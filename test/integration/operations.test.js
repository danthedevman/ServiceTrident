import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { ObjectId } from 'mongodb';
import { connectDatabase } from '../../shared/persistence/database.js';
import { createApp } from '../../api/src/app.js';
import { reconcileOperations } from '../../workers/src/notifications/reconcile.js';
import { processDelivery } from '../../workers/src/notifications/delivery.js';

test(
  'workspace access, field protection, schedules, incident lifecycle and delivery retries',
  { timeout: 30000 },
  async (t) => {
    process.env.DATABASE_SCHEMA =
      process.env.MONGODB_DB = `operations_test_${randomUUID().replaceAll('-', '')}`;
    process.env.INTEGRATION_ENCRYPTION_KEY = 'cd'.repeat(32);
    const { db, client } = await connectDatabase(),
      server = createApp(db).listen(0, '0.0.0.0');
    await new Promise((resolve) => server.once('listening', resolve));
    t.after(async () => {
      await new Promise((resolve) => server.close(resolve));
      await db.dropDatabase();
      await client.close();
    });
    const base = `http://127.0.0.1:${server.address().port}/api`;
    const request = async (path, cookie, method = 'GET', body) => {
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
    };
    const registered = await request('/auth/register', null, 'POST', {
        displayName: 'Test user',
        email: 'owner@example.com',
        password: 'long unique owner password',
      }),
      owner = registered.cookie,
      workspaceId = new ObjectId(registered.data.user.id);
    // This suite exercises immediate delivery; grouping windows have their own regression suite.
    await db
      .collection('users')
      .updateOne({ _id: workspaceId }, { $set: { 'workspaceSettings.alertGroupingSeconds': 0 } });
    const other = (
      await request('/auth/register', null, 'POST', {
        displayName: 'Test user',
        email: 'other@example.com',
        password: 'long unique other password',
      })
    ).cookie;
    const service = (await request('/services', owner, 'POST', { name: 'Checkout' })).data.item;
    const missingName = await request('/invitations', owner, 'POST', {
      email: 'missing@example.com',
      displayName: '  ',
      role: 'user',
    });
    assert.equal(missingName.status, 400);
    assert.equal(missingName.data.fields.displayName, 'Name is required.');
    const missingEmail = await request('/invitations', owner, 'POST', {
      email: '',
      displayName: 'Name',
      role: 'user',
    });
    assert.equal(missingEmail.data.fields.email, 'Email is required.');
    const invitation = await request('/invitations', owner, 'POST', {
      email: 'responder@example.com',
      displayName: 'Responder',
      role: 'responder',
    });
    assert.equal(invitation.status, 201);
    const token = invitation.data.inviteUrl.split('/').at(-1);
    assert.ok(!JSON.stringify((await request('/invitations', owner)).data).includes(token));
    const joined = await request('/auth/invite', null, 'POST', {
        token,
        password: 'long unique teammate password',
      }),
      teammate = joined.cookie;
    assert.equal(joined.status, 201);
    assert.equal(joined.data.user.workspaceId, String(workspaceId));
    assert.equal(joined.data.user.role, 'responder');
    assert.equal(
      (
        await request('/auth/invite', null, 'POST', {
          token,
          password: 'long unique teammate password',
        })
      ).status,
      400,
    );
    assert.equal((await request('/services', teammate)).data.services[0].id, service.id);
    assert.equal((await request('/services', other)).data.services.length, 0);
    for (const [path, method, body] of [
      ['/services', 'POST', { name: 'No' }],
      ['/monitors', 'POST', {}],
      ['/incident-fields', 'PUT', {}],
      ['/on-call', 'PUT', {}],
      ['/invitations', 'POST', {}],
    ])
      assert.equal((await request(path, teammate, method, body)).status, 403, path);
    assert.equal((await request('/integrations', teammate)).status, 403);
    let schema = (await request('/incident-fields', owner)).data;
    assert.equal(
      (
        await request('/incident-fields', owner, 'PUT', {
          ...schema,
          fields: schema.fields.slice(1),
        })
      ).status,
      400,
    );
    const custom = {
      id: new ObjectId().toHexString(),
      label: 'Environment',
      type: 'select',
      required: true,
      archived: false,
      options: ['Production', 'Staging'],
    };
    assert.equal(
      (
        await request('/incident-fields', owner, 'PUT', {
          revision: schema.revision,
          fields: [...schema.fields, custom],
        })
      ).status,
      200,
    );
    schema = (await request('/incident-fields', owner)).data;
    assert.equal(
      (
        await request('/incident-fields', owner, 'PUT', {
          ...schema,
          fields: schema.fields.map((f) => (f.id === custom.id ? { ...f, type: 'text' } : f)),
        })
      ).status,
      400,
    );
    const input = {
      title: 'Checkout outage',
      serviceId: service.id,
      severity: 'high',
      description: 'Investigating',
      custom: { [custom.id]: 'Production' },
    };
    assert.equal(
      (await request('/incidents', teammate, 'POST', { ...input, custom: {} })).status,
      400,
    );
    const created = await request('/incidents', teammate, 'POST', {...input, source: 'monitor', sourceAccountId: String(workspaceId)});
    assert.equal(created.status, 201);
    const incident = created.data.incident;
    assert.equal(incident.source, 'manual');
    assert.equal(incident.sourceAccountId, undefined);
    assert.equal((await request('/incidents?source=manual', teammate)).data.total, 1);
    assert.equal((await request(`/incidents/${incident.id}`, other)).status, 404);
    assert.equal((await request('/incidents', other)).data.total, 0);
    assert.equal(
      (
        await request('/incident-fields', owner, 'PUT', {
          ...schema,
          fields: schema.fields.map((f) =>
            f.id === custom.id
              ? {
                  ...f,
                  label: 'Deployment environment',
                  options: ['Staging', 'Production'],
                  archived: true,
                }
              : f,
          ),
        })
      ).status,
      200,
    );
    const snapshot = (await request(`/incidents/${incident.id}`, teammate)).data.incident;
    assert.equal(snapshot.fields[0].label, 'Environment');
    assert.deepEqual(snapshot.fields[0].options, ['Production', 'Staging']);
    assert.equal(
      (
        await request(`/incidents/${incident.id}`, teammate, 'PATCH', {
          ...snapshot,
          status: 'acknowledged',
        })
      ).status,
      200,
    );
    assert.equal(
      (
        await request(`/incidents/${incident.id}`, teammate, 'PATCH', {
          ...snapshot,
          status: 'resolved',
        })
      ).status,
      409,
    );
    const csv = await fetch(`${base}/incidents/export?status=acknowledged`, {
      headers: { Cookie: teammate },
    });
    assert.equal(csv.status, 200);
    assert.match(await csv.text(), /Checkout outage/);
    assert.equal((await request('/incidents?status=open', owner)).data.total, 0);
    let schedule = (await request('/on-call', owner)).data;
    const now = Date.now(),
      shift = {
        id: new ObjectId().toHexString(),
        userId: joined.data.user.id,
        serviceIds: [service.id],
        start: new Date(now - 60000).toISOString(),
        end: new Date(now + 3600000).toISOString(),
      };
    assert.equal(
      (await request('/on-call', owner, 'PUT', { revision: schedule.revision, shifts: [shift] }))
        .status,
      200,
    );
    schedule = (await request('/on-call', owner)).data;
    assert.equal(
      (
        await request('/on-call', owner, 'PUT', {
          ...schedule,
          shifts: [shift, { ...shift, id: new ObjectId().toHexString() }],
        })
      ).status,
      400,
    );
    assert.equal(
      (await request('/on-call', owner, 'PUT', { revision: schedule.revision - 1, shifts: [] }))
        .status,
      409,
    );
    const integrationId = new ObjectId().toHexString(),
      config = (await request('/integrations', owner)).data;
    assert.equal(
      (
        await request(`/integrations/${integrationId}`, owner, 'PUT', {
          revision: config.revision,
          name: 'Alerts',
          type: 'slack',
          url: 'https://hooks.slack.com/services/A/B/secret',
          enabled: true,
          recovery: true,
          serviceIds: [],
        })
      ).status,
      200,
    );
    const safe = (await request('/integrations', owner)).data;
    assert.ok(!JSON.stringify(safe).includes('secret'));
    assert.ok(
      !(
        await db.collection('operations').findOne({ _id: workspaceId })
      ).integrations[0].secret.includes('hooks.slack.com'),
    );
    // Drain the manual incident before creating the monitor impact.
    const queued = [],
      queue = { add: async (...args) => queued.push(args) };
    await reconcileOperations(db, queue);
    const monitorId = new ObjectId(),
      checkedAt = new Date(),
      triggerEventId = new ObjectId();
    await db.collection('monitors').insertOne({
      _id: monitorId,
      userId: workspaceId,
      serviceId: new ObjectId(service.id),
      intervalMinutes: 1,
      paused: false,
      name: 'Checkout health',
      lastCheck: { checkedAt, status: 'down', statusCode: 503, durationMs: 123, error: 'HTTP 503' },
    });
    await db.collection('events').insertMany([
      {
        _id: triggerEventId,
        monitorId,
        userId: workspaceId,
        checkedAt,
        status: 'down',
        statusCode: 503,
        durationMs: 123,
        error: 'HTTP 503',
        details: { privateTestField: 'Must stay out of related rows' },
      },
      {
        _id: new ObjectId(),
        monitorId,
        userId: workspaceId,
        checkedAt: new Date(+checkedAt + 1),
        status: 'up',
        statusCode: 200,
        durationMs: 10,
      },
      {
        _id: new ObjectId(),
        monitorId,
        userId: new ObjectId(),
        checkedAt,
        status: 'down',
        statusCode: 500,
        durationMs: 10,
      },
    ]);
    await Promise.all([reconcileOperations(db, queue), reconcileOperations(db, queue)]);
    assert.equal(
      await db.collection('incidents').countDocuments({ workspaceId, activeAutomatic: true }),
      1,
    );
    const automatic = await db.collection('incidents').findOne({ activeAutomatic: true });
    assert.equal(automatic.source, 'monitor');
    const origin = await request(`/incidents/${automatic._id}`, teammate);
    assert.ok(origin.data.origin.some(row => row.href === `/monitors/${monitorId}`));
    assert.ok(origin.data.origin.some(row => row.href?.endsWith(`/events/${triggerEventId}`)));
    assert.equal((await request('/incidents?source=monitor', teammate)).data.total, 1);
    assert.equal((await request('/incidents?searchColumn=source&search=Monitor', teammate)).data.total, 1);
    assert.equal(automatic.assigneeId, joined.data.user.id);
    assert.equal(automatic.triggeringChecks.length, 1);
    const eventsPath = `/tables/incident-monitor-events?recordId=${automatic._id}&sortBy=checkedAt&order=desc`;
    const triggeringEvents = await request(eventsPath, teammate);
    assert.equal(triggeringEvents.status, 200);
    assert.equal(triggeringEvents.data.total, 1);
    assert.equal(triggeringEvents.data.rows[0].id, String(triggerEventId));
    assert.equal(triggeringEvents.data.rows[0].monitorName, 'Checkout health');
    assert.equal(triggeringEvents.data.rows[0].serviceName, 'Checkout');
    assert.ok(!JSON.stringify(triggeringEvents.data).includes('privateTestField'));
    assert.equal((await request(eventsPath, other)).status, 404);
    assert.equal((await request(eventsPath, null)).status, 401);
    assert.equal((await request(`${eventsPath}&search=does-not-match`, teammate)).data.total, 0);
    assert.equal(
      (await request(`${eventsPath}&search=Checkout&searchColumn=monitorName`, teammate)).data
        .total,
      1,
    );
    assert.equal((await request(`${eventsPath}&page=2`, teammate)).data.rows.length, 0);
    assert.equal((await request(`${eventsPath}&pageSize=1000`, owner)).status, 400);
    const exported = await fetch(`${base}${eventsPath}&export=csv`, {
      headers: { Cookie: teammate },
    });
    assert.equal(exported.status, 200);
    const exportedText = await exported.text();
    assert.match(exportedText, /Checkout health/);
    assert.match(exportedText, /503/);
    assert.ok(!exportedText.includes('Must stay out'));
    const originalTriggerTime = automatic.triggeringChecks[0].checkedAt;
    await reconcileOperations(db, queue);
    assert.equal(
      await db
        .collection('deliveries')
        .countDocuments({ incidentId: automatic._id, event: 'impacted' }),
      1,
    );
    const delivery = await db.collection('deliveries').findOne({ incidentId: automatic._id });
    let sent = 0;
    await Promise.all([
      processDelivery(db, delivery._id, async () => {
        sent++;
        return {};
      }),
      processDelivery(db, delivery._id, async () => {
        sent++;
        return {};
      }),
    ]);
    assert.equal(sent, 1);
    assert.equal((await db.collection('deliveries').findOne({ _id: delivery._id })).status, 'sent');
    // Pausing or stale results must not report recovery.
    await db.collection('monitors').updateOne({ _id: monitorId }, { $set: { paused: true } });
    await reconcileOperations(db, queue);
    assert.equal((await db.collection('incidents').findOne({ _id: automatic._id })).status, 'open');
    await db
      .collection('monitors')
      .updateOne(
        { _id: monitorId },
        { $set: { paused: false, lastCheck: { status: 'up', checkedAt: new Date() } } },
      );
    await reconcileOperations(db, queue);
    assert.equal(
      (await db.collection('incidents').findOne({ _id: automatic._id })).status,
      'resolved',
    );
    assert.equal(
      +new Date(
        (await db.collection('incidents').findOne({ _id: automatic._id })).triggeringChecks[0]
          .checkedAt,
      ),
      +new Date(originalTriggerTime),
    );
    assert.equal((await request(eventsPath, teammate)).data.rows[0].statusCode, 503);
    const recovered = await db
      .collection('deliveries')
      .findOne({ incidentId: automatic._id, event: 'recovered' });
    for (let i = 0; i < 5; i++) {
      await db
        .collection('deliveries')
        .updateOne({ _id: recovered._id }, { $set: { nextAttemptAt: new Date(0) } });
      await processDelivery(db, recovered._id, async () => {
        throw new Error('credential-secret https://private-webhook');
      });
    }
    const failed = await db.collection('deliveries').findOne({ _id: recovered._id });
    assert.equal(failed.status, 'failed');
    assert.equal(failed.attempts, 5);
    assert.ok(!failed.error.includes('credential-secret'));
    assert.equal(
      (await request(`/deliveries/${recovered._id}/retry`, owner, 'POST', {})).status,
      200,
    );
    const missingMemberName = await request(`/members/${joined.data.user.id}`, owner, 'PATCH', {
      displayName: '',
      role: 'responder',
      disabled: false,
    });
    assert.equal(missingMemberName.status, 400);
    assert.equal(missingMemberName.data.fields.displayName, 'Name is required.');
    assert.equal(
      (
        await request(`/members/${joined.data.user.id}`, owner, 'PATCH', {
          displayName: 'Responder',
          role: 'responder',
          disabled: true,
        })
      ).status,
      200,
    );
    assert.equal((await request('/services', teammate)).status, 401);
    assert.equal(
      (
        await request(`/members/${workspaceId}`, owner, 'PATCH', {
          displayName: 'Responder',
          role: 'responder',
          disabled: true,
        })
      ).status,
      409,
    );
  },
);
