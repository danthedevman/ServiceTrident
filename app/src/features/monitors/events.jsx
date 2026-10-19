import { useListFilter } from '../../data/use-list-filter.js';
import { displayValue } from '../../lib/display-value.js';
import { ReferenceValue } from '../../components/reference-value.jsx';
import { AdminOnly } from '../../auth/role-gates.jsx';
import { PlusIcon } from '@heroicons/react/24/outline';
import { Link, useSearchParams } from 'react-router-dom';
import React from 'react';
import { DataTable } from '../../components/data-table.jsx';
import { ReferenceField } from '../../components/forms/reference-field.jsx';
import { Select } from '../../components/forms/select.jsx';
import { DateTime } from '../../preferences/date-time.jsx';
import { Badge } from '../../components/feedback.jsx';

/** Retained checks across the workspace, with server filtering and record links. */
export function EventsPage() {
  return <EventsTable />;
}

export function AlertsPage() {
  return <EventsTable alertsView />;
}

export function EventsTable({
  alertId = '',
  eventId = '',
  relatedIncidentId = '',
  related = false,
  alertsView = false,
}) {
  const [params] = useSearchParams();
  const alerts = alertsView;
  const [sourceType, setSourceType] = useListFilter(
    'sourceType',
    params.get('sourceType') || '',
    alerts ? 'event-alerts' : 'events',
  );
  const [severity, setSeverity] = useListFilter('severity', '', alerts ? 'event-alerts' : 'events');
  const [eventType, setEventType] = useListFilter(
    'eventType',
    '',
    alerts ? 'event-alerts' : 'events',
  );
  const [serviceId, setService] = useListFilter(
    'serviceId',
    params.get('serviceId') || '',
    alerts ? 'event-alerts' : 'events',
  );
  const [monitorId, setMonitor] = useListFilter(
    'monitorId',
    '',
    alerts ? 'event-alerts' : 'events',
  );
  const [incidentId, setIncident] = useListFilter(
    'incidentId',
    params.get('incidentId') || '',
    alerts ? 'event-alerts' : 'events',
  );
  const [status, setStatus] = useListFilter(
    'status',
    params.get('status') || '',
    alerts ? 'event-alerts' : 'events',
  );
  const query = new URLSearchParams({
    serviceId,
    monitorId,
    status,
    incidentId: relatedIncidentId || incidentId,
    eventId,
    sourceType,
    severity,
    alertId,
    eventType,
  });
  return (
    <div className={related ? undefined : 'list-page'}>
      <DataTable
        key={alerts ? 'alerts' : 'events'}
        fullPage={!related}
        tableClassName={alerts ? 'w-full min-w-[1100px] table-fixed text-left text-sm' : undefined}
        title={alerts ? 'Alerts' : 'Events'}
        actions={
          !related &&
          !alerts && (
            <AdminOnly>
              <Link
                className="btn-primary"
                to={`/monitors/new${serviceId ? `?serviceId=${encodeURIComponent(serviceId)}` : ''}`}
              >
                <PlusIcon className="h-5 w-5 shrink-0" aria-hidden="true" />
                Create Monitor
              </Link>
            </AdminOnly>
          )
        }
        source={`${alerts ? 'event-alerts' : 'events'}?${query}`}
        filename="events.csv"
        dateColumn={alerts ? 'lastOccurredAt' : 'checkedAt'}
        filtersActive={
          !!(serviceId || monitorId || status || incidentId || sourceType || severity || eventType)
        }
        onResetFilters={() => {
          setService('');
          setMonitor('');
          setIncident('');
          setStatus('');
          setSourceType('');
          setSeverity('');
          setEventType('');
        }}
        defaultSort={alerts ? 'lastOccurredAt:desc' : 'checkedAt:desc'}
        rowHref={(row) =>
          alerts
            ? `/alerts/${row.id}`
            : row.monitorId
              ? `/monitors/${row.monitorId}/events/${row.id}`
              : `/events/${row.id}`
        }
        description={
          alerts
            ? 'Correlated signals that need attention. Filter by state to review resolved alerts.'
            : 'Monitor and external events retained for the last 30 days.'
        }
        filters={
          <div className="table-filter-fields">
            <ReferenceField
              label="Service"
              referenceType="services"
              value={serviceId}
              onChange={setService}
            />
            {!alerts && (
              <ReferenceField
                label="Monitor"
                referenceType="monitors"
                value={monitorId}
                onChange={setMonitor}
              />
            )}
            {!alerts && (
              <ReferenceField
                label="Incident"
                referenceType="incidents"
                value={incidentId}
                onChange={setIncident}
              />
            )}
            <label className="field-label">
              {alerts ? 'State' : 'Outcome'}
              <Select
                aria-label={alerts ? 'Alert State' : 'Outcome'}
                value={status}
                onChange={(event) => setStatus(event.target.value)}
              >
                {alerts ? (
                  <>
                    <option value="">Active alerts</option>
                    <option value="open">Open</option>
                    <option value="acknowledged">Acknowledged</option>
                    <option value="resolved">Resolved</option>
                  </>
                ) : (
                  <>
                    <option value="">All outcomes</option>
                    <option value="up">Operational / Recovery</option>
                    <option value="down">Failure / Firing</option>
                  </>
                )}
              </Select>
            </label>
            <label className="field-label">
              Source
              <Select
                aria-label="Event Source"
                value={sourceType}
                onChange={(e) => setSourceType(e.target.value)}
              >
                <option value="">All sources</option>
                <option value="monitor">Monitor</option>
                <option value="external">External</option>
              </Select>
            </label>
            {!alerts && (
              <label className="field-label">
                Type
                <Select
                  aria-label="Event Type"
                  value={eventType}
                  onChange={(e) => setEventType(e.target.value)}
                >
                  <option value="">All types</option>
                  {['check', 'alert', 'change', 'information'].map((value) => (
                    <option key={value} value={value}>
                      {value[0].toUpperCase() + value.slice(1)}
                    </option>
                  ))}
                </Select>
              </label>
            )}
            <label className="field-label">
              Severity
              <Select
                aria-label="Event Severity"
                value={severity}
                onChange={(e) => setSeverity(e.target.value)}
              >
                <option value="">All severities</option>
                {['critical', 'high', 'medium', 'low', 'info'].map((value) => (
                  <option key={value} value={value}>
                    {value[0].toUpperCase() + value.slice(1)}
                  </option>
                ))}
              </Select>
            </label>
          </div>
        }
        columns={
          alerts
            ? [
                { key: 'title', label: 'Title', className: 'truncate', value: (row) => row.title },
                {
                  key: 'severity',
                  label: 'Severity',
                  width: '6rem',
                  value: (row) => row.severity,
                  render: (row) => <Badge status={row.severity} />,
                },
                {
                  key: 'status',
                  label: 'State',
                  width: '8rem',
                  value: (row) => row.status,
                  render: (row) => <Badge status={row.status} />,
                },
                {
                  key: 'serviceName',
                  label: 'Service',
                  width: '9rem',
                  value: (row) => row.serviceName,
                  render: (row) => (
                    <ReferenceValue type="services" id={row.serviceId} label={row.serviceName} />
                  ),
                },
                {
                  key: 'sourceName',
                  label: 'Source',
                  width: '9rem',
                  className: 'truncate',
                  value: (row) => row.sourceName,
                },
                {
                  key: 'lastOccurredAt',
                  label: 'Last Event',
                  width: '10rem',
                  value: (row) => row.lastOccurredAt,
                  render: (row) => <DateTime value={row.lastOccurredAt} />,
                },
              ]
            : [
                { key: 'title', label: 'Title', value: (row) => row.title || row.monitorName },
                {
                  key: 'sourceType',
                  label: 'Source Type',
                  value: (row) => row.sourceType || 'monitor',
                  render: (row) => displayValue(row.sourceType || 'monitor'),
                },
                {
                  key: 'eventType',
                  label: 'Type',
                  value: (row) => row.eventType || 'check',
                  render: (row) => displayValue(row.eventType || 'check'),
                },
                {
                  key: 'severity',
                  label: 'Severity',
                  value: (row) => row.severity || (row.status === 'down' ? 'high' : 'info'),
                  render: (row) => (
                    <Badge status={row.severity || (row.status === 'down' ? 'high' : 'info')} />
                  ),
                },
                ...['externalId', 'correlationKey', 'signal', 'region'].map((key) => ({
                  key,
                  label: {
                    externalId: 'External ID',
                    correlationKey: 'Correlation Key',
                    signal: 'Signal',
                    region: 'Region',
                  }[key],
                  value: (row) => row[key] || '—',
                })),
                ...['occurredAt', 'receivedAt'].map((key) => ({
                  key,
                  label: key === 'occurredAt' ? 'Occurred At' : 'Received At',
                  value: (row) => row[key],
                  render: (row) => (row[key] ? <DateTime value={row[key]} /> : '—'),
                })),
                {
                  key: 'checkedAt',
                  label: 'Checked At',
                  value: (row) => row.checkedAt,
                  render: (row) => <DateTime value={row.checkedAt} />,
                },
                {
                  key: 'sourceName',
                  label: 'Source',
                  value: (row) => row.sourceName || row.monitorName,
                  render: (row) =>
                    row.monitorId ? (
                      <ReferenceValue
                        type="monitors"
                        id={row.monitorId}
                        label={row.sourceName || row.monitorName}
                      />
                    ) : (
                      <span>{row.sourceName}</span>
                    ),
                },
                {
                  key: 'serviceName',
                  label: 'Service',
                  value: (row) => row.serviceName,
                  render: (row) => (
                    <ReferenceValue type="services" id={row.serviceId} label={row.serviceName} />
                  ),
                },
                {
                  key: 'incidentTitles',
                  label: 'Incident',
                  sortable: false,
                  value: (row) => row.incidentTitles || '—',
                  render: (row) =>
                    row.incidents?.length ? (
                      <div className="space-y-1">
                        {row.incidents.map((incident) => (
                          <div key={incident.id}>
                            <ReferenceValue
                              type="incidents"
                              id={incident.id}
                              label={incident.number || incident.title}
                            />
                          </div>
                        ))}
                        {row.incidentsTruncated && (
                          <span className="field-hint">Showing the latest 100 incidents</span>
                        )}
                      </div>
                    ) : (
                      '—'
                    ),
                },
                {
                  key: 'status',
                  label: 'Outcome',
                  value: (row) => row.status,
                  render: (row) => (
                    <Badge status={row.sourceType === 'external' ? row.signal : row.status} />
                  ),
                },
                {
                  key: 'statusCode',
                  label: 'HTTP Status',
                  value: (row) =>
                    row.sourceType === 'external' ? '—' : (row.statusCode ?? 'No response'),
                },
                { key: 'durationMs', label: 'Duration (ms)', value: (row) => row.durationMs },
                { key: 'error', label: 'Error', value: (row) => row.error || '—' },
              ]
        }
      />
    </div>
  );
}
