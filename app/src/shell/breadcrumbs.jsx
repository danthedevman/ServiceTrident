import { historyParent, historyBreadcrumbs, recordAncestors } from '../lib/navigation-context.js';
import React from 'react';
import { onCallLabel } from '../lib/on-call-label.js';
import { dashboardReport } from '../../../shared/domain/dashboard-reports.js';
import { Link, useLocation } from 'react-router-dom';
import { useResource } from '../data/use-resource.js';

const sections = {
  records: 'Record',
  notifications: 'Notifications',
  profile: 'Profile',
  dashboard: 'Dashboard',
  help: 'Help',
  settings: 'Settings',
  incidents: 'Incidents',
  tasks: 'Tasks',
  rcas: 'RCAs',
  knowledge: 'Knowledge Bases',
  services: 'Services',
  collections: 'Collections',
  monitors: 'Monitors',
  events: 'Events',
  alerts: 'Alerts',
  groups: 'Groups',
  integrations: 'Integrations',
  workspace: 'Users',
  'on-call': 'On Call',
  status: 'Status Page',
};
/** Keep every routed form connected to its parent list and, when available, its saved record. */
export function Breadcrumbs({ resolveNames = true }) {
  const { pathname, search } = useLocation(),
    parts = pathname.split('/').filter(Boolean);
  const [kind, id, action] = parts;
  const directory = ['groups', 'workspace'].includes(kind);
  const nested = !!sections[kind] && id !== 'public';
  const catalog = [
    'services',
    'collections',
    'groups',
    'integrations',
    'workspace',
    'on-call',
  ].includes(kind);
  const path =
    resolveNames &&
    nested &&
    id &&
    !['new', 'fields', 'invite', 'settings', 'articles', 'bases', 'ai'].includes(id)
      ? ['monitors', 'incidents', 'tasks', 'rcas', 'knowledge', 'events', 'alerts'].includes(kind)
        ? `/${kind === 'alerts' ? 'event-alerts' : kind}/${id}`
        : catalog
          ? kind === 'workspace'
            ? '/members'
            : `/${kind}`
          : null
      : null;
  const basePath = kind === 'knowledge' && id === 'bases';
  const accountRecord =
    kind === 'settings' && id === 'service-accounts' && /^[a-f\d]{24}$/i.test(action || '');
  const { data } = useResource(
    accountRecord
      ? `/settings/service-accounts/${action}`
      : basePath && action && action !== 'new'
        ? `/knowledge-bases/${action}`
        : path,
  );
  const query = new URLSearchParams(search);
  const historyContext = kind === 'records' ? historyParent(id, query) : null;
  const history = useResource(
    resolveNames && kind === 'records' && action
      ? `/table-records/${encodeURIComponent(id)}/${encodeURIComponent(action)}${search}`
      : null,
  );
  const historyRecord = useResource(resolveNames && historyContext ? historyContext.path : null);
  const currentEvent = useResource(
    resolveNames && kind === 'monitors' && action === 'events' ? pathname : null,
  );
  const articleRecord =
    kind === 'knowledge' && id && !['new', 'fields', 'articles', 'bases', 'ai'].includes(id);
  const articleCreate = kind === 'knowledge' && id === 'new';
  const articleBaseId = articleRecord
    ? data?.item?.knowledgeBaseId
    : articleCreate && /^[a-f0-9]{24}$/i.test(query.get('knowledgeBaseId') || '')
      ? query.get('knowledgeBaseId')
      : historyContext?.kind === 'knowledge'
        ? historyRecord.data?.item?.knowledgeBaseId
        : null;
  const articleBase = useResource(
    resolveNames && articleBaseId ? `/knowledge-bases/${encodeURIComponent(articleBaseId)}` : null,
  );
  const coverageRecord = resolveNames && kind === 'on-call' && id && id !== 'new';
  const coverageMembers = useResource(coverageRecord ? '/members' : null);
  const coverageServices = useResource(coverageRecord ? '/services' : null);
  if (!nested) return null;
  const name =
    data?.monitor?.name ||
    data?.incident?.title ||
    data?.item?.title ||
    data?.item?.name ||
    data?.[kind]?.find((item) => item.id === id)?.name ||
    data?.members?.find((item) => item.id === id)?.displayName ||
    (kind === 'on-call' &&
      onCallLabel(
        data?.shifts?.find((item) => item.id === id),
        coverageMembers.data?.members,
        coverageServices.data?.services,
      ));
  const nouns = {
    incidents: 'incident',
    tasks: 'task',
    rcas: 'RCA',
    knowledge: 'article',
    services: 'service',
    collections: 'collection',
    monitors: 'monitor',
    groups: 'group',
    integrations: 'integration',
    workspace: 'user',
    'on-call': 'coverage',
  };
  const noun = nouns[kind] || 'record',
    crumbs = [{ label: sections[kind], to: `/${kind}` }];
  if (articleRecord || articleCreate)
    crumbs.splice(
      0,
      crumbs.length,
      ...recordAncestors(
        'knowledge',
        articleRecord
          ? data?.item
          : articleBase.data?.item
            ? { knowledgeBaseId: articleBaseId, knowledgeBaseTitle: articleBase.data.item.title }
            : {},
        articleBase.data?.item,
      ),
    );
  if (kind === 'records')
    crumbs.splice(
      0,
      crumbs.length,
      ...historyBreadcrumbs(
        id,
        history.data?.item,
        historyContext,
        historyRecord.data,
        articleBase.data?.item,
      ),
    );
  if (directory) crumbs.unshift({ label: 'Settings', to: '/settings' });
  if (kind === 'collections') crumbs.unshift({ label: 'Services', to: '/services' });
  if (basePath)
    crumbs.push({ label: action === 'new' ? 'Create Knowledge Base' : name || 'Knowledge Base' });
  else if (kind === 'knowledge' && id === 'articles') crumbs.push({ label: 'All Articles' });
  else if (kind === 'dashboard' && id === 'reports') {
    const params = new URLSearchParams(search);
    crumbs.push({
      label:
        dashboardReport(params.get('report'), params.get('value') || '')?.title ||
        'Report Not Found',
    });
  } else if (id === 'new')
    crumbs.push({ label: `Create ${noun.charAt(0).toUpperCase()}${noun.slice(1)}` });
  else if (id === 'fields') crumbs.push({ label: 'Form Builder' });
  else if (id === 'invite') crumbs.push({ label: 'Invite Teammate' });
  else if (kind === 'settings' && id === 'identity-providers')
    crumbs.push({ label: 'Identity Providers' });
  else if (kind === 'settings' && id === 'audit') crumbs.push({ label: 'Audit Log' });
  else if (kind === 'settings' && id === 'service-accounts') {
    crumbs.push({
      label: 'Service Accounts',
      to: action ? '/settings/service-accounts' : undefined,
    });
    if (action) crumbs.push({ label: name || 'Service Account' });
  } else if (id === 'settings') crumbs.push({ label: 'Settings' });
  else if (kind === 'integrations' && id === 'ai') crumbs.push({ label: 'AI Provider' });
  else if (id && kind !== 'records') {
    crumbs.push({
      label: name || `${noun.charAt(0).toUpperCase()}${noun.slice(1)}`,
      to: `/${kind}/${id}`,
    });
    if (action === 'password') crumbs.push({ label: 'Reset Password' });
    if (action === 'edit') crumbs.push({ label: 'Edit' });
    if (action === 'events') crumbs.push({ label: 'Check Event' });
  }
  if (kind === 'monitors' && action === 'events')
    crumbs.splice(
      0,
      crumbs.length,
      { label: 'Events', to: '/events' },
      { label: name || 'Monitor', to: `/monitors/${id}` },
      {
        label: currentEvent.data?.event?.number
          ? `Event ${currentEvent.data.event.number}`
          : 'Check Event',
      },
    );
  if (['events', 'alerts'].includes(kind) && id)
    crumbs.splice(
      0,
      crumbs.length,
      {
        label: kind === 'alerts' ? 'Alerts' : 'Events',
        to: kind === 'alerts' ? '/alerts' : '/events',
      },
      {
        label:
          data?.item?.title ||
          data?.event?.title ||
          data?.event?.number ||
          (kind === 'events' ? 'Event' : 'Alert'),
      },
    );
  return (
    <nav aria-label="Breadcrumb">
      <ol className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-slate-500 dark:text-slate-400">
        {crumbs.map((crumb, index) => (
          <li key={index} className="flex min-w-0 items-center gap-2">
            {index > 0 && <span aria-hidden="true">/</span>}
            {index === crumbs.length - 1 ? (
              <h1
                className="breadcrumb-title block max-w-[min(55vw,28rem)] truncate text-lg font-semibold text-slate-700 dark:text-slate-200"
                title={crumb.label}
                aria-current="page"
              >
                {crumb.label}
              </h1>
            ) : (
              <Link
                title={crumb.label}
                className="block max-w-[min(55vw,28rem)] truncate hover:text-blue-700 dark:hover:text-blue-400"
                to={crumb.to}
              >
                {crumb.label}
              </Link>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
