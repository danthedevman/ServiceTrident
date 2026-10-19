import { eventPayload } from './event-payload.js';
import { createHash } from 'node:crypto';
import { ObjectId } from 'mongodb';
import { text, identifier, choice, invalid } from '../validation/fields.js';
import { InputError } from '../validation/input-error.js';

export const EVENT_SEVERITIES = ['critical', 'high', 'medium', 'low', 'info'];
/** Bounded intake with redacted diagnostic payload; request headers are never stored. */
export function externalEventInput(body) {
  const allowed = [
    'externalId',
    'correlationKey',
    'title',
    'description',
    'serviceId',
    'severity',
    'signal',
    'eventType',
    'occurredAt',
    'payload',
  ];
  if (
    !body ||
    typeof body !== 'object' ||
    Array.isArray(body) ||
    Object.keys(body).some((key) => !allowed.includes(key))
  )
    throw new InputError('Send only supported event fields.');
  const eventType = choice(
    body.eventType ?? 'alert',
    ['alert', 'change', 'information'],
    'eventType',
  );
  const signal = choice(body.signal ?? 'firing', ['firing', 'recovery', 'information'], 'signal');
  if (eventType === 'alert' && signal === 'information')
    invalid('signal', 'Alert events require firing or recovery.');
  if (eventType !== 'alert' && signal !== 'information')
    invalid('signal', 'Changes and information events require the information signal.');
  if (
    body.occurredAt !== undefined &&
    (typeof body.occurredAt !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(
        body.occurredAt,
      ) ||
      !Number.isFinite(+new Date(body.occurredAt.slice(0, 10))) ||
      new Date(body.occurredAt.slice(0, 10)).toISOString().slice(0, 10) !==
        body.occurredAt.slice(0, 10))
  )
    invalid('occurredAt', 'Use an ISO date and time with a timezone.');
  const occurredAt =
    body.occurredAt === undefined
      ? new Date()
      : new Date(typeof body.occurredAt === 'string' ? body.occurredAt : NaN);
  if (
    !Number.isFinite(+occurredAt) ||
    +occurredAt < Date.now() - 30 * 86400000 ||
    +occurredAt > Date.now() + 300000
  )
    invalid(
      'occurredAt',
      'Use a timestamp within the last 30 days and no more than five minutes in the future.',
    );
  return {
    payload: eventPayload(body.payload),
    externalId: text(body.externalId, 'externalId', 160),
    correlationKey: eventType === 'alert' ? text(body.correlationKey, 'correlationKey', 160) : '',
    title: text(body.title, 'title', 160),
    description: text(body.description ?? '', 'description', 5000, false),
    serviceId: body.serviceId ? identifier(body.serviceId, 'serviceId') : null,
    severity: choice(body.severity ?? 'medium', EVENT_SEVERITIES, 'severity'),
    signal,
    eventType,
    occurredAt,
  };
}
export const stableEventId = (...parts) =>
  new ObjectId(createHash('sha256').update(JSON.stringify(parts)).digest('hex').slice(0, 24));
export function normalizedMonitorEvent(monitor, event) {
  return {
    ...event,
    sourceType: 'monitor',
    sourceName: monitor.name,
    serviceId: monitor.serviceId ? String(monitor.serviceId) : null,
    title: `${monitor.name}: ${event.status === 'up' ? 'Operational' : 'Check failed'}`,
    eventType: 'check',
    severity: event.status === 'up' ? 'info' : 'high',
    signal: event.status === 'up' ? 'recovery' : 'firing',
    occurredAt: event.checkedAt,
    alertId: String(stableEventId('monitor-alert', String(monitor.userId), String(monitor._id))),
  };
}
/** Immutable event order drives a CAS reducer. Retries and old recovery messages cannot undo newer failures. */
export async function reconcileEventAlert(db, event) {
  if (!event.alertId) return;
  const alerts = db.collection('eventAlerts'),
    _id = new ObjectId(event.alertId);
  for (let attempt = 0; attempt < 12; attempt++) {
    const current = await alerts.findOne({ _id, workspaceId: event.userId });
    const order = `${new Date(event.occurredAt ?? event.checkedAt).toISOString()}:${event.signal === 'recovery' ? '1' : '0'}:${event._id}`;
    if (current && order <= current.eventOrder) return;
    const now = new Date();
    let serviceName = event.serviceName || current?.serviceName;
    if (!serviceName && event.serviceId) {
      const catalog = await db
        .collection('catalogs')
        .findOne({ _id: event.userId }, { projection: { services: 1 } });
      serviceName = catalog?.services?.find(
        (service) => String(service.id) === event.serviceId,
      )?.name;
    }
    const values = {
      suppressed: event.suppressed === true,
      assignmentGroupId: event.assignmentGroupId || null,
      assignmentGroupName: event.assignmentGroupName || '',
      cycleKey:
        !current || (current.status === 'resolved' && event.signal === 'firing')
          ? String(event._id)
          : current.cycleKey || String(current._id),
      title: event.title,
      description: event.description ?? event.error ?? '',
      severity: event.severity,
      serviceId: event.serviceId,
      serviceName: serviceName || 'Unassigned',
      sourceType: event.sourceType,
      sourceName: event.sourceName,
      monitorId: event.monitorId ? String(event.monitorId) : null,
      lastOccurredAt: event.occurredAt ?? event.checkedAt,
      latestEventId: String(event._id),
      eventOrder: order,
      status:
        event.signal === 'recovery'
          ? 'resolved'
          : current?.status === 'acknowledged'
            ? 'acknowledged'
            : 'open',
      updatedAt: now,
      updatedBy: 'System',
      updatedById: null,
    };
    if (current) {
      const result = await alerts.updateOne(
        { _id, workspaceId: event.userId, revision: current.revision },
        { $set: values, $inc: { revision: 1 } },
      );
      if (!result.matchedCount) continue;
    } else {
      try {
        await alerts.insertOne({
          _id,
          workspaceId: event.userId,
          createdAt: now,
          createdBy: 'System',
          revision: 0,
          ...values,
        });
      } catch (error) {
        if (error.code === 11000) continue;
        throw error;
      }
    }
    await db.collection('auditEvents').insertOne({
      workspaceId: event.userId,
      createdAt: now,
      actor: 'System',
      actualRole: 'system',
      effectiveRole: 'system',
      source: 'worker',
      action: 'event_alert_updated',
      recordType: 'eventAlerts',
      recordId: String(_id),
      operation: 'Reconcile event alert',
      fields: 'status,lastOccurredAt,severity',
      outcome: 'success',
      statusCode: 200,
    });
    return;
  }
  throw new InputError('The alert is busy. Retry the same event ID.', 409);
}
