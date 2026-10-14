import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { connectDatabase } from '../../shared/persistence/database.js';
import { createApp } from '../../api/src/app.js';

test('audit history captures writes, failures and deletes without secrets and enforces admin tenant access', async (t) => {
  process.env.DATABASE_SCHEMA =
    process.env.MONGODB_DB = `audit_test_${randomUUID().replaceAll('-', '')}`;
  const { db, client } = await connectDatabase();
  const server = createApp(db).listen(0, '0.0.0.0');
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await db.dropDatabase();
    await client.close();
  });
  const root = `http://127.0.0.1:${server.address().port}/api`;
  async function request(path, cookie, method = 'GET', body) {
    const response = await fetch(root + path, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'X-Requested-With': 'ServiceTrident',
        ...(cookie ? { Cookie: cookie } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await response.text();
    return {
      status: response.status,
      data: text ? JSON.parse(text) : null,
      cookie: response.headers.get('set-cookie')?.split(';')[0],
    };
  }
  const owner = await request('/auth/register', null, 'POST', {
    displayName: 'Audit owner',
    email: 'owner@audit.example',
    password: 'audit-test-password-secure',
  });
  const other = await request('/auth/register', null, 'POST', {
    displayName: 'Other owner',
    email: 'other@audit.example',
    password: 'audit-test-password-secure',
  });
  const created = await request('/services', owner.cookie, 'POST', {
    name: 'Audit service',
    description: 'PRIVATE CONTENT',
  });
  assert.equal(created.status, 201);
  const id = created.data.item.id;
  assert.equal(
    (await request(`/services/${id}`, owner.cookie, 'PATCH', { name: 'Updated service' })).status,
    200,
  );
  assert.equal(
    (
      await request('/auth/profile', owner.cookie, 'PATCH', {
        password: 'DO NOT LOG THIS',
        currentPassword: 'SECRET',
        email: 'invalid',
      })
    ).status,
    400,
  );
  assert.equal((await request(`/services/${id}`, owner.cookie, 'DELETE', {})).status, 204);
  const logs = await request('/tables/audit?sortBy=createdAt&order=asc', owner.cookie);
  assert.equal(logs.status, 200);
  assert.equal(logs.data.total, 7);
  const recordChanges = logs.data.rows.filter(
    (row) =>
      row.operation !== 'POST /api/auth/register' &&
      row.operation !== 'Assign sequential record number',
  );
  assert.equal(
    logs.data.rows.filter((row) => row.operation === 'Assign sequential record number').length,
    2,
  );
  assert.deepEqual(
    recordChanges.map((row) => row.action),
    ['create', 'update', 'update', 'delete'],
  );
  assert.equal(recordChanges[0].recordId, id);
  assert.equal(recordChanges[2].outcome, 'failed');
  assert.ok(!JSON.stringify(logs.data).includes('PRIVATE CONTENT'));
  assert.ok(!JSON.stringify(logs.data).includes('SECRET'));
  assert.ok(!JSON.stringify(logs.data).includes('DO NOT LOG'));
  assert.equal((await request('/tables/audit', other.cookie)).data.total, 2);
  assert.ok(
    (await db.collection('auditEvents').find({}).toArray()).some(
      (row) => row.operation === 'GET /api/tables/:kind' && row.recordType === 'audit',
    ),
  );
  const rejected = await request('/services', null);
  assert.equal(rejected.status, 401);
  assert.ok(await db.collection('auditEvents').findOne({ workspaceId: null, statusCode: 401 }));
  const filter = await request('/tables/audit?searchColumn=action&search=delete', owner.cookie);
  assert.equal(filter.data.total, 1);
  const exported = await fetch(
    root + '/tables/audit?searchColumn=action&search=delete&export=csv',
    { headers: { Cookie: owner.cookie } },
  );
  assert.equal(exported.status, 200);
  assert.ok((await exported.text()).includes(id));
  assert.equal((await request('/tables/audit?sortBy=password', owner.cookie)).status, 400);
  await request('/auth/role', owner.cookie, 'POST', { role: 'viewer' });
  assert.equal((await request('/tables/audit', owner.cookie)).status, 403);
  assert.equal((await request('/tables/audit?export=csv', owner.cookie)).status, 403);
});
