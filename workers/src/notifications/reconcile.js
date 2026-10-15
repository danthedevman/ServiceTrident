import { workspaceSettings } from '@servicetrident/shared/domain/workspace-settings';
import { writeAudit } from '@servicetrident/shared/domain/audit';
import { ObjectId } from 'mongodb';

import { onCall } from '@servicetrident/shared/domain/on-call';
import { serviceHealth } from '@servicetrident/shared/domain/service-health';
import { BUILTIN_FIELDS } from '@servicetrident/shared/forms/schema';
import { monitorContext, groupedCheckReferences } from './monitor-context.js';

/** Reconcile monitor rollups and write durable, idempotent notification records. */
export async function reconcileOperations(db, queue) {
  for await (const catalog of db.collection('catalogs').find({})) {
    const owner = await db
      .collection('users')
      .findOne({ _id: catalog._id }, { projection: { workspaceSettings: 1 } });
    const preferences = workspaceSettings(owner?.workspaceSettings);
    const now = new Date();
    await db
      .collection('operations')
      .updateOne(
        { _id: catalog._id },
        { $setOnInsert: { revision: 0, fields: BUILTIN_FIELDS, shifts: [], integrations: [] } },
        { upsert: true },
      );
    // One short database-only reconciliation per workspace; outbound calls happen separately.
    const lock = await db.collection('operations').findOneAndUpdate(
      {
        _id: catalog._id,
        $or: [{ reconcileUntil: { $lte: now } }, { reconcileUntil: { $exists: false } }],
      },
      { $set: { reconcileUntil: new Date(+now + 60000) } },
      { returnDocument: 'after' },
    );
    if (!lock) continue;
    try {
      const monitors = await db.collection('monitors').find({ userId: catalog._id }).toArray();
      const health = serviceHealth(catalog.services, monitors);
      for (const service of catalog.services.filter((service) => !service.demoBatchId)) {
        const state = health.get(service.id);
        const existing = await db
          .collection('incidents')
          .findOne({ workspaceId: catalog._id, serviceId: service.id, activeAutomatic: true });
        if (existing?.alertGroupUntil && +now < +new Date(existing.alertGroupUntil)) {
          const grouped = groupedCheckReferences(
            service.id,
            catalog.services,
            monitors,
            now,
            existing.triggeringChecks ?? [],
          );
          if (grouped.length !== (existing.triggeringChecks?.length ?? 0)) {
            const updated = await db.collection('incidents').updateOne(
              { _id: existing._id, workspaceId: catalog._id, revision: existing.revision },
              {
                $set: {
                  triggeringChecks: grouped,
                  updatedAt: now,
                  updatedBy: 'System',
                  updatedById: null,
                },
                $inc: { revision: 1 },
              },
            );
            if (updated.modifiedCount) {
              existing.triggeringChecks = grouped;
              existing.revision++;
              await writeAudit(db, {
                workspaceId: catalog._id,
                source: 'worker',
                action: 'update',
                recordType: 'incidents',
                recordId: existing._id,
                fields: 'triggeringChecks',
                operation: 'Group related monitor checks',
              });
            }
          }
        }
        if (['down', 'degraded'].includes(state) && !existing && preferences.automaticIncidents) {
          try {
            const triggeringChecks = groupedCheckReferences(
              service.id,
              catalog.services,
              monitors,
              now,
            );
            const created = await db.collection('incidents').insertOne({
              _id: new ObjectId(),
              workspaceId: catalog._id,
              serviceId: service.id,
              serviceName: service.name,
              title: `${service.name} is impacted`,
              description:
                state === 'degraded'
                  ? 'The service or a dependency is degraded by a manual flag or health threshold.'
                  : 'The service is flagged Down, or a monitor or dependency has confirmed an outage.',
              severity: state === 'degraded' ? 'medium' : 'high',
              status: 'open',
              source: triggeringChecks.length ? 'monitor' : 'automation',
              // Match immutable monitor/time pairs even if the event insert is still finishing.
              triggeringChecks,
              alertGrouping: 'service',
              alertGroupUntil: new Date(+now + preferences.alertGroupingSeconds * 1000),
              createdBy: 'System',
              updatedBy: 'System',
              activeAutomatic: true,
              fields: [],
              custom: {},
              assigneeId: onCall(lock.shifts, service.id, now),
              createdAt: now,
              updatedAt: now,
              revision: 0,
              timeline: [
                {
                  at: now,
                  by: 'System',
                  status: 'open',
                  note:
                    state === 'degraded'
                      ? 'Service degradation detected.'
                      : 'Manual Down flag or confirmed monitor/dependency outage.',
                },
              ],
            });
            await writeAudit(db, {
              workspaceId: catalog._id,
              source: 'worker',
              action: 'create',
              recordType: 'incidents',
              recordId: created.insertedId,
              operation: 'Automatic incident creation',
            });
          } catch (error) {
            if (error.code !== 11000) throw error;
          }
        } else if (state === 'up' && existing && preferences.automaticRecovery) {
          const resolved = await db.collection('incidents').updateOne(
            { _id: existing._id, activeAutomatic: true, revision: existing.revision },
            {
              $set: {
                status: 'resolved',
                statusOption: 'resolved',
                statusLabel: 'Resolved',
                activeAutomatic: false,
                updatedAt: now,
                updatedBy: 'System',
                updatedById: null,
                resolvedAt: now,
                resolutionNotes: 'All monitors and dependencies recovered.',
              },
              $inc: { revision: 1 },
              $push: {
                timeline: {
                  $each: [
                    {
                      at: now,
                      by: 'System',
                      status: 'resolved',
                      note: 'All monitors and dependencies recovered.',
                    },
                  ],
                  $slice: -200,
                },
              },
            },
          );
          if (resolved.modifiedCount)
            await writeAudit(db, {
              workspaceId: catalog._id,
              source: 'worker',
              action: 'resolve',
              recordType: 'incidents',
              recordId: existing._id,
              fields: 'status, resolutionNotes',
              operation: 'Automatic recovery',
            });
        }
      }
      // A crash before these flags are saved is safe: each outbox key is deterministic.
      for await (const incident of db.collection('incidents').find({
        workspaceId: catalog._id,
        demoBatchId: { $exists: false },
        $or: [
          { notifiedOpen: { $ne: true } },
          { status: 'resolved', notifiedResolved: { $ne: true } },
        ],
      })) {
        if (incident.alertGroupUntil && +now < +new Date(incident.alertGroupUntil)) continue;
        for (const event of ['impacted', 'recovered']) {
          const flag = event === 'impacted' ? 'notifiedOpen' : 'notifiedResolved';
          if (incident[flag] || (event === 'recovered' && incident.status !== 'resolved')) continue;
          const checks = await monitorContext(
            db,
            catalog._id,
            incident,
            event,
            catalog.services,
            monitors,
            now,
          );
          for (const integration of lock.integrations.filter(
            (i) =>
              !i.demoBatchId &&
              i.enabled &&
              (!i.serviceIds.length || i.serviceIds.includes(incident.serviceId)) &&
              (event === 'impacted' || i.recovery),
          )) {
            const cycle = incident.resolutionCycle ?? 0;
            const key = `${incident._id}-${event}-${integration.id}${cycle ? `-cycle${cycle}` : ''}`;
            await db.collection('deliveries').updateOne(
              { _id: key },
              {
                $setOnInsert: {
                  workspaceId: catalog._id,
                  incidentId: incident._id,
                  integrationId: integration.id,
                  integrationName: integration.name,
                  resolutionCycle: cycle,
                  event,
                  monitorChecks: checks,
                  ...(incident.alertGrouping === 'service'
                    ? {
                        alertGrouping: 'service',
                        monitorCheckCount: new Set(
                          (incident.triggeringChecks ?? []).map((check) => check.monitorId),
                        ).size,
                      }
                    : {}),
                  status: 'pending',
                  attempts: 0,
                  createdAt: now,
                  nextAttemptAt: now,
                  onCallUserId: onCall(
                    lock.shifts,
                    incident.serviceId,
                    event === 'impacted'
                      ? (incident.reopenedAt ?? incident.createdAt)
                      : incident.updatedAt,
                  ),
                },
              },
              { upsert: true },
            );
          }
          await db
            .collection('incidents')
            .updateOne(
              { _id: incident._id, revision: incident.revision },
              { $set: { [flag]: true } },
            );
        }
      }
    } finally {
      await db
        .collection('operations')
        .updateOne({ _id: catalog._id }, { $unset: { reconcileUntil: '' } });
    }
  }
  // Comment insertion is the durable source; deterministic delivery IDs make retries safe.
  for await (const entry of db
    .collection('incidentComments')
    .find({ kind: 'comment', demoBatchId: { $exists: false }, notificationsQueued: false })
    .limit(200)) {
    for (const recipientId of entry.recipientIds) {
      const now = new Date();
      await db.collection('deliveries').updateOne(
        { _id: `comment-${entry._id}-${recipientId}` },
        {
          $setOnInsert: {
            workspaceId: entry.workspaceId,
            incidentId: entry.incidentId,
            commentId: entry._id,
            recipientId,
            integrationName: 'Incident comment email',
            event: 'comment',
            status: 'pending',
            attempts: 0,
            createdAt: now,
            nextAttemptAt: now,
          },
        },
        { upsert: true },
      );
    }
    await db
      .collection('incidentComments')
      .updateOne({ _id: entry._id }, { $set: { notificationsQueued: true } });
  }
  const now = new Date();
  for await (const row of db
    .collection('deliveries')
    .find({
      demoBatchId: { $exists: false },
      status: 'pending',
      nextAttemptAt: { $lte: now },
      $or: [{ leaseUntil: { $exists: false } }, { leaseUntil: { $lte: now } }],
    })
    .limit(200)) {
    await queue.add(
      'deliver',
      { id: row._id },
      {
        jobId: row._id,
        removeOnComplete: true,
        removeOnFail: 100,
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
      },
    );
  }
}
