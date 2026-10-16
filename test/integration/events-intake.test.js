import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { ObjectId } from 'mongodb';
import { createApp } from '../../api/src/app.js';
import { connectDatabase } from '../../shared/persistence/database.js';
import { digestToken } from '../../api/src/auth/auth.js';
import { normalizedMonitorEvent, reconcileEventAlert } from '../../shared/domain/events.js';

test(
  'event intake, correlation, immutable history and role/tenant/service boundaries',
  { timeout: 60000 },
  async (t) => {
    process.env.DATABASE_SCHEMA =
      process.env.MONGODB_DB = `events_test_${randomUUID().replaceAll('-', '')}`;
    const { db, client } = await connectDatabase();
    const server = createApp(db).listen(0, '127.0.0.1');
    await new Promise((resolve) => server.once('listening', resolve));
    t.after(async () => {
      await new Promise((resolve) => server.close(resolve));
      await db.dropDatabase();
      await client.close();
    });
    const base = `http://127.0.0.1:${server.address().port}/api`;
    const owner = new ObjectId(),
      other = new ObjectId(),
      viewer = new ObjectId();
    const headers = [];
    for (const [userId, role, workspaceId] of [
      [owner, 'admin', owner],
      [other, 'admin', other],
      [viewer, 'viewer', owner],
    ]) {
      await db.collection('users').insertOne({
        _id: userId,
        email: `${userId}@example.test`,
        displayName: 'Test user',
        role,
        workspaceId,
      });
      const token = randomBytes(32).toString('hex');
      await db
        .collection('sessions')
        .insertOne({ _id: digestToken(token), userId, expiresAt: new Date(Date.now() + 3600000) });
      headers.push({
        Cookie: `servicetrident_session=${token}`,
        'X-Requested-With': 'ServiceTrident',
      });
    }
    const [admin, foreign, readOnly] = headers;
    async function req(path, method = 'GET', body, auth = admin) {
      const res = await fetch(base + path, {
        method,
        headers: { 'Content-Type': 'application/json', ...auth },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      const data = res.headers.get('content-type')?.includes('application/json')
        ? await res.json()
        : await res.text();
      return { status: res.status, data };
    }
    const service = (await req('/services', 'POST', { name: 'Synthetic service', description: '' }))
      .data.item;
    const service2 = (await req('/services', 'POST', { name: 'Other service', description: '' }))
      .data.item;
    const foreignService = (
      await req('/services', 'POST', { name: 'Foreign service', description: '' }, foreign)
    ).data.item;
    const accountId = new ObjectId(),
      key = `stk_${randomBytes(32).toString('hex')}`,
      auth = { Authorization: `Bearer ${key}` };
    await db.collection('serviceAccounts').insertOne({
      _id: accountId,
      workspaceId: owner,
      name: 'Deployment source',
      enabled: true,
      scopes: ['events:create'],
      serviceIds: [service.id],
      apiKeyHash: digestToken(key),
      apiKeyExpiresAt: new Date(Date.now() + 3600000),
    });
    const input = {
      externalId: 'deploy-1',
      correlationKey: 'api-errors',
      title: 'Error threshold exceeded',
      description: 'Synthetic payload',
      payload: { region: 'test-region', token: 'synthetic-token-not-real', nested: { retries: 2 } },
      serviceId: service.id,
      severity: 'high',
      signal: 'firing',
      occurredAt: new Date(Date.now() - 10000).toISOString(),
    };
    assert.equal((await req('/external/v1/events', 'POST', input)).status, 401);
    assert.equal(
      (await req('/external/v1/events', 'POST', { ...input, serviceId: service2.id }, auth)).status,
      403,
    );
    assert.equal(
      (await req('/external/v1/events', 'POST', { ...input, serviceId: foreignService.id }, auth))
        .status,
      403,
    );
    assert.equal(
      (await req('/external/v1/events', 'POST', { ...input, workspaceId: String(other) }, auth))
        .status,
      400,
    );
    assert.equal(
      (await req('/external/v1/events', 'POST', { ...input, occurredAt: {} }, auth)).status,
      400,
    );
    await db
      .collection('serviceAccounts')
      .updateOne({ _id: accountId }, { $set: { scopes: ['tasks:create'] } });
    assert.equal((await req('/external/v1/events', 'POST', input, auth)).status, 403);
    await db
      .collection('serviceAccounts')
      .updateOne({ _id: accountId }, { $set: { scopes: ['events:create'] } });
    const received = await req('/external/v1/events', 'POST', input, auth);
    assert.equal(received.status, 201, JSON.stringify(received.data));
    const event = received.data.event;
    assert.match(event.number, /^EVT\d{7}/);
    assert.ok(event.alertId);
    assert.equal(await db.collection('incidents').countDocuments({ workspaceId: owner }), 0);
    const retried = await req('/external/v1/events', 'POST', input, auth);
    assert.equal(retried.status, 200);
    assert.equal(retried.data.duplicate, true);
    assert.equal(
      (await req('/external/v1/events', 'POST', { ...input, title: 'Changed' }, auth)).status,
      409,
    );
    const parallelTime = new Date(Date.now() - 5000).toISOString();
    const concurrent = await Promise.all(
      Array.from({ length: 4 }, () =>
        req(
          '/external/v1/events',
          'POST',
          {
            ...input,
            externalId: 'deploy-parallel',
            occurredAt: parallelTime,
          },
          auth,
        ),
      ),
    );
    assert.ok(
      concurrent.every((row) => [200, 201].includes(row.status)),
      JSON.stringify(concurrent),
    );
    assert.equal(await db.collection('events').countDocuments({ userId: owner }), 2);
    const detail = await req(`/events/${event.id}`);
    assert.equal(detail.status, 200);
    assert.equal(detail.data.event.sourceType, 'external');
    assert.equal(detail.data.event.fingerprint, undefined);
    assert.equal(detail.data.monitor, null);
    assert.equal((await req(`/events/${event.id}`, 'GET', undefined, foreign)).status, 404);
    assert.equal((await req(`/events/${event.id}`, 'GET', undefined, readOnly)).status, 200);
    const alert = (await req(`/event-alerts/${event.alertId}`)).data.item;
    assert.equal(alert.status, 'open');
    assert.match(alert.number, /^ALT/);
    assert.equal(
      (
        await req(
          `/event-alerts/${event.alertId}`,
          'PATCH',
          { status: 'acknowledged', revision: alert.revision, confirm: true },
          readOnly,
        )
      ).status,
      403,
    );
    assert.equal(
      (
        await req(`/event-alerts/${event.alertId}`, 'PATCH', {
          status: 'acknowledged',
          revision: alert.revision,
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await req(`/event-alerts/${event.alertId}`, 'PATCH', {
          status: 'acknowledged',
          revision: alert.revision,
          confirm: true,
        })
      ).status,
      200,
    );
    assert.equal(
      (
        await req(`/event-alerts/${event.alertId}`, 'PATCH', {
          status: 'resolved',
          revision: alert.revision,
          confirm: true,
        })
      ).status,
      409,
    );
    const recovery = {
      ...input,
      externalId: 'recover-1',
      signal: 'recovery',
      occurredAt: new Date().toISOString(),
    };
    assert.equal((await req('/external/v1/events', 'POST', recovery, auth)).status, 201);
    assert.equal((await req(`/event-alerts/${event.alertId}`)).data.item.status, 'resolved');
    await req(
      '/external/v1/events',
      'POST',
      {
        ...input,
        externalId: 'delayed-failure',
        occurredAt: new Date(Date.now() - 20000).toISOString(),
      },
      auth,
    );
    assert.equal(
      (await req(`/event-alerts/${event.alertId}`)).data.item.status,
      'resolved',
      'old messages cannot reopen a recovered alert',
    );
    const info = await req(
      '/external/v1/events',
      'POST',
      {
        externalId: 'deployment-info',
        title: 'Release completed',
        eventType: 'change',
        signal: 'information',
        serviceId: service.id,
      },
      auth,
    );
    assert.equal(info.status, 201);
    assert.equal(info.data.event.alertId, null);
    assert.equal((await req('/tables/events?sourceType=external&severity=high')).data.total, 4);
    assert.equal((await req('/tables/event-alerts?status=resolved')).data.total, 1);
    assert.equal((await req('/tables/event-alerts')).data.total, 0);
    const incident = await req('/incidents', 'POST', {
      title: 'Investigate deployment',
      description: 'Review event',
      serviceId: service.id,
      severity: 'high',
      eventAlertId: event.alertId,
    });
    assert.equal(incident.status, 201, JSON.stringify(incident.data));
    assert.equal(
      (await req(`/events/${event.id}`)).data.incidents[0].id,
      incident.data.incident.id,
    );
    assert.equal(
      (await req(`/tables/events?incidentId=${incident.data.incident.id}`)).data.total,
      4,
    );
    assert.equal((await req(`/tables/event-incidents?eventId=${event.id}`)).data.total, 1);
    assert.equal((await req(`/tables/event-incidents?alertId=${event.alertId}`)).data.total, 1);
    assert.equal(
      (await req(`/tables/event-alerts?incidentId=${incident.data.incident.id}`)).data.total,
      1,
    );
    assert.equal((await req(`/related-counts/events/${event.id}`)).data.counts.incidents, 1);
    assert.equal(
      (await req(`/related-counts/incidents/${incident.data.incident.id}`)).data.counts.events,
      4,
    );
    assert.equal((await req(`/events/${event.id}`)).data.event.payload.token, '[redacted]');
    assert.equal(
      (await req(`/tables/events?search=Error&columnSearch=deploy-1&searchColumn=externalId`)).data
        .total,
      1,
    );
    for (const path of [
      `/tables/event-incidents?eventId=${event.id}`,
      `/tables/event-incidents?alertId=${event.alertId}`,
      `/tables/event-alerts?incidentId=${incident.data.incident.id}`,
      `/related-counts/events/${event.id}`,
    ])
      assert.equal((await req(path, 'GET', undefined, foreign)).status, 404);
    const filters = { '/events:events:default:admin': { search: 'synthetic' } };
    assert.equal((await req('/auth/preferences', 'PATCH', { listFilters: filters })).status, 200);
    assert.deepEqual(
      (await db.collection('users').findOne({ _id: owner })).uiPreferences.listFilters,
      filters,
    );
    assert.equal(
      (await db.collection('users').findOne({ _id: other })).uiPreferences?.listFilters,
      undefined,
    );
    const originalEvent = await db.collection('events').findOne({ _id: new ObjectId(event.id) });
    await db
      .collection('events')
      .updateOne(
        { _id: new ObjectId(info.data.event.id) },
        { $set: { checkedAt: originalEvent.checkedAt } },
      );
    assert.equal(
      (await req(`/events/${info.data.event.id}`)).data.incidents.length,
      0,
      'Same receipt timestamp must not correlate unrelated external events',
    );
    const monitor = {
      _id: new ObjectId(),
      userId: owner,
      name: 'Synthetic monitor',
      serviceId: new ObjectId(service.id),
    };
    const down = normalizedMonitorEvent(monitor, {
      _id: new ObjectId(),
      userId: owner,
      monitorId: monitor._id,
      checkedAt: new Date(),
      status: 'down',
      error: 'HTTP 503',
    });
    await db.collection('events').insertOne(down);
    await reconcileEventAlert(db, down);
    assert.equal((await req(`/event-alerts/${down.alertId}`)).data.item.status, 'open');
    const up = normalizedMonitorEvent(monitor, {
      ...down,
      _id: new ObjectId(),
      checkedAt: new Date(Date.now() + 1000),
      status: 'up',
      error: null,
    });
    await reconcileEventAlert(db, up);
    assert.equal((await req(`/event-alerts/${down.alertId}`)).data.item.status, 'resolved');
    const metrics = (await req('/event-metrics')).data;
    assert.equal(metrics.sources.find((row) => row.sourceType === 'external').count, 5);
    assert.equal(
      metrics.outcomes.reduce((n, row) => n + row.count, 0),
      1,
    );
    const firstRecovery = await req(
      '/external/v1/events',
      'POST',
      { ...recovery, externalId: 'recovery-first', correlationKey: 'other-signal' },
      auth,
    );
    assert.equal(firstRecovery.status, 201);
    await req(
      '/external/v1/events',
      'POST',
      { ...input, externalId: 'late-failure-after-recovery', correlationKey: 'other-signal' },
      auth,
    );
    assert.equal(
      (await req(`/event-alerts/${firstRecovery.data.event.alertId}`)).data.item.status,
      'resolved',
    );
    assert.equal(
      (
        await req(
          '/external/v1/events',
          'POST',
          { ...input, externalId: 'invalid-signal', signal: 'information' },
          auth,
        )
      ).status,
      400,
    );
    assert.equal(
      (
        await req(
          '/external/v1/events',
          'POST',
          { ...input, externalId: 'invalid-time', occurredAt: '2026-99-10T12:00:00Z' },
          auth,
        )
      ).status,
      400,
    );
    await db
      .collection('serviceAccounts')
      .updateOne({ _id: accountId }, { $set: { enabled: false } });
    assert.equal(
      (await req('/external/v1/events', 'POST', { ...input, externalId: 'disabled' }, auth)).status,
      401,
    );
    const audits = await db.collection('auditEvents').find({ workspaceId: owner }).toArray();
    assert.ok(audits.some((row) => row.recordType === 'events'));
    assert.ok(!JSON.stringify(audits).includes(key));
    assert.ok(!JSON.stringify(audits).includes('Synthetic payload'));
  },
);
