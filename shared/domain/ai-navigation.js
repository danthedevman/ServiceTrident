/** Athena may recommend only app-owned destinations; URLs never come from model output. */
const pages = [
  ['dashboard', 'Dashboard', '/'],
  ['incidents', 'Incidents', '/incidents'],
  ['services', 'Services', '/services'],
  ['components', 'Components', '/components'],
  ['tasks', 'Tasks', '/tasks'],
  ['alerts', 'Alerts', '/alerts'],
  ['events', 'Events', '/events'],
  ['monitors', 'Monitors', '/monitors'],
  ['on-call', 'On Call', '/on-call'],
  ['knowledge', 'Knowledge', '/knowledge'],
  ['rcas', 'RCAs', '/rcas'],
  ['status', 'Status Page', '/status'],
  ['reporting', 'Operational Reporting', '/?view=operational'],
  ['notifications', 'Notifications', '/notifications'],
  ['profile', 'Profile', '/profile'],
  ['settings', 'Settings', '/settings'],
  ['help', 'Help', '/help'],
];
const responder = [
  ['create-incident', 'Create Incident', '/incidents/new'],
  ['create-task', 'Create Task', '/tasks/new'],
  ['create-article', 'Create Knowledge Article', '/knowledge/new'],
  ['create-rca', 'Create RCA', '/rcas/new'],
];
const admin = [
  ['athena-settings', 'Athena Settings', '/settings?section=ai'],
  ['integrations', 'Integrations', '/integrations'],
  ['event-rules', 'Event Rules', '/event-rules'],
  ['escalation-policies', 'Escalation Policies', '/escalation-policies'],
  ['maintenance-windows', 'Maintenance Windows', '/maintenance-windows'],
  ['alert-grouping', 'Alert Grouping', '/alert-grouping'],
  ['probe-agents', 'Probe Agents', '/probe-agents'],
  ['create-service', 'Create Service', '/services/new'],
  ['create-component', 'Create Component', '/components/new'],
  ['create-monitor', 'Create Monitor', '/monitors/new'],
];
export function aiDestinations(role) {
  if (!['admin', 'responder', 'viewer'].includes(role)) return [];
  return [
    ...pages,
    ...(['admin', 'responder'].includes(role) ? responder : []),
    ...(role === 'admin' ? admin : []),
  ].map(([id, label, href]) => ({ id, label, href }));
}
