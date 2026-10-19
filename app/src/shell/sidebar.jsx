import { navigationActive } from '../lib/navigation-active.js';
import { useUiPreferences } from '../preferences/ui-preferences.jsx';
import { createPortal } from 'react-dom';
import { ActionMenu } from '../components/action-menu.jsx';
import { Tooltip } from '../components/tooltip.jsx';
import { Modal } from '../components/modal.jsx';
import { RolePreview } from '../auth/role-preview.jsx';
import { GlobalSearch } from '../features/search/global-search.jsx';
import { prefetchRoute } from '../data/query-client.js';
import {
  Cog6ToothIcon,
  MapPinIcon,
  QuestionMarkCircleIcon,
  MagnifyingGlassIcon,
  ClipboardDocumentListIcon,
  DocumentMagnifyingGlassIcon,
  BookOpenIcon,
  UserGroupIcon,
  PlusIcon,
  ExclamationTriangleIcon,
  CalendarDaysIcon,
  Squares2X2Icon,
  SignalIcon,
  BellAlertIcon,
  CpuChipIcon,
  ServerStackIcon,
  FolderIcon,
  ChartBarSquareIcon,
  ChevronUpIcon,
  ChevronDownIcon,
  AdjustmentsHorizontalIcon,
  ArrowsRightLeftIcon,
  ArrowTrendingUpIcon,
  WrenchScrewdriverIcon,
  GlobeAltIcon,
  PuzzlePieceIcon,
  XMarkIcon,
  UserCircleIcon,
  ArrowRightStartOnRectangleIcon,
} from '@heroicons/react/24/outline';
import React, { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ThemeToggle } from '../preferences/theme.jsx';

/** A sidebar pane beside the main canvas, matching the drawer action. */
function DrawerIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" {...props}>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M9 4v16M5.5 8h1M5.5 11h1" strokeLinecap="round" />
    </svg>
  );
}

// One hierarchy drives expanded, compact and mobile navigation.
const navigationGroups = [
  {
    links: [
      ['/', 'Dashboard', Squares2X2Icon],
      ['/incidents', 'Incidents', ExclamationTriangleIcon],
      ['/services', 'Services', ServerStackIcon],
      ['/tasks', 'Tasks', ClipboardDocumentListIcon],
      ['/pinned', 'Pinned', MapPinIcon],
    ],
  },
  {
    id: 'monitor',
    label: 'Monitor & Respond',
    preference: 'navMonitorOpen',
    links: [
      ['/alerts', 'Alerts', BellAlertIcon],
      ['/events', 'Events', SignalIcon],
      ['/monitors', 'Monitors', CpuChipIcon],
      ['/on-call', 'On Call', CalendarDaysIcon],
    ],
  },
  {
    id: 'knowledge',
    label: 'Knowledge & Reports',
    preference: 'navKnowledgeOpen',
    links: [
      ['/knowledge', 'Knowledge', BookOpenIcon],
      ['/rcas', 'RCAs', DocumentMagnifyingGlassIcon],
      ['/operational-reporting', 'Operational Reporting', ChartBarSquareIcon],
      ['/status', 'Status Page', ChartBarSquareIcon],
    ],
  },
  {
    id: 'automation',
    label: 'Automation & Connections',
    preference: 'navAutomationOpen',
    links: [
      ['/event-rules', 'Event Rules', ArrowsRightLeftIcon],
      ['/escalation-policies', 'Escalation Policies', ArrowTrendingUpIcon],
      ['/maintenance-windows', 'Maintenance Windows', WrenchScrewdriverIcon],
      ['/alert-grouping', 'Alert Grouping', AdjustmentsHorizontalIcon],
      ['/integrations', 'Integrations', PuzzlePieceIcon],
      ['/probe-agents', 'Probe Agents', GlobeAltIcon],
    ],
  },
];

/** Bottom-anchored disclosure with ordinary keyboard-accessible links and buttons. */
function ProfileMenu({ user, compact, logout, busy, onNavigate, dropdown = false }) {
  const ref = useRef(null);
  useEffect(() => {
    const close = (event) => {
      if (!ref.current?.contains(event.target)) ref.current?.removeAttribute('open');
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, []);
  if (!user)
    return (
      <div role="status" aria-label="Loading profile" className="flex items-center gap-3 p-2">
        <UserCircleIcon className="h-10 w-10 shrink-0 text-slate-400" aria-hidden="true" />
        {!compact && <span className="sr-only">Loading profile…</span>}
      </div>
    );
  return (
    <details
      ref={ref}
      className="relative"
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.stopPropagation();
          ref.current.open = false;
          ref.current.querySelector('summary').focus();
        }
      }}
    >
      <Tooltip label={compact && !dropdown ? 'Profile and appearance settings' : null}>
        <summary
          className={`profile-trigger flex cursor-pointer list-none items-center gap-3 rounded-xl p-2 hover:bg-slate-100 dark:hover:bg-slate-800 [&::-webkit-details-marker]:hidden ${compact ? 'mx-auto h-9 w-9 justify-center !gap-0 !p-0' : ''}`}
          aria-label="Profile and appearance settings"
          title={compact ? 'Profile and appearance settings' : undefined}
        >
          <span className="profile-avatar grid h-8 w-8 shrink-0 place-items-center rounded-full bg-blue-100 font-semibold text-blue-800 dark:bg-blue-950 dark:text-blue-300">
            {(user.displayName || user.email).slice(0, 1).toUpperCase()}
          </span>
          {!compact && (
            <>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">
                  {user.displayName || 'Your account'}
                </span>
                <span className="block truncate text-xs text-slate-500 dark:text-slate-400">
                  {user.email}
                </span>
              </span>
              <ChevronUpIcon className="h-4 w-4 shrink-0" aria-hidden="true" />
            </>
          )}
        </summary>
      </Tooltip>
      <div
        className={`panel profile-dropup absolute z-50 w-60 max-w-[calc(100vw-2rem)] space-y-0 p-1 shadow-xl ${dropdown ? 'right-0 top-full mt-2 max-h-[calc(100dvh-6rem)] overflow-y-auto' : 'bottom-full left-0 mb-3'}`}
      >
        <Link
          to="/profile"
          className="profile-menu-item"
          onClick={() => {
            ref.current.open = false;
            onNavigate();
          }}
        >
          <UserCircleIcon className="h-5 w-5 shrink-0" aria-hidden="true" />
          Profile
        </Link>
        {user.role !== 'user' && (
          <Link
            to="/settings"
            className="profile-menu-item"
            onClick={() => {
              ref.current.open = false;
              onNavigate();
            }}
          >
            <Cog6ToothIcon className="h-5 w-5 shrink-0" aria-hidden="true" />
            Settings
          </Link>
        )}
        <Link
          to="/help"
          className="profile-menu-item"
          onClick={() => {
            ref.current.open = false;
            onNavigate();
          }}
        >
          <QuestionMarkCircleIcon className="h-5 w-5 shrink-0" aria-hidden="true" />
          Help
        </Link>
        <ThemeToggle menu />
        <RolePreview />
        <button type="button" className="profile-menu-item" disabled={busy} onClick={logout}>
          <ArrowRightStartOnRectangleIcon className="h-5 w-5 shrink-0" aria-hidden="true" />
          {busy ? 'Signing out…' : 'Sign out'}
        </button>
      </div>
    </details>
  );
}

/** Persistent desktop rail and a native mobile dialog with focus trapping and Escape support. */
export function Sidebar({
  user,
  logout,
  busy,
  collapsed,
  setCollapsed,
  renderBrand,
  toolbarTarget,
  mobileActions,
}) {
  const preferences = useUiPreferences();
  const dialog = useRef(null);
  const compact = collapsed;
  const toggle = () => setCollapsed(!collapsed);
  const [createOpen, setCreateOpen] = useState(false);
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [searchOpen, setSearchOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const close = () => {
    dialog.current?.close();
    setMobileOpen(false);
  };
  useEffect(() => {
    dialog.current?.close();
    setMobileOpen(false);
    setCreateOpen(false);
    setSearchOpen(false);
  }, [pathname, user?.role]);
  useEffect(() => {
    const media = window.matchMedia('(min-width: 768px)');
    const resize = () => {
      if (media.matches) {
        dialog.current?.close();
        setMobileOpen(false);
      }
    };
    media.addEventListener('change', resize);
    return () => media.removeEventListener('change', resize);
  }, []);
  useEffect(() => {
    if (!mobileOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [mobileOpen]);
  const openCreate = () => {
    close();
    if (
      pathname.replace(/\/$/, '') === '/knowledge/articles' &&
      ['admin', 'responder'].includes(user?.role)
    ) {
      navigate('/knowledge/new');
      return;
    }
    setCreateOpen(true);
  };
  const groups = navigationGroups
    .map((group) => ({
      ...group,
      links: user
        ? group.links.filter(([to]) =>
            group.id === 'automation'
              ? user.role === 'admin'
              : user.role !== 'user' || ['/incidents', '/pinned'].includes(to),
          )
        : [],
    }))
    .filter((group) => group.links.length);
  useEffect(() => {
    if (!preferences.ready) return;
    const active = groups.find(
      (group) => group.id && group.links.some(([to]) => navigationActive(to, pathname)),
    );
    if (active && !preferences[active.preference])
      preferences.setPreference(active.preference, true);
    // Expand when entering a route, while allowing an explicit collapse on the current page.
  }, [pathname, user?.role, preferences.ready]);
  const renderLink = ([to, label, Icon], compact) => (
    <Tooltip key={to} label={compact ? label : null}>
      <Link
        to={to}
        onMouseEnter={() => prefetchRoute(to, user)}
        onFocus={() => prefetchRoute(to, user)}
        aria-current={navigationActive(to, pathname) ? 'page' : undefined}
        onClick={close}
        title={compact ? label : undefined}
        className={`nav-link sidenav-link ${navigationActive(to, pathname) ? 'active' : ''} ${compact ? '' : 'sidenav-link-expanded'} flex items-center gap-3 ${compact ? 'mx-auto h-9 w-9 justify-center !gap-0 !p-0' : ''}`}
      >
        <span className="sidenav-link-icon" aria-hidden="true">
          <Icon className="h-5 w-5" />
        </span>
        <span className={compact ? 'sr-only' : ''}>
          {user?.role === 'user' && to === '/incidents' ? 'My incidents' : label}
        </span>
      </Link>
    </Tooltip>
  );
  const content = (compact, mobile = false) => (
    <>
      <div
        className={`sidebar-brand-row flex h-12 shrink-0 items-center gap-2 ${compact ? 'justify-center px-3' : 'justify-between pl-5 pr-0'}`}
      >
        {compact ? (
          <div className="group relative grid h-10 w-10 shrink-0 place-items-center">
            <span className="flex items-center justify-center group-hover:opacity-0 group-focus-within:opacity-0">
              {renderBrand(true)}
            </span>
            <Tooltip label={compact ? 'Expand Navigation' : null}>
              <button
                type="button"
                className="absolute inset-0 grid place-items-center rounded-lg bg-white opacity-0 hover:bg-slate-100 focus:opacity-100 group-hover:opacity-100 group-focus-within:opacity-100 dark:bg-slate-900 dark:hover:bg-slate-800"
                aria-label="Expand Navigation"
                title="Expand Navigation"
                onClick={() => setCollapsed(false)}
              >
                <DrawerIcon className="h-5 w-5" aria-hidden="true" />
              </button>
            </Tooltip>
          </div>
        ) : (
          <Link
            className="flex items-center"
            to="/"
            onClick={close}
            aria-label="ServiceTrident dashboard"
          >
            {renderBrand(false)}
          </Link>
        )}
        {!compact && (
          <div className="flex shrink-0 items-center justify-center">
            <button
              type="button"
              className="sidenav-toggle grid h-9 w-9 place-items-center"
              onClick={mobile ? close : toggle}
              aria-label={
                mobile
                  ? 'Close navigation'
                  : collapsed
                    ? 'Expand Navigation'
                    : 'Collapse navigation'
              }
              title={
                mobile
                  ? 'Close navigation'
                  : collapsed
                    ? 'Expand Navigation'
                    : 'Collapse navigation'
              }
            >
              <span className="sidenav-toggle-icon">
                {mobile ? (
                  <XMarkIcon className="h-5 w-5" aria-hidden="true" />
                ) : compact ? (
                  <DrawerIcon className="h-5 w-5" aria-hidden="true" />
                ) : (
                  <DrawerIcon className="h-5 w-5" aria-hidden="true" />
                )}
              </span>
            </button>
          </div>
        )}
      </div>
      <nav
        aria-label="Main navigation"
        className={`min-h-0 flex-1 space-y-1 ${compact ? 'px-2 pb-2' : 'px-3 pb-3'} pt-0 overflow-y-auto overflow-x-hidden`}
      >
        {groups.find((group) => !group.id)?.links.map((link) => renderLink(link, compact))}
        {!(compact || mobile) &&
          groups
            .filter((group) => group.id)
            .map((group) => (
              <section key={group.id} className="pt-3" aria-label={group.label}>
                <button
                  type="button"
                  className="sidenav-group-heading flex w-full min-w-0 items-center justify-between gap-2 rounded px-2 py-2 text-left text-xs font-semibold text-blue-700 hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500 dark:text-blue-300 dark:hover:bg-slate-800"
                  aria-expanded={preferences[group.preference]}
                  aria-controls={`sidenav-${group.id}`}
                  title={group.label}
                  onClick={() =>
                    preferences.setPreference(group.preference, !preferences[group.preference])
                  }
                >
                  <span className="min-w-0 truncate whitespace-nowrap">{group.label}</span>
                  <ChevronDownIcon
                    className={`h-3.5 w-3.5 shrink-0 ${preferences[group.preference] ? '' : '-rotate-90'}`}
                    aria-hidden="true"
                  />
                </button>
                {preferences[group.preference] && (
                  <div id={`sidenav-${group.id}`} className="space-y-1">
                    {group.links.map((link) => renderLink(link, false))}
                  </div>
                )}
              </section>
            ))}
        {(compact || mobile) && groups.some((group) => group.id) && (
          <div className={compact ? 'flex justify-center' : ''}>
            <Tooltip label={compact ? 'More' : null}>
              <span>
                <ActionMenu label="More" borderless horizontal>
                  {groups
                    .filter((group) => group.id)
                    .map((group) => (
                      <section key={group.id} aria-label={group.label}>
                        <h3
                          title={group.label}
                          className="sidenav-group-menu-heading whitespace-nowrap px-3 pb-1 pt-3 text-xs font-semibold text-blue-700 dark:text-blue-300"
                        >
                          {group.label}
                        </h3>
                        {group.links.map(([to, label]) => (
                          <Link
                            key={to}
                            to={to}
                            aria-current={navigationActive(to, pathname) ? 'page' : undefined}
                            className={`nav-link ${navigationActive(to, pathname) ? 'active' : ''}`}
                            onClick={close}
                          >
                            {label}
                          </Link>
                        ))}
                      </section>
                    ))}
                </ActionMenu>
              </span>
            </Tooltip>
          </div>
        )}
      </nav>
      <div
        className={`sidebar-profile shrink-0 ${compact ? 'p-2' : 'p-3'} pb-[max(0.75rem,env(safe-area-inset-bottom))] ${mobile ? '!hidden' : ''}`}
      >
        <ProfileMenu user={user} compact={compact} logout={logout} busy={busy} onNavigate={close} />
      </div>
    </>
  );
  return (
    <>
      {toolbarTarget &&
        createPortal(
          <>
            <button
              type="button"
              className="notification-trigger"
              aria-label="Search Workspace"
              title="Search Workspace"
              aria-haspopup="dialog"
              onClick={() => {
                close();
                setSearchOpen(true);
              }}
            >
              <MagnifyingGlassIcon className="h-5 w-5" aria-hidden="true" />
            </button>
            {['admin', 'responder', 'user'].includes(user?.role) && (
              <button
                type="button"
                className="notification-trigger"
                aria-label="Create"
                title="Create"
                aria-haspopup="dialog"
                onClick={openCreate}
              >
                <PlusIcon className="h-5 w-5" aria-hidden="true" />
              </button>
            )}
          </>,
          toolbarTarget,
        )}
      {searchOpen && <GlobalSearch role={user?.role} onClose={() => setSearchOpen(false)} />}
      {createOpen && (
        <CreateDialog role={user?.role} onClose={() => setCreateOpen(false)} onNavigate={close} />
      )}
      <aside
        className={`desktop-sidebar fixed inset-y-0 left-0 z-30 hidden flex-col bg-white dark:bg-slate-900 md:flex ${compact ? 'w-16' : 'w-72'}`}
      >
        {content(compact)}
      </aside>
      <header
        className="mobile-topbar relative z-30 flex items-center justify-between border-b border-slate-200 bg-white px-4 dark:border-slate-700 dark:bg-slate-900 md:hidden"
        aria-label="Mobile navigation"
      >
        <button
          type="button"
          className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-[4px] hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500 dark:hover:bg-slate-800"
          aria-label="Open navigation"
          aria-haspopup="dialog"
          aria-expanded={mobileOpen}
          onClick={() => {
            dialog.current.showModal();
            setMobileOpen(true);
          }}
        >
          <span className="inline-flex" aria-hidden="true">
            {renderBrand(true)}
          </span>
        </button>
        <div className="mobile-profile-actions flex items-center gap-2">
          {mobileActions}
          <ProfileMenu
            user={user}
            compact
            dropdown
            logout={logout}
            busy={busy}
            onNavigate={close}
          />
        </div>
      </header>
      <dialog
        ref={dialog}
        aria-label="Navigation"
        className="fixed inset-y-0 left-0 m-0 h-dvh max-h-none w-72 max-w-[85vw] border-0 bg-white p-0 text-slate-800 shadow-xl backdrop:bg-slate-950/50 dark:bg-slate-900 dark:text-slate-200"
        onClose={() => setMobileOpen(false)}
        onClick={(event) => {
          if (event.target === event.currentTarget) close();
        }}
      >
        <div className="flex h-full flex-col">{content(false, true)}</div>
      </dialog>
    </>
  );
}

/** Native dialog provides focus trapping and Escape support for global creation choices. */
function CreateDialog({ role, onNavigate, onClose }) {
  const options = [
    {
      to: '/incidents/new',
      title: 'Incident',
      description: 'Track an issue affecting a service.',
      Icon: ExclamationTriangleIcon,
    },
    ...(['admin', 'responder'].includes(role)
      ? [
          {
            to: '/tasks/new',
            title: 'Task',
            description: 'Track work for an incident or service.',
            Icon: ClipboardDocumentListIcon,
          },
          {
            to: '/rcas/new',
            title: 'RCA',
            description: 'Analyze an incident and track corrective actions.',
            Icon: DocumentMagnifyingGlassIcon,
          },
          {
            to: '/knowledge/bases/new',
            title: 'Knowledge Base',
            description: 'Create a home for runbooks and solutions.',
            Icon: BookOpenIcon,
          },
          {
            to: '/knowledge/new',
            title: 'Knowledge Article',
            description: 'Write an article or a step-by-step runbook.',
            Icon: BookOpenIcon,
          },
        ]
      : []),
    ...(role === 'admin'
      ? [
          {
            to: '/quick-start',
            title: 'Quick Setup',
            description:
              'Create a service and monitor with optional notifications and on-call coverage.',
            Icon: AdjustmentsHorizontalIcon,
          },
          {
            to: '/workspace/new',
            title: 'User',
            description: 'Create or invite a workspace user.',
            Icon: UserGroupIcon,
          },
          {
            to: '/monitors/new',
            title: 'Monitor',
            description: 'Schedule a service health check.',
            Icon: SignalIcon,
          },
          {
            to: '/services/new',
            title: 'Service',
            description: 'Organize monitors and dependencies.',
            Icon: ServerStackIcon,
          },
          {
            to: '/collections/new',
            title: 'Collection',
            description: 'Group related services together.',
            Icon: FolderIcon,
          },
          {
            to: '/groups?create=1',
            title: 'Group',
            description: 'Organize workspace members.',
            Icon: UserGroupIcon,
          },
        ]
      : []),
  ];
  return (
    <Modal title="Create" onClose={onClose}>
      <div className="grid gap-3 sm:grid-cols-2">
        {options.map(({ to, title, description, Icon }) => (
          <Link
            key={to}
            to={to}
            className="rounded-xl border border-slate-200 p-5 hover:border-blue-500 hover:bg-blue-50 focus-visible:outline-2 focus-visible:outline-blue-600 dark:border-slate-700 dark:hover:border-blue-400 dark:hover:bg-blue-950"
            onClick={() => {
              onClose();
              onNavigate();
            }}
          >
            <Icon className="mb-3 h-6 w-6 text-blue-700 dark:text-blue-400" aria-hidden="true" />
            <span className="block font-semibold">{title}</span>
            <span className="mt-1 block text-sm text-slate-500 dark:text-slate-400">
              {description}
            </span>
          </Link>
        ))}
      </div>
    </Modal>
  );
}
