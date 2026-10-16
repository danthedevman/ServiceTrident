import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { ObjectId } from 'mongodb';
import { connectDatabase } from '../../shared/persistence/database.js';
import { createApp } from '../../api/src/app.js';

test(
  'AI context survives provider/model changes and confirmed RCA/draft tools preserve authorization',
  { timeout: 45000 },
  async (t) => {
    process.env.DATABASE_SCHEMA =
      process.env.MONGODB_DB = `ai_context_test_${randomUUID().replaceAll('-', '')}`;
    process.env.INTEGRATION_ENCRYPTION_KEY = '3'.repeat(64);
    const { db, client } = await connectDatabase();
    let plan = { intent: 'search', kind: 'tasks', search: '', action: null };
    const calls = [];
    const server = createApp(db, {
      aiFetch: async (url, options) => {
        const body = JSON.parse(options.body),
          input = body.input ?? body.messages[0].content;
        calls.push({ url, input, model: body.model });
        const text = input.startsWith('Plan a service')
          ? JSON.stringify(plan)
          : 'Verified evidence [1].';
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
        data: await response.json(),
        cookie: response.headers.get('set-cookie')?.split(';')[0],
      };
    }
    const owner = await request('/auth/register', null, 'POST', {
      displayName: 'Context Admin',
      email: 'context@example.test',
      password: 'synthetic context password 123',
    });
    assert.equal(owner.status, 201);
    const invitation = await request('/invitations', owner.cookie, 'POST', {
      role: 'responder',
      email: 'context-responder@example.test',
      displayName: 'Context Responder',
    });
    const responder = await request('/auth/invite', null, 'POST', {
      token: invitation.data.inviteUrl.split('/').at(-1),
      password: 'synthetic responder password 123',
    });
    const task = await request('/tasks', owner.cookie, 'POST', {
      title: 'Current authorized context',
      description: 'Check recovery',
      status: 'todo',
      priority: 'medium',
    });
    const foreignId = new ObjectId();
    await db.collection('tasks').insertOne({
      _id: foreignId,
      workspaceId: new ObjectId(),
      title: 'FOREIGN_CONTEXT_SECRET',
      revision: 0,
    });
    for (const [type, model] of [
      ['openai', 'model-a'],
      ['openai', 'model-b'],
      ['claude', 'model-c'],
    ]) {
      const config = (await request('/ai/settings', owner.cookie)).data;
      assert.equal(
        (
          await request('/ai/settings', owner.cookie, 'PUT', {
            type,
            model,
            apiKey: 'synthetic-context-provider-key',
            revision: config.revision,
          })
        ).status,
        200,
      );
      const before = calls.length;
      const result = await request('/ai/chat', owner.cookie, 'POST', {
        message: 'Continue the investigation',
        history: [
          { role: 'user', text: 'CONVERSATION_MARKER: investigate checkout' },
          { role: 'assistant', text: 'Check the recovery evidence.' },
        ],
        references: [
          { kind: 'tasks', id: task.data.item.id },
          { kind: 'tasks', id: String(foreignId) },
        ],
      });
      assert.equal(result.status, 200);
      assert.equal(calls.length, before + 2);
      for (const call of calls.slice(before)) {
        assert.equal(call.model, model);
        assert.ok(call.input.includes('CONVERSATION_MARKER'));
        assert.ok(call.input.includes('Current authorized context'));
        assert.ok(!call.input.includes('FOREIGN_CONTEXT_SECRET'));
      }
    }
    plan = {
      intent: 'action',
      kind: 'rcas',
      search: '',
      action: {
        kind: 'rcas',
        operation: 'create',
        changes: {
          title: 'Checkout investigation',
          summary: 'Review recovery',
          taskIds: [task.data.item.id],
        },
      },
    };
    const proposal = await request('/ai/chat', owner.cookie, 'POST', {
      message: 'Create an RCA for this investigation',
    });
    assert.equal(proposal.status, 200);
    const workspaceId = new ObjectId(owner.data.user.id);
    assert.equal(await db.collection('rcas').countDocuments({ workspaceId }), 0);
    assert.equal(
      (
        await request('/ai/actions', owner.cookie, 'POST', {
          token: proposal.data.action.token,
          confirm: false,
        })
      ).status,
      400,
    );
    assert.equal(await db.collection('rcas').countDocuments({ workspaceId }), 0);
    const created = await request('/ai/actions', owner.cookie, 'POST', {
      token: proposal.data.action.token,
      confirm: true,
    });
    assert.equal(created.status, 201);
    assert.deepEqual(created.data.item.taskIds, [task.data.item.id]);
    plan = {
      intent: 'action',
      kind: 'rcas',
      search: '',
      action: {
        kind: 'rcas',
        operation: 'update',
        id: created.data.item.id,
        changes: { rootCause: 'Timeout exhausted the pool.' },
      },
    };
    const update = await request('/ai/chat', owner.cookie, 'POST', {
      message: 'Update the root cause',
      context: { kind: 'rcas', id: created.data.item.id },
    });
    assert.equal(update.status, 200);
    const updated = await request('/ai/actions', owner.cookie, 'POST', {
      token: update.data.action.token,
      confirm: true,
    });
    assert.equal(updated.status, 200);
    assert.equal(updated.data.item.title, created.data.item.title);
    assert.deepEqual(updated.data.item.taskIds, [task.data.item.id]);
    assert.equal(updated.data.item.rootCause, 'Timeout exhausted the pool.');
    plan.action = {
      kind: 'rcas',
      operation: 'create',
      changes: { title: 'Denied foreign relationship', taskIds: [String(foreignId)] },
    };
    assert.equal(
      (await request('/ai/chat', owner.cookie, 'POST', { message: 'Create an RCA' })).status,
      502,
    );
    const article = await request('/knowledge', owner.cookie, 'POST', {
      title: 'Draft recap',
      summary: '',
      content: 'Original text',
      status: 'draft',
      articleType: 'article',
    });
    assert.equal(article.status, 201);
    plan = {
      intent: 'action',
      kind: 'knowledge',
      search: '',
      action: {
        kind: 'knowledge',
        operation: 'update',
        id: article.data.item.id,
        changes: { summary: 'Revised recovery summary' },
      },
    };
    const draftProposal = await request('/ai/chat', responder.cookie, 'POST', {
      message: 'Update this draft summary',
      context: { kind: 'knowledge', id: article.data.item.id },
    });
    assert.equal(draftProposal.status, 200);
    await db
      .collection('users')
      .updateOne({ _id: new ObjectId(responder.data.user.id) }, { $set: { role: 'viewer' } });
    assert.equal(
      (
        await request('/ai/actions', responder.cookie, 'POST', {
          token: draftProposal.data.action.token,
          confirm: true,
        })
      ).status,
      403,
    );
    await db
      .collection('users')
      .updateOne({ _id: new ObjectId(responder.data.user.id) }, { $set: { role: 'responder' } });
    const revised = await request('/ai/actions', responder.cookie, 'POST', {
      token: draftProposal.data.action.token,
      confirm: true,
    });
    assert.equal(revised.status, 200);
    assert.equal(revised.data.item.summary, 'Revised recovery summary');
    assert.equal(revised.data.item.status, 'draft');
    assert.equal(revised.data.item.content, 'Original text');
    assert.ok(
      await db
        .collection('auditEvents')
        .findOne({ workspaceId, operation: 'AI confirmed create', recordType: 'rcas' }),
    );
  },
);
