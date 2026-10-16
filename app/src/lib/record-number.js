const prefixes = {
  incidents: 'INC',
  events: 'EVT',
  eventAlerts: 'ALT',
  tasks: 'TASK',
  rcas: 'RCA',
  knowledge: 'KB',
  knowledgeBases: 'KBASE',
  services: 'SVC',
  collections: 'COL',
  monitors: 'MON',
  groups: 'GRP',
  workspace: 'USR',
  'on-call': 'OC',
  integrations: 'INT',
};

/** Use the server-owned sequential number, with a stable legacy fallback. */
export function recordNumber(kind, item) {
  if (!item?.id) return '';
  if (item.number || item.recordNumber) return item.number || item.recordNumber;
  const raw = String(item.id);
  const hex = raw.replaceAll('-', '');
  const identifier = /^[a-f\d]{24}$|^[a-f\d]{32}$/i.test(hex)
    ? BigInt(`0x${hex}`).toString(36).toUpperCase()
    : raw;
  return `${prefixes[kind] || 'REC'}-${identifier}`;
}
