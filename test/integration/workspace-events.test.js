import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, randomBytes } from 'node:crypto';
import { ObjectId } from 'mongodb';
import { connectDatabase } from '../../shared/persistence/database.js';
import { createApp } from '../../api/src/app.js';

test('workspace Events enforce roles, tenant isolation, filters, safe exports, metrics and retention', async (t) => {
  process.env.DATABASE_SCHEMA =
    process.env.MONGODB_DB = `workspace_events_test_${randomUUID().replaceAll('-', '')}`;
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
  const monitorId = new ObjectId(),
    serviceId = new ObjectId();
  await db.collection('catalogs').insertOne({
    _id: workspaceId,
    services: [{ id: String(serviceId), name: 'Demo Service' }],
    collections: [],
  });
  await db
    .collection('monitors')
    .insertOne({ _id: monitorId, userId: workspaceId, serviceId, name: 'Demo Check' });
  const event = {
    userId: workspaceId,
    monitorId,
    checkedAt: new Date(),
    status: 'down',
    statusCode: 503,
    durationMs: 20,
    error: 'HTTP 503',
    details: { body: 'Private synthetic response' },
  };
  await db.collection('events').insertMany([
    { ...event, _id: new ObjectId() },
    { ...event, _id: new ObjectId(), status: 'up', statusCode: 200, durationMs: 40 },
    { ...event, _id: new ObjectId(), checkedAt: new Date(Date.now() - 31 * 86400000) },
    { ...event, _id: new ObjectId(), userId: new ObjectId(outside.data.user.id) },
  ]);
  await db.collection('events').updateMany({ userId: workspaceId }, { $unset: { number: '' } });
  for (const person of [owner, responder, viewer]) {
    const result = await request('/tables/events?sortBy=checkedAt&order=desc', person.cookie);
    assert.equal(result.status, 200);
    assert.equal(result.data.total, 2);
    for (const row of result.data.rows) assert.match(row.number, /^EVT\d{7,}$/);
    assert.equal(result.data.rows[0].monitorName, 'Demo Check');
    assert.equal(result.data.rows[0].serviceName, 'Demo Service');
    assert.ok(!JSON.stringify(result.data).includes('Private synthetic'));
  }
  assert.equal((await request('/tables/events', outside.cookie)).data.total, 1);
  assert.equal((await request('/tables/events', endUser.cookie)).status, 403);
  assert.equal((await request('/event-metrics', endUser.cookie)).status, 403);
  assert.equal((await request('/tables/events?status=down', viewer.cookie)).data.total, 1);
  assert.equal(
    (await request(`/tables/events?serviceId=${serviceId}`, viewer.cookie)).data.total,
    2,
  );
  assert.equal(
    (await request(`/tables/events?serviceId=${new ObjectId()}`, viewer.cookie)).data.total,
    0,
  );
  assert.equal(
    (await request('/tables/events?search=Check&searchColumn=monitorName', viewer.cookie)).data
      .total,
    2,
  );
  assert.equal((await request('/tables/events?status=bogus', viewer.cookie)).status, 400);
  assert.equal((await request('/tables/events?serviceId=bogus', viewer.cookie)).status, 400);
  const csv = await request('/tables/events?status=down&export=csv', viewer.cookie);
  assert.equal(csv.status, 200);
  assert.match(csv.data, /Demo Check/);
  assert.ok(!csv.data.includes('Private synthetic'));
  const metrics = await request('/event-metrics', viewer.cookie);
  assert.equal(metrics.status, 200);
  assert.equal(
    metrics.data.outcomes.reduce((sum, row) => sum + row.count, 0),
    2,
  );
  assert.equal(
    metrics.data.outcomes.reduce((sum, row) => sum + row.durationTotal, 0),
    60,
  );
  assert.equal(
    metrics.data.outcomes.reduce((sum, row) => sum + row.durationCount, 0),
    2,
  );
  assert.equal(
    (await request(`/event-metrics?serviceId=${new ObjectId()}`, viewer.cookie)).data.outcomes
      .length,
    0,
  );
  const incidentId = new ObjectId();
  await db.collection('incidents').insertOne({
    _id: incidentId,
    workspaceId,
    serviceId: String(serviceId),
    createdById: endUser.data.user.id,
    timeline: [
      { kind: 'work_note', note: 'Internal synthetic note' },
      { kind: 'status', note: 'Opened' },
    ],
  });
  await db.collection('incidentComments').insertMany([
    { workspaceId, incidentId, kind: 'comment' },
    { workspaceId, incidentId, kind: 'work_note' },
  ]);
  await db.collection('tasks').insertMany([
    { workspaceId, serviceId: String(serviceId), incidentId: String(incidentId), status: 'todo' },
    {
      workspaceId,
      serviceId: String(serviceId),
      incidentId: String(incidentId),
      status: 'archived',
    },
  ]);
  const triggeringEvent = await db
    .collection('events')
    .findOne({ userId: workspaceId, status: 'down', checkedAt: event.checkedAt });
  await db.collection('incidents').updateOne(
    { _id: incidentId },
    {
      $set: {
        title: 'Demo triggered incident',
        status: 'open',
        triggeringChecks: [{ monitorId: String(monitorId), checkedAt: event.checkedAt }],
      },
    },
  );
  const foreignIncident = new ObjectId(),
    falseMatchIncident = new ObjectId();
  await db.collection('incidents').insertMany([
    {
      _id: foreignIncident,
      workspaceId: new ObjectId(outside.data.user.id),
      title: 'Foreign incident',
      triggeringChecks: [{ monitorId: String(monitorId), checkedAt: event.checkedAt }],
    },
    {
      _id: falseMatchIncident,
      workspaceId,
      title: 'Wrong check pair',
      triggeringChecks: [
        { monitorId: String(monitorId), checkedAt: new Date(+event.checkedAt - 1000) },
        { monitorId: String(new ObjectId()), checkedAt: event.checkedAt },
      ],
    },
  ]);
  assert.equal(
    (await request(`/tables/events?incidentId=${incidentId}`, viewer.cookie)).data.total,
    2,
  );
  assert.equal(
    (await request(`/tables/events?incidentId=${falseMatchIncident}`, viewer.cookie)).data.total,
    0,
  );
  assert.equal(
    (await request(`/tables/events?incidentId=${foreignIncident}`, viewer.cookie)).status,
    404,
  );
  assert.equal((await request('/tables/events?incidentId=invalid', viewer.cookie)).status, 400);
  const eventPath = `/monitors/${monitorId}/events/${triggeringEvent._id}`;
  for (const person of [owner, responder, viewer]) {
    const response = await request(eventPath, person.cookie);
    assert.equal(response.status, 200);
    assert.deepEqual(response.data.incidents, [
      {
        id: String(incidentId),
        title: 'Demo triggered incident',
        number: 'INC0000001',
        status: 'open',
      },
    ]);
    assert.equal(response.data.incidentsTruncated, false);
  }
  assert.equal((await request(eventPath, outside.cookie)).status, 404);
  assert.equal((await request(eventPath, endUser.cookie)).status, 403);
  const unrelatedEvent = new ObjectId();
  await db
    .collection('events')
    .insertOne({ ...event, _id: unrelatedEvent, checkedAt: new Date(+event.checkedAt - 2000) });
  assert.deepEqual(
    (await request(`/monitors/${monitorId}/events/${unrelatedEvent}`, viewer.cookie)).data
      .incidents,
    [],
  );
  await db.collection('events').deleteOne({ _id: unrelatedEvent });
  await db
    .collection('incidents')
    .deleteMany({ _id: { $in: [foreignIncident, falseMatchIncident] } });
  const associatedRows = await request('/tables/events', viewer.cookie);
  assert.equal(associatedRows.status, 200);
  assert.deepEqual(
    associatedRows.data.rows.find((row) => row.id === String(triggeringEvent._id)).incidents,
    [
      {
        id: String(incidentId),
        title: 'Demo triggered incident',
        number: 'INC0000001',
        status: 'open',
      },
    ],
  );
  const associatedExport = await request('/tables/events?export=csv', viewer.cookie);
  assert.match(associatedExport.data, /incidentTitles/);
  assert.match(associatedExport.data, /INC0000001/);
  assert.ok(
    !associatedExport.data.includes('Foreign incident') &&
      !associatedExport.data.includes('Wrong check pair'),
  );
  const related = await request(`/related-counts/services/${serviceId}`, viewer.cookie);
  assert.equal(related.status, 200);
  assert.deepEqual(related.data.counts, { incidents: 1, tasks: 1, knowledge: 0, monitors: 1 });
  assert.equal(
    (await request(`/related-counts/services/${serviceId}`, outside.cookie)).status,
    404,
  );
  assert.equal(
    (await request(`/related-counts/services/${serviceId}`, endUser.cookie)).status,
    403,
  );
  assert.equal(
    (await request(`/related-counts/monitors/${monitorId}`, viewer.cookie)).data.counts.events,
    2,
  );
  assert.equal(
    (await request(`/related-counts/incidents/${incidentId}`, responder.cookie)).data.counts
      .discussion,
    2,
  );
  const portalCounts = await request(`/related-counts/incidents/${incidentId}`, endUser.cookie);
  assert.equal(portalCounts.status, 200);
  assert.deepEqual(portalCounts.data.counts, { attachments: 0, discussion: 1, activity: 1 });
  assert.equal(
    (await request(`/related-counts/incidents/${incidentId}`, outside.cookie)).status,
    404,
  );
});
