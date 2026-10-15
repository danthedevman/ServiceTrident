import { Modal } from './modal.jsx';
import { RecordExportActions } from './record-export-actions.jsx';
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
import React, {
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import {
  PencilSquareIcon,
  AdjustmentsHorizontalIcon,
  InformationCircleIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';
import { useUiPreferences } from '../preferences/ui-preferences.jsx';
import { useResource } from '../data/use-resource.js';
import { displayValue } from '../lib/display-value.js';

const narrowInfoQuery = () => window.matchMedia('(max-width: 1199px)').matches;
const subscribeInfoViewport = (listener) => {
  const query = window.matchMedia('(max-width: 1199px)');
  query.addEventListener('change', listener);
  return () => query.removeEventListener('change', listener);
};

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
  identityExtra,
  exportPath,
  showToolbar = true,
  informationRequest = 0,
}) {
  useRecordTabLabel(item?.title || item?.name || item?.displayName);
  const { user } = useContext(AuthContext);
  const showFormBuilder =
    user?.role === 'admin' && ['incidents', 'tasks', 'knowledge', 'rcas'].includes(kind);
  const preferences = useUiPreferences();
  const { setPreference } = preferences;
  const { collapsed, handle } = useRecordSidebarResize(preferences);
  const narrowInfo = useSyncExternalStore(subscribeInfoViewport, narrowInfoQuery, () => false);
  const [mobileInfoOpen, setMobileInfoOpen] = useState(false);
  const infoExpanded = narrowInfo ? mobileInfoOpen : !collapsed;
  const infoTrigger = useRef(null),
    seenInformationRequest = useRef(informationRequest);
  useEffect(() => {
    // A field-selection request opens details; resizing alone must not open an overlay.
    if (seenInformationRequest.current === informationRequest) return;
    seenInformationRequest.current = informationRequest;
    if (narrowInfo) setMobileInfoOpen(true);
  }, [informationRequest, narrowInfo]);
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
  return (
    <div className="record-container">
      <div className="record-workspace">
        <div className="record-body min-w-0 space-y-2">
          {(showToolbar || (item?.id && kind) || sidebar) && (
            <RecordHeader>
              <div className="record-toolbar flex flex-wrap items-center justify-end gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  {(showFormBuilder || secondaryActions || (item?.id && kind)) && (
                    <ActionMenu label="Record actions">
                      {secondaryActions}
                      <RecordExportActions kind={kind} item={item} path={exportPath} />
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
                  <button
                    type="button"
                    ref={infoTrigger}
                    className={`record-info-toggle shrink-0 ${infoExpanded ? 'record-info-active' : ''}`}
                    aria-expanded={infoExpanded}
                    aria-controls={id}
                    aria-label={
                      infoExpanded ? 'Collapse record information' : 'Expand record information'
                    }
                    title={
                      infoExpanded ? 'Collapse record information' : 'Expand record information'
                    }
                    onClick={() =>
                      narrowInfo
                        ? setMobileInfoOpen(!mobileInfoOpen)
                        : setPreference('rightCollapsed', !collapsed)
                    }
                  >
                    <InformationCircleIcon className="h-5 w-5" aria-hidden="true" />
                  </button>
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
                {identityExtra}
              </div>
            )}
            <RelatedCountsContext.Provider value={item?.id ? { kind, id: item.id } : null}>
              {children}
            </RelatedCountsContext.Provider>
          </RecordActionContext.Provider>
        </div>
        {!narrowInfo && (
          <aside aria-label={label} data-collapsed={collapsed} className="record-sidebar min-w-0">
            <div
              {...handle}
              className="record-sidebar-resizer"
              aria-controls={id}
              title="Drag to resize; Arrow keys resize, Home collapses, End expands to maximum"
            />
            {!collapsed && (
              <div className="record-sidebar-header">
                <h2 className="min-w-0 flex-1 truncate text-sm font-semibold">{label}</h2>
                <button
                  type="button"
                  className="task-icon-action shrink-0"
                  aria-label={`Close ${label.toLowerCase()}`}
                  title={`Close ${label.toLowerCase()}`}
                  onClick={() => {
                    setPreference('rightCollapsed', true);
                    infoTrigger.current?.focus();
                  }}
                >
                  <XMarkIcon className="h-5 w-5" aria-hidden="true" />
                </button>
              </div>
            )}
            <div id={id} hidden={collapsed} className="record-sidebar-content space-y-5">
              {sidebar}
            </div>
          </aside>
        )}
        {narrowInfo && mobileInfoOpen && active && (
          <Modal
            title={label}
            className="record-info-modal"
            onClose={() => setMobileInfoOpen(false)}
          >
            <div id={id} className="space-y-5">
              {sidebar}
            </div>
          </Modal>
        )}
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
