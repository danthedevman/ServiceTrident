import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { ObjectId } from 'mongodb';
import { connectDatabase } from '../../shared/persistence/database.js';
import { reconcileOperations } from '../../workers/src/notifications/reconcile.js';
import { processDelivery } from '../../workers/src/notifications/delivery.js';
import { message } from '../../workers/src/notifications/message.js';

test('service alert grouping captures staggered failures once and preserves failure diagnostics through recovery', async (t) => {
  process.env.DATABASE_SCHEMA =
    process.env.MONGODB_DB = `grouping_test_${randomUUID().replaceAll('-', '')}`;
  const { db, client } = await connectDatabase();
  t.after(async () => {
    await db.dropDatabase();
    await client.close();
  });
  const workspaceId = new ObjectId(),
    serviceId = String(new ObjectId()),
    otherServiceId = String(new ObjectId());
  const integrationId = String(new ObjectId()),
    first = new ObjectId(),
    second = new ObjectId(),
    third = new ObjectId(),
    checkedAt = new Date();
  await db.collection('users').insertOne({ _id: workspaceId });
  await db.collection('catalogs').insertOne({
    _id: workspaceId,
    services: [
      { id: serviceId, name: 'Checkout' },
      { id: otherServiceId, name: 'Separate service' },
    ],
  });
  await db.collection('operations').insertOne({
    _id: workspaceId,
    revision: 0,
    fields: [],
    shifts: [],
    integrations: [
      { id: integrationId, enabled: true, type: 'webhook', serviceIds: [], recovery: true },
    ],
  });
  for (const [monitorId, scopedService, status, code] of [
    [first, serviceId, 'down', 503],
    [second, serviceId, 'up', 200],
    [third, otherServiceId, 'down', 502],
  ]) {
    await db.collection('monitors').insertOne({
      _id: monitorId,
      userId: workspaceId,
      serviceId: new ObjectId(scopedService),
      name: 'Synthetic monitor',
      method: 'HEAD',
      intervalMinutes: 1,
      lastCheck: { checkedAt, status, statusCode: code, durationMs: 12 },
    });
    await db.collection('events').insertOne({
      _id: new ObjectId(),
      userId: workspaceId,
      monitorId,
      checkedAt,
      status,
      statusCode: code,
      durationMs: 12,
      details: {
        method: 'HEAD',
        responses: [{ statusMessage: 'Synthetic response', body: { text: 'PRIVATE BODY' } }],
      },
    });
  }
  const queue = { add: async () => {} };
  await reconcileOperations(db, queue);
  assert.equal(await db.collection('incidents').countDocuments({ workspaceId }), 2);
  assert.equal(
    await db.collection('deliveries').countDocuments({ workspaceId }),
    0,
    'Initial notifications wait for the grouping window',
  );
  const secondTime = new Date(+checkedAt + 1);
  await db.collection('monitors').updateOne(
    { _id: second },
    {
      $set: {
        lastCheck: { checkedAt: secondTime, status: 'down', statusCode: 504, durationMs: 99 },
      },
    },
  );
  await db.collection('events').insertOne({
    _id: new ObjectId(),
    userId: workspaceId,
    monitorId: second,
    checkedAt: secondTime,
    status: 'down',
    statusCode: 504,
    durationMs: 99,
  });
  await reconcileOperations(db, queue);
  await reconcileOperations(db, queue);
  let incident = await db.collection('incidents').findOne({ workspaceId, serviceId });
  assert.equal(
    incident.triggeringChecks.length,
    2,
    'Repeated reconciliation never duplicates check references',
  );
  assert.equal(await db.collection('incidents').countDocuments({ workspaceId, serviceId }), 1);
  await db
    .collection('incidents')
    .updateMany({ workspaceId }, { $set: { alertGroupUntil: new Date(Date.now() - 1) } });
  await db.collection('monitors').updateMany(
    { _id: { $in: [first, second] } },
    {
      $set: {
        lastCheck: { checkedAt: new Date(), status: 'up', statusCode: 200, durationMs: 3 },
      },
    },
  );
  await reconcileOperations(db, queue);
  incident = await db.collection('incidents').findOne({ workspaceId, serviceId });
  assert.equal(incident.status, 'resolved', 'Recovery is not delayed in the app');
  const opening = await db
    .collection('deliveries')
    .findOne({ incidentId: incident._id, event: 'impacted' });
  assert.equal(opening.monitorCheckCount, 2);
  assert.deepEqual(
    opening.monitorChecks.map((check) => check.statusCode),
    [503, 504],
  );
  assert.equal(opening.monitorChecks[0].method, 'HEAD');
  assert.ok(!JSON.stringify(opening).includes('PRIVATE BODY'));
  assert.match(message(incident, 'impacted', opening), /Affected monitors: 2/);
  assert.equal(
    await db
      .collection('deliveries')
      .countDocuments({ incidentId: incident._id, event: 'impacted' }),
    1,
  );
  let calls = 0;
  await processDelivery(db, opening._id, async () => {
    calls++;
    return {};
  });
  await processDelivery(db, opening._id, async () => {
    calls++;
    return {};
  });
  assert.equal(calls, 1, 'Outbox retries do not duplicate a sent grouped notification');
  await reconcileOperations(db, queue);
  assert.equal(
    await db.collection('deliveries').countDocuments({ incidentId: incident._id }),
    2,
    'One initial and one recovery delivery per integration',
  );
  const flaggedId = String(new ObjectId());
  await db
    .collection('catalogs')
    .updateOne(
      { _id: workspaceId },
      {
        $push: {
          services: { id: flaggedId, name: 'Flagged service', healthPolicy: { manualDown: true } },
        },
      },
    );
  await reconcileOperations(db, queue);
  const automated = await db.collection('incidents').findOne({ workspaceId, serviceId: flaggedId });
  assert.equal(automated.source, 'automation');
  assert.equal(automated.triggeringChecks.length, 0);
});
