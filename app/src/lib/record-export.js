import { displayValue } from './display-value.js';
import { csvRow } from '../../../shared/files/csv.js';
import { isTimestampField } from './date-time.js';

const common = [
  'number',
  'title',
  'name',
  'displayName',
  'description',
  'status',
  'severity',
  'priority',
  'sourceLabel',
  'createdBy',
  'createdAt',
  'updatedBy',
  'updatedAt',
];
const fields = {
  incidents: [
    'serviceName',
    'assignmentGroupName',
    'assigneeName',
    'openedForName',
    'resolutionNotes',
    'resolvedAt',
  ],
  tasks: ['serviceName', 'incidentTitle', 'assignmentGroupName', 'assigneeName', 'dueDate'],
  knowledge: [
    'articleTypeLabel',
    'knowledgeBaseTitle',
    'serviceName',
    'summary',
    'content',
    'steps',
  ],
  rcas: [
    'summary',
    'impact',
    'timeline',
    'rootCause',
    'contributingFactors',
    'correctiveActions',
    'lessonsLearned',
  ],
  services: ['owners', 'contact', 'dependencies', 'healthPolicy'],
  collections: ['serviceIds'],
  monitors: ['type', 'url', 'method', 'intervalMinutes', 'paused', 'lastCheck'],
  events: ['checkedAt', 'statusCode', 'durationMs', 'error'],
  groups: ['memberIds'],
  workspace: [
    'email',
    'role',
    'disabled',
    'jobTitle',
    'department',
    'company',
    'phone',
    'timeZone',
    'location',
    'groupNames',
  ],
  integrations: [
    'type',
    'enabled',
    'configured',
    'recovery',
    'onCall',
    'serviceIds',
    'instanceUrl',
    'authType',
  ],
  serviceAccounts: ['enabled', 'scopes', 'serviceIds', 'apiKeyEnabled', 'oauthEnabled'],
  knowledgeBases: [],
  'on-call': ['memberId', 'serviceIds', 'start', 'end'],
};
const nested = {
  healthPolicy: ['manualDown', 'manualDegraded', 'responseTimeMs', 'failuresBeforeDown'],
  lastCheck: ['checkedAt', 'status', 'statusCode', 'durationMs', 'error'],
};
export const exportLabel = (key) =>
  ({
    sourceLabel: 'Source',
    content: 'Content',
    url: 'URL',
    statusCode: 'HTTP Status',
    durationMs: 'Duration (ms)',
  })[key] || key.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, (c) => c.toUpperCase());
/** Rich content is exported as text, never interpreted as HTML or fetched from image URLs. */
export function documentText(node, depth = 0) {
  if (!node || depth > 15) return '';
  if (node.type === 'text') return String(node.text || '');
  if (node.type === 'image') return '[Image omitted]';
  const value = (node.content || []).map((child) => documentText(child, depth + 1)).join('');
  return node.type === 'hardBreak'
    ? '\n'
    : ['paragraph', 'heading', 'listItem'].includes(node.type)
      ? `${value}\n`
      : value;
}
function textValue(key, value, format) {
  if (value == null) return '';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (isTimestampField(key) || ['start', 'end'].includes(key)) return format(value);
  if (key === 'url' || key === 'instanceUrl') {
    try {
      const url = new URL(value);
      return `${url.origin}${url.pathname}`;
    } catch {
      return '';
    }
  }
  if (key === 'steps' && Array.isArray(value))
    return value
      .slice(0, 30)
      .map((step, i) => `${i + 1}. ${step.title}\n${step.instructions}`)
      .join('\n\n');
  if (Array.isArray(value))
    return value.filter((item) => ['string', 'number'].includes(typeof item)).join(', ');
  if (nested[key] && typeof value === 'object')
    return nested[key]
      .filter((field) => value[field] != null)
      .map((field) => `${exportLabel(field)}: ${textValue(field, value[field], format)}`)
      .join('\n');
  return ['string', 'number'].includes(typeof value) ? String(value) : '';
}
/** Explicit public-field allowlists prevent accidental credential exports when API shapes grow. */
export function recordExportRows(
  kind,
  item,
  schema = [],
  { format = String, tableFields = [], linked = [] } = {},
) {
  const allowed = kind === 'tableRecord' ? tableFields : [...common, ...(fields[kind] || [])];
  const rows = [...new Set(allowed)]
    .filter((key) => item[key] != null)
    .map((key) => ({
      key,
      label: schema.find((field) => field.id === key)?.label || exportLabel(key),
      value: ['status', 'severity', 'priority', 'type', 'role'].includes(key)
        ? item[`${key}Label`] || displayValue(item[key])
        : textValue(key, item[key], format),
    }));
  if (kind === 'knowledge' && item.contentDocument) {
    const content = { key: 'content', label: 'Content', value: documentText(item.contentDocument) };
    const at = rows.findIndex((row) => row.key === 'content');
    if (at < 0) rows.push(content);
    else rows[at] = content;
  }
  // Use the current workspace schema: archived values remain stored but cannot enter exports.
  for (const field of schema.filter((field) => field.type !== 'builtin' && !field.archived)) {
    if (item.custom?.[field.id] != null)
      rows.push({
        key: field.id,
        label: field.label,
        value: textValue(field.id, item.custom[field.id], format),
      });
  }
  rows.push(...linked);
  return rows
    .filter((row) => row.value !== '')
    .slice(0, 200)
    .map((row) => ({ ...row, value: row.value.slice(0, 300000) }));
}
export const recordCsv = (rows) =>
  '\uFEFF' +
  csvRow(['Field', 'Value']) +
  rows.map((row) => csvRow([row.label, row.value])).join('');
export function recordPdfDefinition(title, rows) {
  return {
    info: { title },
    pageSize: 'A4',
    pageMargins: [48, 48, 48, 48],
    defaultStyle: { font: 'Roboto', fontSize: 10, lineHeight: 1.35, color: '#243247' },
    content: [
      { text: title, fontSize: 25, bold: true, margin: [0, 0, 0, 16] },
      ...rows
        .filter((row) => row.key !== 'title' && row.key !== 'name')
        .flatMap((row) => [
          { text: row.label, fontSize: 12, bold: true, color: '#24528b', margin: [0, 12, 0, 4] },
          { text: row.value },
        ]),
    ],
    footer: (page, pages) => ({
      text: `${page} / ${pages}`,
      alignment: 'center',
      fontSize: 8,
      color: '#64748b',
      margin: [0, 12, 0, 0],
    }),
  };
}
