import { AdminOnly } from '../../auth/role-gates.jsx';
import { PlusIcon } from '@heroicons/react/24/outline';
import { Link, useSearchParams } from 'react-router-dom';
import React, { useState } from 'react';
import { DataTable } from '../../components/data-table.jsx';
import { ReferenceField } from '../../components/forms/reference-field.jsx';
import { Select } from '../../components/forms/select.jsx';
import { DateTime } from '../../preferences/date-time.jsx';
import { Badge } from '../../components/feedback.jsx';

/** Retained checks across the workspace, with server filtering and record links. */
export function EventsPage() {
  const [params] = useSearchParams();
  const [serviceId, setService] = useState(params.get('serviceId') || '');
  const [monitorId, setMonitor] = useState('');
  const [status, setStatus] = useState(params.get('status') || '');
  const query = new URLSearchParams({ serviceId, monitorId, status });
  return (
    <div className="list-page">
      <DataTable
        fullPage
        title="Events"
        actions={
          <AdminOnly>
            <Link
              className="btn-primary"
              to={`/monitors/new${serviceId ? `?serviceId=${encodeURIComponent(serviceId)}` : ''}`}
            >
              <PlusIcon className="h-5 w-5 shrink-0" aria-hidden="true" />
              Create Monitor
            </Link>
          </AdminOnly>
        }
        source={`events?${query}`}
        filename="events.csv"
        dateColumn="checkedAt"
        filtersActive={!!(serviceId || monitorId || status)}
        onResetFilters={() => {
          setService('');
          setMonitor('');
          setStatus('');
        }}
        defaultSort="checkedAt:desc"
        rowHref={(row) => `/monitors/${row.monitorId}/events/${row.id}`}
        description="Monitor checks retained for the last 30 days."
        filters={
          <div className="flex flex-wrap items-end gap-4">
            <ReferenceField
              label="Service"
              referenceType="services"
              value={serviceId}
              onChange={setService}
            />
            <ReferenceField
              label="Monitor"
              referenceType="monitors"
              value={monitorId}
              onChange={setMonitor}
            />
            <label className="field-label">
              Outcome
              <Select
                aria-label="Outcome"
                value={status}
                onChange={(event) => setStatus(event.target.value)}
              >
                <option value="">All outcomes</option>
                <option value="up">Operational</option>
                <option value="down">Down</option>
              </Select>
            </label>
          </div>
        }
        columns={[
          {
            key: 'checkedAt',
            label: 'Checked At',
            value: (row) => row.checkedAt,
            render: (row) => <DateTime value={row.checkedAt} />,
          },
          { key: 'monitorName', label: 'Monitor', value: (row) => row.monitorName },
          { key: 'serviceName', label: 'Service', value: (row) => row.serviceName },
          {
            key: 'status',
            label: 'Outcome',
            value: (row) => row.status,
            render: (row) => <Badge status={row.status} />,
          },
          {
            key: 'statusCode',
            label: 'HTTP Status',
            value: (row) => row.statusCode ?? 'No response',
          },
          { key: 'durationMs', label: 'Duration (ms)', value: (row) => row.durationMs },
          { key: 'error', label: 'Error', value: (row) => row.error || '—' },
        ]}
      />
    </div>
  );
}
