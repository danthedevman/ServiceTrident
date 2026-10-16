import { InputError } from '@servicetrident/shared/validation/input-error';
import { stableEventId } from '@servicetrident/shared/domain/events';
import { objectId } from '../domain/identifiers.js';

export const retainedEvents = (workspaceId) => ({
  userId: workspaceId,
  checkedAt: { $gte: new Date(Date.now() - 30 * 86400000) },
});
export function incidentEventsFilter(incident) {
  const alternatives = (incident.triggeringChecks || []).slice(0, 1000).map((check) => ({
    monitorId: objectId(check.monitorId),
    checkedAt: new Date(check.checkedAt),
  }));
  if (incident.eventAlertId) alternatives.push({ alertId: incident.eventAlertId });
  return alternatives.length ? { $or: alternatives } : { _id: { $in: [] } };
}
export function incidentAlertsFilter(incident, workspaceId) {
  return {
    _id: {
      $in: [
        ...new Set([
          ...(incident.eventAlertId ? [incident.eventAlertId] : []),
          ...(incident.triggeringChecks || [])
            .slice(0, 1000)
            .map((check) =>
              String(stableEventId('monitor-alert', String(workspaceId), String(check.monitorId))),
            ),
        ]),
      ].map(objectId),
    },
  };
}
export async function eventRelationParent(db, workspaceId, query) {
  const isAlert = !!query.alertId;
  const item = await db.collection(isAlert ? 'eventAlerts' : 'events').findOne({
    _id: objectId(isAlert ? query.alertId : query.eventId),
    ...(isAlert ? { workspaceId } : retainedEvents(workspaceId)),
  });
  if (!item) throw new InputError('Related record not found.', 404);
  return { item, isAlert };
}
export function relatedIncidentsFilter(item, isAlert) {
  const alternatives = [];
  const alertId = isAlert ? String(item._id) : item.alertId;
  if (alertId) alternatives.push({ eventAlertId: alertId });
  if (item.monitorId)
    alternatives.push({
      triggeringChecks: {
        $elemMatch: {
          monitorId: String(item.monitorId),
          ...(!isAlert ? { checkedAt: item.checkedAt } : {}),
        },
      },
    });
  return alternatives.length ? { $or: alternatives } : { _id: { $in: [] } };
}
