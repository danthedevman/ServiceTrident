import { ReadOnlyFieldsContext } from './read-only-context.js';
import { RecordLink, useRecordEditMarker } from '../record-navigation.jsx';
import { useInfiniteResource, useResource } from '../../data/use-resource.js';
import React, { useContext, useEffect, useLayoutEffect, useId, useRef, useState } from 'react';
import {
  InformationCircleIcon,
  XMarkIcon,
  ArrowTopRightOnSquareIcon,
} from '@heroicons/react/24/outline';
import { useQueryClient } from '@tanstack/react-query';
import { AuthContext } from '../../auth/auth-context.js';

import { referenceRoutes as recordRoutes } from '../reference-value.jsx';

const destinations = {
  components: { href: '/components/new', label: 'Create Component', roles: ['admin'] },
  knowledgeBases: {
    href: '/knowledge/bases/new',
    label: 'Create Knowledge Base',
    roles: ['admin', 'responder'],
  },
  knowledge: { href: '/knowledge/new', label: 'Create Article', roles: ['admin', 'responder'] },
  services: { href: '/services/new', label: 'Create Service', roles: ['admin'] },
  collections: { href: '/collections/new', label: 'Create Collection', roles: ['admin'] },
  groups: { href: '/groups/new', label: 'Create Group', roles: ['admin'] },
  members: { href: '/workspace/new', label: 'Create User', roles: ['admin'] },
  incidents: {
    href: '/incidents/new',
    label: 'Create Incident',
    roles: ['admin', 'responder', 'user'],
  },
};

/** Keep selections inside a searchable control; results support keyboard navigation and safe record creation. */
export function ReferenceField({
  label,
  hideLabel = false,
  placeholder,
  options = [],
  value,
  onChange,
  multiple = false,
  name,
  disabled = false,
  error,
  helpText,
  onSearch,
  referenceType,
  groupId,
  projectId,
  serviceId,
  excludeId,
  required = false,
  assignToMe = false,
}) {
  const readOnly = useContext(ReadOnlyFieldsContext);
  const id = useId(),
    [search, setSearch] = useState(''),
    [open, setOpen] = useState(false),
    [active, setActive] = useState(-1),
    [typing, setTyping] = useState(false);
  const markEdited = useRecordEditMarker();
  const input = useRef(null);
  const labels = useRef(new Map());
  const results = useRef(null);
  const popup = useRef(null);
  // Manual popovers escape clipping and avoid auto-dismiss on the click that follows input focus.
  // The field retains its existing blur and Escape handling.
  useLayoutEffect(() => {
    if (!open || disabled || !popup.current) return;
    const panel = popup.current;
    panel.showPopover();
    const position = () => {
      const rect = input.current?.closest('.reference-control')?.getBoundingClientRect();
      if (!rect) return;
      panel.style.width = `${Math.min(rect.width, window.innerWidth - 16)}px`;
      panel.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - panel.offsetWidth - 8))}px`;
      panel.style.top = `${Math.max(8, rect.bottom + panel.offsetHeight + 8 <= window.innerHeight ? rect.bottom + 4 : rect.top - panel.offsetHeight - 4)}px`;
    };
    position();
    window.addEventListener('resize', position);
    window.addEventListener('scroll', position, true);
    return () => {
      window.removeEventListener('resize', position);
      window.removeEventListener('scroll', position, true);
    };
  }, [open, disabled]);
  const sentinel = useRef(null);
  const { user } = useContext(AuthContext),
    client = useQueryClient();
  const selfAssignment =
    assignToMe &&
    !multiple &&
    referenceType === 'members' &&
    ['admin', 'responder'].includes(user?.role);
  const groups = useResource(selfAssignment && groupId ? '/groups' : null);
  const eligible =
    !groupId ||
    groups.data?.groups?.find((group) => group.id === groupId)?.memberIds.includes(user?.id);
  const destination = destinations[referenceType];
  const canCreate = destination?.roles.includes(user?.role);
  const ids = multiple ? value || [] : value ? [value] : [];
  const [query, setQuery] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => {
      setQuery(search);
    }, 200);
    return () => clearTimeout(timer);
  }, [search]);
  const remote = useInfiniteResource(
    referenceType && open && !disabled
      ? `/references/${referenceType}?${new URLSearchParams({ q: query, ...(groupId ? { groupId } : {}), ...(projectId ? { projectId } : {}), ...(serviceId ? { serviceId } : {}), ...(excludeId ? { excludeId } : {}) })}`
      : null,
  );
  const saved = useResource(
    referenceType && ids.length
      ? `/references/${referenceType}?${new URLSearchParams({ selected: ids.join(','), ...(projectId ? { projectId } : {}), ...(serviceId ? { serviceId } : {}) })}`
      : null,
  );
  // A record can move between server pages while someone edits it; show each ID once.
  const choices = [
    ...new Map(
      (remote.data?.pages ?? [])
        .flatMap((page) => page.options)
        .map((option) => [option.id, option]),
    ).values(),
  ];
  const available = referenceType ? [...(saved.data?.selected ?? []), ...choices] : options;
  useEffect(() => {
    if (
      !open ||
      disabled ||
      !referenceType ||
      remote.pending ||
      remote.error ||
      query !== search ||
      !remote.hasMore
    )
      return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) void remote.loadMore();
      },
      { root: results.current, rootMargin: '0px 0px 64px 0px' },
    );
    if (sentinel.current) observer.observe(sentinel.current);
    return () => observer.disconnect();
  }, [open, disabled, referenceType, remote, query, search]);
  for (const selected of ids) {
    const option = [...available, ...options].find((row) => row.id === selected);
    if (option) labels.current.set(selected, option.label);
  }
  for (const key of labels.current.keys()) if (!ids.includes(key)) labels.current.delete(key);
  const selectedLabel = (selected) => labels.current.get(selected) || 'Unavailable record';
  /** Keep navigation separate from selection; IDs are encoded under known application routes. */
  const recordLink = (selected) =>
    recordRoutes[referenceType] && selected ? (
      <RecordLink
        to={`${recordRoutes[referenceType]}/${encodeURIComponent(selected)}`}
        className="inline-flex shrink-0 items-center justify-center rounded p-1.5 text-blue-700 hover:bg-blue-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500 dark:text-blue-300 dark:hover:bg-blue-900"
        title={`Open ${selectedLabel(selected)} in a record tab`}
        aria-label={`Open ${selectedLabel(selected)} in a record tab`}
      >
        <InformationCircleIcon className="h-5 w-5" aria-hidden="true" />
      </RecordLink>
    ) : null;
  const matches = (referenceType ? choices : options).filter(
    (option) => !ids.includes(option.id) && option.id !== excludeId,
  );
  const select = (option) => {
    if (option.id === excludeId) return;
    onChange(multiple ? [...ids, option.id] : option.id);
    setSearch('');
    onSearch?.('');
    setTyping(false);
    setActive(-1);
    setOpen(multiple);
    input.current?.focus();
  };
  /** Refresh choices on focus so records created in another tab become available without resetting the form. */
  function showResults() {
    setOpen(true);
    if (referenceType) void remote.refresh();
    if (referenceType && user)
      void client.invalidateQueries({
        predicate: ({ queryKey }) =>
          queryKey[0] === 'private' &&
          queryKey[1] === user.email &&
          (queryKey[2] === `/${referenceType}` || queryKey[2]?.startsWith(`/${referenceType}?`)),
      });
  }
  return (
    <div
      className="min-w-0 space-y-2"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          setOpen(false);
          setTyping(false);
          setSearch('');
          setActive(-1);
          onSearch?.('');
        }
      }}
    >
      <div className="flex items-center justify-between gap-3">
        <label htmlFor={id} className={hideLabel ? 'sr-only' : 'field-label'}>
          {label}
        </label>
        {selfAssignment && !disabled && !readOnly && (
          <button
            type="button"
            className="shrink-0 text-sm font-medium text-blue-700 hover:underline disabled:opacity-50 dark:text-blue-300"
            disabled={!eligible || value === user.id}
            title={
              groupId && !eligible ? 'You must belong to the selected assignment group.' : undefined
            }
            onClick={() => {
              labels.current.set(user.id, user.displayName || user.email);
              setOpen(false);
              setSearch('');
              setTyping(false);
              setActive(-1);
              onChange(user.id);
              markEdited();
            }}
          >
            Assign to Me
          </button>
        )}
      </div>
      {name &&
        ids.map((selected) => <input key={selected} type="hidden" name={name} value={selected} />)}
      <div className="relative">
        <div
          data-selected-ids={ids.join(',')}
          className={`reference-control ${multiple ? '' : 'reference-single'} ${disabled ? 'reference-disabled' : ''}`}
          onClick={(event) => {
            if (event.target === event.currentTarget) input.current?.focus();
          }}
        >
          {multiple &&
            ids.map((selected) => (
              <span
                key={selected}
                className="inline-flex min-w-0 max-w-full items-center gap-1 rounded-md bg-blue-50 px-2 py-1 text-sm text-blue-800 dark:bg-blue-950 dark:text-blue-200"
              >
                <span className="min-w-0 truncate" title={selectedLabel(selected)}>
                  {selectedLabel(selected)}
                </span>
                {recordLink(selected)}
                {!readOnly && (
                  <button
                    type="button"
                    disabled={disabled}
                    className="shrink-0 rounded p-1"
                    aria-label={`Remove ${selectedLabel(selected)}`}
                    onClick={() => {
                      onChange(ids.filter((item) => item !== selected));
                      input.current?.focus();
                    }}
                  >
                    <XMarkIcon className="h-4 w-4" aria-hidden="true" />
                  </button>
                )}
              </span>
            ))}
          <input
            ref={input}
            id={id}
            data-reference-name={name}
            role="combobox"
            aria-autocomplete="list"
            aria-haspopup="listbox"
            aria-required={required}
            type="text"
            autoComplete="off"
            title={!multiple && ids.length ? selectedLabel(ids[0]) : undefined}
            value={!multiple && !typing && ids.length ? selectedLabel(ids[0]) : search}
            disabled={disabled}
            aria-expanded={open && !disabled}
            aria-controls={open && !disabled ? `${id}-results` : undefined}
            aria-activedescendant={
              open && active >= 0 && matches[active] ? `${id}-option-${active}` : undefined
            }
            aria-invalid={!!error}
            aria-describedby={
              [helpText ? `${id}-help` : '', error ? `${id}-error` : '']
                .filter(Boolean)
                .join(' ') || undefined
            }
            placeholder={
              readOnly
                ? ids.length
                  ? undefined
                  : 'Unassigned'
                : (placeholder ??
                  (multiple && ids.length ? 'Search to add more…' : 'Search to select…'))
            }
            onFocus={(event) => {
              showResults();
              if (!multiple) event.target.select();
            }}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.stopPropagation();
                setOpen(false);
                setTyping(false);
                setSearch('');
                onSearch?.('');
                setActive(-1);
              }
              if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                event.preventDefault();
                setOpen(true);
                const next =
                  event.key === 'ArrowDown'
                    ? Math.min(active + 1, matches.length - 1)
                    : Math.max(active - 1, 0);
                if (
                  event.key === 'ArrowDown' &&
                  active >= matches.length - 1 &&
                  query === search &&
                  !remote.error
                )
                  void remote.loadMore();
                setActive(next);
                document
                  .getElementById(`${id}-option-${next}`)
                  ?.scrollIntoView({ block: 'nearest' });
              }
              if (event.key === 'Enter') {
                event.preventDefault();
                if (open && matches[active]) select(matches[active]);
                else if (open && matches.length === 1) select(matches[0]);
              }
            }}
            onChange={(event) => {
              setTyping(true);
              setSearch(event.target.value);
              onSearch?.(event.target.value);
              setOpen(true);
              setActive(-1);
            }}
          />
          {!multiple && ids.length > 0 && recordLink(ids[0])}
          {!multiple && ids.length > 0 && !readOnly && (
            <button
              type="button"
              disabled={disabled}
              className="shrink-0 rounded p-2 text-slate-500"
              aria-label={`Clear ${selectedLabel(ids[0])}`}
              onClick={() => {
                onChange('');
                setSearch('');
                setTyping(false);
                onSearch?.('');
                input.current?.focus();
              }}
            >
              <XMarkIcon className="h-4 w-4" aria-hidden="true" />
            </button>
          )}
        </div>
        {open && !disabled && (
          <div
            ref={popup}
            popover="manual"
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                setOpen(false);
                input.current?.focus();
              }
            }}
            onToggle={(event) => {
              if (event.newState === 'closed') setOpen(false);
            }}
            className="reference-options fixed m-0 rounded border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-900"
          >
            <div
              ref={results}
              id={`${id}-results`}
              aria-busy={remote.pending}

              role="listbox"
              aria-label={label}
              aria-multiselectable={multiple || undefined}
              className="max-h-52 overflow-y-auto p-2"
            >
              {matches.length ? (
                matches.map((option, index) => (
                  <button
                    type="button"
                    key={option.id}
                    id={`${id}-option-${index}`}
                    role="option"
                    aria-selected={active === index}
                    tabIndex={-1}
                    onMouseDown={(event) => event.preventDefault()}
                    className={`block w-full rounded p-2 text-left text-sm hover:bg-blue-50 dark:hover:bg-slate-800 ${active === index ? 'bg-blue-50 dark:bg-slate-800' : ''}`}
                    onClick={() => select(option)}
                  >
                    {option.label}
                    {option.description && (
                      <span className="ml-2 text-xs text-slate-500">{option.description}</span>
                    )}
                  </button>
                ))
              ) : (
                <p className="p-2 text-sm text-slate-500">
                  {remote.pending || query !== search
                    ? 'Searching…'
                    : remote.error
                      ? 'Results unavailable.'
                      : 'No matching records.'}
                </p>
              )}
              <div ref={sentinel} role="presentation" className="h-px" />
            </div>
            <p role="status" className="px-2 text-sm text-slate-500">
              {remote.pending && matches.length > 0 ? 'Loading more results…' : ''}
            </p>
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 p-2 dark:border-slate-700">
              {remote.error && (
                <p role="alert" className="p-2 text-sm text-rose-700 dark:text-rose-400">
                  {remote.error}
                  <button
                    type="button"
                    className="ml-2 underline"
                    onClick={() => (remote.hasMore ? remote.loadMore() : remote.refresh())}
                  >
                    Retry
                  </button>
                </p>
              )}
              {canCreate && (
                <RecordLink
                  to={destination.href}
                  className="inline-flex items-center gap-2 rounded p-2 text-sm font-medium text-blue-700 dark:text-blue-300"
                >
                  {destination.label}
                  <ArrowTopRightOnSquareIcon className="h-4 w-4" aria-hidden="true" />
                  <span className="sr-only"> (opens in a record tab)</span>
                </RecordLink>
              )}
              <button
                type="button"
                className="p-2 text-xs text-blue-700 dark:text-blue-300"
                onClick={() => {
                  setOpen(false);
                  setTyping(false);
                  setSearch('');
                  onSearch?.('');
                }}
              >
                Close results
              </button>
            </div>
          </div>
        )}
      </div>
      {helpText && (
        <p id={`${id}-help`} className="field-hint whitespace-pre-wrap">
          {helpText}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} role="alert" className="text-sm text-rose-700 dark:text-rose-300">
          {error}
        </p>
      )}
    </div>
  );
}
