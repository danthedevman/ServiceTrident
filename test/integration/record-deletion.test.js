import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { ObjectId } from 'mongodb';
import { connectDatabase } from '../../shared/persistence/database.js';
import { createApp } from '../../api/src/app.js';
import { hashPassword } from '../../api/src/auth/auth.js';

test('admin record deletion enforces role, tenant and revision, cleans files and retains related records', async (t) => {
  process.env.MONGODB_DB =
    process.env.DATABASE_SCHEMA = `deletion_test_${randomUUID().replaceAll('-', '')}`;
  const { db, client } = await connectDatabase();
  const server = createApp(db).listen(0, '0.0.0.0');
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await db.dropDatabase();
    await client.close();
  });
  const base = `http://127.0.0.1:${server.address().port}/api`;
  async function request(path, cookie, method = 'GET', body) {
    if (method === 'DELETE' && body === undefined) body = {};
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
      data: response.status === 204 ? null : await response.json(),
      cookie: response.headers.get('set-cookie')?.split(';')[0],
    };
  }
  const password = randomBytes(24).toString('hex');
  const owner = await request('/auth/register', null, 'POST', {
    displayName: 'Owner',
    email: 'owner@example.invalid',
    password,
  });
  const foreign = await request('/auth/register', null, 'POST', {
    displayName: 'Other',
    email: 'other@example.invalid',
    password,
  });
  const workspaceId = new ObjectId(owner.data.user.id);
  const cookies = [];
  for (const role of ['responder', 'viewer', 'user']) {
    await db.collection('users').insertOne({
      _id: new ObjectId(),
      workspaceId,
      role,
      email: `${role}@example.invalid`,
      displayName: role,
      passwordHash: await hashPassword(password),
    });
    cookies.push(
      (await request('/auth/login', null, 'POST', { email: `${role}@example.invalid`, password }))
        .cookie,
    );
  }
  const photo =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j5xkAAAAASUVORK5CYII=';
  const photoPath = `/member-photos/${owner.data.user.id}`;
  assert.equal((await request('/auth/photo', null, 'PUT', { base64: photo })).status, 401);
  for (const cookie of cookies)
    assert.equal((await request(photoPath, cookie, 'PUT', { base64: photo })).status, 403);
  assert.equal((await request(photoPath, foreign.cookie, 'PUT', { base64: photo })).status, 404);
  assert.equal(
    (await request('/auth/photo', owner.cookie, 'PUT', { base64: 'not an image' })).status,
    400,
  );
  assert.equal(
    (
      await request('/auth/photo', owner.cookie, 'PUT', {
        base64: photo,
        workspaceId: foreign.data.user.id,
      })
    ).status,
    400,
  );
  const uploaded = await request('/auth/photo', owner.cookie, 'PUT', { base64: photo });
  assert.equal(uploaded.status, 200);
  assert.ok(uploaded.data.photoVersion);
  assert.equal(uploaded.data.base64, undefined);
  const preview = await fetch(base + photoPath, { headers: { Cookie: owner.cookie } });
  assert.equal(preview.status, 200);
  assert.equal(preview.headers.get('content-type'), 'image/png');
  assert.equal(preview.headers.get('cache-control'), 'no-store');
  assert.equal(Buffer.from(await preview.arrayBuffer()).toString('base64'), photo);
  assert.equal((await request(photoPath, foreign.cookie)).status, 404);
  assert.equal((await request(photoPath, cookies[2])).status, 403);
  assert.equal(
    (await request('/auth/me', owner.cookie)).data.user.photoVersion,
    uploaded.data.photoVersion,
  );
  assert.equal(
    (await request('/auth/photo', cookies[1], 'PUT', { base64: photo })).status,
    200,
    'viewers can manage their own photo',
  );
  assert.equal((await request('/auth/photo', owner.cookie, 'DELETE')).status, 204);
  assert.equal((await request('/auth/photo', owner.cookie)).status, 404);
  assert.ok(
    !JSON.stringify(await db.collection('auditEvents').find({ workspaceId }).toArray()).includes(
      photo,
    ),
    'photo bytes never enter audit metadata',
  );
  for (const [source, sortBy] of [
    ['groups', 'name'],
    ['members', 'displayName'],
    ['audit', 'createdAt'],
  ]) {
    const response = await request(
      `/tables/${source}?page=1&pageSize=10&sortBy=${sortBy}&order=asc&search=`,
      owner.cookie,
    );
    assert.equal(response.status, 200, `${source} supports settings panel requests`);
    assert.ok(Array.isArray(response.data.rows));
  }
  for (const [kind, collection] of Object.entries({
    incidents: 'incidents',
    tasks: 'tasks',
    knowledge: 'articles',
    rcas: 'rcas',
  })) {
    const _id = new ObjectId(),
      recordId = String(_id),
      fileId = new ObjectId();
    await db
      .collection(collection)
      .insertOne({ _id, workspaceId, title: 'Synthetic private record', revision: 2 });
    await db.collection('attachments').insertOne({ _id: fileId, workspaceId, kind, recordId });
    const relatedId = new ObjectId();
    if (kind === 'incidents') {
      await db.collection('tasks').insertOne({
        _id: relatedId,
        workspaceId,
        title: 'Retained follow-up',
        incidentId: recordId,
        revision: 0,
      });
      await db
        .collection('incidentComments')
        .insertOne({ _id: new ObjectId(), workspaceId, incidentId: _id });
      await db
        .collection('deliveries')
        .insertOne({ _id: new ObjectId(), workspaceId, incidentId: _id });
    }
    if (kind === 'knowledge')
      await db
        .collection('incidents')
        .insertOne({ _id: relatedId, workspaceId, knowledgeIds: [recordId], revision: 0 });
    const path = `/${kind}/${recordId}`;
    assert.equal((await request(path, null, 'DELETE', { revision: 2 })).status, 401);
    for (const cookie of cookies)
      assert.equal((await request(path, cookie, 'DELETE', { revision: 2 })).status, 403);
    assert.equal((await request(path, foreign.cookie, 'DELETE', { revision: 2 })).status, 409);
    assert.equal((await request(path, owner.cookie, 'DELETE', { revision: 1 })).status, 409);
    assert.equal((await request(path, owner.cookie, 'DELETE', { revision: -1 })).status, 400);
    assert.ok(await db.collection(collection).findOne({ _id, workspaceId }));
    assert.equal((await request(path, owner.cookie, 'DELETE', { revision: 2 })).status, 204);
    assert.equal(await db.collection(collection).findOne({ _id }), null);
    assert.equal(await db.collection('attachments').findOne({ _id: fileId }), null);
    if (kind === 'incidents') {
      const task = await db.collection('tasks').findOne({ _id: relatedId });
      assert.equal(task.incidentId, '');
      assert.equal(task.revision, 1);
      assert.equal(
        await db.collection('incidentComments').countDocuments({ workspaceId, incidentId: _id }),
        0,
      );
      assert.equal(
        await db.collection('deliveries').countDocuments({ workspaceId, incidentId: _id }),
        0,
      );
    }
    if (kind === 'knowledge')
      assert.deepEqual(
        (await db.collection('incidents').findOne({ _id: relatedId })).knowledgeIds,
        [],
      );
  }
});
