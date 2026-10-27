import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { ObjectId } from 'mongodb';
import { connectDatabase } from '../../shared/persistence/database.js';
import { prepareConversation, conversationVault } from '../../api/src/routes/ai-conversations.js';
import { createApp } from '../../api/src/app.js';

test(
  'Athena settings and encrypted persistent conversations enforce owner, role, source access and confirmation boundaries',
  { timeout: 45000 },
  async (t) => {
    process.env.DATABASE_SCHEMA =
      process.env.MONGODB_DB = `ai_context_test_${randomUUID().replaceAll('-', '')}`;
    process.env.INTEGRATION_ENCRYPTION_KEY = '3'.repeat(64);
    const { db, client } = await connectDatabase();
    let plan = { intent: 'conversation', destinations: ['monitors', 'help'], action: null };
    const calls = [];
    const server = createApp(db, {
      aiFetch: async (url, options) => {
        const body = JSON.parse(options.body),
          input = body.input ?? body.messages[0].content;
        calls.push({ url, input, model: body.model });
        const text = input.startsWith('Plan a service')
          ? JSON.stringify(plan)
          : 'Hello, I am Athena. How can I help?';
        return Response.json(
          body.input
            ? { output: [{ content: [{ type: 'output_text', text }] }] }
            : { content: [{ type: 'text', text }] },
        );
      },
    }).listen(0, '0.0.0.0');
    await new Promise((resolve) => server.once('listening', resolve));
    t.after(async () => {
      await new Promise((resolve) => server.close(resolve));
      await db.dropDatabase();
      await client.close();
    });
    async function request(path, cookie, method = 'GET', body) {
      const response = await fetch(`http://127.0.0.1:${server.address().port}/api${path}`, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'X-Requested-With': 'ServiceTrident',
          ...(cookie ? { Cookie: cookie } : {}),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      return {
        status: response.status,
        data: response.status === 204 ? null : await response.json(),
        cookie: response.headers.get('set-cookie')?.split(';')[0],
      };
    }
    const owner = await request('/auth/register', null, 'POST', {
      displayName: 'Athena Admin',
      email: 'athena@example.test',
      password: 'synthetic athena password 123',
    });
    assert.equal(owner.status, 201);
    const invitation = await request('/invitations', owner.cookie, 'POST', {
      role: 'responder',
      email: 'athena-responder@example.test',
      displayName: 'Athena Responder',
    });
    const responder = await request('/auth/invite', null, 'POST', {
      token: invitation.data.inviteUrl.split('/').at(-1),
      password: 'synthetic responder password 123',
    });
    const config = (await request('/ai/settings', owner.cookie)).data;
    assert.equal(
      (
        await request('/ai/settings', owner.cookie, 'PUT', {
          type: 'openai',
          model: 'synthetic-model',
          apiKey: 'synthetic-athena-key',
          revision: config.revision,
        })
      ).status,
      200,
    );
    const revision = (await request('/ai/settings', owner.cookie)).data.revision;
    const guidance = { revision, responseStyle: 'concise', instructions: 'Use plain language.' };
    assert.equal((await request('/ai/assistant', responder.cookie, 'PUT', guidance)).status, 403);
    assert.equal(
      (
        await request('/ai/assistant', owner.cookie, 'PUT', {
          ...guidance,
          responseStyle: 'invalid',
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await request('/ai/assistant', owner.cookie, 'PUT', {
          ...guidance,
          instructions: 'x'.repeat(2001),
        })
      ).status,
      400,
    );
    assert.equal(
      (await request('/ai/assistant', owner.cookie, 'PUT', { ...guidance, unknown: true })).status,
      400,
    );
    assert.equal((await request('/ai/assistant', owner.cookie, 'PUT', guidance)).status, 200);
    assert.equal((await request('/ai/assistant', owner.cookie, 'PUT', guidance)).status, 409);
    assert.equal(
      (await request('/ai/settings', owner.cookie)).data.assistant.responseStyle,
      'concise',
    );
    const id = randomUUID();
    const first = await request('/ai/chat', owner.cookie, 'POST', {
      message: 'ATHENA_PRIVATE_GREETING',
      conversationId: id,
    });
    assert.equal(first.status, 200);
    assert.equal(first.data.conversationId, id);
    assert.deepEqual(first.data.records, []);
    assert.deepEqual(
      first.data.navigation.map((row) => row.href),
      ['/monitors', '/help'],
    );
    assert.ok(calls.at(-1).input.includes('You are Athena'));
    assert.ok(calls.at(-1).input.includes('Response style: concise'));
    assert.ok(calls.at(-1).input.includes('Use plain language.'));
    assert.equal((await request('/ai/conversations', null)).status, 401);
    assert.equal((await request('/ai/conversations', responder.cookie)).data.items.length, 0);
    assert.equal((await request(`/ai/conversations/${id}`, responder.cookie)).status, 404);
    assert.equal(
      (await request(`/ai/conversations/${id}`, responder.cookie, 'DELETE', {})).status,
      404,
    );
    const reLogin = await request('/auth/login', null, 'POST', {
      email: 'athena@example.test',
      password: 'synthetic athena password 123',
    });
    assert.equal(reLogin.status, 200);
    assert.equal((await request('/ai/conversations', reLogin.cookie)).data.items[0].id, id);
    assert.equal(
      (await request(`/ai/conversations/${id}`, reLogin.cookie)).data.item.messages[0].text,
      'ATHENA_PRIVATE_GREETING',
    );
    const continued = await request('/ai/chat', reLogin.cookie, 'POST', {
      message: 'Continue',
      conversationId: id,
      history: [],
    });
    assert.equal(continued.status, 200);
    assert.ok(calls.at(-1).input.includes('ATHENA_PRIVATE_GREETING'));
    assert.equal(
      (await request(`/ai/conversations/${id}`, owner.cookie)).data.item.messages.length,
      4,
    );
    const vault = await db
      .collection('aiConversations')
      .findOne({ actorId: new ObjectId(owner.data.user.id) });
    assert.ok(!JSON.stringify(vault).includes('ATHENA_PRIVATE_GREETING'));
    const foreign = await request('/auth/register', null, 'POST', {
      displayName: 'Other Workspace',
      email: 'athena-foreign@example.test',
      password: 'synthetic foreign password 123',
    });
    assert.equal((await request(`/ai/conversations/${id}`, foreign.cookie)).status, 404);
    const task = await request('/tasks', owner.cookie, 'POST', {
      title: 'Private task evidence',
      status: 'todo',
      priority: 'medium',
    });
    plan = {
      intent: 'action',
      kind: 'tasks',
      search: '',
      action: {
        kind: 'tasks',
        operation: 'update',
        id: task.data.item.id,
        changes: { status: 'done' },
      },
    };
    const actionChat = await request('/ai/chat', owner.cookie, 'POST', {
      message: 'Mark task done',
      context: { kind: 'tasks', id: task.data.item.id },
    });
    assert.equal(actionChat.status, 200);
    assert.ok(actionChat.data.action.token);
    const restored = (
      await request(`/ai/conversations/${actionChat.data.conversationId}`, owner.cookie)
    ).data.item;
    assert.equal(restored.messages.at(-1).previousProposal, true);
    assert.ok(!JSON.stringify(restored).includes(actionChat.data.action.token));
    assert.equal(restored.messages.at(-1).action, undefined);
    await db.collection('tasks').deleteOne({ _id: new ObjectId(task.data.item.id) });
    assert.equal(
      (await request(`/ai/conversations/${actionChat.data.conversationId}`, owner.cookie)).status,
      404,
    );
    assert.equal((await request('/ai/conversations', owner.cookie)).data.items.length, 1);
    assert.equal(
      (
        await request('/ai/chat', owner.cookie, 'POST', {
          message: 'Continue',
          conversationId: actionChat.data.conversationId,
        })
      ).status,
      403,
    );
    plan = { intent: 'conversation', destinations: ['athena-settings'], action: null };
    assert.equal(
      (await request('/ai/chat', responder.cookie, 'POST', { message: 'Open Athena settings' }))
        .status,
      403,
    );
    plan.destinations = ['https://untrusted.example.test'];
    assert.equal(
      (await request('/ai/chat', responder.cookie, 'POST', { message: 'Open page' })).status,
      403,
    );
    plan.destinations = ['monitors'];
    const responderChat = await request('/ai/chat', responder.cookie, 'POST', {
      message: 'Hello Athena',
    });
    assert.equal(responderChat.status, 200);
    await db
      .collection('users')
      .updateOne({ _id: new ObjectId(responder.data.user.id) }, { $set: { role: 'viewer' } });
    assert.equal(
      (await request(`/ai/conversations/${responderChat.data.conversationId}`, responder.cookie))
        .status,
      404,
    );
    plan.destinations = ['create-task'];
    assert.equal(
      (await request('/ai/chat', responder.cookie, 'POST', { message: 'Create task' })).status,
      403,
    );
    await db
      .collection('users')
      .updateOne({ _id: new ObjectId(responder.data.user.id) }, { $set: { role: 'responder' } });
    assert.equal(
      (await request(`/ai/conversations/${responderChat.data.conversationId}`, responder.cookie))
        .status,
      200,
    );
    assert.equal(
      (await request(`/ai/conversations/${id}`, owner.cookie, 'DELETE', {})).status,
      200,
    );
    assert.equal((await request(`/ai/conversations/${id}`, owner.cookie)).status, 404);
    assert.equal(
      (await request(`/members/${responder.data.user.id}`, owner.cookie, 'DELETE', {})).status,
      204,
    );
    assert.equal(
      await db
        .collection('aiConversations')
        .countDocuments({ actorId: new ObjectId(responder.data.user.id) }),
      0,
    );
    const audits = await db
      .collection('auditEvents')
      .find({ workspaceId: new ObjectId(owner.data.user.id) })
      .toArray();
    assert.ok(!JSON.stringify(audits).includes('ATHENA_PRIVATE_GREETING'));
    assert.ok(audits.some((row) => JSON.stringify(row).includes('/api/ai/conversations')));
    const scopedRequest = {
      workspaceId: new ObjectId(owner.data.user.id),
      user: { _id: new ObjectId(owner.data.user.id) },
      role: 'admin',
      body: { message: 'Bounded conversation' },
    };
    const sink = { json: (value) => value };
    for (let index = 0; index < 21; index++) {
      const prepared = await prepareConversation(db, scopedRequest);
      await prepared.reply(sink, { text: 'Synthetic persisted answer', records: [], demo: false });
    }
    assert.equal((await conversationVault(db, scopedRequest)).entries.length, 20);
    const firstConcurrent = await prepareConversation(db, scopedRequest);
    const secondConcurrent = await prepareConversation(db, scopedRequest);
    await firstConcurrent.reply(sink, { text: 'First turn', records: [], demo: false });
    await assert.rejects(
      () =>
        secondConcurrent.reply(sink, { text: 'Concurrent stale turn', records: [], demo: false }),
      /Conversation changed/,
    );
  },
);
