import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, randomBytes } from 'node:crypto';
import { ObjectId } from 'mongodb';
import { connectDatabase } from '../../shared/persistence/database.js';
import { createApp } from '../../api/src/app.js';

test('incident trigger events enforce roles, workspace ownership, exact check references and retention', async (t) => {
  process.env.DATABASE_SCHEMA =
    process.env.MONGODB_DB = `incident_events_test_${randomUUID().replaceAll('-', '')}`;
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
  const incidentId = new ObjectId(),
    monitorId = new ObjectId(),
    eventId = new ObjectId(),
    checkedAt = new Date();
  await db.collection('incidents').insertOne({
    _id: incidentId,
    workspaceId,
    source: 'monitor',
    title: 'Demo dependency outage',
    serviceName: 'Demo Portal',
    status: 'open',
    severity: 'high',
    fields: [],
    timeline: [],
    createdById: endUser.data.user.id,
    createdAt: checkedAt,
    triggeringChecks: [
      {
        monitorId: String(monitorId),
        monitorName: 'Demo API health',
        serviceName: 'Demo API',
        checkedAt,
      },
    ],
  });
  await db.collection('events').insertOne({
    _id: eventId,
    userId: workspaceId,
    monitorId,
    checkedAt,
    status: 'down',
    statusCode: 503,
    durationMs: 20,
    error: 'HTTP 503',
    details: { body: 'Private synthetic details' },
  });
  const path = `/tables/incident-monitor-events?recordId=${incidentId}&sortBy=checkedAt&order=desc`;
  for (const person of [owner, responder, viewer]) {
    const result = await request(path, person.cookie);
    assert.equal(result.status, 200);
    assert.equal(result.data.total, 1);
    assert.equal(result.data.rows[0].monitorName, 'Demo API health');
    assert.equal(result.data.rows[0].id, String(eventId));
    assert.ok(!JSON.stringify(result.data).includes('Private synthetic'));
  }
  assert.equal((await request(path, outside.cookie)).status, 404);
  assert.equal((await request(`${path}&export=csv`, outside.cookie)).status, 404);
  assert.equal((await request(path, endUser.cookie)).status, 403);
  assert.equal((await request(`${path}&export=csv`, endUser.cookie)).status, 403);
  const portal = await request(`/incidents/${incidentId}`, endUser.cookie);
  assert.equal(portal.status, 200);
  assert.ok(!JSON.stringify(portal.data).includes('triggeringChecks'));
  assert.ok(!JSON.stringify(portal.data).includes('Demo API health'));
  assert.equal(
    (await request(`${path}&search=API&searchColumn=monitorName`, viewer.cookie)).data.total,
    1,
  );
  assert.equal((await request(`${path}&search=missing`, viewer.cookie)).data.total, 0);
  const exported = await request(`${path}&export=csv`, viewer.cookie);
  assert.equal(exported.status, 200);
  assert.match(exported.data, /Demo API health/);
  assert.ok(!exported.data.includes('Private synthetic'));
  const expired = new Date(Date.now() - 31 * 86400000);
  await db.collection('events').updateOne({ _id: eventId }, { $set: { checkedAt: expired } });
  await db
    .collection('incidents')
    .updateOne({ _id: incidentId }, { $set: { 'triggeringChecks.0.checkedAt': expired } });
  assert.equal((await request(path, viewer.cookie)).data.total, 0);
  await db
    .collection('incidents')
    .updateOne({ _id: incidentId }, { $unset: { triggeringChecks: '' } });
  assert.equal((await request(path, viewer.cookie)).data.total, 0);
});
