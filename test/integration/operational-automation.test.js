import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { ObjectId } from 'mongodb';
import { connectDatabase } from '../../shared/persistence/database.js';
import { createApp } from '../../api/src/app.js';
import { digestToken } from '../../api/src/auth/auth.js';
import { reconcileEscalations } from '../../workers/src/notifications/escalations.js';
import { processDelivery } from '../../workers/src/notifications/delivery.js';
import { processMonitor } from '../../workers/src/monitoring/processor.js';
import { monitorHealth } from '../../shared/domain/service-health.js';

test(
  'operational rules, silences, escalation, delivery limits and independent probes enforce boundaries',
  { timeout: 120000 },
  async (t) => {
    process.env.INTEGRATION_ENCRYPTION_KEY = randomBytes(32).toString('hex');
    process.env.DATABASE_SCHEMA =
      process.env.MONGODB_DB = `test_automation_${randomUUID().replaceAll('-', '')}`;
    const { db, client } = await connectDatabase();
    const server = createApp(db).listen(0, '127.0.0.1');
    await new Promise((resolve) => server.once('listening', resolve));
    t.after(async () => {
      await new Promise((resolve) => server.close(resolve));
      await db.dropDatabase();
      await client.close();
    });
    const base = `http://127.0.0.1:${server.address().port}/api`,
      owner = new ObjectId(),
      foreign = new ObjectId(),
      responder = new ObjectId();
    const cookies = [];
    for (const [_id, role, workspaceId] of [
      [owner, 'admin', owner],
      [foreign, 'admin', foreign],
      [responder, 'responder', owner],
    ]) {
      await db.collection('users').insertOne({
        _id,
        email: `${_id}@example.test`,
        displayName: 'Synthetic operator',
        role,
        workspaceId,
        monitorCount: 0,
      });
      const token = randomBytes(32).toString('hex');
      await db.collection('sessions').insertOne({
        _id: digestToken(token),
        userId: _id,
        expiresAt: new Date(Date.now() + 3600000),
      });
      cookies.push({
        Cookie: `servicetrident_session=${token}`,
        'X-Requested-With': 'ServiceTrident',
      });
    }
    const request = async (path, method = 'GET', body, headers = cookies[0]) => {
      const response = await fetch(base + path, {
        method,
        headers: { 'Content-Type': 'application/json', ...headers },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      return { status: response.status, data: await response.json() };
    };
    const service = (await request('/services', 'POST', { name: 'Test service', description: '' }))
      .data.item;
    const otherService = (
      await request('/services', 'POST', { name: 'Second service', description: '' })
    ).data.item;
    await request('/operational-automation');
    const groupId = String(new ObjectId()),
      integrationId = String(new ObjectId());
    await db.collection('operations').updateOne(
      { _id: owner },
      {
        $set: {
          groups: [
            { id: groupId, name: 'Responders', memberIds: [String(owner), String(responder)] },
          ],
          integrations: [
            {
              id: integrationId,
              name: 'Test email',
              type: 'email',
              enabled: true,
              serviceIds: [],
              recipients: ['test@example.test'],
              onCall: true,
            },
          ],
          shifts: [
            {
              id: String(new ObjectId()),
              userId: String(owner),
              serviceIds: [],
              start: new Date(Date.now() - 3600000).toISOString(),
              end: new Date(Date.now() + 3600000).toISOString(),
            },
          ],
        },
      },
    );
    const revision = async () => (await request('/operational-automation')).data.revision;
    assert.equal(
      (await request('/operational-automation', 'GET', undefined, cookies[2])).status,
      403,
    );
    const rule = {
      id: String(new ObjectId()),
      name: 'Route errors',
      enabled: true,
      match: 'all',
      conditions: [{ field: 'sourceType', operator: 'equals', value: 'external' }],
      actions: {
        severity: 'critical',
        serviceId: service.id,
        assignmentGroupId: groupId,
        suppress: false,
        createIncident: true,
      },
    };
    const sample = {
      externalId: 'sample',
      correlationKey: 'test-key',
      title: 'API outage',
      serviceId: service.id,
      severity: 'high',
      signal: 'firing',
    };
    assert.equal(
      (
        await request(`/operational-automation/eventRules/${rule.id}`, 'PUT', {
          configuration: rule,
          revision: await revision(),
        })
      ).status,
      400,
    );
    const preview = await request('/operational-automation/preview', 'POST', {
      rule,
      event: sample,
    });
    assert.equal(preview.status, 200, JSON.stringify(preview.data));
    assert.equal(preview.data.matched, true);
    assert.equal(
      (
        await request(
          `/operational-automation/eventRules/${rule.id}`,
          'PUT',
          {
            configuration: rule,
            revision: await revision(),
            previewToken: preview.data.previewToken,
          },
          cookies[1],
        )
      ).status,
      400,
    );
    const saved = await request(`/operational-automation/eventRules/${rule.id}`, 'PUT', {
      configuration: rule,
      revision: await revision(),
      previewToken: preview.data.previewToken,
    });
    assert.equal(saved.status, 200, JSON.stringify(saved.data));
    const machineToken = randomBytes(32).toString('hex'),
      accountId = new ObjectId();
    await db.collection('serviceAccounts').insertOne({
      _id: accountId,
      workspaceId: owner,
      name: 'Synthetic sender',
      enabled: true,
      scopes: ['events:create'],
      serviceIds: [service.id],
      apiKeyHash: digestToken(`stk_${machineToken}`),
      apiKeyExpiresAt: new Date(Date.now() + 3600000),
    });
    const machine = { Authorization: `Bearer stk_${machineToken}` };
    const event = await request('/external/v1/events', 'POST', sample, machine);
    assert.equal(event.status, 201, JSON.stringify(event.data));
    const incident = await db
      .collection('incidents')
      .findOne({ workspaceId: owner, eventAlertId: event.data.event.alertId });
    assert.ok(incident);
    assert.equal(incident.severity, 'critical');
    assert.equal(incident.assignmentGroupId, groupId);
    assert.equal((await request('/external/v1/events', 'POST', sample, machine)).status, 200);
    assert.equal(
      await db
        .collection('incidents')
        .countDocuments({ workspaceId: owner, eventAlertId: event.data.event.alertId }),
      1,
    );
    const changed = { ...rule, actions: { ...rule.actions, serviceId: otherService.id } };
    const changedPreview = await request('/operational-automation/preview', 'POST', {
      rule: changed,
      event: sample,
    });
    await request(`/operational-automation/eventRules/${rule.id}`, 'PUT', {
      configuration: changed,
      revision: await revision(),
      previewToken: changedPreview.data.previewToken,
    });
    assert.equal(
      (
        await request(
          '/external/v1/events',
          'POST',
          { ...sample, externalId: 'foreign-route' },
          machine,
        )
      ).status,
      403,
    );
    const disabled = { ...rule, enabled: false };
    await request(`/operational-automation/eventRules/${rule.id}`, 'PUT', {
      configuration: disabled,
      revision: await revision(),
    });
    const policy = {
      id: String(new ObjectId()),
      name: 'On-call then backup',
      enabled: true,
      serviceIds: [service.id],
      steps: [
        { afterMinutes: 0, target: 'on_call', integrationIds: [integrationId] },
        {
          afterMinutes: 1,
          target: 'user',
          userId: String(responder),
          integrationIds: [integrationId],
        },
      ],
    };
    const policySave = await request(
      `/operational-automation/escalationPolicies/${policy.id}`,
      'PUT',
      { configuration: policy, revision: await revision() },
    );
    assert.equal(policySave.status, 200, JSON.stringify(policySave.data));
    let config = await db.collection('operations').findOne({ _id: owner });
    const now = new Date();
    await reconcileEscalations(db, config, now);
    await reconcileEscalations(db, config, now);
    assert.equal(
      await db
        .collection('deliveries')
        .countDocuments({ incidentId: incident._id, event: 'escalation' }),
      1,
    );
    await reconcileEscalations(db, config, new Date(+now + 120000));
    assert.equal(
      await db
        .collection('deliveries')
        .countDocuments({ incidentId: incident._id, event: 'escalation' }),
      2,
    );
    const current = await db.collection('incidents').findOne({ _id: incident._id });
    assert.equal(
      (
        await request(`/incidents/${incident._id}/acknowledge`, 'POST', {
          revision: current.revision,
          confirm: true,
        })
      ).status,
      200,
    );
    let sends = 0;
    const send = async () => {
      sends++;
      return {};
    };
    for (const row of await db
      .collection('deliveries')
      .find({ incidentId: incident._id, event: 'escalation' })
      .toArray())
      await processDelivery(db, row._id, send);
    assert.equal(sends, 0, 'Acknowledgment suppresses pending escalations');
    const window = {
      id: String(new ObjectId()),
      name: 'Planned work',
      enabled: true,
      serviceIds: [service.id],
      startsAt: new Date(Date.now() - 60000).toISOString(),
      endsAt: new Date(Date.now() + 60000).toISOString(),
      reason: 'Deployment',
    };
    assert.equal(
      (
        await request(`/operational-automation/maintenanceWindows/${window.id}`, 'PUT', {
          configuration: window,
          revision: await revision(),
        })
      ).status,
      200,
    );
    const deliveryKey = `test-delivery-${randomUUID()}`;
    await db.collection('deliveries').insertOne({
      _id: deliveryKey,
      workspaceId: owner,
      incidentId: incident._id,
      integrationId,
      event: 'impacted',
      status: 'pending',
      attempts: 0,
      createdAt: now,
      nextAttemptAt: new Date(0),
    });
    await processDelivery(db, deliveryKey, send);
    assert.equal(sends, 0);
    assert.equal(
      (await db.collection('deliveries').findOne({ _id: deliveryKey })).deliveryState,
      'suppressed',
    );
    await request(`/operational-automation/maintenanceWindows/${window.id}`, 'DELETE', {
      revision: await revision(),
    });
    const failedKey = `failed-${randomUUID()}`;
    await db.collection('deliveries').insertOne({
      _id: failedKey,
      workspaceId: owner,
      incidentId: incident._id,
      integrationId,
      event: 'impacted',
      status: 'pending',
      attempts: 0,
      nextAttemptAt: new Date(0),
      createdAt: now,
    });
    for (let i = 0; i < 5; i++) {
      await db
        .collection('deliveries')
        .updateOne({ _id: failedKey }, { $set: { nextAttemptAt: new Date(0) } });
      await processDelivery(db, failedKey, async () => {
        throw new Error('Never persist synthetic-private-provider-details');
      });
    }
    const failed = await db.collection('deliveries').findOne({ _id: failedKey });
    assert.equal(failed.status, 'failed');
    assert.equal(failed.attempts, 5);
    assert.ok(!failed.error.includes('synthetic-private'));
    assert.equal((await request(`/deliveries/${failedKey}/retry`, 'POST', {})).status, 400);
    assert.equal(
      (await request(`/deliveries/${failedKey}/retry`, 'POST', { confirm: true })).status,
      200,
    );
    assert.equal(
      (await request(`/deliveries/${failedKey}/retry`, 'POST', { confirm: true })).status,
      409,
    );
    const probe = await request('/monitor-probes', 'POST', {
      name: 'Independent region',
      region: 'Region B',
      revision: await revision(),
    });
    assert.equal(probe.status, 201, JSON.stringify(probe.data));
    assert.ok(
      !(await request('/monitor-probes')).data.probes.some((row) => row.token || row.tokenHash),
    );
    const monitor = await request('/monitors', 'POST', {
      name: 'Confirmed endpoint',
      url: 'https://example.com',
      serviceId: service.id,
      intervalMinutes: 1,
      method: 'GET',
      confirmationProbeId: probe.data.probe.id,
    });
    assert.equal(monitor.status, 201, JSON.stringify(monitor.data));
    await processMonitor(db, monitor.data.monitor.id, async () => ({
      status: 'down',
      statusCode: 503,
      durationMs: 1,
      error: 'HTTP 503',
      details: { method: 'GET', responses: [] },
    }));
    let rawMonitor = await db
      .collection('monitors')
      .findOne({ _id: new ObjectId(monitor.data.monitor.id) });
    assert.equal(monitorHealth(rawMonitor), 'unknown');
    const probeHeaders = { Authorization: `Bearer ${probe.data.token}` };
    const job = await request(`/probe/v1/${probe.data.probe.id}/jobs`, 'POST', {}, probeHeaders);
    assert.equal(job.status, 200, JSON.stringify(job.data));
    assert.ok(job.data.job);
    assert.ok(!JSON.stringify(job.data).includes('authSecret'));
    const result = {
      jobId: job.data.job.id,
      leaseId: job.data.job.leaseId,
      status: 'down',
      statusCode: 503,
      durationMs: 2,
    };
    assert.equal(
      (
        await request(
          `/probe/v1/${probe.data.probe.id}/results`,
          'POST',
          { ...result, leaseId: '0'.repeat(32) },
          probeHeaders,
        )
      ).status,
      409,
    );
    const reported = await request(
      `/probe/v1/${probe.data.probe.id}/results`,
      'POST',
      result,
      probeHeaders,
    );
    assert.equal(reported.status, 200, JSON.stringify(reported.data));
    assert.equal(
      (await request(`/probe/v1/${probe.data.probe.id}/results`, 'POST', result, probeHeaders))
        .status,
      409,
    );
    rawMonitor = await db.collection('monitors').findOne({ _id: rawMonitor._id });
    assert.equal(monitorHealth(rawMonitor), 'down');
    assert.equal((await request('/incidents', 'GET', undefined, probeHeaders)).status, 401);
    const report = await request('/operational-report?days=30');
    assert.equal(report.status, 200, JSON.stringify(report.data));
    assert.ok(report.data.acknowledgmentSamples >= 1);
    assert.equal((await request('/operational-report?days=365')).status, 400);
    assert.equal(
      (await request('/operational-report', 'GET', undefined, cookies[1])).data.incidents,
      0,
    );
    config = await db.collection('operations').findOne({ _id: owner });
    await request(`/monitor-probes/${probe.data.probe.id}`, 'DELETE', {
      revision: config.revision,
    });
    assert.equal(
      (await request(`/probe/v1/${probe.data.probe.id}/jobs`, 'POST', {}, probeHeaders)).status,
      401,
    );
    const audits = await db.collection('auditEvents').find({ workspaceId: owner }).toArray();
    assert.ok(!JSON.stringify(audits).includes(probe.data.token));
    assert.ok(!JSON.stringify(audits).includes(machineToken));
  },
);
