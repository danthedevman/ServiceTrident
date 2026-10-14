import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, randomBytes } from 'node:crypto';
import { ObjectId } from 'mongodb';
import { connectDatabase } from '../../shared/persistence/database.js';
import { dispatchDue, processMonitor } from '../../workers/src/monitoring/processor.js';
import { createApp } from '../../api/src/app.js';

test('manual monitor checks enforce ownership, roles, cooldown, duplicate claims, pause and scheduling policy', async (t) => {
  process.env.DATABASE_SCHEMA =
    process.env.MONGODB_DB = `manual_monitor_test_${randomUUID().replaceAll('-', '')}`;
  const { db, client } = await connectDatabase();
  const server = createApp(db).listen(0, '0.0.0.0');
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await db.dropDatabase();
    await client.close();
  });
  const origin = `http://127.0.0.1:${server.address().port}/api`;
  const request = async (path, cookie, body) => {
    const response = await fetch(origin + path, {
      method: body ? 'POST' : 'GET',
      headers: {
        'Content-Type': 'application/json',
        'X-Requested-With': 'ServiceTrident',
        ...(cookie ? { Cookie: cookie } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    return {
      status: response.status,
      data: response.headers.get('content-type')?.includes('json')
        ? await response.json()
        : await response.text(),
      cookie: response.headers.get('set-cookie')?.split(';')[0],
    };
  };
  const register = (email) =>
    request('/auth/register', null, {
      email,
      displayName: 'Demo Owner',
      password: randomBytes(24).toString('hex'),
    });
  const owner = await register('owner@example.test');
  const outside = await register('outside@example.test');
  const workspaceId = new ObjectId(owner.data.user.id);
  const invite = async (role) => {
    const invitation = await request('/invitations', owner.cookie, {
      email: `${role}@example.test`,
      displayName: `Demo ${role}`,
      role,
    });
    assert.equal(invitation.status, 201);
    return request('/auth/invite', null, {
      token: invitation.data.inviteUrl.split('/').at(-1),
      password: randomBytes(24).toString('hex'),
    });
  };
  const responder = await invite('responder'),
    viewer = await invite('viewer'),
    endUser = await invite('user');
  const serviceId = new ObjectId();
  await db.collection('catalogs').insertOne({
    _id: workspaceId,
    services: [{ id: String(serviceId), name: 'Demo Service' }],
    collections: [],
  });
  const created = await request('/monitors', owner.cookie, {
    name: 'Demo Manual Check',
    url: 'https://health.example.com/',
    serviceId: String(serviceId),
    intervalMinutes: 120,
    method: 'HEAD',
    paused: true,
  });
  assert.equal(created.status, 201, JSON.stringify(created.data));
  await db
    .collection('monitors')
    .updateOne(
      { _id: new ObjectId(created.data.monitor.id) },
      { $set: { paused: true, nextCheckAt: new Date(Date.now() + 3600000) } },
    );
  const monitorId = created.data.monitor.id,
    path = `/monitors/${monitorId}/check`;
  for (const person of [responder, viewer, endUser])
    assert.equal((await request(path, person.cookie, {})).status, 403);
  assert.equal((await request(path, outside.cookie, {})).status, 404);
  assert.equal((await request(path, null, {})).status, 401);
  assert.equal(
    (await request(path, owner.cookie, { url: 'https://other.example.test/' })).status,
    400,
  );
  const requested = await request(path, owner.cookie, {});
  assert.equal(requested.status, 202);
  assert.equal(requested.data.monitor.manualCheckPending, true);
  assert.equal((await request(path, owner.cookie, {})).status, 429);
  let jobs = [];
  await dispatchDue(db, {
    addBulk: async (items) => {
      jobs = items;
    },
  });
  assert.ok(
    jobs.some((job) => job.data.monitorId === monitorId),
    'Paused monitor queues its one-off check',
  );
  let calls = 0;
  const results = await Promise.all(
    Array.from({ length: 8 }, () =>
      processMonitor(db, monitorId, async () => {
        calls++;
        return { status: 'up', statusCode: 200, durationMs: 10, error: null };
      }),
    ),
  );
  assert.equal(calls, 1);
  assert.equal(results.filter(Boolean).length, 1);
  let monitor = await db.collection('monitors').findOne({ _id: new ObjectId(monitorId) });
  assert.equal(monitor.paused, true);
  assert.equal(monitor.manualCheckPending, false);
  assert.equal(monitor.lastCheck.statusCode, 200);
  assert.equal(
    await processMonitor(db, monitorId, async () => assert.fail('Paused monitor ran again')),
    false,
  );
  assert.equal((await request(path, owner.cookie, {})).status, 429);
  await db.collection('monitors').updateOne(
    { _id: monitor._id },
    {
      $set: {
        lastManualCheckRequestedAt: new Date(0),
        lastStartedAt: new Date(Date.now() - 30000),
      },
    },
  );
  assert.equal((await request(path, owner.cookie, {})).status, 202);
  monitor = await db.collection('monitors').findOne({ _id: monitor._id });
  assert.ok(
    monitor.nextCheckAt - monitor.lastStartedAt >= 60000,
    'Manual checks preserve one-minute start spacing',
  );
  assert.equal(
    await processMonitor(db, monitorId, async () => assert.fail('Manual check started too soon')),
    false,
  );
  await db.collection('monitors').updateOne(
    { _id: monitor._id },
    {
      $set: {
        manualCheckPending: false,
        lastManualCheckRequestedAt: new Date(0),
        demoBatchId: new ObjectId(),
      },
    },
  );
  assert.equal((await request(path, owner.cookie, {})).status, 400);
  await db
    .collection('monitors')
    .updateOne({ _id: monitor._id }, { $unset: { demoBatchId: '' }, $set: { type: 'tcp' } });
  assert.equal((await request(path, owner.cookie, {})).status, 400);
  assert.ok(
    (await db.collection('auditEvents').countDocuments({ workspaceId, statusCode: 202 })) > 0,
  );
});
