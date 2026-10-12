import React, { useEffect, useState } from 'react';
import { useResource } from '../data/use-resource.js';
import { downloadCsv } from '../lib/csv-download.js';
import { TableSearch } from './table-search.jsx';
import { dateRangeErrors } from '../../../shared/validation/form-validation.js';

/** Keep only query controls in the browser; the server owns filtering, ordering, totals and exports. */
export function ServerTable({ source, render: View, ...props }) {
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState(
    props.defaultSort || `${props.columns.find((c) => c.sortable !== false).key}:asc`,
  );
  const [page, setPage] = useState(1),
    [pageSize, setSize] = useState(10);
  const [from, setFrom] = useState(''),
    [to, setTo] = useState('');
  const [sortBy, order] = sort.split(':');
  const [kind, scope = ''] = source.split('?');
  const params = new URLSearchParams(scope);
  for (const [key, value] of Object.entries({
    search,
    searchColumn: '',
    sortBy,
    order,
    page,
    pageSize,
    from,
    to,
  }))
    params.set(key, String(value));
  const invalid = Object.keys(dateRangeErrors(from, to)).length > 0;
  const path = `/tables/${kind}?${params}`;
  const resource = useResource(invalid ? null : path, 30000);
  useEffect(() => {
    if (resource.data && page > Math.max(1, Math.ceil(resource.data.total / pageSize)))
      setPage(Math.max(1, Math.ceil(resource.data.total / pageSize)));
  }, [resource.data, page, pageSize]);
  const change = (setter) => (value) => {
    setter(value);
    setPage(1);
  };
  return (
    <>
      {resource.error && (
        <p role="alert" className="text-rose-700 dark:text-rose-400">
          {resource.error}
        </p>
      )}
      <View
        {...props}
        source={source}
        rows={resource.data?.rows ?? []}
        loading={!resource.data && resource.loading}
        columns={props.columns.map((column) => ({
          ...column,
          value: (row) => (Object.hasOwn(row, column.key) ? row[column.key] : column.value(row)),
        }))}
        filters={
          <div className="flex flex-wrap items-end gap-4">
            <TableSearch search={search} onSearch={change(setSearch)} />
            {props.dateColumn && (
              <>
                <label className="field-label">
                  From
                  <input
                    type="date"
                    value={from}
                    onChange={(e) => change(setFrom)(e.target.value)}
                  />
                </label>
                <label className="field-label">
                  To
                  <input type="date" value={to} onChange={(e) => change(setTo)(e.target.value)} />
                </label>
                {invalid && <p role="alert">Choose a valid date range.</p>}
              </>
            )}
            {props.filters}
            {(search || from || to || props.filtersActive) && (
              <button
                type="button"
                className="text-xs text-blue-700 dark:text-blue-400"
                onClick={() => {
                  props.onResetFilters?.();
                  setSearch('');
                  setFrom('');
                  setTo('');
                  setPage(1);
                  setSort(props.defaultSort || `${props.columns[0].key}:asc`);
                }}
              >
                Reset filters and sorting
              </button>
            )}
          </div>
        }
        remote={{
          page,
          pageSize,
          total: resource.data?.total ?? 0,
          sort,
          pending: resource.pending,
          invalid,
          filtersActive: !!(search || from || to || props.filtersActive),
          onPage: setPage,
          onPageSize: change(setSize),
          onSort: change(setSort),
          onRefresh: resource.refresh,
          onReset: () => {
            setSearch('');
            setFrom('');
            setTo('');
            setSort(
              props.defaultSort || `${props.columns.find((c) => c.sortable !== false).key}:asc`,
            );
            setPage(1);
          },
          onExport: (signal) =>
            downloadCsv(`${path}&export=csv`, props.filename || `${kind}.csv`, signal),
        }}
      />
    </>
  );
}
