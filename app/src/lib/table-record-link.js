const routes = {
  incidents: '/incidents',
  tasks: '/tasks',
  knowledge: '/knowledge',
  services: '/services',
  collections: '/collections',
  monitors: '/monitors',
  members: '/workspace',
  groups: '/groups',
  integrations: '/integrations',
  coverage: '/on-call',
  'priority-incidents': '/incidents',
  'priority-tasks': '/tasks',
  'impacted-services': '/services',
  'incident-knowledge': '/knowledge',
};

const detailSources = new Set([
  'audit',
  'activity',
  'comments',
  'deliveries',
  'invitations',
  'inquiries',
  'attachments',
  'headers',
  'demo',
]);

/** Related history keeps its parent scope in the URL; the API rechecks list and record authorization. */
export function tableRecordLink(source, deletePath, row) {
  const kind = source?.split('?')[0] || deletePath?.slice(1);
  const path = routes[kind];
  if (row.id === undefined || row.id === null) return null;
  if (path) return `${path}/${encodeURIComponent(row.id)}`;
  if (kind === 'incident-monitor-events' && row.monitorId)
    return `/monitors/${encodeURIComponent(row.monitorId)}/events/${encodeURIComponent(row.id)}`;
  if (!detailSources.has(kind)) return null;
  const query = new URLSearchParams(source?.split('?')[1] || '');
  for (const key of [...query.keys()])
    if (!['recordId', 'recordKind', 'monitorId', 'eventId', 'headerSet'].includes(key))
      query.delete(key);
  return `/records/${kind}/${encodeURIComponent(row.id)}${query.size ? `?${query}` : ''}`;
}
