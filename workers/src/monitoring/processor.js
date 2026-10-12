import { unseal } from '@servicetrident/shared/integrations/secrets';
import { InputError } from '@servicetrident/shared/validation/input-error';
import { ObjectId } from 'mongodb';
import { checkWebsite } from './check.js';
import { userAgentForCheck } from './user-agents.js';

/** Queue due monitors; fixed job IDs coalesce overlapping dispatches.
 * @param {import('mongodb').Db} db @param {import('bullmq').Queue} queue
 */
export async function dispatchDue(db, queue) {
  const monitors = await db
    .collection('monitors')
    .aggregate([
      {
        $match: {
          type: { $in: [null, 'http'] },
          paused: false,
          demoBatchId: { $exists: false },
          $expr: { $lte: ['$nextCheckAt', '$$NOW'] },
        },
      },
      { $sort: { nextCheckAt: 1, _id: 1 } },
      { $limit: 200 },
      { $project: { _id: 1, queuedAt: '$$NOW' } },
    ])
    .toArray();
  if (!monitors.length) return;
  await queue.addBulk(
    monitors.map((monitor) => ({
      name: 'check',
      data: { monitorId: monitor._id.toHexString(), queuedAt: monitor.queuedAt.toISOString() },
      opts: {
        jobId: `monitor-${monitor._id}`,
        attempts: 1,
        removeOnComplete: true,
        removeOnFail: true,
      },
    })),
  );
}

/** Claim a due monitor atomically before doing I/O, even across multiple workers.
 * MongoDB server time enforces spacing without depending on worker clock skew.
 * @param {import('mongodb').Db} db @param {string} monitorId @param {Function} [check]
 * @param {{queuedAt?: string}} [options] Dispatch timestamp from MongoDB, carried by the job.
 * @returns {Promise<boolean>} Whether this job claimed a check.
 */
export async function processMonitor(db, monitorId, check = checkWebsite, { queuedAt } = {}) {
  const _id = new ObjectId(monitorId);
  const monitor = await db.collection('monitors').findOneAndUpdate(
    {
      _id,
      type: { $in: [null, 'http'] },
      paused: false,
      demoBatchId: { $exists: false },
      $expr: { $lte: ['$nextCheckAt', '$$NOW'] },
    },
    [
      {
        $set: {
          nextCheckAt: {
            $dateAdd: {
              startDate: '$$NOW',
              unit: 'minute',
              amount: { $max: [1, '$intervalMinutes'] },
            },
          },
          lastScheduledAt: '$nextCheckAt',
          lastStartedAt: '$$NOW',
          checkSequence: { $add: [{ $ifNull: ['$checkSequence', 0] }, 1] },
        },
      },
    ],
    { returnDocument: 'after' },
  );
  if (!monitor) return false;
  const method = monitor.method ?? 'GET';
  const followRedirects = monitor.followRedirects === true;
  const result = await check(monitor.url, {
    method,
    followRedirects,
    userAgent: userAgentForCheck(monitor.checkSequence),
    authentication: monitor.authSecret
      ? () => {
          try {
            return unseal(monitor.authSecret);
          } catch {
            throw new InputError(
              'Stored monitor credentials could not be decrypted. Restore the encryption key or replace the credentials.',
            );
          }
        }
      : null,
  });
  const timing = checkTiming(monitor.lastScheduledAt, monitor.lastStartedAt, queuedAt);
  const event = {
    timing,
    monitorId: _id,
    userId: monitor.userId,
    checkedAt: monitor.lastStartedAt,
    ...result,
  };
  const { details, ...summary } = result;
  // A long gap or a successful response breaks the consecutive-failure sequence.
  const previous = monitor.lastCheck;
  const continuous =
    previous &&
    +monitor.lastStartedAt - +new Date(previous.checkedAt) <=
      (monitor.intervalMinutes * 60 + 60) * 1000;
  const consecutiveFailures =
    result.status === 'down'
      ? Math.min(
          10,
          (continuous && previous.status === 'down' ? (previous.consecutiveFailures ?? 1) : 0) + 1,
        )
      : 0;
  // Deleted monitors must not regain a visible status from an in-flight request.
  await db.collection('monitors').updateOne(
    {
      _id,
      url: monitor.url,
      lastStartedAt: monitor.lastStartedAt,
      $expr: {
        $and: [
          { $eq: [{ $ifNull: ['$method', 'GET'] }, method] },
          { $eq: [{ $ifNull: ['$followRedirects', false] }, followRedirects] },
          { $eq: [{ $ifNull: ['$authSecret', null] }, monitor.authSecret ?? null] },
        ],
      },
    },
    {
      $set: { lastCheck: { checkedAt: event.checkedAt, timing, ...summary, consecutiveFailures } },
    },
  );
  if (await db.collection('monitors').findOne({ _id }, { projection: { _id: 1 } }))
    await db.collection('events').insertOne(event);
  return true;
}

/** Measure scheduling delay separately from request duration, using MongoDB timestamps.
 * Old queued jobs have no dispatch timestamp; do not invent their queue wait.
 * @param {Date} scheduledAt @param {Date} startedAt @param {string} [queuedAt]
 * @returns {object} Event timing visible only through authenticated endpoints.
 */
export function checkTiming(scheduledAt, startedAt, queuedAt) {
  const queued = queuedAt ? new Date(queuedAt) : null;
  const validQueued =
    queued && Number.isFinite(queued.getTime()) && queued >= scheduledAt && queued <= startedAt;
  return {
    scheduledAt,
    startedAt,
    queuedAt: validQueued ? queued : null,
    scheduleDelayMs: Math.max(0, startedAt - scheduledAt),
    dispatchDelayMs: validQueued ? queued - scheduledAt : null,
    queueDelayMs: validQueued ? startedAt - queued : null,
  };
}
