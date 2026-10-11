import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { ObjectId } from 'mongodb';
import { connectDatabase } from '../../shared/persistence/database.js';
import { processMonitor } from '../../workers/src/monitoring/processor.js';
import { reconcileOperations } from '../../workers/src/notifications/reconcile.js';
import { serviceHealth } from '../../shared/domain/service-health.js';
import { statusData } from '../../api/src/domain/status.js';
import { serializeMonitor } from '../../api/src/domain/monitor.js';

test('worker failure streaks, public health and automatic incidents agree', async (t) => {
  process.env.DATABASE_SCHEMA =
    process.env.MONGODB_DB = `degradation_test_${randomUUID().replaceAll('-', '')}`;
  const { db, client } = await connectDatabase();
  t.after(async () => {
    await db.dropDatabase();
    await client.close();
  });
  const userId = new ObjectId(),
    monitorId = new ObjectId(),
    serviceId = new ObjectId();
  const service = {
    id: String(serviceId),
    name: 'API',
    dependencyIds: [],
    healthPolicy: { failuresBeforeDown: 2, responseTimeMs: 500, manualDegraded: false },
  };
  await db.collection('users').insertOne({ _id: userId, email: 'test@example.com' });
  await db
    .collection('catalogs')
    .insertOne({ _id: userId, services: [service], collections: [], visibility: 'private' });
  await db.collection('monitors').insertOne({
    _id: monitorId,
    userId,
    serviceId,
    name: 'API health',
    url: 'https://example.com',
    intervalMinutes: 1,
    paused: false,
    nextCheckAt: new Date(0),
    lastCheck: null,
  });
  async function check(status, durationMs, expected, streak) {
    await db
      .collection('monitors')
      .updateOne({ _id: monitorId }, { $set: { nextCheckAt: new Date(0) } });
    assert.equal(
      await processMonitor(db, String(monitorId), async () => ({
        status,
        durationMs,
        statusCode: status === 'up' ? 200 : 503,
      })),
      true,
    );
    const row = await db.collection('monitors').findOne({ _id: monitorId });
    assert.equal(row.lastCheck.consecutiveFailures, streak);
    assert.equal(serviceHealth([service], [row]).get(service.id), expected);
    for (const publicView of [false, true]) {
      assert.equal(
        (await statusData(db, userId, serializeMonitor, publicView)).services[0].status,
        expected,
        `${publicView ? 'Public' : 'Internal'} status page must reflect service health`,
      );
    }
    await reconcileOperations(db, { add: async () => {} });
  }
  await check('down', 100, 'degraded', 1);
  let incident = await db.collection('incidents').findOne({ workspaceId: userId });
  assert.equal(incident.severity, 'medium');
  assert.equal(incident.status, 'open');
  const trigger = incident.triggeringChecks[0];
  assert.equal(trigger.monitorId, String(monitorId));
  assert.equal(trigger.serviceName, 'API');
  assert.equal(
    await db
      .collection('events')
      .countDocuments({ monitorId, userId, checkedAt: trigger.checkedAt }),
    1,
  );
  await check('down', 100, 'down', 2);
  assert.equal(await db.collection('incidents').countDocuments({ workspaceId: userId }), 1);
  await check('up', 600, 'degraded', 0);
  incident = await db.collection('incidents').findOne({ workspaceId: userId });
  assert.equal(incident.status, 'open');
  await check('up', 100, 'up', 0);
  incident = await db.collection('incidents').findOne({ workspaceId: userId });
  assert.equal(incident.status, 'resolved');
  assert.equal(+new Date(incident.triggeringChecks[0].checkedAt), +new Date(trigger.checkedAt));
  await check('down', 100, 'degraded', 1);
  await db
    .collection('monitors')
    .updateOne(
      { _id: monitorId },
      { $set: { 'lastCheck.checkedAt': new Date(Date.now() - 180000) } },
    );
  await check('down', 100, 'degraded', 1);
});
