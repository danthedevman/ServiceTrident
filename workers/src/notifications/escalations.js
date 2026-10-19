import { ObjectId } from 'mongodb';
import { ruleSilenced } from './silencing.js';
import { stableEventId } from '@servicetrident/shared/domain/events';
import { onCall } from '@servicetrident/shared/domain/on-call';
import { activeSilence } from '@servicetrident/shared/domain/operational-automation';
import { writeAudit } from '@servicetrident/shared/domain/audit';

/** Deterministic outbox keys survive restarts and concurrent reconciliation. No timers in memory. */
export async function reconcileEscalations(db, config, now = new Date()) {
  const policies = (config.escalationPolicies || []).filter(
    (policy) => policy.enabled && !policy.demoBatchId,
  );
  if (!policies.length) return;
  for await (const incident of db
    .collection('incidents')
    .find({ workspaceId: config._id, status: 'open', demoBatchId: { $exists: false } })
    .limit(500)) {
    if (
      incident.notificationSuppressed ||
      activeSilence(config, incident.serviceId, now) ||
      (await ruleSilenced(db, incident))
    )
      continue;
    const policy = incident.escalationPolicyId
      ? policies.find((item) => item.id === incident.escalationPolicyId)
      : policies.find((item) => item.serviceIds.includes(incident.serviceId)) ||
        policies.find((item) => !item.serviceIds.length);
    if (!policy || (policy.serviceIds.length && !policy.serviceIds.includes(incident.serviceId)))
      continue;
    const start = new Date(incident.reopenedAt || incident.createdAt);
    const eligible = policy.steps
      .map((step, index) => ({ ...step, index }))
      .filter((step) => +start + step.afterMinutes * 60000 <= +now);
    // After downtime, send the current step only rather than a burst of obsolete pages.
    const step = eligible.at(-1);
    if (!step) continue;
    const recipientId =
      step.target === 'on_call'
        ? onCall(config.shifts || [], incident.serviceId, now)
        : step.userId;
    const recipient =
      recipientId && /^[a-f0-9]{24}$/i.test(recipientId)
        ? await db
            .collection('users')
            .findOne({
              _id: new ObjectId(recipientId),
              disabled: { $ne: true },
              role: { $in: ['admin', 'responder'] },
              $or: [{ _id: config._id }, { workspaceId: config._id }],
            })
        : null;
    if (!recipient) {
      const result = await db.collection('incidents').updateOne(
        {
          _id: incident._id,
          workspaceId: config._id,
          escalationIssue: { $ne: 'No active responder for escalation step.' },
        },
        { $set: { escalationIssue: 'No active responder for escalation step.' } },
      );
      if (result.modifiedCount)
        await writeAudit(db, {
          workspaceId: config._id,
          source: 'worker',
          action: 'escalation_no_coverage',
          recordType: 'incidents',
          recordId: incident._id,
          outcome: 'failed',
          statusCode: 409,
        });
      continue;
    }
    const entryId = stableEventId(
      'escalation-notification',
      String(incident._id),
      incident.resolutionCycle || 0,
      policy.id,
      step.index,
    );
    await db.collection('incidentComments').updateOne(
      { _id: entryId },
      {
        $setOnInsert: {
          workspaceId: config._id,
          incidentId: incident._id,
          kind: 'work_note',
          body: `Escalation step ${step.index + 1} reached. A responder notification is available.`,
          author: 'System',
          authorId: null,
          createdAt: now,
          alertRecipientIds: [recipientId],
          recipientIds: [],
          mentions: [],
          notificationsQueued: true,
        },
      },
      { upsert: true },
    );
    for (const integrationId of step.integrationIds) {
      const integration = config.integrations.find(
        (item) =>
          item.id === integrationId &&
          item.enabled &&
          !item.demoBatchId &&
          (!item.serviceIds?.length || item.serviceIds.includes(incident.serviceId)),
      );
      if (!integration) continue;
      const key = `escalation-${incident._id}-${incident.resolutionCycle || 0}-${policy.id}-${step.index}-${integrationId}`;
      const result = await db.collection('deliveries').updateOne(
        { _id: key },
        {
          $setOnInsert: {
            workspaceId: config._id,
            incidentId: incident._id,
            integrationId,
            integrationName: integration.name,
            resolutionCycle: incident.resolutionCycle || 0,
            event: 'escalation',
            policyId: policy.id,
            step: step.index + 1,
            status: 'pending',
            deliveryState: 'queued',
            attempts: 0,
            totalAttempts: 0,
            createdAt: now,
            nextAttemptAt: now,
            onCallUserId: recipientId,
          },
        },
        { upsert: true },
      );
      if (result.upsertedId)
        await writeAudit(db, {
          workspaceId: config._id,
          source: 'worker',
          action: 'escalation_queued',
          recordType: 'deliveries',
          recordId: key,
          parentId: incident._id,
        });
    }
    await db.collection('incidents').updateOne(
      { _id: incident._id, workspaceId: config._id },
      {
        $set: {
          escalationPolicyId: policy.id,
          escalationStep: step.index + 1,
          escalationIssue: '',
        },
      },
    );
  }
}
