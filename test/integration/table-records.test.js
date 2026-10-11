import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { ObjectId } from 'mongodb';
import { connectDatabase } from '../../shared/persistence/database.js';
import { createApp } from '../../api/src/app.js';
import { hashPassword } from '../../api/src/auth/auth.js';

test(
  'history and log record views reuse table authorization, parent visibility, and column allowlists',
  { timeout: 30000 },
  async (t) => {
    process.env.MONGODB_DB =
      process.env.DATABASE_SCHEMA = `records_test_${randomUUID().replaceAll('-', '')}`;
    const { db, client } = await connectDatabase(),
      server = createApp(db).listen(0, '0.0.0.0');
    await new Promise((resolve) => server.once('listening', resolve));
    t.after(async () => {
      await new Promise((resolve) => server.close(resolve));
      await db.dropDatabase();
      await client.close();
    });
    const base = `http://127.0.0.1:${server.address().port}/api`;
    async function request(path, cookie, method = 'GET', body) {
      const response = await fetch(base + path, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'X-Requested-With': 'ServiceTrident',
          ...(cookie ? { Cookie: cookie } : {}),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      return {
        status: response.status,
        data: await response.json(),
        cookie: response.headers.get('set-cookie')?.split(';')[0],
      };
    }
    const password = randomBytes(24).toString('hex');
    const owner = await request('/auth/register', null, 'POST', {
      displayName: 'Owner',
      email: 'owner@example.com',
      password,
    });
    const other = await request('/auth/register', null, 'POST', {
      displayName: 'Other',
      email: 'other@example.com',
      password,
    });
    const workspaceId = new ObjectId(owner.data.user.id),
      viewerId = new ObjectId(),
      userId = new ObjectId();
    for (const [id, role] of [
      [viewerId, 'viewer'],
      [userId, 'user'],
    ])
      await db
        .collection('users')
        .insertOne({
          _id: id,
          workspaceId,
          role,
          email: `${role}@example.com`,
          displayName: role,
          passwordHash: await hashPassword(password),
        });
    const viewer = await request('/auth/login', null, 'POST', {
      email: 'viewer@example.com',
      password,
    });
    const user = await request('/auth/login', null, 'POST', {
      email: 'user@example.com',
      password,
    });
    const auditId = new ObjectId(),
      deliveryId = new ObjectId(),
      incidentId = new ObjectId(),
      hiddenId = new ObjectId(),
      commentId = new ObjectId(),
      noteId = new ObjectId();
    await db
      .collection('auditEvents')
      .insertOne({
        _id: auditId,
        workspaceId,
        action: 'update',
        actor: 'Demo',
        createdAt: new Date(),
        privatePayload: 'excluded',
      });
    await db
      .collection('deliveries')
      .insertOne({
        _id: deliveryId,
        workspaceId,
        status: 'failed',
        error: 'Synthetic failure',
        attempts: 2,
        createdAt: new Date(),
        monitorChecks: [{ response: 'excluded' }],
        credentials: 'excluded',
      });
    await db.collection('incidents').insertOne({
      _id: incidentId,
      workspaceId,
      openedForId: String(userId),
      title: 'Demo Incident',
      timeline: [
        { at: new Date(), by: 'Demo', note: 'Visible event' },
        { at: new Date(), by: 'Demo', kind: 'work_note', note: 'Private work note' },
      ],
    });
    await db
      .collection('incidents')
      .insertOne({
        _id: hiddenId,
        workspaceId,
        openedForId: String(viewerId),
        title: 'Other Incident',
      });
    await db.collection('incidentComments').insertMany([
      {
        _id: commentId,
        workspaceId,
        incidentId,
        kind: 'comment',
        author: 'Demo',
        body: '<script>plain text</script>',
        createdAt: new Date(),
      },
      {
        _id: noteId,
        workspaceId,
        incidentId,
        kind: 'work_note',
        author: 'Demo',
        body: 'Private note',
        createdAt: new Date(),
      },
    ]);
    for (const [kind, id] of [
      ['audit', auditId],
      ['deliveries', deliveryId],
    ]) {
      assert.equal((await request(`/table-records/${kind}/${id}`)).status, 401);
      assert.equal((await request(`/table-records/${kind}/${id}`, viewer.cookie)).status, 403);
      assert.equal((await request(`/table-records/${kind}/${id}`, other.cookie)).status, 404);
      const detail = await request(`/table-records/${kind}/${id}`, owner.cookie);
      assert.equal(detail.status, 200);
      assert.ok(!JSON.stringify(detail.data).includes('excluded'));
    }
    const visible = await request(`/table-records/activity/0?recordId=${incidentId}`, user.cookie);
    assert.equal(visible.status, 200);
    assert.equal(visible.data.item.note, 'Visible event');
    assert.equal(
      (await request(`/table-records/activity/1?recordId=${incidentId}`, user.cookie)).status,
      404,
    );
    assert.equal(
      (await request(`/table-records/activity/0?recordId=${hiddenId}`, user.cookie)).status,
      404,
    );
    assert.equal(
      (await request(`/table-records/activity/0?recordId=${incidentId}`, other.cookie)).status,
      404,
    );
    assert.equal(
      (await request(`/table-records/comments/${commentId}?recordId=${incidentId}`, user.cookie))
        .data.item.body,
      '<script>plain text</script>',
    );
    assert.equal(
      (await request(`/table-records/comments/${noteId}?recordId=${incidentId}`, viewer.cookie))
        .status,
      404,
    );
    assert.equal(
      (await request(`/table-records/comments/${commentId}?recordId=${hiddenId}`, owner.cookie))
        .status,
      404,
    );
    assert.equal((await request('/table-records/users/anything', owner.cookie)).status, 404);
  },
);
