import { ObjectId } from 'mongodb';

/** Bounded indexed lookups: origin never fetches bodies, response headers or integration secrets. */
export async function incidentOrigin(db, workspaceId, incident, role) {
  const result = [];
  if (incident.eventAlertId)
    result.push({
      key: 'event-alert',
      label: 'Originating alert',
      href: `/alerts/${incident.eventAlertId}`,
    });
  if (incident.source === 'integration') {
    const account = /^[a-f\d]{24}$/i.test(incident.sourceAccountId || '')
      ? await db
          .collection('serviceAccounts')
          .findOne(
            { _id: new ObjectId(incident.sourceAccountId), workspaceId },
            { projection: { name: 1 } },
          )
      : null;
    result.push({
      key: 'integration',
      label: account?.name || incident.sourceAccountName || 'External integration',
      ...(account && role === 'admin' ? { href: `/settings/service-accounts/${account._id}` } : {}),
    });
  }
  if (incident.source === 'ai') result.push({ key: 'ai', label: 'Confirmed AI assistant action' });
  const seen = new Set();
  const checks = (incident.triggeringChecks ?? [])
    .filter((check) => {
      if (
        !/^[a-f\d]{24}$/i.test(check.monitorId || '') ||
        !Number.isFinite(+new Date(check.checkedAt)) ||
        seen.has(check.monitorId)
      )
        return false;
      seen.add(check.monitorId);
      return true;
    })
    .slice(0, 20);
  if (checks.length) {
    const [monitors, events] = await Promise.all([
      db
        .collection('monitors')
        .find(
          {
            userId: workspaceId,
            _id: { $in: checks.map((check) => new ObjectId(check.monitorId)) },
          },
          { projection: { name: 1 } },
        )
        .limit(20)
        .toArray(),
      db
        .collection('events')
        .find(
          {
            userId: workspaceId,
            checkedAt: { $gte: new Date(Date.now() - 30 * 86400000) },
            $or: checks.map((check) => ({
              monitorId: new ObjectId(check.monitorId),
              checkedAt: new Date(check.checkedAt),
            })),
          },
          { projection: { monitorId: 1, number: 1 } },
        )
        .limit(20)
        .toArray(),
    ]);
    for (const check of checks) {
      const monitor = monitors.find((row) => String(row._id) === check.monitorId);
      result.push({
        key: `monitor:${check.monitorId}`,
        label: `Monitor: ${monitor?.name || check.monitorName || 'Unavailable monitor'}`,
        ...(monitor ? { href: `/monitors/${monitor._id}` } : {}),
      });
      const event = events.find((row) => String(row.monitorId) === check.monitorId);
      if (event && monitor)
        result.push({
          key: `event:${event._id}`,
          label: `Event: ${event.number || 'Triggering check'}`,
          href: `/monitors/${monitor._id}/events/${event._id}`,
        });
    }
  } else if (['monitor', 'automation'].includes(incident.source)) {
    result.push({
      key: 'service-health',
      label: 'Service health',
      ...(incident.serviceId
        ? { href: `/services/${encodeURIComponent(incident.serviceId)}` }
        : {}),
    });
  }
  return result;
}
