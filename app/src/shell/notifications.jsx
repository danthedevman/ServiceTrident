import React, { useContext, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useInfiniteQuery } from '@tanstack/react-query';
import { api } from '../data/api.js';
import { resourceOptions } from '../data/query-client.js';
import { AuthContext } from '../auth/auth-context.js';
import { RecordHeader } from '../components/record-actions.jsx';
import { BellIcon, XMarkIcon, ArrowPathIcon } from '@heroicons/react/24/outline';
import { useResource } from '../data/use-resource.js';
import { useSave } from '../data/use-save.js';
import { RecordLink } from '../components/record-navigation.jsx';
import { SearchInput } from '../components/forms/search-input.jsx';
import { Select } from '../components/forms/select.jsx';
import { DateTime } from '../preferences/date-time.jsx';

export function Notifications() {
  const [open, setOpen] = useState(false),
    [tab, setTab] = useState('unread');
  const resource = useResource('/notifications', 30000),
    save = useSave();
  const root = useRef(null),
    trigger = useRef(null);
  const entries = resource.data?.notifications ?? [];
  const unread = entries.filter((item) => item.unread).length;
  const readResource = useResource(
    open && tab === 'read' ? '/notifications?state=read' : null,
    30000,
  );
  const activeResource = tab === 'read' ? readResource : resource;
  const visible =
    tab === 'read'
      ? (readResource.data?.notifications ?? [])
      : entries.filter((item) => item.unread);
  useEffect(() => {
    if (!open) return;
    const outside = (event) => {
      if (!root.current?.contains(event.target)) setOpen(false);
    };
    const escape = (event) => {
      if (event.key === 'Escape') {
        setOpen(false);
        trigger.current?.focus();
      }
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', escape);
    };
  }, [open]);
  return (
    <div ref={root} className="notification-control">
      <button
        ref={trigger}
        type="button"
        className="notification-trigger"
        aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`}
        aria-expanded={open}
        aria-controls="notification-panel"
        onClick={() => setOpen(!open)}
      >
        <BellIcon className="h-5 w-5" aria-hidden="true" />
        {unread > 0 && <span className="notification-count">{unread > 99 ? '99+' : unread}</span>}
      </button>
      {open && (
        <section
          id="notification-panel"
          aria-label="Notifications"
          className="notification-panel"
          aria-busy={activeResource.pending}
        >
          <header className="flex items-center justify-between gap-3 p-4">
            <h2 className="font-semibold">Notifications</h2>
            <button
              type="button"
              className="task-icon-action"
              aria-label="Close notifications"
              onClick={() => {
                setOpen(false);
                trigger.current?.focus();
              }}
            >
              <XMarkIcon className="h-5 w-5" />
            </button>
          </header>
          {(activeResource.error || save.error) && (
            <p className="px-4 pb-3 text-sm text-rose-600" role="alert">
              {activeResource.error || save.error}
            </p>
          )}
          {unread > 0 && (
            <button
              type="button"
              className="mx-4 mb-3 text-sm text-blue-600 dark:text-blue-300"
              disabled={save.busy}
              onClick={() =>
                save.run(
                  '/notifications/read',
                  'POST',
                  { checkedAt: resource.data.checkedAt },
                  () => void resource.refresh(),
                )
              }
            >
              Mark all as read
            </button>
          )}
          <NotificationTabs value={tab} onChange={setTab} prefix="notification-menu" />
          <div
            role="tabpanel"
            id="notification-menu-results"
            className="notification-results"
            aria-label={tab === 'unread' ? 'Unread notifications' : 'Read notifications'}
          >
            {!visible.length && !activeResource.pending && !activeResource.error && (
              <p className="p-4 text-sm text-slate-500">
                {tab === 'unread' ? 'You’re all caught up.' : 'No read notifications.'}
              </p>
            )}
            <NotificationEntries entries={visible} onOpen={() => setOpen(false)} />
          </div>
          <footer className="notification-footer">
            <Link
              className="text-sm font-medium text-blue-600 dark:text-blue-300"
              to="/notifications"
              onClick={() => setOpen(false)}
            >
              View All Notifications
            </Link>
          </footer>
        </section>
      )}
    </div>
  );
}

function NotificationTabs({ value, onChange, all = false, prefix }) {
  const options = all ? ['all', 'unread', 'read'] : ['unread', 'read'];
  return (
    <div role="tablist" aria-label="Notification filters" className="notification-tabs">
      {options.map((key, index) => (
        <button
          key={key}
          type="button"
          role="tab"
          aria-selected={value === key}
          aria-controls={`${prefix}-results`}
          tabIndex={value === key ? 0 : -1}
          onClick={() => onChange(key)}
          onKeyDown={(event) => {
            let next;
            if (event.key === 'ArrowRight') next = (index + 1) % options.length;
            else if (event.key === 'ArrowLeft')
              next = (index + options.length - 1) % options.length;
            else if (event.key === 'Home') next = 0;
            else if (event.key === 'End') next = options.length - 1;
            else return;
            event.preventDefault();
            onChange(options[next]);
            const buttons = event.currentTarget
              .closest('[role="tablist"]')
              .querySelectorAll('button');
            buttons[next].focus();
          }}
        >
          {key.charAt(0).toUpperCase() + key.slice(1)}
        </button>
      ))}
    </div>
  );
}
function NotificationEntries({ entries, onOpen }) {
  return (
    <ol className="notification-list">
      {entries.map((item) => (
        <li key={item.id}>
          <RecordLink
            to={`/incidents/${item.incidentId}`}
            recordLabel={item.title}
            onClick={onOpen}
            className={`notification-entry ${item.unread ? 'notification-unread' : ''}`}
          >
            <span className="block text-sm font-medium">
              {item.author} added a {item.kind === 'work_note' ? 'work note' : 'comment'}
            </span>
            <span className="block truncate text-sm">
              {item.number ? `${item.number} · ` : ''}
              {item.title}
            </span>
            <span className="block text-xs text-slate-500">
              <DateTime value={item.createdAt} />
            </span>
          </RecordLink>
        </li>
      ))}
    </ol>
  );
}
export function NotificationsPage() {
  const [tab, setTab] = useState('all');
  const [search, setSearch] = useState(''),
    [query, setQuery] = useState(''),
    [order, setOrder] = useState('desc');
  useEffect(() => {
    const timer = setTimeout(() => setQuery(search.trim()), 250);
    return () => clearTimeout(timer);
  }, [search]);
  return (
    <section className="space-y-4" aria-label="Notification history">
      <div className="notification-history-toolbar flex flex-wrap items-end justify-between gap-4">
        <NotificationTabs value={tab} onChange={setTab} all prefix="notification-page" />
        <div className="notification-history-fields flex min-w-0 flex-1 items-end justify-end gap-3">
          <label className="field-label block min-w-0 flex-1 sm:max-w-sm">
            <span className="sr-only">Search Notifications</span>
            <SearchInput
              value={search}
              maxLength={100}
              placeholder="Search title, number, or author"
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>
          <label className="field-label">
            Created
            <Select
              aria-label="Created"
              value={order}
              onChange={(event) => setOrder(event.target.value)}
            >
              <option value="desc">Newest First</option>
              <option value="asc">Oldest First</option>
            </Select>
          </label>
        </div>
      </div>
      <NotificationHistory
        key={`${tab}-${query}-${order}`}
        state={tab}
        search={query}
        order={order}
      />
    </section>
  );
}
function NotificationHistory({ state, search, order }) {
  const { user } = useContext(AuthContext),
    save = useSave();
  const path = `/notifications?${new URLSearchParams({ state, pageSize: 50, search, order })}`;
  const query = useInfiniteQuery({
    ...resourceOptions(path, user?.email ?? null),
    queryKey: [...resourceOptions(path, user?.email ?? null).queryKey, 'cursor'],
    initialPageParam: null,
    queryFn: ({ signal, pageParam }) =>
      api(`${path}${pageParam ? `&cursor=${encodeURIComponent(pageParam)}` : ''}`, { signal }),
    getNextPageParam: (lastPage) => lastPage.nextCursor || undefined,
    enabled: !!user,
  });
  const entries = [
    ...new Map(
      (query.data?.pages ?? []).flatMap((page) => page.notifications).map((row) => [row.id, row]),
    ).values(),
  ];
  const unread = entries.some((entry) => entry.unread);
  return (
    <>
      <RecordHeader>
        {unread && (
          <button
            className="btn-secondary"
            disabled={save.busy}
            onClick={() =>
              save.run(
                '/notifications/read',
                'POST',
                { checkedAt: query.data.pages[0].checkedAt },
                () => query.refetch(),
              )
            }
          >
            Mark all as read
          </button>
        )}
        <button
          type="button"
          className="btn-secondary"
          aria-label="Refresh Notifications"
          disabled={query.isFetching}
          onClick={() => query.refetch()}
        >
          <ArrowPathIcon className="h-4 w-4" aria-hidden="true" />
        </button>
      </RecordHeader>
      <div
        role="tabpanel"
        id="notification-page-results"
        aria-label={`${state.charAt(0).toUpperCase() + state.slice(1)} notifications`}
        aria-busy={query.isFetching}
        className="notification-history panel"
      >
        {(query.error || save.error) && (
          <p role="alert" className="p-4 text-sm text-rose-600">
            {query.error?.message || save.error}
          </p>
        )}
        {query.isPending && (
          <div className="space-y-3 p-4" aria-hidden="true">
            {[1, 2, 3].map((key) => (
              <div
                key={key}
                className="h-16 animate-pulse rounded bg-slate-200 dark:bg-slate-800"
              />
            ))}
          </div>
        )}
        {!entries.length && !query.isPending && !query.error && (
          <p className="p-4 text-sm text-slate-500">No notifications in this view.</p>
        )}
        <NotificationEntries entries={entries} />
        {query.hasNextPage && (
          <button
            type="button"
            className="btn-secondary m-4"
            disabled={query.isFetching}
            onClick={() => query.fetchNextPage()}
          >
            Load More
          </button>
        )}
      </div>
    </>
  );
}
