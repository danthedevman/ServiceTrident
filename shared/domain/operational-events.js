import { monitorHealth } from './service-health.js';
import { routeEvent } from './operational-automation.js';
import { stableEventId, reconcileEventAlert } from './events.js';
import { validateMandatory, validateValues, resolveChoices } from '../forms/schema.js';
import { writeAudit } from './audit.js';

export async function prepareOperationalEvent(db, event, config) {
  config ||= await db.collection('operations').findOne({ _id: event.userId });
  const routed = routeEvent(config?.eventRules || [], event);
  if (routed.serviceId !== event.serviceId) {
    const catalog = await db.collection('catalogs').findOne({ _id: event.userId });
    const service = catalog?.services?.find((item) => item.id === routed.serviceId);
    if (service) routed.serviceName = service.name;
    else {
      routed.serviceId = event.serviceId;
      routed.serviceName = event.serviceName;
    }
  }
  const group = config?.groups?.find((item) => item.id === routed.assignmentGroupId);
  routed.assignmentGroupName = group?.name || '';
  if (routed.assignmentGroupId && !group) {
    routed.assignmentGroupId = null;
    routed.createIncident = false;
  }
  return routed;
}
/** Replayed intake repairs an interrupted action; deterministic IDs prevent duplicate incidents. */
export async function completeOperationalEvent(db, event) {
  await reconcileEventAlert(db, event);
  if (
    !event.alertId ||
    !event.createIncident ||
    event.suppressed ||
    event.signal !== 'firing' ||
    event.demoBatchId
  )
    return;
  const monitor =
    event.sourceType === 'monitor' && event.monitorId
      ? await db
          .collection('monitors')
          .findOne({ _id: stableEventIdFrom(event.monitorId), userId: event.userId })
      : null;
  // Monitor rules retain the normal failure threshold and independent-confirmation gate.
  if (event.sourceType === 'monitor' && (!monitor || monitorHealth(monitor) !== 'down')) return;
  const existing = monitor
    ? await db
        .collection('incidents')
        .findOne({ workspaceId: event.userId, serviceId: event.serviceId, activeAutomatic: true })
    : null;
  const config = await db.collection('operations').findOne({ _id: event.userId });
  const alert = await db
    .collection('eventAlerts')
    .findOne({ _id: stableEventIdFrom(event.alertId), workspaceId: event.userId });
  if (!alert || alert.status === 'resolved' || alert.latestEventId !== String(event._id)) return;
  const _id =
    existing?._id ||
    stableEventId(
      'rule-incident',
      String(event.userId),
      event.alertId,
      alert.cycleKey || alert.createdAt?.toISOString(),
    );
  const now = new Date();
  const input = {
    _id,
    workspaceId: event.userId,
    eventAlertId: event.alertId,
    originEventId: String(event._id),
    title: event.title,
    description: event.description || event.error || '',
    serviceId: event.serviceId || null,
    serviceName: event.serviceName || 'Unassigned',
    assignmentGroupId: event.assignmentGroupId || null,
    assignmentGroupName: event.assignmentGroupName || '',
    assigneeId: null,
    openedForId: null,
    knowledgeIds: [],
    resolutionNotes: '',
    severity: event.severity === 'info' ? 'low' : event.severity,
    status: 'open',
    escalationPolicyId: event.escalationPolicyId || null,
    notificationSuppressed: false,
    source: monitor ? 'monitor' : 'automation',
    ...(monitor
      ? {
          activeAutomatic: true,
          triggeringChecks: [{ monitorId: String(monitor._id), checkedAt: event.checkedAt }],
        }
      : {}),
    matchedRuleIds: event.matchedRuleIds || [],
    fields: [],
    custom: {},
    revision: 0,
    createdAt: now,
    updatedAt: now,
    createdBy: 'System',
    updatedBy: 'System',
    createdById: null,
    updatedById: null,
    timeline: [{ at: now, by: 'System', status: 'open', note: 'Created by an event rule.' }],
  };
  try {
    const schema = config?.fields || [];
    input.fields = schema.filter((field) => field.type !== 'builtin' && !field.archived);
    const catalog = await db.collection('catalogs').findOne({ _id: event.userId });
    if (input.serviceId && !catalog?.services?.some((service) => service.id === input.serviceId))
      throw new Error('Service unavailable.');
    Object.assign(
      input,
      resolveChoices({ status: input.status, severity: input.severity }, schema, 'incidents'),
    );
    input.custom = validateValues({}, input.fields);
    validateMandatory(schema, input);
    await db
      .collection('incidents')
      .updateOne({ _id, workspaceId: event.userId }, { $setOnInsert: input }, { upsert: true });
    await db
      .collection('events')
      .updateOne(
        { _id: event._id, userId: event.userId },
        { $set: { ruleIncidentId: String(_id), actionError: null } },
      );
  } catch {
    await db.collection('events').updateOne(
      { _id: event._id, userId: event.userId },
      {
        $set: {
          actionError:
            'Incident creation did not complete. Check required form fields and routing references.',
        },
      },
    );
    await writeAudit(db, {
      workspaceId: event.userId,
      source: 'worker',
      action: 'event_rule_incident',
      recordType: 'events',
      recordId: event._id,
      outcome: 'failed',
      operation: 'Create rule incident',
      statusCode: 409,
    });
    return;
  }
  await writeAudit(db, {
    workspaceId: event.userId,
    source: 'worker',
    action: 'event_rule_incident',
    recordType: 'incidents',
    recordId: _id,
    operation: 'Create rule incident',
  });
}
import { ObjectId } from 'mongodb';
const stableEventIdFrom = (value) => new ObjectId(value);
