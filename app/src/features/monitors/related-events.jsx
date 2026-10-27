import React from 'react';
import { DataTable } from '../../components/data-table.jsx';
import { RecordTabs } from '../../components/record-tabs.jsx';
import { ReferenceValue } from '../../components/reference-value.jsx';
import { EventsTable } from './events.jsx';
import { DateTime } from '../../preferences/date-time.jsx';

/** Fetch only the active relationship panel; the server owns paging and counts. */
export function EventRelatedLists({ eventId, alertId, details, selectedId, onSelect }) {
  const query = new URLSearchParams(eventId ? { eventId } : { alertId });
  return (
    <RecordTabs
      related
      details={details}
      selectedId={selectedId}
      onSelect={onSelect}
      lazy
      tabs={[
        {
          id: 'incidents',
          label: 'Incidents',
          content: (
            <DataTable
              source={`event-incidents?${query}`}
              title="Related Incidents"
              defaultSort="createdAt:desc"
              dateColumn="createdAt"
              columns={[
                {
                  key: 'number',
                  label: 'Number',
                  value: (row) => row.number,
                  render: (row) => (
                    <ReferenceValue
                      type="incidents"
                      id={row.id}
                      label={row.number || row.title}
                      showIcon={false}
                    />
                  ),
                },
                {
                  key: 'title',
                  label: 'Title',
                  value: (row) => row.title,
                  render: (row) => (
                    <ReferenceValue type="incidents" id={row.id} label={row.title} />
                  ),
                },
                { key: 'status', label: 'Status', value: (row) => row.status },
                { key: 'severity', label: 'Severity', value: (row) => row.severity },
                {
                  key: 'createdAt',
                  label: 'Created',
                  value: (row) => row.createdAt,
                  render: (row) => <DateTime value={row.createdAt} />,
                },
              ]}
            />
          ),
        },
        ...(eventId
          ? [
              {
                id: 'alerts',
                label: 'Alerts',
                content: <EventsTable related alertsView eventId={eventId} />,
              },
            ]
          : []),
        ...(alertId
          ? [{ id: 'events', label: 'Events', content: <EventsTable related alertId={alertId} /> }]
          : []),
      ]}
    />
  );
}
