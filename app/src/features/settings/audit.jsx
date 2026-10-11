import { DateTime } from '../../preferences/date-time.jsx';
import React from 'react';
import { DataTable } from '../../components/data-table.jsx';
import { displayValue } from '../../lib/display-value.js';

/** Read-only workspace history; every query and export is authorized and paged by the API. */
export function AuditPage() {
  const columns = [
    {
      key: 'createdAt',
      label: 'Time',
      value: (row) => row.createdAt,
      render: (row) => <DateTime value={row.createdAt} />,
    },
    { key: 'actor', label: 'Performed by', value: (row) => row.actor },
    {
      key: 'action',
      label: 'Action',
      value: (row) => row.action,
      render: (row) => displayValue(row.action),
    },
    {
      key: 'recordType',
      label: 'Record type',
      value: (row) => row.recordType,
      render: (row) => displayValue(row.recordType),
    },
    { key: 'recordId', label: 'Record ID', value: (row) => row.recordId || '—' },
    { key: 'fields', label: 'Submitted fields', value: (row) => row.fields || '—' },
    {
      key: 'outcome',
      label: 'Outcome',
      value: (row) => row.outcome,
      render: (row) => (
        <span className={row.outcome === 'success' ? 'badge badge-up' : 'badge badge-down'}>
          {displayValue(row.outcome)}
        </span>
      ),
    },
    { key: 'actualRole', label: 'Account role', value: (row) => row.actualRole },
    { key: 'effectiveRole', label: 'Acting role', value: (row) => row.effectiveRole },
    { key: 'source', label: 'Source', value: (row) => row.source },
    { key: 'operation', label: 'Operation', value: (row) => row.operation },
    { key: 'statusCode', label: 'HTTP Status', value: (row) => row.statusCode },
    { key: 'actorId', label: 'Actor ID', value: (row) => row.actorId },
    { key: 'parentId', label: 'Parent record ID', value: (row) => row.parentId },
    { key: 'requestId', label: 'Request ID', value: (row) => row.requestId },
  ];
  return (
    <div className="list-page">
      <DataTable
        fullPage
        source="audit"
        title="Audit Log"
        columns={columns}
        defaultSort="createdAt:desc"
        dateColumn="createdAt"
        filename="audit-log.csv"
        description="Activity recorded from the time auditing was enabled. Field values and secrets are excluded."
      />
    </div>
  );
}
