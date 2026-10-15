import React, { useEffect, useRef, useState } from 'react';
import { BellIcon, XMarkIcon } from '@heroicons/react/24/outline';
import { useResource } from '../data/use-resource.js';
import { useSave } from '../data/use-save.js';
import { RecordLink } from '../components/record-navigation.jsx';
import { DateTime } from '../preferences/date-time.jsx';

export function Notifications() {
  const [open, setOpen] = useState(false);
  const resource = useResource('/notifications', 30000),
    save = useSave();
  const root = useRef(null),
    trigger = useRef(null);
  const entries = resource.data?.notifications ?? [];
  const unread = entries.filter((item) => item.unread).length;
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
          aria-busy={resource.pending}
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
          {(resource.error || save.error) && (
            <p className="px-4 pb-3 text-sm text-rose-600" role="alert">
              {resource.error || save.error}
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
          {!entries.length && !resource.pending && !resource.error && (
            <p className="p-4 text-sm text-slate-500">You’re all caught up.</p>
          )}
          <ol className="notification-list">
            {entries.map((item) => (
              <li key={item.id}>
                <RecordLink
                  to={`/incidents/${item.incidentId}`}
                  recordLabel={item.title}
                  onClick={() => setOpen(false)}
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
        </section>
      )}
    </div>
  );
}
