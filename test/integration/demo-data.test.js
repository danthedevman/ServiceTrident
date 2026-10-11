import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { ObjectId } from 'mongodb';
import { connectDatabase } from '../../shared/persistence/database.js';
import { createApp } from '../../api/src/app.js';

test('demo route adds once and removes only its workspace batch', async (t) => {
  process.env.DATABASE_SCHEMA =
    process.env.MONGODB_DB = `demo_test_${randomUUID().replaceAll('-', '')}`;
  const { db, client } = await connectDatabase(),
    server = createApp(db).listen(0, '0.0.0.0');
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await db.dropDatabase();
    await client.close();
  });
  let cookie;
  const request = async (path, method = 'GET', body) => {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'X-Requested-With': 'ServiceTrident',
        ...(cookie ? { Cookie: cookie } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (response.headers.get('set-cookie'))
      cookie = response.headers.get('set-cookie').split(';')[0];
    return { status: response.status, data: await response.json() };
  };
  const account = await request('/auth/register', 'POST', {
    displayName: 'Demo tester',
    email: 'demo-test@example.com',
    password: 'unique test password for demo',
  });
  const workspaceId = new ObjectId(account.data.user.id);
  assert.equal((await request('/settings/demo-data')).status, 200);
  const real = await request('/services', 'POST', { name: 'Demo named real service' });
  assert.equal(real.status, 201);
  assert.equal((await request('/settings/demo-data', 'POST', {})).status, 400);
  const added = await request('/settings/demo-data', 'POST', { confirmation: 'ADD DEMO DATA' });
  assert.equal(added.status, 201, JSON.stringify(added.data));
  const batchId = added.data.batch.batchId;
  assert.equal(
    (await request('/settings/demo-data', 'POST', { confirmation: 'ADD DEMO DATA' })).status,
    409,
  );
  for (const name of [
    'users',
    'invitations',
    'monitors',
    'events',
    'incidents',
    'tasks',
    'articles',
    'attachments',
    'deliveries',
  ])
    assert.equal(await db.collection(name).countDocuments({ demoBatchId: batchId }), 50, name);
  assert.equal(
    await db
      .collection('articles')
      .countDocuments({ demoBatchId: batchId, articleType: 'article' }),
    25,
  );
  assert.equal(
    await db
      .collection('articles')
      .countDocuments({ demoBatchId: batchId, articleType: 'runbook' }),
    25,
  );
  const runbooks = await db
    .collection('articles')
    .find({ demoBatchId: batchId, articleType: 'runbook' })
    .toArray();
  assert.ok(
    runbooks.every(
      (item) =>
        item.steps.length === 3 && item.steps.every((step) => step.title && step.instructions),
    ),
  );
  assert.equal(
    await db.collection('incidentComments').countDocuments({ demoBatchId: batchId }),
    100,
  );
  assert.equal(
    await db.collection('monitors').countDocuments({ demoBatchId: batchId, paused: false }),
    0,
  );
  const catalog = await db.collection('catalogs').findOne({ _id: workspaceId });
  assert.equal(catalog.services.filter((item) => item.demoBatchId === batchId).length, 50);
  assert.equal(catalog.collections.length, 50);
  assert.equal(new Set(catalog.services.map((item) => item.name)).size, 51);
  assert.ok(
    catalog.services
      .filter((item) => item.demoBatchId)
      .every((item) => !item.name.startsWith('Demo')),
  );
  const incident = await db.collection('incidents').findOne({ demoBatchId: batchId });
  assert.match(
    incident.title,
    /response times|authentication failures|server errors|background jobs|dependency unavailable/,
  );
  assert.ok(incident.description.length > 100);
  const config = await db.collection('operations').findOne({ _id: workspaceId });
  for (const name of ['groups', 'shifts', 'integrations'])
    assert.equal(config[name].filter((item) => item.demoBatchId === batchId).length, 50);
  // Every table source is paginated on the server and rejects unsupported columns.
  for (const kind of [
    'services',
    'collections',
    'monitors',
    'members',
    'invitations',
    'groups',
    'coverage',
    'integrations',
    'deliveries',
    'priority-incidents',
    'priority-tasks',
    'impacted-services',
    'demo',
  ]) {
    const first = await request(`/tables/${kind}?pageSize=10`);
    assert.equal(first.status, 200, `${kind}: ${JSON.stringify(first.data)}`);
    assert.ok(first.data.rows.length <= 10, kind);
    const invalid = await request(`/tables/${kind}?sortBy=passwordHash`);
    assert.equal(invalid.status, 400, kind);
    assert.ok(!JSON.stringify(first.data).includes('passwordHash'));
    assert.ok(!JSON.stringify(first.data).includes('"secret":'));
  }
  const page2 = await request('/tables/services?page=2&pageSize=10&sortBy=name');
  assert.equal(page2.data.total, 51);
  assert.equal(page2.data.rows.length, 10);
  const searched = await request('/tables/services?search=Demo%20named&searchColumn=name');
  assert.deepEqual(
    searched.data.rows.map((row) => row.id),
    [real.data.item.id],
  );
  for (const path of [
    `comments?recordId=${incident._id}`,
    `activity?recordId=${incident._id}`,
    `incident-knowledge?recordId=${incident._id}`,
    `attachments?recordKind=incidents&recordId=${incident._id}`,
  ]) {
    const result = await request(`/tables/${path}`);
    assert.equal(result.status, 200, JSON.stringify(result.data));
  }
  const lookup = await request('/references/services?q=Demo%20named');
  assert.equal(lookup.status, 200);
  assert.deepEqual(
    lookup.data.options.map((row) => row.id),
    [real.data.item.id],
  );
  const exportResult = await fetch(
    `http://127.0.0.1:${server.address().port}/api/tables/services?search=Demo%20named&searchColumn=name&export=csv`,
    { headers: { Cookie: cookie } },
  );
  assert.equal(exportResult.status, 200);
  const csv = await exportResult.text();
  assert.ok(csv.includes('Demo named real service'));
  assert.equal(csv.trim().split('\r\n').length, 2);
  assert.equal(
    (await request('/settings/demo-data', 'DELETE', { confirmation: 'DELETE DEMO DATA', batchId }))
      .status,
    200,
  );
  assert.equal(
    (await db.collection('catalogs').findOne({ _id: workspaceId })).services[0].id,
    real.data.item.id,
  );
  for (const name of [
    'users',
    'invitations',
    'monitors',
    'events',
    'incidents',
    'tasks',
    'articles',
    'attachments',
    'deliveries',
    'incidentComments',
  ])
    assert.equal(await db.collection(name).countDocuments({ demoBatchId: batchId }), 0, name);
  assert.equal((await request('/settings/demo-data')).data.batch, null);
});
