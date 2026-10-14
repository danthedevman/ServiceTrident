import { DateTime } from '../preferences/date-time.jsx';
import { ActivePanelContext, RelatedCountsContext } from './record-tabs.jsx';
import { useRecordTabLabel } from './record-navigation.jsx';
import { useRecordSidebarResize } from './record-sidebar-resize.jsx';
import { Link } from 'react-router-dom';
import { AuthContext } from '../auth/auth-context.js';
import { ActionMenu } from './action-menu.jsx';
import { StateBadge } from './state-badge.jsx';
import { ReferenceValue } from './reference-value.jsx';
import { RecordActionContext, RecordHeader, RecordRailContext } from './record-actions.jsx';
import { recordNumber } from '../lib/record-number.js';
import React, { useContext, useId, useLayoutEffect, useState } from 'react';
import {
  PencilSquareIcon,
  AdjustmentsHorizontalIcon,
  ChevronDoubleLeftIcon,
  ChevronDoubleRightIcon,
} from '@heroicons/react/24/outline';
import { useUiPreferences } from '../preferences/ui-preferences.jsx';
import { useResource } from '../data/use-resource.js';
import { displayValue } from '../lib/display-value.js';

/** Keep the form mounted while collapsing independently scrolling record information. */
export function RecordWorkspace({
  children,
  sidebar,
  label = 'Details',
  onEdit,
  item,
  kind,
  actions,
  secondaryActions,
  status,
  showToolbar = true,
}) {
  useRecordTabLabel(item?.title || item?.name || item?.displayName);
  const { user } = useContext(AuthContext);
  const showFormBuilder =
    user?.role === 'admin' && ['incidents', 'tasks', 'knowledge'].includes(kind);
  const preferences = useUiPreferences();
  const { setPreference } = preferences;
  const { collapsed, handle } = useRecordSidebarResize(preferences);
  const id = useId();
  const registerRail = useContext(RecordRailContext),
    active = useContext(ActivePanelContext);
  useLayoutEffect(() => {
    if (!active || !registerRail) return;
    registerRail(id, true);
    return () => registerRail(id, false);
  }, [active, registerRail, id]);
  const [toolbar, setToolbar] = useState(null);
  const state =
    status ??
    item?.status ??
    (kind === 'workspace' && item
      ? item.disabled
        ? 'disabled'
        : 'active'
      : kind === 'integrations' && item
        ? item.enabled
          ? 'enabled'
          : 'disabled'
        : null);
  const Icon = collapsed ? ChevronDoubleLeftIcon : ChevronDoubleRightIcon;
  return (
    <div className="record-container">
      <div className="record-workspace">
        <div className="record-body min-w-0 space-y-2">
          {showToolbar && (
            <RecordHeader>
              <div className="record-toolbar flex flex-wrap items-center justify-end gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  {(showFormBuilder || secondaryActions) && (
                    <ActionMenu label="Record actions">
                      {secondaryActions}
                      {showFormBuilder && (
                        <Link to={`/${kind}/fields`}>
                          <AdjustmentsHorizontalIcon className="h-5 w-5" aria-hidden="true" />
                          Form Builder
                        </Link>
                      )}
                    </ActionMenu>
                  )}
                  <div ref={setToolbar} className="flex flex-wrap items-center gap-2">
                    {onEdit && <EditRecordButton onClick={onEdit} />}
                    {actions}
                  </div>
                </div>
              </div>
            </RecordHeader>
          )}
          <RecordActionContext.Provider value={toolbar}>
            {item && (
              <div className="record-identity flex flex-wrap items-center gap-3 py-1">
                <span
                  className="break-all font-mono text-xs text-slate-500"
                  aria-label="Record number"
                >
                  {recordNumber(kind, item)}
                </span>
                {state && <StateBadge status={state} label={item?.statusLabel} />}
              </div>
            )}
            <RelatedCountsContext.Provider value={item?.id ? { kind, id: item.id } : null}>
              {children}
            </RelatedCountsContext.Provider>
          </RecordActionContext.Provider>
        </div>
        <aside aria-label={label} data-collapsed={collapsed} className="record-sidebar min-w-0">
          <div
            {...handle}
            className="record-sidebar-resizer"
            aria-controls={id}
            title="Drag to resize; Arrow keys resize, Home collapses, End expands to maximum"
          />
          <div className="record-sidebar-header">
            <button
              type="button"
              className="btn-secondary shrink-0"
              aria-expanded={!collapsed}
              aria-controls={id}
              aria-label={collapsed ? 'Expand record information' : 'Collapse record information'}
              title={collapsed ? 'Expand record information' : 'Collapse record information'}
              onClick={() => setPreference('rightCollapsed', !collapsed)}
            >
              <Icon className="h-5 w-5" aria-hidden="true" />
            </button>
            {!collapsed && <h2 className="text-sm font-semibold">{label}</h2>}
          </div>
          <div id={id} hidden={collapsed} className="record-sidebar-content space-y-5">
            {sidebar}
          </div>
        </aside>
      </div>
    </div>
  );
}

/** A consistent sidebar section for actions, metadata, relationships, or files. */
export function RecordSection({ title, children }) {
  return (
    <section className="record-section min-w-0 space-y-3">
      {title && (
        <h2 className="text-xs font-semibold text-slate-600 dark:text-slate-300">{title}</h2>
      )}
      {children}
    </section>
  );
}

/** Expose an explicit audit allowlist, never whole API documents or credentials. Dates follow the viewer's saved timezone and format. */
export function RecordMetadata({ item, extra = [] }) {
  const members = useResource('/members');
  const date = (value) =>
    value && !Number.isNaN(+new Date(value)) ? <DateTime value={value} /> : null;
  const person = (label, id) =>
    label ||
    members.data?.members.find((member) => member.id === id)?.displayName ||
    members.data?.members.find((member) => member.id === id)?.email ||
    id ||
    'Not recorded';
  const fields = [
    ...(item.demoBatchId ? [['Dataset', 'Demo data — removed by Delete demo data']] : []),
    ...extra,
    [item.number ? 'Record Number' : 'Record ID', item.number || item.id],
    ['Created', date(item.createdAt) || 'Not recorded'],
    [
      'Created by',
      <ReferenceValue
        key="created-by"
        type={item.createdByType === 'service_account' ? 'serviceAccounts' : 'members'}
        id={item.createdById}
        label={person(item.createdBy, item.createdById)}
      />,
    ],
    ['Last updated', date(item.updatedAt) || 'Not recorded'],
    [
      'Updated by',
      <ReferenceValue
        key="updated-by"
        type={item.updatedByType === 'service_account' ? 'serviceAccounts' : 'members'}
        id={item.updatedById}
        label={person(item.updatedBy, item.updatedById)}
      />,
    ],
    ['Revision', item.revision],
    ['Source', item.source ? displayValue(item.source) : null],
    ['Resolved', date(item.resolvedAt)],
    ['Reopened', date(item.reopenedAt)],
    ['Last check', date(item.lastCheck?.checkedAt)],
    ['Last check started', date(item.lastStartedAt)],
    ['Next scheduled check', item.paused ? null : date(item.nextCheckAt)],
    ['HTTP Status', item.lastCheck?.statusCode],
    [
      'Response time',
      typeof item.lastCheck?.durationMs === 'number' ? `${item.lastCheck.durationMs} ms` : null,
    ],
  ];
  const seen = new Set();
  return (
    <RecordSection>
      <dl className="record-metadata text-sm">
        {fields
          .filter(([label, value]) => {
            if (seen.has(label) || value === undefined || value === null || value === '')
              return false;
            seen.add(label);
            return true;
          })
          .map(([label, value]) => (
            <div key={label}>
              <dt className="text-xs text-slate-500 dark:text-slate-400">{label}</dt>
              <dd className="mt-1 break-words [overflow-wrap:anywhere]">{value}</dd>
            </div>
          ))}
      </dl>
    </RecordSection>
  );
}

/** Visible edit action shared by record pages; callers enforce their existing role permissions. */
export function EditRecordButton({ onClick }) {
  return (
    <button
      type="button"
      className="btn-secondary"
      onClick={onClick}
      aria-label="Edit Record"
      title="Edit Record"
    >
      <PencilSquareIcon className="h-5 w-5" aria-hidden="true" />
      <span>Edit</span>
    </button>
  );
}
