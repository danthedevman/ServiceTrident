import { useListFilter } from '../../data/use-list-filter.js';
import { AuthContext } from '../../auth/auth-context.js';
import { RecordTabs } from '../../components/record-tabs.jsx';
import { Select } from '../../components/forms/select.jsx';
import { EditRecordButton } from '../../components/record-workspace.jsx';
import { Stat } from '../../components/stat.jsx';
import { PendingPage } from '../../components/pending-page.jsx';
import { RecordWorkspace, RecordMetadata } from '../../components/record-workspace.jsx';
import { Modal } from '../../components/modal.jsx';

import { AdminOnly } from '../../auth/role-gates.jsx';

import { DataTable } from '../../components/data-table.jsx';
import { downloadCsv } from '../../lib/csv-download.js';

import { writeApi } from '../../data/query-client.js';
import { useResource } from '../../data/use-resource.js';

import { ArrowPathIcon, ArrowRightIcon, ArrowUpRightIcon } from '@heroicons/react/24/outline';
import React, { useContext, useEffect, useState } from 'react';

import { Link, useNavigate, useParams } from 'react-router-dom';
import { dateRangeErrors } from '../../../../shared/validation/form-validation.js';

import { layouts, historyColumns } from '../../lib/layouts.js';

import { MonitorOrganization } from '../services/monitor-organization.jsx';

import { Badge } from '../../components/feedback.jsx';
import { ErrorNotice } from '../../components/feedback.jsx';

import { useDateTime } from '../../preferences/date-time.jsx';

import { MonitorForm } from './form.jsx';

/** Paginated check history plus pause, resume, and delete controls. */
export function MonitorDetail() {
  const dateTime = useDateTime();
  const { user } = useContext(AuthContext);
  const [formVersion, setFormVersion] = useState(0);
  const [editingId, setEditingId] = useState(null);
  const editing = editingId === useParams().id;
  const { id } = useParams();
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useListFilter('pageSize', 10, 'monitor-history');
  const [status, setStatus] = useListFilter('status', '', 'monitor-history');
  const [from, setFrom] = useListFilter('from', '', 'monitor-history');
  const [to, setTo] = useListFilter('to', '', 'monitor-history');
  const [sort, setSort] = useListFilter('sort', 'checkedAt:desc', 'monitor-history');
  const filters = { status, from, to, sort };
  function setFilters(update) {
    const next = typeof update === 'function' ? update(filters) : update;
    setStatus(next.status);
    setFrom(next.from);
    setTo(next.to);
    setSort(next.sort);
  }
  const [sortBy, order] = filters.sort.split(':');
  const query = new URLSearchParams({
    page: String(page),
    pageSize: String(pageSize),
    sortBy,
    order,
  });
  for (const key of ['status', 'from', 'to']) if (filters[key]) query.set(key, filters[key]);
  const monitorState = useResource(`/monitors/${id}`, 15000);
  const dateErrors = dateRangeErrors(filters.from, filters.to);
  const invalidDates = Object.keys(dateErrors).length > 0;
  const eventState = useResource(
    invalidDates ? null : `/monitors/${id}/events?${query}`,
    page === 1 ? 15000 : 0,
  );
  const changeFilter = (key, value) => {
    setFilters((current) => ({ ...current, [key]: value }));
    setPage(1);
  };
  useEffect(() => {
    if (eventState.data && page > Math.max(1, eventState.data.totalPages))
      setPage(Math.max(1, eventState.data.totalPages));
  }, [eventState.data, page]);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const monitor = monitorState.data?.monitor;
  const eventColumns = [
    {
      key: 'number',
      label: 'Check Number',
      width: '10rem',
      value: (event) => event.number || '—',
      sortable: false,
    },
    {
      key: 'checkedAt',
      label: 'Checked at',
      value: (event) => event.checkedAt,
      render: (event) => (
        <Link
          className="font-medium text-blue-700 dark:text-blue-400 hover:underline"
          to={`/monitors/${id}/events/${event.id}`}
        >
          {dateTime(event.checkedAt)}
        </Link>
      ),
      className: 'whitespace-nowrap',
    },
    {
      key: 'status',
      label: 'Status',
      value: (event) => event.status,
      render: (event) => <Badge status={event.status} />,
      sortable: false,
    },
    {
      key: 'statusCode',
      label: 'HTTP',
      value: (event) => event.statusCode,
      className: 'font-mono text-xs',
    },
    {
      key: 'durationMs',
      label: 'Response',
      value: (event) => event.durationMs,
      render: (event) => `${event.durationMs} ms`,
      className: 'whitespace-nowrap',
    },
    {
      key: 'delay',
      label: 'Start delay',
      value: (event) => event.timing?.scheduleDelayMs,
      render: (event) =>
        event.timing ? `${(event.timing.scheduleDelayMs / 1000).toFixed(1)} s` : '—',
      sortable: false,
    },
    {
      key: 'details',
      label: 'Details',
      value: (event) => event.error ?? 'Request succeeded',
      sortable: false,
      className: 'break-words text-slate-500 dark:text-slate-400',
      render: (event) => (
        <>
          <p>
            {event.error ??
              (event.statusCode >= 300 && event.statusCode < 400
                ? 'Redirect response — inspect event for details'
                : 'Request succeeded')}
          </p>
          <Link
            className="mt-1 inline-block text-xs font-medium text-blue-700 dark:text-blue-400 hover:underline"
            to={`/monitors/${id}/events/${event.id}`}
          >
            View response <ArrowRightIcon className="inline h-4 w-4" aria-hidden="true" />
          </Link>
        </>
      ),
    },
  ].map((column, index) => ({ ...column, width: column.width ?? historyColumns[index - 1].width }));

  const checkNow = async () => {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await writeApi(`/monitors/${id}/check`, { method: 'POST', body: {} });
      setNotice(
        'Check requested. It runs at the next permitted start; recent checks or worker availability can delay it.',
      );
      await monitorState.refresh();
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusy(false);
    }
  };
  const change = async (remove = false) => {
    setBusy(true);
    setError('');
    try {
      await writeApi(`/monitors/${id}`, {
        method: remove ? 'DELETE' : 'PATCH',
        body: remove ? {} : { paused: !monitor.paused },
      });
      if (remove) navigate('/monitors');
    } catch (error) {
      setError(error.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <ErrorNotice>{error || monitorState.error || eventState.error}</ErrorNotice>
      {notice && (
        <p role="status" className="text-sm text-slate-500 dark:text-slate-400">
          {notice}
        </p>
      )}
      {monitorState.loading ? (
        <PendingPage pathname={`/monitors/${id}`} />
      ) : (
        monitor && (
          <>
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="field-label">Name</span>
                  <span className="break-words">{monitor.name}</span>
                </div>
                <a
                  href={!monitor.type || monitor.type === 'http' ? monitor.url : undefined}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 block break-all text-sm text-slate-500 dark:text-slate-400 hover:text-blue-700 dark:hover:text-blue-400"
                >
                  {monitor.url}{' '}
                  <ArrowUpRightIcon className="ml-1 inline h-4 w-4" aria-hidden="true" />
                </a>
              </div>
            </div>
            {monitor.unsupported && (
              <p role="status" className="text-sm text-amber-700 dark:text-amber-300">
                This monitor type has been retired and is paused. Historical results remain
                available. Create an HTTP/HTTPS monitor to replace it.
              </p>
            )}
            <RecordWorkspace
              item={monitor}
              kind={'monitors'}
              actions={
                !editing &&
                !monitor.unsupported && (
                  <AdminOnly>
                    <button
                      type="button"
                      className="btn-primary"
                      disabled={busy || monitor.manualCheckPending || !!monitor.demoBatchId}
                      onClick={checkNow}
                    >
                      <ArrowPathIcon className="h-4 w-4" aria-hidden="true" />
                      Check Now
                    </button>
                    <EditRecordButton onClick={() => setEditingId(id)} />
                  </AdminOnly>
                )
              }
              secondaryActions={
                user?.role === 'admin' && (
                  <>
                    <button
                      className="btn-secondary"
                      disabled={busy || !!monitor.demoBatchId || monitor.unsupported}
                      onClick={() => change()}
                    >
                      {monitor.paused ? 'Resume monitor' : 'Pause monitor'}
                    </button>
                    <button
                      className="btn-danger"
                      disabled={busy}
                      onClick={() => setConfirmDelete(true)}
                    >
                      Delete monitor
                    </button>
                  </>
                )
              }
              sidebar={
                <>
                  <RecordMetadata
                    item={monitor}
                    extra={[
                      ['Status', monitor.status],
                      [
                        'Protocol',
                        monitor.type && monitor.type !== 'http'
                          ? monitor.type
                          : monitor.method || 'GET',
                      ],
                      ['Interval', `${monitor.intervalMinutes} min`],
                    ]}
                  />
                  <MonitorOrganization monitor={monitor} />
                </>
              }
            >
              <AdminOnly>
                {editing && (
                  <MonitorForm
                    key={`${id}-${formVersion}`}
                    monitor={monitor}
                    onReset={() => {
                      setEditingId(null);
                      setFormVersion((value) => value + 1);
                    }}
                  />
                )}
              </AdminOnly>
              <div className={layouts.scores}>
                <Stat
                  title="Check Interval"
                  value={`${monitor.intervalMinutes} min`}
                  note={
                    monitor.paused
                      ? 'Monitoring is paused'
                      : `${monitor.method ?? 'GET'} · Redirects ${monitor.followRedirects ? 'enabled' : 'disabled'}`
                  }
                />
                <Stat
                  title="Latest Response"
                  value={monitor.lastCheck ? `${monitor.lastCheck.durationMs} ms` : '—'}
                  note={
                    monitor.lastCheck?.statusCode
                      ? `HTTP ${monitor.lastCheck.statusCode}`
                      : 'Waiting for a response'
                  }
                />
                <Stat
                  title="Last Checked"
                  compact
                  value={monitor.lastCheck ? dateTime(monitor.lastCheck.checkedAt) : '—'}
                  note={!monitor.lastCheck ? 'First check starts shortly' : undefined}
                />
              </div>
              {monitor.status === 'unknown' && (
                <div className="rounded-xl bg-amber-50 dark:bg-amber-950 p-4 text-sm text-amber-800 dark:text-amber-300">
                  No recent check has arrived. The worker may be delayed or offline; current uptime
                  is unknown.
                </div>
              )}
              <RecordTabs
                related
                tabs={[
                  {
                    id: 'events',
                    label: 'Check History',
                    content: (
                      <DataTable
                        title="Check History"
                        rowHref={(event) => `/monitors/${id}/events/${event.id}`}
                        description="Last 30 days · Times shown in your profile time zone"
                        rows={eventState.data?.events ?? []}
                        columns={eventColumns}
                        rowKey={(event) => event.id}
                        tableClassName={layouts.historyTable}
                        remote={{
                          filtersActive: Boolean(filters.status || filters.from || filters.to),
                          page,
                          pageSize,
                          total: eventState.data?.total ?? 0,
                          sort: filters.sort,
                          onPage: setPage,
                          onPageSize: (value) => {
                            setPageSize(value);
                            setPage(1);
                          },
                          onSort: (value) => changeFilter('sort', value),
                          pending: eventState.pending,
                          loading: eventState.loading,
                          invalid: invalidDates,
                          onRefresh: eventState.refresh,
                          onExport: (signal) =>
                            downloadCsv(
                              `/monitors/${id}/events/export?${query}`,
                              `monitor-${id}-events.csv`,
                              signal,
                            ),
                        }}
                        filters={
                          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                            <label className="field-label">
                              Status
                              <Select
                                className="history-select"
                                value={filters.status}
                                onChange={(event) => changeFilter('status', event.target.value)}
                              >
                                <option value="">All results</option>
                                <option value="up">Operational</option>
                                <option value="down">Down</option>
                              </Select>
                            </label>

                            <label className="field-label">
                              From date
                              <input
                                type="date"
                                aria-invalid={!!dateErrors.from}
                                aria-describedby={dateErrors.from ? 'from-date-error' : undefined}
                                value={filters.from}
                                onChange={(event) => changeFilter('from', event.target.value)}
                              />
                              {dateErrors.from && (
                                <span
                                  id="from-date-error"
                                  className="mt-2 block text-xs text-rose-700 dark:text-rose-400"
                                >
                                  {dateErrors.from}
                                </span>
                              )}
                            </label>
                            <label className="field-label">
                              Through date
                              <input
                                type="date"
                                aria-invalid={!!dateErrors.to}
                                aria-describedby={dateErrors.to ? 'to-date-error' : undefined}
                                value={filters.to}
                                onChange={(event) => changeFilter('to', event.target.value)}
                              />
                              {dateErrors.to && (
                                <span
                                  id="to-date-error"
                                  className="mt-2 block text-xs text-rose-700 dark:text-rose-400"
                                >
                                  {dateErrors.to}
                                </span>
                              )}
                            </label>
                            {(filters.status ||
                              filters.from ||
                              filters.to ||
                              filters.sort !== 'checkedAt:desc') && (
                              <button
                                className="justify-self-start text-xs font-medium text-blue-700 dark:text-blue-400"
                                onClick={() => {
                                  setFilters({
                                    status: '',
                                    from: '',
                                    to: '',
                                    sort: 'checkedAt:desc',
                                  });
                                  setPage(1);
                                }}
                              >
                                Reset filters and sorting
                              </button>
                            )}
                          </div>
                        }
                      />
                    ),
                  },
                ]}
              />
            </RecordWorkspace>
            <div className="flex flex-wrap items-center justify-between gap-3 pt-4">
              <p className="text-xs text-slate-400">Created {dateTime(monitor.createdAt)}</p>
              <AdminOnly>
                {confirmDelete ? (
                  <Modal
                    title="Delete Monitor?"
                    onClose={() => setConfirmDelete(false)}
                    busy={busy}
                    footer={
                      <>
                        <button
                          type="button"
                          className="btn-secondary"
                          disabled={busy}
                          onClick={() => setConfirmDelete(false)}
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          className="btn-danger"
                          disabled={busy}
                          onClick={() => change(true)}
                        >
                          Delete monitor
                        </button>
                      </>
                    }
                  >
                    <p>Delete this monitor and its history?</p>
                  </Modal>
                ) : null}
              </AdminOnly>
            </div>
          </>
        )
      )}
    </>
  );
}
