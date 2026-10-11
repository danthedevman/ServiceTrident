/** Report links encode canonical workflow values, never display labels or arbitrary predicates. */
export function dashboardReportHref(report, value = '') {
  const definition = dashboardReport(report, value);
  if (!definition) return '/';
  return `/dashboard/reports?${new URLSearchParams({ report, ...(value ? { value } : {}) })}`;
}

const definitions = {
  incidents: ['Unresolved Incidents', 'incidents'],
  'my-incidents': ['Incidents Assigned to Me', 'incidents'],
  'team-incidents': ['Incidents Assigned to My Team', 'incidents'],
  'my-tasks': ['Tasks Assigned to Me', 'tasks'],
  'team-tasks': ['Tasks Assigned to My Team', 'tasks'],
  urgent: ['Critical / High Unresolved Incidents', 'incidents'],
  unassigned: ['Unassigned Unresolved Incidents', 'incidents'],
  severity: [
    'Unresolved Incidents by Severity',
    'incidents',
    ['critical', 'high', 'medium', 'low'],
  ],
  incidentStatus: ['Incidents by Response Status', 'incidents', ['open', 'acknowledged']],
  serviceIncidents: ['Unresolved Incidents for Service', 'incidents', 'id'],
  tasks: ['Outstanding Tasks', 'tasks'],
  overdue: ['Overdue Outstanding Tasks', 'tasks'],
  taskStatus: ['Tasks by Status', 'tasks', ['todo', 'in_progress', 'blocked']],
  taskPriority: ['Outstanding Tasks by Priority', 'tasks', ['high', 'medium', 'low']],
  impacted: ['Services with Active Incidents', 'services'],
  services: ['Service Health', 'services'],
  serviceHealth: ['Services by Health', 'services', ['up', 'degraded', 'down', 'unknown']],
  monitors: ['Monitor Health', 'monitors'],
  monitorHealth: ['Monitors by Health', 'monitors', ['up', 'down', 'pending', 'unknown', 'paused']],
  uptime: ['Recorded Monitor Uptime', 'uptime'],
};

export function dashboardReport(report, value = '') {
  if (typeof report !== 'string' || typeof value !== 'string') return null;
  const definition = Object.hasOwn(definitions, report) ? definitions[report] : null;
  if (!definition) return null;
  const [title, kind, allowed] = definition;
  if (
    allowed === 'id'
      ? value !== 'none' && !/^[a-f\d]{24}$/i.test(value)
      : allowed
        ? !allowed.includes(value)
        : !!value
  )
    return null;
  const labels = { up: 'Operational', unknown: 'Unknown / Stale', pending: 'Awaiting Check' };
  const label =
    labels[value] || value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
  return { report, value, kind, title: allowed && allowed !== 'id' ? `${title}: ${label}` : title };
}

/** Same canonical predicates as the dashboard aggregates; UTC dates exclude today's tasks. */
export function dashboardReportFilter(
  { report, value, kind },
  workspaceId,
  today,
  assignments = {},
) {
  const filter = {
    workspaceId,
    status: {
      $in: kind === 'incidents' ? ['open', 'acknowledged'] : ['todo', 'in_progress', 'blocked'],
    },
  };
  if (['my-incidents', 'my-tasks'].includes(report))
    filter.assigneeId = assignments.assigneeId ?? { $in: [] };
  if (['team-incidents', 'team-tasks'].includes(report))
    filter.assignmentGroupId = { $in: assignments.teamIds ?? [] };
  if (report === 'urgent') filter.severity = { $in: ['critical', 'high'] };
  if (report === 'unassigned') filter.assigneeId = null;
  if (report === 'serviceIncidents') filter.serviceId = value === 'none' ? null : value;
  if (report === 'severity') filter.severity = value;
  if (report === 'incidentStatus' || report === 'taskStatus') filter.status = value;
  if (report === 'taskPriority') filter.priority = value;
  if (report === 'overdue') filter.dueDate = { $type: 'string', $gt: '', $lt: today };
  return filter;
}
