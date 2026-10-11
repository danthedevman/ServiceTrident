import { monitorHealth } from '@servicetrident/shared/domain/service-health';

/** Resolve service and dependency checks using the same freshness and threshold rules as health. */
export function relatedMonitorChecks(serviceId, event, services, monitors, now) {
  const related = new Map();
  const visit = (id) => {
    if (related.has(id)) return;
    const service = services.find((item) => item.id === id);
    if (!service) return;
    related.set(id, service);
    for (const dependency of service.dependencyIds ?? []) visit(dependency);
  };
  visit(serviceId);
  const selected = monitors.filter((monitor) => {
    const service = related.get(String(monitor.serviceId));
    if (!service || monitor.demoBatchId) return false;
    const state = monitorHealth(monitor, service.healthPolicy, +now);
    return event === 'recovered' ? state === 'up' : ['down', 'degraded'].includes(state);
  });
  return selected.map((monitor) => ({ monitor, service: related.get(String(monitor.serviceId)) }));
}

/** Snapshot the checks behind an alert so retries cannot replace a failure with a later success. */
export async function monitorContext(db, workspaceId, incident, event, services, monitors, now) {
  if (incident.source !== 'monitor') return [];
  const selected = relatedMonitorChecks(incident.serviceId, event, services, monitors, now).slice(
    0,
    5,
  );
  return Promise.all(
    selected.map(async ({ monitor, service }) => {
      const check = monitor.lastCheck;
      // Raw bodies, URLs, and headers can contain secrets; only check diagnostics leave the app.
      const saved = await db.collection('events').findOne(
        { userId: workspaceId, monitorId: monitor._id, checkedAt: check.checkedAt },
        {
          projection: {
            'details.method': 1,
            'details.responses.statusMessage': 1,
            'details.responses.body.error': 1,
          },
        },
      );
      const response = saved?.details?.responses?.at(-1);
      return {
        name: String(monitor.name ?? 'Monitor').slice(0, 200),
        service: String(service.name ?? '').slice(0, 200),
        statusCode: Number.isInteger(check.statusCode) ? check.statusCode : null,
        statusMessage: String(response?.statusMessage ?? '').slice(0, 100),
        error: String(check.error ?? '').slice(0, 500),
        responseError: String(response?.body?.error ?? '').slice(0, 500),
        durationMs: Number.isFinite(check.durationMs) ? check.durationMs : null,
        method: monitor.method === 'HEAD' ? 'HEAD' : 'GET',
        checkedAt: new Date(check.checkedAt).toISOString(),
      };
    }),
  );
}
