import { ruleSilenced } from './silencing.js';
import { randomUUID } from 'node:crypto';
import { activeSilence } from '@servicetrident/shared/domain/operational-automation';
import { writeAudit } from '@servicetrident/shared/domain/audit';
import { ObjectId } from 'mongodb';

import { sendNotification } from './send.js';
/** Claim a durable delivery and retry failures with bounded exponential backoff. */
export async function processDelivery(db, key, send = sendNotification) {
  const now = new Date(),
    leaseToken = randomUUID();
  const delivery = await db.collection('deliveries').findOneAndUpdate(
    {
      _id: key,
      demoBatchId: { $exists: false },
      status: 'pending',
      attempts: { $lt: 5 },
      nextAttemptAt: { $lte: now },
      $or: [{ leaseUntil: { $exists: false } }, { leaseUntil: { $lte: now } }],
    },
    {
      $set: {
        leaseUntil: new Date(+now + 60000),
        leaseToken,
        deliveryState: 'delivering',
        lastAttemptAt: now,
      },
      $inc: { attempts: 1, totalAttempts: 1 },
    },
    { returnDocument: 'after' },
  );
  if (!delivery) return;
  const claimed = { _id: key, leaseToken };
  try {
    const config = await db.collection('operations').findOne({ _id: delivery.workspaceId });
    let integration = config?.integrations.find(
      (i) => i.id === delivery.integrationId && !i.demoBatchId && i.enabled,
    );
    if (delivery.event === 'comment') {
      const entry = await db.collection('incidentComments').findOne({
        _id: delivery.commentId,
        workspaceId: delivery.workspaceId,
        incidentId: delivery.incidentId,
        kind: 'comment',
      });
      const person = await db.collection('users').findOne({
        _id: new ObjectId(delivery.recipientId),
        disabled: { $ne: true },
        $or: [{ _id: delivery.workspaceId }, { workspaceId: delivery.workspaceId }],
      });
      const visible = await db.collection('incidents').findOne({
        _id: delivery.incidentId,
        workspaceId: delivery.workspaceId,
        ...(person?.role === 'user'
          ? {
              $or: [{ createdById: delivery.recipientId }, { openedForId: delivery.recipientId }],
            }
          : {}),
      });
      if (entry && person && visible) {
        const emailApp = config?.integrations.find(
          (item) =>
            item.type === 'email' && item.enabled && item.commentNotifications && !item.demoBatchId,
        );
        integration = emailApp
          ? { ...emailApp, onCall: false, recipients: [person.email] }
          : process.env.SMTP_HOST
            ? { type: 'email', recipients: [person.email] }
            : null;
        delivery.commentBody = entry.body;
        delivery.commentAuthor = entry.author;
      }
    }
    if (!integration) {
      await db.collection('deliveries').updateOne(claimed, {
        $set: {
          status: 'skipped',
          deliveryState: 'skipped',
          error: 'Integration disabled or removed.',
        },
        $unset: { leaseUntil: '', leaseToken: '' },
      });
      return;
    }
    const incident = await db
      .collection('incidents')
      .findOne({ _id: delivery.incidentId, workspaceId: delivery.workspaceId });
    if (!incident) throw new Error('Incident is unavailable.');
    if (
      delivery.event !== 'comment' &&
      ((delivery.resolutionCycle ?? 0) !== (incident.resolutionCycle ?? 0) ||
        (delivery.event === 'recovered' && incident.status !== 'resolved'))
    ) {
      await db.collection('deliveries').updateOne(claimed, {
        $set: {
          status: 'skipped',
          deliveryState: 'skipped',
          error: 'Incident state changed before delivery.',
        },
        $unset: { leaseUntil: '', leaseToken: '' },
      });
      return;
    }
    const staleEscalation =
      delivery.event === 'escalation' &&
      (incident.status !== 'open' ||
        incident.escalationStep !== delivery.step ||
        !config?.escalationPolicies?.some(
          (policy) =>
            policy.id === delivery.policyId &&
            policy.enabled &&
            policy.steps[delivery.step - 1]?.integrationIds.includes(delivery.integrationId),
        ));
    if (
      staleEscalation ||
      (delivery.resumeAfterSilence && delivery.event !== 'recovered' && incident.status !== 'open')
    ) {
      await db.collection('deliveries').updateOne(claimed, {
        $set: {
          status: 'skipped',
          deliveryState: 'skipped',
          error: 'Incident acknowledged, recovered, or escalation policy changed.',
        },
        $unset: { leaseUntil: '', leaseToken: '' },
      });
      return;
    }
    const maintenance =
      delivery.event !== 'comment' ? activeSilence(config || {}, incident.serviceId, now) : null;
    const suppressedByRule = delivery.event !== 'comment' && (await ruleSilenced(db, incident));
    if (maintenance || suppressedByRule) {
      const recovered = delivery.event === 'recovered';
      const suppressionKey = maintenance?.id || 'event-rule';
      await db.collection('deliveries').updateOne(claimed, {
        $set: {
          status: recovered ? 'skipped' : 'pending',
          deliveryState: 'suppressed',
          suppressionKey,
          resumeAfterSilence: true,
          nextAttemptAt: maintenance ? new Date(maintenance.endsAt) : new Date(+now + 30000),
          error: 'Notifications suppressed by maintenance or an event rule.',
        },
        $inc: { attempts: -1, totalAttempts: -1 },
        $unset: { leaseUntil: '', leaseToken: '' },
      });
      if (delivery.suppressionKey !== suppressionKey)
        await writeAudit(db, {
          workspaceId: delivery.workspaceId,
          source: 'worker',
          action: 'delivery_suppressed',
          recordType: 'deliveries',
          recordId: key,
        });
      return;
    }
    const person = delivery.onCallUserId
      ? await db.collection('users').findOne({
          _id: new ObjectId(delivery.onCallUserId),
          disabled: { $ne: true },
          $or: [{ _id: delivery.workspaceId }, { workspaceId: delivery.workspaceId }],
        })
      : null;
    if (delivery.event === 'escalation' && !person) throw new Error('Responder unavailable.');
    if (delivery.event === 'escalation' && integration.type === 'email')
      integration = { ...integration, onCall: true };
    if (['github', 'jira'].includes(integration.type)) {
      const previous = await db.collection('deliveries').findOne({
        workspaceId: delivery.workspaceId,
        integrationId: delivery.integrationId,
        incidentId: delivery.incidentId,
        status: 'sent',
        externalId: { $ne: null },
      });
      if (previous?.externalId) delivery.externalId = previous.externalId;
    }
    const result = await send(integration, incident, delivery, person?.email);
    await db.collection('deliveries').updateOne(claimed, {
      $set: {
        status: 'sent',
        deliveryState: 'delivered',
        sentAt: new Date(),
        externalId: result.externalId ?? null,
        error: '',
      },
      $unset: { leaseUntil: '', leaseToken: '' },
    });
    await writeAudit(db, {
      workspaceId: delivery.workspaceId,
      source: 'worker',
      action: 'delivery_sent',
      recordType: 'deliveries',
      recordId: key,
    });
  } catch (error) {
    // Never persist raw provider responses, webhook URLs, or SMTP authentication diagnostics.
    const safe = /^Provider returned HTTP \d{3}\.$/.test(error.message)
      ? error.message
      : 'Delivery failed. Check provider credentials, permissions, TLS, and network settings.';
    await db.collection('deliveries').updateOne(claimed, {
      $set: {
        status: delivery.attempts >= 5 ? 'failed' : 'pending',
        deliveryState: delivery.attempts >= 5 ? 'failed' : 'retrying',
        error: safe,
        nextAttemptAt: new Date(Date.now() + 30000 * 2 ** (delivery.attempts - 1)),
      },
      $unset: { leaseUntil: '', leaseToken: '' },
    });
    await writeAudit(db, {
      workspaceId: delivery.workspaceId,
      source: 'worker',
      action: 'delivery_failed',
      recordType: 'deliveries',
      recordId: key,
      outcome: 'failed',
      statusCode: 502,
    });
  }
}
