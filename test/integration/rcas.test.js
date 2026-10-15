import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { ObjectId } from 'mongodb';
import { connectDatabase } from '../../shared/persistence/database.js';
import { createApp } from '../../api/src/app.js';

test(
  'RCA roles, tenant references, concurrency, completion and safe audit metadata',
  { timeout: 30000 },
  async (t) => {
    process.env.DATABASE_SCHEMA =
      process.env.MONGODB_DB = `rca_test_${randomUUID().replaceAll('-', '')}`;
    const { db, client } = await connectDatabase();
    const server = createApp(db).listen(0, '0.0.0.0');
    await new Promise((resolve) => server.once('listening', resolve));
    t.after(async () => {
      await new Promise((resolve) => server.close(resolve));
      await db.dropDatabase();
      await client.close();
    });
    const request = async (path, cookie, method = 'GET', body) => {
      const result = await fetch(`http://127.0.0.1:${server.address().port}/api${path}`, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'X-Requested-With': 'ServiceTrident',
          ...(cookie ? { Cookie: cookie } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      });
      return {
        status: result.status,
        data: await result.json(),
        cookie: result.headers.get('set-cookie')?.split(';')[0],
      };
    };
    const register = (email) =>
      request('/auth/register', null, 'POST', {
        displayName: 'Synthetic owner',
        email,
        password: 'isolated RCA test password',
      });
    const owner = await register('owner@rca.example'),
      foreign = await register('foreign@rca.example');
    const invite = async (role) => {
      const sent = await request('/invitations', owner.cookie, 'POST', {
        role,
        email: `${role}@rca.example`,
        displayName: `Synthetic ${role}`,
      });
      return request('/auth/invite', null, 'POST', {
        token: sent.data.inviteUrl.split('/').at(-1),
        password: 'isolated invited RCA password',
      });
    };
    const responder = await invite('responder'),
      viewer = await invite('viewer'),
      user = await invite('user');
    const workspaceId = new ObjectId(owner.data.user.id),
      incidentId = new ObjectId(),
      taskId = new ObjectId(),
      foreignId = new ObjectId();
    await db.collection('incidents').insertOne({
      _id: incidentId,
      workspaceId,
      title: 'Synthetic outage',
      timeline: [],
      knowledgeIds: [],
      status: 'resolved',
    });
    await db.collection('tasks').insertOne({
      _id: taskId,
      workspaceId,
      title: 'Prevent recurrence',
      status: 'open',
      attachmentIds: [],
    });
    await db.collection('tasks').insertOne({
      _id: foreignId,
      workspaceId: new ObjectId(foreign.data.user.id),
      title: 'Foreign task',
    });
    const input = {
      title: 'Synthetic RCA',
      status: 'draft',
      incidentIds: [String(incidentId)],
      taskIds: [String(taskId)],
      rootCause: 'PRIVATE RCA CONTENT',
    };
    for (const actor of [viewer, user])
      assert.equal((await request('/rcas', actor.cookie, 'POST', input)).status, 403);
    assert.equal(
      (await request('/rcas', responder.cookie, 'POST', { ...input, taskIds: [String(foreignId)] }))
        .status,
      400,
    );
    for (const extra of [
      { workspaceId: String(workspaceId) },
      { number: 'RCA1' },
      { createdById: owner.data.user.id },
    ])
      assert.equal(
        (await request('/rcas', owner.cookie, 'POST', { ...input, ...extra })).status,
        400,
      );
    const schema = await request('/rca-fields', owner.cookie);
    const customId = String(new ObjectId());
    const configured = [
      ...schema.data.fields,
      {
        id: customId,
        label: 'Detection gap',
        type: 'text',
        required: true,
        archived: false,
        options: [],
      },
    ];
    assert.equal(
      (
        await request('/rca-fields', responder.cookie, 'PUT', {
          fields: configured,
          revision: schema.data.revision,
        })
      ).status,
      403,
    );
    assert.equal(
      (
        await request('/rca-fields', owner.cookie, 'PUT', {
          fields: configured,
          revision: schema.data.revision,
        })
      ).status,
      200,
    );
    assert.equal((await request('/rcas', responder.cookie, 'POST', input)).status, 400);
    assert.equal(
      (await request('/rcas', responder.cookie, 'POST', { ...input, custom: { unknown: 'bad' } }))
        .status,
      400,
    );
    input.custom = { [customId]: 'Synthetic detection gap' };
    const created = await request('/rcas', responder.cookie, 'POST', input);
    assert.equal(created.status, 201);
    const path = `/rcas/${created.data.item.id}`;
    assert.equal((await request(`${path}?recordExport=pdf`, viewer.cookie)).status, 200);
    assert.equal((await request(`${path}?recordExport=csv`, foreign.cookie)).status, 404);
    assert.equal((await request(`${path}?recordExport=pdf`, user.cookie)).status, 403);
    assert.equal((await request(path, foreign.cookie)).status, 404);
    assert.equal((await request(path, user.cookie)).status, 403);
    const detail = await request(path, viewer.cookie);
    assert.equal(detail.data.item.custom[customId], 'Synthetic detection gap');
    assert.match(detail.data.item.number, /^RCA\d{7,}$/);
    assert.equal(detail.data.incidents[0].id, String(incidentId));
    assert.equal(detail.data.tasks[0].id, String(taskId));
    const list = await request(`/tables/rcas?incidentId=${incidentId}`, owner.cookie);
    assert.equal(list.data.total, 1);
    assert.equal((await request('/tables/rcas', user.cookie)).status, 403);
    assert.equal((await request(`/tables/rcas?taskId=${foreignId}`, owner.cookie)).status, 404);
    assert.equal(
      (await request(path, owner.cookie, 'PATCH', { ...input, revision: 999 })).status,
      409,
    );
    assert.equal(
      (
        await request(path, owner.cookie, 'PATCH', {
          ...input,
          revision: detail.data.item.revision,
          status: 'completed',
        })
      ).status,
      400,
    );
    const completed = await request(path, responder.cookie, 'PATCH', {
      ...input,
      revision: detail.data.item.revision,
      status: 'completed',
      summary: 'Review complete',
      correctiveActions: 'Track the linked task',
    });
    assert.equal(completed.status, 200);
    assert.equal(
      (
        await request(path, owner.cookie, 'PATCH', {
          ...input,
          revision: detail.data.item.revision,
        })
      ).status,
      409,
    );
    assert.equal(
      (await request(`/related-counts/tasks/${taskId}`, owner.cookie)).data.counts.rcas,
      1,
    );
    await request(path, owner.cookie, 'PATCH', {
      ...input,
      revision: completed.data.item.revision,
      status: 'archived',
    });
    assert.equal((await request('/tables/rcas', owner.cookie)).data.total, 0);
    assert.equal((await request('/tables/rcas?status=archived', owner.cookie)).data.total, 1);
    const latestSchema = await request('/rca-fields', owner.cookie);
    assert.equal(
      (
        await request('/rca-fields', owner.cookie, 'PUT', {
          fields: latestSchema.data.fields.map((field) =>
            field.id === customId ? { ...field, archived: true } : field,
          ),
          revision: latestSchema.data.revision,
        })
      ).status,
      200,
    );
    const latest = await request(path, owner.cookie);
    const retained = await request(path, owner.cookie, 'PATCH', {
      ...input,
      custom: {},
      status: 'archived',
      revision: latest.data.item.revision,
    });
    assert.equal(retained.status, 200);
    assert.equal(retained.data.item.custom[customId], 'Synthetic detection gap');
    const audits = await db.collection('auditEvents').find({ workspaceId }).toArray();
    assert.ok(audits.some((row) => row.operation?.includes('/rcas')));
    assert.ok(
      audits.some(
        (row) =>
          row.action === 'export' &&
          row.recordId === created.data.item.id &&
          row.statusCode === 200,
      ),
    );
    assert.ok(!JSON.stringify(audits).includes('PRIVATE RCA CONTENT'));
  },
);
