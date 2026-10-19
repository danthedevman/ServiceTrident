import { RecordDetailSection } from '../../components/record-detail-section.jsx';
import { DateTime } from '../../preferences/date-time.jsx';
import { displayValue } from '../../lib/display-value.js';
import React, { useContext } from 'react';
import { Link } from 'react-router-dom';
import { useParams } from 'react-router-dom';
import { useResource } from '../../data/use-resource.js';
import { writeApi } from '../../data/query-client.js';
import { AuthContext } from '../../auth/auth-context.js';
import { RecordWorkspace, RecordMetadata } from '../../components/record-workspace.jsx';
import { ConfirmDeleteButton } from '../../components/confirm-delete-button.jsx';
import { ReferenceValue } from '../../components/reference-value.jsx';
import { ErrorNotice, Loading, Badge } from '../../components/feedback.jsx';
import { EventRelatedLists } from './related-events.jsx';

export function EventAlertDetail() {
  const { id } = useParams(),
    { user } = useContext(AuthContext);
  const state = useResource(`/event-alerts/${id}`),
    item = state.data?.item;
  const canEdit = ['admin', 'responder'].includes(user?.role);
  return (
    <RecordWorkspace
      kind="eventAlerts"
      item={item}
      identityExtra={item ? <Badge status={item.severity} /> : null}
      sidebar={
        item ? (
          <RecordMetadata
            item={item}
            extra={[
              ['Source', item.sourceName],
              ['Source Type', item.sourceType],
              ['Severity', item.severity],
              [
                'Service',
                <ReferenceValue type="services" id={item.serviceId} label={item.serviceName} />,
              ],
            ]}
          />
        ) : null
      }
      secondaryActions={
        item && canEdit ? (
          <>
            {['open', 'acknowledged', 'resolved']
              .filter((status) => status !== item.status)
              .map((status) => (
                <ConfirmDeleteButton
                  key={status}
                  title="Change Alert State"
                  confirmation={`Change this alert to ${status}? This does not change service health or resolve linked incidents.`}
                  confirmLabel="Confirm"
                  busyLabel="Confirm"
                  className="btn-secondary"
                  confirmClassName="btn-primary"
                  onConfirm={async () => {
                    await writeApi(`/event-alerts/${id}`, {
                      method: 'PATCH',
                      body: { status, revision: item.revision, confirm: true },
                    });
                    await state.refresh();
                  }}
                >
                  {status === 'open'
                    ? 'Reopen'
                    : status === 'acknowledged'
                      ? 'Acknowledge'
                      : 'Resolve'}
                </ConfirmDeleteButton>
              ))}
          </>
        ) : null
      }
      actions={
        item && canEdit ? (
          <Link
            className="btn-primary"
            to={`/incidents/new?${new URLSearchParams({ alertId: id, serviceId: item.serviceId || '' })}`}
          >
            Create Incident
          </Link>
        ) : null
      }
    >
      <ErrorNotice>{state.error}</ErrorNotice>
      {state.loading ? (
        <Loading />
      ) : (
        item && (
          <>
            <RecordDetailSection
              title="Alert Details"
              columns={1}
              entries={[
                ['Title', item.title],
                ['Description', item.description],
              ]}
            />
            <RecordDetailSection
              title="Source and Status"
              entries={[
                ['Status', <Badge status={item.status} />],
                ['Severity', <Badge status={item.severity} />],
                ['Source', item.sourceName],
                ['Source Type', displayValue(item.sourceType || 'unknown')],
                [
                  'Service',
                  <ReferenceValue type="services" id={item.serviceId} label={item.serviceName} />,
                ],
                ...(item.monitorId
                  ? [
                      [
                        'Monitor',
                        <ReferenceValue
                          type="monitors"
                          id={item.monitorId}
                          label={item.sourceName}
                        />,
                      ],
                    ]
                  : []),
                ...(item.assignmentGroupId
                  ? [
                      [
                        'Assignment Group',
                        <ReferenceValue
                          type="groups"
                          id={item.assignmentGroupId}
                          label={item.assignmentGroupName}
                        />,
                      ],
                    ]
                  : []),
                ['Last Occurred At', <DateTime value={item.lastOccurredAt} />],
                ...(item.latestEventId
                  ? [
                      [
                        'Latest Event',
                        <ReferenceValue type="events" id={item.latestEventId} label="View Event" />,
                      ],
                    ]
                  : []),
              ]}
            />
            <EventRelatedLists alertId={id} />
          </>
        )
      )}
    </RecordWorkspace>
  );
}
