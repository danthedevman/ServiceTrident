const recordId = (value) => typeof value === 'string' && /^[a-f0-9]{24}$/i.test(value);
const labels = { incidents: 'Incidents', tasks: 'Tasks', knowledge: 'All Articles' };

/** Only supported record parents become navigation paths; IDs never become visible labels. */
export function historyParent(type, params) {
  if (type === 'headers') {
    const monitorId = params.get('monitorId'),
      id = params.get('eventId');
    return recordId(monitorId) && recordId(id)
      ? { kind: 'events', id, monitorId, path: `/monitors/${monitorId}/events/${id}` }
      : null;
  }
  const kind = ['activity', 'comments'].includes(type)
    ? 'incidents'
    : type === 'attachments'
      ? params.get('recordKind')
      : null;
  const id = params.get('recordId');
  return Object.hasOwn(labels, kind) && recordId(id) ? { kind, id, path: `/${kind}/${id}` } : null;
}

export function recordAncestors(kind, record = {}, base = {}) {
  if (kind === 'knowledge' && record.knowledgeBaseId)
    return [
      { label: 'Knowledge Bases', to: '/knowledge' },
      {
        label: base.title || record.knowledgeBaseTitle || 'Knowledge Base',
        to: `/knowledge/bases/${encodeURIComponent(record.knowledgeBaseId)}`,
      },
    ];
  return [
    {
      label: labels[kind] || 'Records',
      to: kind === 'knowledge' ? '/knowledge/articles' : `/${kind}`,
    },
  ];
}

/** History follows its actual list or authorized parent rather than a generic “Details” dead end. */
export function historyBreadcrumbs(type, record = {}, context, parent = {}, base = {}) {
  const last = {
    label:
      record.name ||
      record.title ||
      {
        audit: 'Audit Entry',
        comments: 'Discussion Entry',
        activity: 'Activity Entry',
        deliveries: 'Delivery Log',
        invitations: 'Invitation',
        inquiries: 'Hosting Inquiry',
        attachments: 'Attachment',
        headers: 'Header',
        demo: 'Demo Record Type',
      }[type] ||
      'Record',
  };
  if (context?.kind === 'events')
    return [
      { label: 'Events', to: '/events' },
      { label: parent.monitor?.name || 'Monitor', to: `/monitors/${context.monitorId}` },
      { label: parent.event?.number ? `Event ${parent.event.number}` : 'Event', to: context.path },
      last,
    ];
  if (context) {
    const item = parent.incident || parent.item || {};
    const related = type === 'comments' ? 'discussion' : type;
    return [
      ...recordAncestors(context.kind, item, base),
      { label: item.title || item.name || 'Record', to: context.path },
      {
        label: { activity: 'Activity', comments: 'Conversation', attachments: 'Attachments' }[type],
        to: `${context.path}?related=${related}`,
      },
      last,
    ];
  }
  if (type === 'audit')
    return [
      { label: 'Settings', to: '/settings' },
      { label: 'Audit Log', to: '/settings/audit' },
      last,
    ];
  if (type === 'deliveries')
    return [
      { label: 'Integrations', to: '/integrations' },
      { label: 'Logs', to: '/integrations?related=deliveries' },
      last,
    ];
  if (type === 'invitations')
    return [{ label: 'Settings', to: '/settings' }, { label: 'Users', to: '/workspace' }, last];
  if (type === 'demo')
    return [
      { label: 'Settings', to: '/settings' },
      { label: 'Demo Data', to: '/settings#demo-data' },
      last,
    ];
  return [{ label: 'Settings', to: '/settings' }, last];
}
