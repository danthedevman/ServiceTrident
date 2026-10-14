import { DateTime, useDateTime } from '../preferences/date-time.jsx';
import { isTimestampField } from '../lib/date-time.js';
import { RecordLink } from './record-navigation.jsx';
import { BreadcrumbTitleContext, PageTitle } from './page-title.jsx';
import { RecordHeader } from './record-actions.jsx';
import { useUiPreferences } from '../preferences/ui-preferences.jsx';
import { Skeleton } from './skeleton.jsx';
import { RelatedListContext } from './record-tabs.jsx';
import { Toggle } from './forms/toggle.jsx';
import { Select } from './forms/select.jsx';
import { ServerTable } from './server-table.jsx';
import { useContext } from 'react';
import { AuthContext } from '../auth/auth-context.js';
import { TableFilterPanel } from './table-filter-panel.jsx';
import { Modal } from './modal.jsx';
import { writeApi } from '../data/query-client.js';
import { ActionMenu } from './action-menu.jsx';
import React, { useEffect, useRef, useState } from 'react';
import {
  FunnelIcon,
  AdjustmentsHorizontalIcon,
  ArrowDownTrayIcon,
  ArrowUpIcon,
  ArrowDownIcon,
  ArrowsUpDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronDoubleLeftIcon,
  ChevronDoubleRightIcon,
} from '@heroicons/react/24/outline';
import { RefreshButton } from './icon-button.jsx';
import { toCsv } from '../../../shared/files/csv.js';
import { saveCsv } from '../lib/csv-download.js';
import { Link, useLocation } from 'react-router-dom';
import { TableColumns } from './table-columns.jsx';
import { tableRecordLink } from '../lib/table-record-link.js';
import { ArrowTopRightOnSquareIcon } from '@heroicons/react/24/outline';

/** One table for server-paged records. Filtering, sorting and exports execute on the server.
 * Columns define plain values for sorting/filtering/CSV and optional safe React rendering.
 * @param {{title: string, columns: Array<object>, fullPage?: boolean, actions?: React.ReactNode, toolbar?: React.ReactNode, rows?: Array<object>, remote?: object, filters?: React.ReactNode, defaultSort?: string, dateColumn?: string, filename?: string, description?: string, tableClassName?: string, rowKey?: Function}} props
 */
export function DataTable(props) {
  if (!props.source && !props.remote)
    throw new Error('DataTable requires a server source or remote pagination.');
  return props.source ? (
    <ServerTable {...props} render={DataTableView} />
  ) : (
    <DataTableView {...props} />
  );
}

function DataTableView({
  source,
  rowHref,
  deletePath,
  onDeleteRow,
  onRefresh,
  fullPage = false,
  loading = false,
  actions,
  secondaryActions,
  toolbar,
  title,
  columns: providedColumns,
  rows = [],
  remote,
  filters,
  filename = 'table.csv',
  description,
  tableClassName = 'w-full min-w-[520px] text-left text-sm',
  rowKey = (row) => row.id ?? JSON.stringify(row),
}) {
  const numbered =
    !!rowHref ||
    [
      'incidents',
      'tasks',
      'knowledge',
      'services',
      'collections',
      'monitors',
      'members',
      'groups',
      'integrations',
      'coverage',
      'events',
      'incident-monitor-events',
      'incident-knowledge',
      'priority-incidents',
      'priority-tasks',
      'impacted-services',
    ].includes(source?.split('?')[0]);
  const columns =
    numbered && !providedColumns.some((column) => column.key === 'number')
      ? [
          {
            key: 'number',
            label: 'Record Number',
            value: (row) => row.number || '—',
            sortable: false,
          },
          ...providedColumns,
        ]
      : providedColumns;
  const formatDate = useDateTime();
  const related = useContext(RelatedListContext);
  const breadcrumbTitle = useContext(BreadcrumbTitleContext);
  const { user } = useContext(AuthContext);
  const { pathname } = useLocation();
  const { tableLayouts, setTableLayout, compactTables, setPreference } = useUiPreferences();
  const filtersAnchor = useRef(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const viewKey =
    `${pathname.replace(/\/[a-f\d]{24}(?=\/|$)/gi, '/record')}::${source?.split('?')[0] || filename}::${title}`
      .replace(/[^a-zA-Z0-9/_:-]/g, '-')
      .slice(0, 200);
  const columnLayout = tableLayouts[viewKey] ?? { order: [], hidden: [] };
  const setColumnLayout = (update) => setTableLayout(viewKey, update);
  const orderedColumns = [
    ...columnLayout.order
      .map((key) => columns.find((column) => column.key === key))
      .filter(Boolean),
    ...columns.filter((column) => !columnLayout.order.includes(column.key)),
  ];
  const shownColumns = orderedColumns.filter((column) => !columnLayout.hidden.includes(column.key));
  const recordHref = (row) => (rowHref ? rowHref(row) : tableRecordLink(source, deletePath, row));
  const [selection, setSelection] = useState({ scope: '', ids: new Set() });
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [confirmRows, setConfirmRows] = useState(null);
  const Heading = fullPage ? 'h1' : 'h2';
  const [exporting, setExporting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [exportError, setExportError] = useState('');
  const controller = useRef(null);
  useEffect(() => () => controller.current?.abort(), []);
  const invalid = remote.invalid;
  const size = remote.pageSize;
  const total = remote.total;
  const pages = Math.max(1, Math.ceil(total / size));
  const current = remote.page;
  const visible = rows;
  const initialLoading = (loading || remote.loading) && rows.length === 0;
  const keys = visible.map((row, index) => String(rowKey(row, index)));
  const scope = JSON.stringify(keys);
  const selected = selection.scope === scope ? selection.ids : new Set();
  const selectedRows = visible.filter((row, index) => selected.has(keys[index]));
  const allSelected = visible.length > 0 && selectedRows.length === visible.length;
  /** Selection is scoped to the visible page, preventing hidden rows from being deleted. */
  function selectRow(key, checked) {
    const ids = new Set(selected);
    if (checked) ids.add(key);
    else ids.delete(key);
    setSelection({ scope, ids });
  }
  async function deleteSelected() {
    if (deleting) return;
    setDeleting(true);
    setDeleteError('');
    let count = 0;
    try {
      for (const row of confirmRows) {
        if (onDeleteRow) await onDeleteRow(row);
        else
          await writeApi(`${deletePath}/${encodeURIComponent(row.id)}`, {
            method: 'DELETE',
            body: { revision: row.revision },
          });
        count++;
      }
      setSelection({ scope: '', ids: new Set() });
      setConfirmRows(null);
    } catch (error) {
      setConfirmRows((current) => current.slice(count));
      setDeleteError(`${count ? `${count} deleted. ` : ''}${error.message}`);
    } finally {
      setDeleting(false);
    }
  }
  const activeSort = remote.sort ?? '';
  const [sortKey, direction] = activeSort.split(':');
  const filtersActive = Boolean(remote.filtersActive);
  const busy = (remote?.pending ?? false) || refreshing;
  function changeSort(value) {
    remote.onSort(value);
  }
  /** Snapshot the current filters on click; cancellation prevents downloads after leaving the page. */
  async function exportRows() {
    setExporting(true);
    setExportError('');
    const pending = new AbortController();
    controller.current = pending;
    try {
      await remote.onExport(pending.signal);
    } catch (error) {
      if (!pending.signal.aborted) setExportError(error.message);
    } finally {
      if (!pending.signal.aborted) setExporting(false);
    }
  }
  const Toolbar = fullPage ? RecordHeader : React.Fragment;
  return (
    <section
      className={
        fullPage
          ? 'data-table list-table'
          : related
            ? 'data-table related-table overflow-hidden'
            : 'data-table panel overflow-hidden'
      }
      data-compact={compactTables}
    >
      <Toolbar>
        <div
          className={
            fullPage
              ? 'flex items-center gap-2'
              : `flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 ${related ? 'px-4 py-3' : 'px-6 py-5'}`
          }
        >
          {(!fullPage || !breadcrumbTitle || description) && (
            <div className={related || fullPage ? 'sr-only' : undefined}>
              {fullPage ? (
                <PageTitle>{title}</PageTitle>
              ) : (
                <Heading className="font-semibold">{title}</Heading>
              )}
              {description && <p className="mt-1 text-xs text-slate-400">{description}</p>}
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <TableColumns
              columns={orderedColumns}
              hidden={columnLayout.hidden}
              onToggle={(key) =>
                setColumnLayout((value) => ({
                  ...value,
                  hidden: value.hidden.includes(key)
                    ? value.hidden.filter((item) => item !== key)
                    : [...value.hidden, key],
                }))
              }
              onMove={(index, offset) => {
                const order = orderedColumns.map((column) => column.key);
                [order[index], order[index + offset]] = [order[index + offset], order[index]];
                setColumnLayout((value) => ({ ...value, order }));
              }}
              onReset={() => setColumnLayout(null)}
            />
            <button
              type="button"
              className="btn-secondary table-filter-toggle gap-2"
              ref={filtersAnchor}
              aria-label="Filters"
              title="Filters"
              aria-expanded={filtersOpen}
              aria-pressed={filtersOpen}
              aria-haspopup="dialog"
              onClick={() => setFiltersOpen(true)}
            >
              <FunnelIcon className="h-5 w-5" aria-hidden="true" />
              {filtersActive && (
                <span className="rounded-full bg-blue-100 px-2 text-xs text-blue-800 dark:bg-blue-950 dark:text-blue-200">
                  Active
                </span>
              )}
            </button>
            {(remote?.onRefresh || onRefresh) && (
              <RefreshButton
                busy={busy}
                onClick={async () => {
                  setRefreshing(true);
                  setExportError('');
                  try {
                    await (remote?.onRefresh || onRefresh)();
                  } catch (error) {
                    setExportError(error.message);
                  } finally {
                    setRefreshing(false);
                  }
                }}
                label={`Refresh ${title.toLowerCase()}`}
              />
            )}
            <ActionMenu label={`${title} actions`}>
              {secondaryActions}
              {fullPage &&
                user?.role === 'admin' &&
                ['/incidents', '/tasks', '/knowledge'].includes(deletePath) && (
                  <Link to={`${deletePath}/fields`}>
                    <AdjustmentsHorizontalIcon className="h-5 w-5" aria-hidden="true" />
                    Form Builder
                  </Link>
                )}
              <label className="table-density-toggle flex cursor-pointer items-center justify-between gap-4 rounded px-3 py-2.5 text-sm hover:bg-blue-50 dark:hover:bg-slate-800">
                <span>Compact Rows</span>
                <Toggle
                  checked={compactTables}
                  onChange={(event) => setPreference('compactTables', event.target.checked)}
                />
              </label>
              <button
                type="button"
                className="btn-secondary gap-2"
                disabled={exporting || busy || invalid}
                onClick={exportRows}
                title="Export All Filtered Rows, Across All Pages"
              >
                <ArrowDownTrayIcon className="h-5 w-5" aria-hidden="true" />
                {exporting ? 'Exporting…' : 'Export CSV'}
              </button>
            </ActionMenu>
            {actions}
          </div>
        </div>
      </Toolbar>
      {toolbar}
      {filtersOpen && (
        <TableFilterPanel
          title="Filter"
          anchorRef={filtersAnchor}
          onClose={() => setFiltersOpen(false)}
        >
          {filters}
        </TableFilterPanel>
      )}
      {exportError && (
        <p role="alert" className="px-6 py-3 text-sm text-rose-700 dark:text-rose-400">
          {exportError}
        </p>
      )}
      {selectedRows.length > 0 && (
        <div
          role="group"
          aria-label="Selected record actions"
          className="flex shrink-0 flex-wrap items-center gap-3 border-b border-slate-200 px-6 py-3 dark:border-slate-800"
        >
          <span className="self-center text-xs" role="status">
            {selectedRows.length} selected
          </span>
          <button
            type="button"
            className="btn-secondary"
            onClick={() =>
              saveCsv(
                new Blob([toCsv(selectedRows, columns)], { type: 'text/csv;charset=utf-8' }),
                filename.replace(/\.csv$/, '-selected.csv'),
              )
            }
          >
            Export selected
          </button>
          {user?.role === 'admin' && (deletePath || onDeleteRow) && (
            <button
              type="button"
              className="btn-danger"
              disabled={deleting}
              onClick={() => {
                setDeleteError('');
                setConfirmRows([...selectedRows]);
              }}
            >
              Delete selected
            </button>
          )}
        </div>
      )}
      {invalid ? (
        <p role="alert" className="p-6 text-sm text-rose-700 dark:text-rose-400">
          Correct the date range to load records.
        </p>
      ) : (
        <div
          className="table-rows loading-content overflow-x-auto"
          aria-busy={busy || initialLoading}
        >
          <table className={tableClassName}>
            <caption className="sr-only">
              {title}
              {initialLoading ? ' — Loading rows…' : ''}
            </caption>
            <colgroup>
              <col style={{ width: '3rem' }} />
              <col style={{ width: '3rem' }} />
              {shownColumns.map((column) => (
                <col key={column.key} style={column.width ? { width: column.width } : undefined} />
              ))}
            </colgroup>
            <thead>
              <tr>
                <th scope="col">
                  <input
                    type="checkbox"
                    aria-label="Select All Rows on This Page"
                    title="Select All Rows on This Page"
                    checked={allSelected}
                    disabled={initialLoading || !visible.length || deleting}
                    ref={(node) => {
                      if (node) node.indeterminate = selectedRows.length > 0 && !allSelected;
                    }}
                    onChange={(event) =>
                      setSelection({ scope, ids: event.target.checked ? new Set(keys) : new Set() })
                    }
                  />
                </th>
                <th scope="col">
                  <span className="sr-only">Open Record</span>
                </th>
                {shownColumns.map((column) => (
                  <th
                    key={column.key}
                    scope="col"
                    aria-sort={
                      column.sortable === false
                        ? undefined
                        : sortKey === column.key
                          ? direction === 'asc'
                            ? 'ascending'
                            : 'descending'
                          : 'none'
                    }
                  >
                    {column.sortable === false ? (
                      column.label
                    ) : (
                      <button
                        className="inline-flex items-center gap-1"
                        onClick={() =>
                          changeSort(
                            `${column.key}:${sortKey === column.key && direction === 'asc' ? 'desc' : 'asc'}`,
                          )
                        }
                      >
                        {column.label}
                        {sortKey === column.key ? (
                          direction === 'asc' ? (
                            <ArrowUpIcon className="h-4 w-4" />
                          ) : (
                            <ArrowDownIcon className="h-4 w-4" />
                          )
                        ) : (
                          <ArrowsUpDownIcon className="h-4 w-4" />
                        )}
                      </button>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {initialLoading ? (
                Array.from({ length: size }, (_, index) => (
                  <tr key={index} aria-hidden="true">
                    <td>
                      <Skeleton className="h-4 w-4" />
                    </td>
                    <td>
                      <Skeleton className="h-4 w-4" />
                    </td>
                    {shownColumns.map((column) => (
                      <td key={column.key} className={column.className}>
                        <Skeleton className="h-5 w-full max-w-48" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : visible.length ? (
                visible.map((row, index) => (
                  <tr key={rowKey(row, index)} aria-selected={selected.has(keys[index])}>
                    <td>
                      <input
                        type="checkbox"
                        aria-label={`Select row ${index + 1}`}
                        checked={selected.has(keys[index])}
                        disabled={deleting}
                        onChange={(event) => selectRow(keys[index], event.target.checked)}
                      />
                    </td>
                    <td>
                      {recordHref(row) ? (
                        <RecordLink
                          to={recordHref(row)}
                          recordLabel={row.title || row.name || row.displayName || row.email}
                          className="inline-flex rounded p-2 text-blue-700 hover:bg-blue-50 dark:text-blue-300 dark:hover:bg-slate-800"
                          aria-label={`Open ${row.title || row.name || row.displayName || row.email || 'record'}`}
                          title="Open Record"
                        >
                          <ArrowTopRightOnSquareIcon className="h-4 w-4" aria-hidden="true" />
                        </RecordLink>
                      ) : (
                        <span className="sr-only">No record view</span>
                      )}
                    </td>
                    {shownColumns.map((column) => (
                      <td key={column.key} className={column.className}>
                        {column.key === 'actions' && column.render ? (
                          <RowActions render={column.render} row={row} />
                        ) : column.render ? (
                          <div
                            className="table-cell-value"
                            title={
                              isTimestampField(column.key) && column.value?.(row)
                                ? formatDate(column.value(row))
                                : String(column.value?.(row) ?? '')
                            }
                          >
                            {column.render(row)}
                          </div>
                        ) : (
                          <div
                            className="table-cell-value"
                            title={
                              isTimestampField(column.key) && column.value(row) ? (
                                <DateTime value={column.value(row)} />
                              ) : (
                                String(column.value(row) ?? '—')
                              )
                            }
                          >
                            {isTimestampField(column.key) && column.value(row) ? (
                              <DateTime value={column.value(row)} />
                            ) : (
                              String(column.value(row) ?? '—')
                            )}
                          </div>
                        )}
                      </td>
                    ))}
                  </tr>
                ))
              ) : (
                <tr>
                  <td
                    colSpan={shownColumns.length + 2}
                    className="py-14 text-center text-slate-500"
                  >
                    No matching records.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
      <nav
        aria-label={`${title} pages`}
        className="table-pagination flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 p-4 text-xs dark:border-slate-800"
      >
        <span aria-live="polite">
          {total.toLocaleString()} matching records · Page {current} of {pages}
        </span>
        <label className="flex items-center gap-2">
          Rows per page
          <Select
            className="history-select !mt-0 !w-auto"
            value={size}
            onChange={(event) => {
              const value = Number(event.target.value);
              remote.onPageSize(value);
            }}
          >
            {[10, 25, 50].map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </Select>
        </label>
        <div className="flex gap-2">
          <button
            type="button"
            className="btn-secondary"
            aria-label="Go to First Page"
            title="Go to First Page"
            disabled={current <= 1 || busy || invalid}
            onClick={() => remote.onPage(1)}
          >
            <ChevronDoubleLeftIcon className="h-4 w-4" aria-hidden="true" />
          </button>
          <button
            className="btn-secondary gap-1"
            disabled={current <= 1 || busy || invalid}
            onClick={() => remote.onPage(current - 1)}
          >
            <ChevronLeftIcon className="h-4 w-4" aria-hidden="true" />
            Previous
          </button>
          <button
            className="btn-secondary gap-1"
            disabled={current >= pages || busy || invalid}
            onClick={() => remote.onPage(current + 1)}
          >
            Next
            <ChevronRightIcon className="h-4 w-4" aria-hidden="true" />
          </button>
          <button
            type="button"
            className="btn-secondary"
            aria-label="Go to Last Page"
            title="Go to Last Page"
            disabled={current >= pages || busy || invalid}
            onClick={() => remote.onPage(pages)}
          >
            <ChevronDoubleRightIcon className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </nav>
      {confirmRows && (
        <Modal
          title={`Delete ${confirmRows.length} selected records?`}
          busy={deleting}
          onClose={() => setConfirmRows(null)}
          footer={
            <>
              <button
                type="button"
                className="btn-secondary"
                disabled={deleting}
                onClick={() => setConfirmRows(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn-danger"
                disabled={deleting || !confirmRows.length}
                onClick={deleteSelected}
              >
                {deleting ? 'Deleting…' : 'Delete records'}
              </button>
            </>
          }
        >
          <p>
            This permanently deletes the selected records. Related attachments or history may also
            be removed. This cannot be undone.
          </p>
          <ul className="mt-3 max-h-48 overflow-auto text-sm">
            {confirmRows.map((row, index) => (
              <li key={index}>
                {row.title ||
                  row.name ||
                  row.displayName ||
                  row.email ||
                  `Selected record ${index + 1}`}
              </li>
            ))}
          </ul>
          {deleteError && (
            <p role="alert" className="mt-3 text-rose-700">
              {deleteError}
            </p>
          )}
        </Modal>
      )}
    </section>
  );
}

/** Do not show a row menu when that row has no permitted actions. */
function RowActions({ render, row }) {
  const content = render(row);
  return content ? <ActionMenu label="Record actions">{content}</ActionMenu> : null;
}
