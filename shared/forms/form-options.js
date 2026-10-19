/** Browser-safe built-in field definitions and canonical workflow choices. */
export const builtinChoices = {
  incidents: {
    severity: ['low', 'medium', 'high', 'critical'],
    status: ['open', 'acknowledged', 'resolved'],
  },
  tasks: {
    priority: ['low', 'medium', 'high'],
    status: ['todo', 'in_progress', 'blocked', 'done', 'archived'],
  },
  knowledge: { status: ['draft', 'published', 'archived'], articleType: ['article', 'runbook'] },
};
/** Human-readable defaults do not change stored canonical values. */
export function optionLabel(value) {
  return (
    { todo: 'To do', in_progress: 'In progress' }[value] ||
    value.charAt(0).toUpperCase() + value.slice(1).replaceAll('_', ' ')
  );
}
/** Legacy forms acquire defaults without a destructive migration. */
export function fieldChoices(kind, field) {
  return (
    field?.choices ??
    (builtinChoices[kind]?.[field?.id] || []).map((value) => ({
      value,
      label: optionLabel(value),
      base: value,
      hidden: false,
    }))
  );
}
export const workFields = {
  tasks: [
    ['title', 'Title', true],
    ['status', 'Status', true],
    ['priority', 'Priority', true],
    ['serviceId', 'Service', false],
    ['incidentId', 'Incident', false],
    ['assignmentGroupId', 'Assignment group', false],
    ['assigneeId', 'Assigned to', false],
    ['dueDate', 'Due date', false],
    ['description', 'Description', false],
  ],
  knowledge: [
    ['articleType', 'Type', true],
    ['knowledgeBaseId', 'Knowledge Base', false],
    ['title', 'Title', true],
    ['status', 'Status', true],
    ['serviceId', 'Service', false],
    ['summary', 'Summary', false],
    ['content', 'Article content', true],
  ],
};
/** Stable built-ins allow relabeling/reordering, never changing identity or data type. */
export function workBuiltinFields(kind) {
  return workFields[kind].map(([id, label, required]) => ({
    id,
    label,
    required,
    type: 'builtin',
    archived: false,
    options: [],
  }));
}
/** Merge current configuration with saved fields so old values remain readable. */
export function recordFields(schema, saved = []) {
  return [
    ...schema.filter((field) => field.type !== 'builtin'),
    ...saved.filter((field) => !schema.some((next) => next.id === field.id)),
  ];
}
