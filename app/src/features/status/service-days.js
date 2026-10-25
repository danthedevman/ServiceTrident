import { statusDay } from '../../../../shared/domain/status-time-zone.js';
const dayFormatter = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeZone: 'UTC' });
/** Summarize a service and its dependencies once per day, without duplicating shared dependencies. */
export function serviceDays(
  service,
  services,
  monitors,
  generatedAt,
  days,
  observedAt = generatedAt,
  timeZone = 'UTC',
) {
  const servicesById = new Map(services.map((item) => [item.id, item]));
  const ids = new Set();
  const visit = (id) => {
    if (ids.has(id)) return;
    ids.add(id);
    servicesById.get(id)?.dependencyIds?.forEach(visit);
  };
  visit(service.id);
  const relevant = monitors.filter((monitor) => ids.has(monitor.serviceId));
  const histories = relevant.map(
    (monitor) => new Map(monitor.history.map((entry) => [entry.day, entry])),
  );
  const today = statusDay(observedAt, timeZone);
  return Array.from({ length: days }, (_, index) => {
    const date = new Date(generatedAt);
    date.setUTCHours(0, 0, 0, 0);
    date.setUTCDate(date.getUTCDate() - days + 1 + index);
    const day = date.toISOString().slice(0, 10);
    const checks = histories.map((history) => history.get(day));
    const total = checks.reduce((sum, entry) => sum + (entry?.total ?? 0), 0);
    const up = checks.reduce((sum, entry) => sum + (entry?.up ?? 0), 0);
    const observedStatus =
      total > up
        ? 'down'
        : checks.length && checks.every((entry) => entry?.total)
          ? 'up'
          : 'unknown';
    const isToday = day === today;
    const current = isToday && ['degraded', 'down'].includes(service.status);
    const status = current ? service.status : observedStatus;
    const label = `${dayFormatter.format(date)}: ${current ? (status === 'degraded' ? 'Currently degraded' : 'Currently down') : status === 'down' ? 'Disruption detected' : status === 'up' ? 'Operational' : 'Incomplete or no data'}${total ? ` · ${((up / total) * 100).toFixed(1)}% of checks successful${isToday ? ' so far' : ''}` : ''}`;
    return { day, status, label, isToday };
  });
}
