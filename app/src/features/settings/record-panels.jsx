import { SettingsDirectoryRows } from './directory-rows.jsx';
import { downloadCsv } from '../../lib/csv-download.js';
import { RECORD_PANEL_PAGE_SIZE, recordPanelParams } from './record-panel-query.js';
import { RecordHeader } from '../../components/record-actions.jsx';
import React, { useContext, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  UserCircleIcon,
  UserGroupIcon,
  ArrowUpRightIcon,
  PlusIcon,
} from '@heroicons/react/24/outline';
import { AuthContext } from '../../auth/auth-context.js';
import { SearchInput } from '../../components/forms/search-input.jsx';
import { StateBadge } from '../../components/state-badge.jsx';
import { ConfirmDeleteButton } from '../../components/confirm-delete-button.jsx';
import { Skeleton } from '../../components/skeleton.jsx';
import { Notice } from '../../components/forms/fields.jsx';
import { RefreshButton } from '../../components/icon-button.jsx';
import { DateTime } from '../../preferences/date-time.jsx';
import { displayValue } from '../../lib/display-value.js';
import { useResource } from '../../data/use-resource.js';
import { writeApi } from '../../data/query-client.js';

const definitions = {
  groups: {
    title: 'Groups',
    source: 'groups',
    sort: 'name',
    description: 'Organize people around ownership and response.',
    create: '/groups/new',
  },
  users: {
    title: 'Users',
    source: 'members',
    sort: 'displayName',
    description: 'Manage workspace members, roles, and account access.',
    create: '/workspace/new',
  },
  audit: {
    title: 'Audit Log',
    source: 'audit',
    sort: 'createdAt',
    description:
      'Review who performed an action and its outcome. Field values and secrets are excluded.',
  },
  hosting: {
    title: 'Hosting Inquiries',
    source: 'inquiries',
    sort: 'createdAt',
    description: 'Review managed hosting requests. Inquiries are retained for 90 days.',
  },
};

/** Cards reuse bounded, authorized server paging; private records never enter browser storage. */
export function SettingsRecordPanels({ section }) {
  const config = definitions[section];
  const { user } = useContext(AuthContext);
  const [search, setSearch] = useState(''),
    [query, setQuery] = useState(''),
    [page, setPage] = useState(1);
  useEffect(() => {
    if (search.trim() === query) return;
    const timer = setTimeout(() => {
      setQuery(search.trim());
      setPage(1);
    }, 250);
    return () => clearTimeout(timer);
  }, [search, query]);
  const [exporting, setExporting] = useState(false),
    [exportError, setExportError] = useState('');
  const directory = ['users', 'groups'].includes(section);
  const params = recordPanelParams({
    search: query,
    sortBy: config.sort,
    order: ['audit', 'hosting'].includes(section) ? 'desc' : 'asc',
    page,
  });
  const resource = useResource(`/tables/${config.source}?${params}`, 30000);
  const rows = resource.data?.rows ?? [],
    total = resource.data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / RECORD_PANEL_PAGE_SIZE));
  useEffect(() => {
    if (resource.data && page > pages) setPage(pages);
  }, [resource.data, page, pages]);
  const admin = user?.role === 'admin';
  return (
    <section
      className="settings-record-panels space-y-5"
      aria-label={config.title}
      aria-busy={resource.pending}
    >
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-xl font-semibold">
            {config.title}
            {resource.data && (
              <span className="ml-2 text-sm font-normal text-slate-500">{total}</span>
            )}
          </h2>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">{config.description}</p>
        </div>
        <RecordHeader>
          <RefreshButton
            busy={resource.pending}
            label={`Refresh ${config.title}`}
            onClick={resource.refresh}
          />
          <button
            type="button"
            className="btn-secondary"
            disabled={exporting || !resource.data}
            onClick={async () => {
              setExporting(true);
              setExportError('');
              try {
                const exportParams = new URLSearchParams(params);
                exportParams.set('export', 'csv');
                await downloadCsv(
                  `/tables/${config.source}?${exportParams}`,
                  `${config.source}.csv`,
                );
              } catch (failure) {
                setExportError(failure.message);
              } finally {
                setExporting(false);
              }
            }}
          >
            Download CSV
          </button>
          {admin && config.create && (
            <Link className="btn-primary gap-2" to={config.create}>
              <PlusIcon className="h-4 w-4" aria-hidden="true" />
              Create
            </Link>
          )}
        </RecordHeader>
      </header>
      <label className="field-label block">
        <span className="sr-only">Search {config.title}</span>
        <SearchInput
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          maxLength={100}
          placeholder={`Search ${config.title}`}
        />
      </label>
      <Notice error={resource.error || exportError} />
      {!resource.data && resource.pending ? (
        <div className="grid gap-4 xl:grid-cols-2" aria-hidden="true">
          {[1, 2, 3, 4].map((value) => (
            <Skeleton key={value} className="h-48" />
          ))}
        </div>
      ) : directory && rows.length ? (
        <SettingsDirectoryRows section={section} rows={rows} refresh={resource.refresh} />
      ) : (
        <ul
          className={`grid gap-4 ${['users', 'groups'].includes(section) ? 'xl:grid-cols-2' : ''}`}
        >
          {rows.map((row) => {
            const people = section === 'users',
              group = section === 'groups';
            const label = people
              ? row.displayName || row.email
              : group
                ? row.name
                : section === 'audit'
                  ? displayValue(row.action)
                  : row.name;
            const href = people
              ? `/workspace/${row.id}`
              : group
                ? `/groups/${row.id}`
                : section === 'audit'
                  ? `/records/audit/${row.id}`
                  : null;
            const Icon = group ? UserGroupIcon : UserCircleIcon;
            const path = people
              ? `/members/${row.id}`
              : group
                ? `/groups/${row.id}`
                : `/settings/marketing/inquiries/${row.id}`;
            return (
              <li key={row.id} className="settings-record-card panel min-w-0 p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    {(people || group) && (
                      <span className="settings-record-icon">
                        <Icon className="h-5 w-5" aria-hidden="true" />
                      </span>
                    )}
                    <h3 className="min-w-0 break-words font-semibold">
                      {href ? (
                        <Link
                          className="text-blue-700 hover:underline dark:text-blue-300"
                          to={href}
                        >
                          {label || 'Selected record'}
                        </Link>
                      ) : (
                        label
                      )}
                    </h3>
                  </div>
                  {people && <StateBadge status={row.disabled ? 'disabled' : 'active'} />}
                  {section === 'audit' && (
                    <StateBadge
                      status={row.outcome === 'success' ? 'done' : 'failed'}
                      label={displayValue(row.outcome)}
                    />
                  )}
                </div>
                {people ? (
                  <div className="mt-4 space-y-2 text-sm">
                    <p className="break-words text-slate-600 dark:text-slate-400">{row.email}</p>
                    <p>{row.owner ? 'Admin (owner)' : displayValue(row.role)}</p>
                    {(row.jobTitle || row.department) && (
                      <p className="text-slate-500">
                        {[row.jobTitle, row.department].filter(Boolean).join(' · ')}
                      </p>
                    )}
                  </div>
                ) : group ? (
                  <div className="mt-4 space-y-3 text-sm">
                    <p className="break-words text-slate-600 dark:text-slate-400">
                      {row.description || 'No description added.'}
                    </p>
                    <p className="break-words">
                      <span className="text-slate-500">Members: </span>
                      {row.members || 'No members'}
                    </p>
                  </div>
                ) : section === 'audit' ? (
                  <div className="mt-3 space-y-2 text-sm text-slate-600 dark:text-slate-400">
                    <p>
                      {row.actor || 'System'} · <DateTime value={row.createdAt} />
                    </p>
                    <p>
                      {displayValue(row.recordType)}
                      {row.statusCode ? ` · HTTP ${row.statusCode}` : ''}
                    </p>
                    {row.fields && <p className="break-words">Fields: {row.fields}</p>}
                  </div>
                ) : (
                  <div className="mt-3 space-y-2 text-sm">
                    <p className="break-words">
                      {row.email} · {row.company}
                    </p>
                    <p>
                      {displayValue(row.interest)} · <DateTime value={row.createdAt} />
                    </p>
                    <p className="whitespace-pre-wrap break-words text-slate-600 dark:text-slate-400">
                      {row.message}
                    </p>
                  </div>
                )}
                <div className="mt-5 flex flex-wrap items-center justify-end gap-3">
                  {admin && section !== 'audit' && !row.owner && row.id !== user.id && (
                    <ConfirmDeleteButton
                      className="text-sm text-rose-700 dark:text-rose-300"
                      title="Delete Record"
                      confirmation={`Delete “${label || 'Selected record'}”? This cannot be undone.${group ? ' Remove service ownership and record assignments first.' : ''}`}
                      onConfirm={async () => {
                        await writeApi(path, {
                          method: 'DELETE',
                          body: { revision: row.revision },
                        });
                        await resource.refresh();
                      }}
                    >
                      Delete
                    </ConfirmDeleteButton>
                  )}
                  {href && (
                    <Link
                      className="btn-secondary gap-2"
                      to={admin && (people || group) && !row.owner ? `${href}/edit` : href}
                    >
                      {admin && (people || group) && !row.owner ? 'Edit' : 'View Record'}
                      <ArrowUpRightIcon className="h-4 w-4" aria-hidden="true" />
                    </Link>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {resource.data && !rows.length && (
        <p className="panel p-6 text-sm text-slate-600 dark:text-slate-400">
          {query ? 'No matching records. Try another search.' : 'No records in this view.'}
        </p>
      )}
      {resource.data && (
        <footer className="flex flex-wrap items-center justify-between gap-3 text-sm text-slate-500">
          <p>
            {total} {total === 1 ? 'record' : 'records'} · Page {page} of {pages}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              className="btn-secondary"
              disabled={page <= 1 || resource.pending}
              onClick={() => setPage(page - 1)}
            >
              Previous
            </button>
            <button
              type="button"
              className="btn-secondary"
              disabled={page >= pages || resource.pending}
              onClick={() => setPage(page + 1)}
            >
              Next
            </button>
          </div>
        </footer>
      )}
    </section>
  );
}
