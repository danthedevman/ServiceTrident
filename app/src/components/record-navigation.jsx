import { useFirstFormFieldFocus } from './forms/autofocus.js';
import React, {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  Link,
  useLocation,
  useNavigate,
  useOutlet,
  UNSAFE_LocationContext,
} from 'react-router-dom';
import {
  XMarkIcon,
  DocumentTextIcon,
  ExclamationTriangleIcon,
  ClipboardDocumentCheckIcon,
  ServerStackIcon,
  SignalIcon,
  BoltIcon,
  BellAlertIcon,
  BookOpenIcon,
  FolderOpenIcon,
  CalendarDaysIcon,
  UserCircleIcon,
  UserGroupIcon,
  KeyIcon,
  ShieldCheckIcon,
  ClockIcon,
  ChatBubbleLeftRightIcon,
  PaperAirplaneIcon,
  CodeBracketIcon,
  EnvelopeIcon,
  PaperClipIcon,
  InboxArrowDownIcon,
  Square3Stack3DIcon,
  UsersIcon,
  PuzzlePieceIcon,
} from '@heroicons/react/24/outline';
import { ActivePanelContext } from './record-tabs.jsx';
import { RecordHeaderContext } from './record-actions.jsx';
import { Modal } from './modal.jsx';

export const RECORD_TAB_LIMIT = 20;
const RecordNavigationContext = createContext(null);
const names = {
  incidents: 'Incident',
  tasks: 'Task',
  rcas: 'RCA',
  knowledge: 'Knowledge',
  services: 'Service',
  collections: 'Collection',
  monitors: 'Monitor',
  events: 'Event',
  alerts: 'Alert',
  groups: 'Group',
  integrations: 'Integration',
  workspace: 'User',
  'on-call': 'Coverage',
  records: 'Record',
};

export function recordTabKey(location) {
  const path = location.pathname;
  if (/^\/(events|alerts)\/[a-f\d]{24}\/?$/i.test(path)) return path;
  if (/^\/records\/[^/]+\/[^/]+\/?$/.test(path)) return path + location.search;
  if (/^\/settings\/service-accounts\/[a-f\d]{24}\/?$/i.test(path)) return path;
  if (/^\/monitors\/[a-f\d]{24}\/events\/[a-f\d]{24}\/?$/i.test(path)) return path;
  if (/^\/knowledge\/bases\/(?:[a-f\d]{24}|new)\/?$/i.test(path)) return path;
  if (
    /^\/(incidents|tasks|rcas|knowledge|services|collections|monitors|groups|integrations|workspace|on-call)\/(?:[a-f\d]{24}|new)(?:\/(?:edit|password))?\/?$/i.test(
      path,
    )
  )
    return (
      path.replace(/\/(edit|password)\/?$/, '') + (path.includes('/new') ? location.search : '')
    );
  return null;
}
function fallbackLabel(location) {
  if (location.pathname.includes('/events/')) return 'Event';
  if (location.pathname.startsWith('/settings/service-accounts/')) return 'Service Account';
  const parts = location.pathname.split('/').filter(Boolean);
  return `${parts.at(-1) === 'new' ? 'New ' : ''}${recordTypeLabel(location.pathname)}`;
}

const storageKey = 'servicetrident-record-tabs';
export function clearRecordTabs() {
  try {
    sessionStorage.removeItem(storageKey);
  } catch {
    /* Storage may be unavailable. */
  }
}
function restoreTabs(owner) {
  try {
    const saved = JSON.parse(sessionStorage.getItem(storageKey));
    if (saved?.owner !== owner || !Array.isArray(saved.tabs)) return [];
    const unique = new Map();
    for (const stored of saved.tabs.slice(0, RECORD_TAB_LIMIT)) {
      const to = typeof stored === 'string' ? stored : stored?.to;
      if (typeof to !== 'string' || to.length > 1024 || !to.startsWith('/') || to.startsWith('//'))
        continue;
      const url = new URL(to, window.location.origin),
        key = recordTabKey(url);
      if (key)
        unique.set(key, {
          key,
          to: url.pathname + url.search,
          label:
            typeof stored?.label === 'string' ? stored.label.slice(0, 512) : fallbackLabel(url),
          relatedTo: typeof stored?.relatedTo === 'string' ? stored.relatedTo.slice(0, 100) : '',
          dirty: false,
        });
    }
    return [...unique.values()];
  } catch {
    return [];
  }
}
/** Persist bounded navigation links only; record data and unsaved drafts stay in memory. */
export function RecordNavigationProvider({ children, owner }) {
  const location = useLocation(),
    navigate = useNavigate();
  const key = recordTabKey(location);
  const [tabs, setTabs] = useState(() => {
    const restored = restoreTabs(owner);
    if (key && !restored.some((tab) => tab.key === key)) {
      if (restored.length === RECORD_TAB_LIMIT) restored.shift();
      restored.push({
        key,
        to: location.pathname + location.search,
        label: fallbackLabel(location),
        dirty: false,
      });
    }
    return restored;
  });
  useEffect(() => {
    if (!owner) return;
    try {
      sessionStorage.setItem(
        storageKey,
        JSON.stringify({
          owner,
          tabs: tabs.map(({ to, label, relatedTo }) => ({ to, label, relatedTo })),
        }),
      );
    } catch {
      /* Navigation remains usable when browser storage is unavailable. */
    }
  }, [owner, tabs]);
  const [notice, setNotice] = useState(''),
    [closing, setClosing] = useState(null);
  const previous = useRef(location);
  const current = useRef(tabs);
  current.current = tabs;
  const update = useCallback((fn) => {
    const next = fn(current.current);
    current.current = next;
    setTabs(next);
  }, []);
  useLayoutEffect(() => {
    const prior = previous.current;
    const sourceTab = current.current.find((tab) => tab.key === recordTabKey(prior));
    previous.current = location;
    if (!key) return;
    if (location.state?.createdRecord && /\/new\/?$/.test(prior.pathname)) {
      const oldKey = recordTabKey(prior);
      if (oldKey && oldKey !== key) update((list) => list.filter((tab) => tab.key !== oldKey));
    }
    const found = current.current.find((tab) => tab.key === key),
      to = location.pathname + location.search;
    if (found) {
      if (found.to !== to)
        update((list) => list.map((tab) => (tab.key === key ? { ...tab, to } : tab)));
      return;
    }
    if (current.current.length >= RECORD_TAB_LIMIT) {
      const fresh = { key, to, label: fallbackLabel(location), dirty: false };
      const oldest = current.current[0];
      if (oldest.dirty) {
        setClosing({ replace: fresh, oldestKey: oldest.key });
        navigate(prior.pathname + prior.search, { replace: true });
      } else update((list) => [...list.slice(1), fresh]);
      return;
    }
    update((list) => [
      ...list,
      {
        key,
        to,
        label: fallbackLabel(location),
        relatedTo: location.state?.createdRecord
          ? sourceTab?.relatedTo || ''
          : sourceTab?.label || '',
        dirty: false,
      },
    ]);
  }, [key, location.pathname, location.search, navigate, update]);
  const openRecord = useCallback(
    (to, label) => {
      const url = new URL(to, window.location.origin);
      if (url.origin !== window.location.origin) return;
      const nextKey = recordTabKey(url);
      if (!nextKey) {
        navigate(url.pathname + url.search);
        return;
      }
      const found = current.current.find((tab) => tab.key === nextKey);
      if (!found && current.current.length >= RECORD_TAB_LIMIT) {
        const fresh = {
          key: nextKey,
          to: url.pathname + url.search,
          label: label || fallbackLabel(url),
          dirty: false,
        };
        const oldest = current.current[0];
        if (oldest.dirty) setClosing({ replace: fresh, oldestKey: oldest.key });
        else {
          update((list) => [...list.slice(1), fresh]);
          setNotice('');
          navigate(fresh.to);
        }
        return;
      }
      if (!found)
        update((list) => [
          ...list,
          {
            key: nextKey,
            to: url.pathname + url.search,
            label: label || fallbackLabel(url),
            relatedTo: current.current.find((tab) => tab.key === key)?.label || '',
            dirty: false,
          },
        ]);
      setNotice('');
      navigate(found?.to || url.pathname + url.search);
    },
    [navigate, update, key],
  );
  const rename = useCallback(
    (tabKey, label) => {
      const boundedLabel = String(label || '')
        .trim()
        .slice(0, 512);
      if (
        !boundedLabel ||
        !current.current.some((tab) => tab.key === tabKey && tab.label !== boundedLabel)
      )
        return;
      update((list) =>
        list.map((tab) => (tab.key === tabKey ? { ...tab, label: boundedLabel } : tab)),
      );
    },
    [update],
  );
  const markEdited = useCallback(
    (tabKey) => {
      if (!current.current.some((tab) => tab.key === tabKey && !tab.dirty)) return;
      update((list) => list.map((tab) => (tab.key === tabKey ? { ...tab, dirty: true } : tab)));
    },
    [update],
  );
  function closeAll() {
    update((list) => list.filter((tab) => tab.key === key));
    setClosing(null);
    setNotice('');
  }
  function requestCloseAll() {
    if (current.current.some((tab) => tab.key !== key && tab.dirty)) setClosing({ all: true });
    else closeAll();
  }
  function close(tab) {
    const next = current.current.filter((item) => item.key !== tab.key);
    update(() => next);
    setClosing(null);
    setNotice('');
    if (key === tab.key) navigate(next.at(-1)?.to || '/');
  }
  return (
    <RecordNavigationContext.Provider
      value={{
        tabs,
        requestCloseAll,
        key,
        openRecord,
        rename,
        markEdited,
        notice,
        dismissNotice: () => setNotice(''),
        requestClose: (tab) => (tab.dirty ? setClosing(tab) : close(tab)),
      }}
    >
      {children}
      {closing && (
        <Modal
          title={
            closing.replace
              ? 'Replace Oldest Record Tab?'
              : closing.reset
                ? 'Refresh Record Tabs?'
                : closing.all
                  ? 'Close All Record Tabs?'
                  : 'Close Record Tab?'
          }
          onClose={() => setClosing(null)}
          footer={
            <>
              <button className="btn-secondary" onClick={() => setClosing(null)}>
                Cancel
              </button>
              <button
                className="btn-danger"
                onClick={() => {
                  if (closing.replace) {
                    update((list) => [
                      ...list.filter((tab) => tab.key !== closing.oldestKey),
                      closing.replace,
                    ]);
                    navigate(closing.replace.to);
                    setClosing(null);
                  } else if (closing.reset) {
                    update(() => [closing.reset]);
                    setNotice('');
                    navigate(closing.reset.to);
                    setClosing(null);
                  } else if (closing.all) closeAll();
                  else close(closing);
                }}
              >
                {closing.replace
                  ? 'Replace Tab and Open Record'
                  : closing.reset
                    ? 'Refresh Tabs and Open Record'
                    : closing.all
                      ? 'Close All Tabs'
                      : 'Close Tab'}
              </button>
            </>
          }
        >
          <p>
            {closing.replace
              ? 'The oldest tab has unsaved changes. Replace it and discard those changes to open this record?'
              : closing.reset
                ? 'Opening this record will refresh your full tab set. Any unsaved changes in edited tabs will be lost. Cancel to keep them.'
                : closing.all
                  ? 'The current record stays open. Unsaved changes in the other edited tabs will be lost.'
                  : 'This tab has been edited. Any unsaved changes will be lost when you close it.'}
          </p>
        </Modal>
      )}
    </RecordNavigationContext.Provider>
  );
}

export function RecordLink({ to, children, onClick, recordLabel, ...props }) {
  const navigation = useContext(RecordNavigationContext);
  return (
    <Link
      {...props}
      to={to}
      onClick={(event) => {
        onClick?.(event);
        if (!event.defaultPrevented && navigation) {
          event.preventDefault();
          navigation.openRecord(
            to,
            recordLabel || (typeof children === 'string' ? children : undefined),
          );
        }
      }}
    >
      {children}
    </Link>
  );
}

/** Mark action-driven form changes that do not emit an input change event. */
export function useRecordEditMarker() {
  const navigation = useContext(RecordNavigationContext);
  const location = useLocation();
  return () => {
    const key = recordTabKey(location);
    if (key) navigation?.markEdited(key);
  };
}

export function useRecordTabLabel(label) {
  const navigation = useContext(RecordNavigationContext),
    location = useLocation();
  const key = recordTabKey(location),
    rename = navigation?.rename;
  // A loaded record can mount before its navigation entry is registered. Retry on registration.
  const registered = navigation?.tabs.some((tab) => tab.key === key);
  useLayoutEffect(() => {
    if (key && rename && label) rename(key, label);
  }, [key, rename, label, registered]);
}

/** Cache routed elements with their original location/params; inactive records keep drafts but contribute no header portals. */
export function RecordTabOutlet({ header, className, recordLayout, enabled }) {
  const outlet = useOutlet(),
    location = useLocation(),
    navigation = useContext(RecordNavigationContext);
  const cache = useRef(new Map());
  const key = recordTabKey(location),
    to = location.pathname + location.search;
  const tabKeys = new Set(navigation?.tabs.map((tab) => tab.key));
  for (const savedKey of cache.current.keys())
    if (!tabKeys.has(savedKey) && savedKey !== key) cache.current.delete(savedKey);
  if (key && enabled && (tabKeys.has(key) || cache.current.size < RECORD_TAB_LIMIT)) {
    const old = cache.current.get(key);
    if (!old || old.to !== to)
      cache.current.set(key, {
        to,
        location,
        outlet,
        className,
        recordLayout,
        focusFirst: location.pathname.endsWith('/new') || !!location.state?.createdRecord,
      });
  }
  if (!enabled) cache.current.clear();
  return (
    <>
      {[...cache.current].map(([savedKey, saved]) => (
        <RecordPane
          key={savedKey}
          focusFirst={saved.focusFirst}
          route={saved.to}
          active={savedKey === key}
          id={panelId(savedKey)}
          role="tabpanel"
          aria-label={navigation?.tabs.find((tab) => tab.key === savedKey)?.label}
          hidden={savedKey !== key}
          inert={savedKey !== key}
          className={saved.className}
          tabIndex={saved.recordLayout ? 0 : undefined}
          onInput={(event) => {
            if (event.target.isContentEditable) navigation?.markEdited(savedKey);
          }}
          onChange={(event) => {
            // Update dirty state after the field's handler has read its new value.
            if (event.target.form) navigation?.markEdited(savedKey);
          }}
        >
          <UNSAFE_LocationContext.Provider
            value={{ location: saved.location, navigationType: 'POP' }}
          >
            <ActivePanelContext.Provider value={savedKey === key}>
              <RecordHeaderContext.Provider value={savedKey === key ? header : null}>
                {saved.outlet}
              </RecordHeaderContext.Provider>
            </ActivePanelContext.Provider>
          </UNSAFE_LocationContext.Provider>
        </RecordPane>
      ))}
      {!key && (
        <div
          className={className}
          tabIndex={recordLayout ? 0 : undefined}
          role={recordLayout ? 'region' : undefined}
          aria-label={recordLayout ? 'Record content' : undefined}
        >
          <RecordHeaderContext.Provider value={header}>
            {enabled ? outlet : null}
          </RecordHeaderContext.Provider>
        </div>
      )}
    </>
  );
}

export function RecordNavigationBar({ onHeightChange }) {
  const { tabs, key, notice, dismissNotice, requestClose, requestCloseAll } =
    useContext(RecordNavigationContext);
  const navigate = useNavigate();
  const bar = useRef(null);
  useLayoutEffect(() => {
    const element = bar.current;
    const measure = () => onHeightChange?.(element?.getBoundingClientRect().height || 0);
    measure();
    if (!element) return;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [key, tabs.length, onHeightChange]);
  useLayoutEffect(() => {
    const strip = bar.current?.querySelector('.record-navigation-scroll');
    if (!strip) return;
    const reveal = () => {
      const tab = strip.querySelector('[data-active="true"]');
      if (!tab) return;
      const bounds = strip.getBoundingClientRect();
      const target = tab.getBoundingClientRect();
      const offset =
        target.left < bounds.left
          ? target.left - bounds.left
          : target.right > bounds.right
            ? target.right - bounds.right
            : 0;
      if (offset) strip.scrollTo({ left: strip.scrollLeft + offset, behavior: 'instant' });
    };
    reveal();
    const observer = new ResizeObserver(reveal);
    observer.observe(strip);
    const tab = strip.querySelector('[data-active="true"]');
    if (tab) observer.observe(tab);
    return () => observer.disconnect();
  }, [key, tabs]);
  return (
    <>
      {key && tabs.length > 1 && (
        <nav ref={bar} className="record-navigation-bar" aria-label="Open record tabs">
          <div role="tablist" aria-label="Record tabs" className="record-navigation-scroll">
            {tabs.map((tab) => (
              <div className="record-navigation-tab" key={tab.key} data-active={tab.key === key}>
                <button
                  type="button"
                  role="tab"
                  aria-selected={tab.key === key}
                  aria-controls={panelId(tab.key)}
                  tabIndex={tab.key === key || !key ? 0 : -1}
                  title={`${recordTypeLabel(tab.to)}: ${tab.label}`}
                  onClick={() => navigate(tab.to)}
                  onKeyDown={(event) => {
                    let index = tabs.indexOf(tab);
                    if (event.key === 'ArrowRight') index = (index + 1) % tabs.length;
                    else if (event.key === 'ArrowLeft')
                      index = (index + tabs.length - 1) % tabs.length;
                    else if (event.key === 'Home') index = 0;
                    else if (event.key === 'End') index = tabs.length - 1;
                    else return;
                    event.preventDefault();
                    navigate(tabs[index].to);
                    const tabButtons = event.currentTarget
                      .closest('[role="tablist"]')
                      .querySelectorAll('[role="tab"]');
                    tabButtons[index]?.focus();
                  }}
                >
                  <TabIcon to={tab.to} />
                  <span className="record-navigation-label">
                    <span>
                      {tab.label}
                      {tab.dirty && <span aria-label="Edited tab"> •</span>}
                    </span>
                    <span className="record-navigation-context">{recordTypeLabel(tab.to)}</span>
                  </span>
                </button>
                <button
                  type="button"
                  aria-label={`Close ${tab.label} tab`}
                  title="Close Tab"
                  onClick={() => requestClose(tab)}
                >
                  <XMarkIcon className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            ))}
          </div>
          <span className="shrink-0 text-xs text-slate-500">
            {tabs.length}/{RECORD_TAB_LIMIT}
          </span>
          <button
            type="button"
            className="record-navigation-close-all"
            onClick={requestCloseAll}
            title="Close All Tabs"
          >
            <XMarkIcon className="h-4 w-4" aria-hidden="true" />
            <span>Close All Tabs</span>
          </button>
        </nav>
      )}
      {notice && (
        <div className="flex items-center justify-between gap-3 px-4 py-2 text-sm" role="status">
          <p>{notice}</p>
          <button type="button" className="btn-secondary shrink-0" onClick={requestCloseAll}>
            Close All Tabs
          </button>
          <button type="button" onClick={dismissNotice} aria-label="Dismiss record tab notice">
            <XMarkIcon className="h-4 w-4" />
          </button>
        </div>
      )}
    </>
  );
}

function RecordPane({ focusFirst, route, active, children, ...props }) {
  const root = useRef(null);
  useLayoutEffect(() => {
    if (!active) return;
    root.current?.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  }, [active, route]);
  useFirstFormFieldFocus(root, focusFirst, active, route);
  return (
    <div {...props} ref={root}>
      {children}
    </div>
  );
}

function TabIcon({ to }) {
  const icons = {
    Incident: ExclamationTriangleIcon,
    Event: BoltIcon,
    Task: ClipboardDocumentCheckIcon,
    RCA: DocumentTextIcon,
    Service: ServerStackIcon,
    Collection: Square3Stack3DIcon,
    Monitor: SignalIcon,
    Alert: BellAlertIcon,
    Group: UserGroupIcon,
    Integration: PuzzlePieceIcon,
    User: UserCircleIcon,
    Coverage: CalendarDaysIcon,
    Knowledge: BookOpenIcon,
    'Knowledge Base': FolderOpenIcon,
    'Service Account': KeyIcon,
    'Audit Log': ShieldCheckIcon,
    Activity: ClockIcon,
    Discussion: ChatBubbleLeftRightIcon,
    'Delivery Log': PaperAirplaneIcon,
    'Response Header': CodeBracketIcon,
    Invitation: EnvelopeIcon,
    Attachment: PaperClipIcon,
    'Hosting Inquiry': InboxArrowDownIcon,
    Member: UsersIcon,
  };
  const Icon = icons[recordTypeLabel(to)] || DocumentTextIcon;
  return <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />;
}

function recordTypeLabel(to) {
  const parts = to.split('/');
  if (parts[1] === 'monitors' && parts[3] === 'events') return 'Event';
  if (parts[1] === 'records')
    return (
      {
        audit: 'Audit Entry',
        activity: 'Activity',
        comments: 'Discussion',
        deliveries: 'Delivery Log',
        headers: 'Response Header',
        invitations: 'Invitation',
        attachments: 'Attachment',
        inquiries: 'Hosting Inquiry',
      }[parts[2]] || 'Record'
    );
  if (parts[1] === 'knowledge' && parts[2] === 'bases') return 'Knowledge Base';
  if (parts[1] === 'settings' && parts[2] === 'service-accounts') return 'Service Account';
  return names[parts[1]] || 'Record';
}

const panelId = (key) => `record-panel-${encodeURIComponent(key)}`;
