import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { ObjectId } from 'mongodb';
import { connectDatabase } from '../../shared/persistence/database.js';
import { createApp } from '../../api/src/app.js';

test(
  'chat enforces tenant/role/preferences, isolated demos, native writes, stale revisions and replay protection',
  { timeout: 45000 },
  async (t) => {
    process.env.DATABASE_SCHEMA =
      process.env.MONGODB_DB = `chat_test_${randomUUID().replaceAll('-', '')}`;
    process.env.INTEGRATION_ENCRYPTION_KEY = '2'.repeat(64);
    const { db, client } = await connectDatabase();
    let calls = 0,
      plan = { intent: 'search', kind: 'tasks', search: '', action: null };
    const inputs = [];
    const server = createApp(db, {
      aiFetch: async (_url, options) => {
        calls++;
        const input = JSON.parse(options.body).input;
        inputs.push(input);
        return Response.json({
          output: [
            {
              content: [
                {
                  type: 'output_text',
                  text: input.startsWith('Plan a service')
                    ? JSON.stringify(plan)
                    : 'Evidence-based answer [1].',
                },
              ],
            },
          ],
        });
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
      displayName: 'Chat Admin',
      email: 'chat-admin@example.test',
      password: 'synthetic chat password 123',
    });
    assert.equal(owner.status, 201);
    const workspaceId = new ObjectId(owner.data.user.id);
    async function invite(role) {
      const invitation = await request('/invitations', owner.cookie, 'POST', {
        role,
        email: `chat-${role}@example.test`,
        displayName: `Chat ${role}`,
      });
      return request('/auth/invite', null, 'POST', {
        token: invitation.data.inviteUrl.split('/').at(-1),
        password: 'synthetic invite password 123',
      });
    }
    const responder = await invite('responder'),
      viewer = await invite('viewer'),
      portal = await invite('user');
    let config = (await request('/ai/settings', owner.cookie)).data;
    assert.equal(
      (
        await request('/ai/features', owner.cookie, 'PUT', {
          revision: config.revision,
          chatEnabled: true,
          demoEnabled: true,
        })
      ).status,
      409,
    );
    const demoBatchId = String(new ObjectId()),
      demoIncidentId = new ObjectId();
    await db
      .collection('demoData')
      .insertOne({ _id: workspaceId, status: 'active', batchId: demoBatchId });
    await db.collection('incidents').insertMany([
      {
        _id: demoIncidentId,
        workspaceId,
        demoBatchId,
        title: 'Demo Response Source',
        status: 'open',
        revision: 0,
      },
      {
        _id: new ObjectId(),
        workspaceId: new ObjectId(),
        demoBatchId,
        title: 'FOREIGN_DEMO_PRIVATE_TEXT',
        status: 'open',
      },
      { _id: new ObjectId(), workspaceId, title: 'LIVE_PRIVATE_TITLE', status: 'open' },
    ]);
    assert.equal(
      (
        await request('/ai/features', owner.cookie, 'PUT', {
          revision: config.revision,
          chatEnabled: true,
          demoEnabled: true,
        })
      ).status,
      200,
    );
    const demo = await request('/ai/chat', viewer.cookie, 'POST', {
      message: 'Resolve',
      demo: true,
      exampleId: 'resolve',
    });
    assert.equal(demo.status, 200);
    assert.equal(demo.data.demoAction, undefined);
    assert.equal(demo.data.records[0].href, `/incidents/${demoIncidentId}`);
    assert.equal(JSON.stringify(demo.data).includes('FOREIGN_DEMO_PRIVATE_TEXT'), false);
    assert.equal(JSON.stringify(demo.data).includes('LIVE_PRIVATE_TITLE'), false);
    assert.match(demo.data.text, /cannot resolve/);
    assert.equal(
      (
        await request('/ai/chat', responder.cookie, 'POST', {
          message: 'Resolve',
          demo: true,
          exampleId: 'resolve',
        })
      ).data.demoAction.changes.status,
      'resolved',
    );
    assert.equal(calls, 0);
    assert.equal(
      (
        await request('/ai/chat', portal.cookie, 'POST', {
          message: 'Search',
          demo: true,
          exampleId: 'attention',
        })
      ).status,
      403,
    );
    assert.equal(
      (
        await request('/ai/features', viewer.cookie, 'PUT', {
          revision: 0,
          chatEnabled: true,
          demoEnabled: true,
        })
      ).status,
      403,
    );
    config = (await request('/ai/settings', owner.cookie)).data;
    assert.equal(
      (
        await request('/ai/settings', owner.cookie, 'PUT', {
          type: 'openai',
          model: 'synthetic-model',
          apiKey: 'synthetic-chat-key',
          revision: config.revision,
        })
      ).status,
      200,
    );
    const task = await request('/tasks', owner.cookie, 'POST', {
      title: 'Chat task',
      description: 'Inspect health',
      status: 'todo',
      priority: 'medium',
    });
    assert.equal(task.status, 201);
    const id = task.data.item.id;
    const foreignId = new ObjectId();
    await db.collection('tasks').insertOne({
      _id: foreignId,
      workspaceId: new ObjectId(),
      title: 'FOREIGN_PRIVATE_TEXT',
      revision: 0,
    });
    const denied = await request('/ai/chat', viewer.cookie, 'POST', {
      message: 'Explain',
      context: { kind: 'tasks', id: String(foreignId) },
    });
    assert.equal(denied.status, 404);
    assert.equal(calls, 0);
    plan = {
      intent: 'action',
      kind: 'tasks',
      search: '',
      action: {
        kind: 'tasks',
        operation: 'update',
        id,
        changes: { status: 'in_progress', assigneeId: 'me' },
      },
    };
    assert.equal(
      (
        await request('/ai/chat', viewer.cookie, 'POST', {
          message: 'Assign task',
          context: { kind: 'tasks', id },
        })
      ).status,
      403,
    );
    const proposal = await request('/ai/chat', responder.cookie, 'POST', {
      message: 'Assign this task to me and start it',
      context: { kind: 'tasks', id },
    });
    assert.equal(proposal.status, 200);
    assert.equal(proposal.data.action.revision, 0);
    assert.equal(JSON.stringify(inputs).includes('FOREIGN_PRIVATE_TEXT'), false);
    assert.equal(
      (
        await request('/ai/actions', viewer.cookie, 'POST', {
          token: proposal.data.action.token,
          confirm: true,
        })
      ).status,
      403,
    );
    assert.equal(
      (
        await request('/ai/actions', owner.cookie, 'POST', {
          token: proposal.data.action.token,
          confirm: true,
        })
      ).status,
      403,
    );
    assert.equal(
      (
        await request('/ai/actions', responder.cookie, 'POST', {
          token: proposal.data.action.token,
          confirm: false,
        })
      ).status,
      400,
    );
    const changed = await request('/ai/actions', responder.cookie, 'POST', {
      token: proposal.data.action.token,
      confirm: true,
    });
    assert.equal(changed.status, 200);
    assert.equal(changed.data.item.status, 'in_progress');
    assert.equal(changed.data.item.assigneeId, responder.data.user.id);
    assert.equal(
      (
        await request('/ai/actions', responder.cookie, 'POST', {
          token: proposal.data.action.token,
          confirm: true,
        })
      ).status,
      409,
    );
    const stale = await request('/ai/chat', owner.cookie, 'POST', {
      message: 'Start task',
      context: { kind: 'tasks', id },
    });
    assert.equal(stale.status, 200);
    await db.collection('tasks').updateOne({ _id: new ObjectId(id) }, { $inc: { revision: 1 } });
    assert.equal(
      (
        await request('/ai/actions', owner.cookie, 'POST', {
          token: stale.data.action.token,
          confirm: true,
        })
      ).status,
      409,
    );
    plan = {
      intent: 'draft',
      kind: 'knowledge',
      search: 'health',
      action: {
        kind: 'knowledge',
        operation: 'create',
        changes: {
          title: 'Health recap',
          summary: 'Review',
          content: 'Cause unconfirmed. Verify dependencies.',
        },
      },
    };
    assert.equal(
      (await request('/ai/chat', viewer.cookie, 'POST', { message: 'Draft an article' })).status,
      403,
    );
    const draft = await request('/ai/chat', owner.cookie, 'POST', {
      message: 'Create a draft recap',
    });
    assert.equal(draft.status, 200);
    const created = await request('/ai/actions', owner.cookie, 'POST', {
      token: draft.data.action.token,
      confirm: true,
    });
    assert.equal(created.status, 201);
    assert.equal(created.data.item.status, 'draft');
    assert.equal(
      (
        await request('/ai/actions', owner.cookie, 'POST', {
          token: draft.data.action.token,
          confirm: true,
        })
      ).status,
      409,
    );
    assert.equal(await db.collection('articles').countDocuments({ workspaceId }), 1);
    const service = (
      await request('/services', owner.cookie, 'POST', {
        name: 'Synthetic AI service',
        description: '',
      })
    ).data.item;
    plan = {
      intent: 'action',
      kind: 'incidents',
      search: '',
      action: {
        kind: 'incidents',
        operation: 'create',
        changes: { title: 'AI-created incident', serviceId: service.id, severity: 'medium' },
      },
    };
    const aiIncident = await request('/ai/chat', owner.cookie, 'POST', {
      message: 'Create an incident',
    });
    assert.equal(aiIncident.status, 200);
    const savedIncident = await request('/ai/actions', owner.cookie, 'POST', {
      token: aiIncident.data.action.token,
      confirm: true,
    });
    assert.equal(savedIncident.status, 201);
    assert.equal(savedIncident.data.incident.source, 'ai');
    assert.equal(savedIncident.data.incident.createdById, owner.data.user.id);

    const monitorId = new ObjectId(),
      outsideMonitor = new ObjectId();
    await db.collection('monitors').insertMany([
      { _id: monitorId, userId: workspaceId, name: 'Main Health' },
      { _id: outsideMonitor, userId: new ObjectId(), name: 'Main Health FOREIGN_PRIVATE_TEXT' },
    ]);
    await db.collection('events').insertMany([
      {
        _id: new ObjectId(),
        userId: workspaceId,
        monitorId,
        checkedAt: new Date(),
        status: 'down',
        statusCode: 503,
      },
      {
        _id: new ObjectId(),
        userId: new ObjectId(),
        monitorId: outsideMonitor,
        checkedAt: new Date(),
        status: 'down',
        error: 'FOREIGN_PRIVATE_TEXT',
      },
    ]);
    plan = { intent: 'explain', kind: 'events', search: 'Main Health', action: null };
    const events = await request('/ai/chat', owner.cookie, 'POST', {
      message: 'Explain Main Health failures',
    });
    assert.equal(events.status, 200);
    assert.equal(events.data.records.length, 1);
    assert.equal(events.data.records[0].statusCode, 503);
    assert.match(events.data.records[0].title, /Main Health/);
    assert.equal(JSON.stringify(inputs).includes('FOREIGN_PRIVATE_TEXT'), false);
    await request('/auth/preferences', viewer.cookie, 'PATCH', { aiChat: false });
    assert.equal(
      (await request('/ai/chat', viewer.cookie, 'POST', { message: 'Search' })).status,
      403,
    );
    const fieldSettings = (await request('/incident-fields', owner.cookie)).data;
    const fields = fieldSettings.fields.map((field) => ({
      ...field,
      label: `${field.label} Updated`,
      ...(field.id === 'resolutionNotes' ? { required: true } : {}),
    }));
    assert.equal(
      (
        await request('/incident-fields', owner.cookie, 'PUT', {
          fields,
          revision: fieldSettings.revision,
        })
      ).status,
      200,
    );
    const saved = (await request('/incident-fields', owner.cookie)).data;
    assert.equal(saved.fields.find((field) => field.id === 'resolutionNotes').required, true);
    assert.equal(
      (
        await request('/incident-fields', owner.cookie, 'PUT', {
          revision: saved.revision,
          fields: saved.fields.map((field) => ({ ...field, archived: true })),
        })
      ).status,
      400,
    );
    assert.ok(
      await db
        .collection('auditEvents')
        .findOne({ workspaceId, operation: 'AI confirmed update', recordId: id }),
    );
    await db.collection('demoData').deleteOne({ _id: workspaceId });
    assert.equal((await request('/ai/settings', owner.cookie)).data.demoEnabled, false);
  },
);
