import { ObjectId } from 'mongodb';
/** A service incident stays actionable if any failing triggering monitor is unsilenced. */
export async function ruleSilenced(db, incident) {
  if (incident.notificationSuppressed) return true;
  if (incident.eventAlertId) {
    const alert = await db
      .collection('eventAlerts')
      .findOne(
        { _id: new ObjectId(incident.eventAlertId), workspaceId: incident.workspaceId },
        { projection: { suppressed: 1 } },
      );
    if (alert?.suppressed) return true;
  }
  const ids = [
    ...new Set((incident.triggeringChecks || []).slice(0, 1000).map((check) => check.monitorId)),
  ].map((id) => new ObjectId(id));
  if (!ids.length) return false;
  const monitors = await db
    .collection('monitors')
    .find(
      { userId: incident.workspaceId, _id: { $in: ids }, 'lastCheck.status': 'down' },
      { projection: { lastCheck: 1 } },
    )
    .toArray();
  return (
    monitors.length > 0 &&
    monitors.every((monitor) => monitor.lastCheck.notificationSuppressed === true)
  );
}
