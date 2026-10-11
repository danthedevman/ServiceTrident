import { useRecordTabLabel } from '../../components/record-navigation.jsx';
import { useDateTime } from '../../preferences/date-time.jsx';
import { DateTime } from '../../preferences/date-time.jsx';
import { isTimestampField } from '../../lib/date-time.js';
import React from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { useResource } from '../../data/use-resource.js';
import { RecordWorkspace } from '../../components/record-workspace.jsx';
import { ErrorNotice } from '../../components/feedback.jsx';
import { Skeleton } from '../../components/skeleton.jsx';
import { displayValue } from '../../lib/display-value.js';

const names = {
  audit: 'Audit Entry',
  activity: 'Activity',
  comments: 'Discussion Entry',
  deliveries: 'Delivery Log',
  invitations: 'Invitation',
  inquiries: 'Hosting Inquiry',
  attachments: 'Attachment',
  headers: 'Header',
  demo: 'Demo Record Type',
};
const labels = {
  at: 'Time',
  by: 'Performed By',
  mime: 'File Type',
  size: 'Size (Bytes)',
  statusCode: 'HTTP Status',
  actorId: 'Actor ID',
  recordId: 'Record ID',
  parentId: 'Parent Record ID',
  requestId: 'Request ID',
  externalId: 'External Incident',
  ownerId: 'Owner ID',
};
function parent(kind, query) {
  if (['activity', 'comments'].includes(kind))
    return `/incidents/${encodeURIComponent(query.get('recordId') || '')}`;
  if (kind === 'attachments')
    return `/${encodeURIComponent(query.get('recordKind') || '')}/${encodeURIComponent(query.get('recordId') || '')}`;
  if (kind === 'headers')
    return `/monitors/${encodeURIComponent(query.get('monitorId') || '')}/events/${encodeURIComponent(query.get('eventId') || '')}`;
  return (
    {
      audit: '/settings/audit',
      deliveries: '/integrations',
      invitations: '/workspace',
      inquiries: '/settings',
      demo: '/settings',
    }[kind] || '/settings'
  );
}

/** Read-only details reuse their table's allowlist, parent authorization, and retention boundaries. */
export function TableRecordPage() {
  const { kind, id } = useParams(),
    { search } = useLocation();
  const query = new URLSearchParams(search);
  const resource = useResource(
    `/table-records/${encodeURIComponent(kind)}/${encodeURIComponent(id)}${search}`,
  );
  const item = resource.data?.item;
  const title = names[kind] || 'Record';
  const format = useDateTime();
  useRecordTabLabel(
    item &&
      (item.name ||
        item.title ||
        `${item.integrationName || item.actor || item.by || title} · ${item.action ? displayValue(item.action) : item.event ? displayValue(item.event) : item.status ? displayValue(item.status) : title}${item.createdAt || item.at ? ` · ${format(item.createdAt || item.at)}` : ''}`),
  );
  return (
    <RecordWorkspace
      label="Record Information"
      sidebar={<p className="text-sm">{title} · Read Only</p>}
      actions={
        <Link className="btn-secondary" to={parent(kind, query)}>
          Back to List
        </Link>
      }
    >
      <ErrorNotice>{resource.error}</ErrorNotice>
      {item ? (
        <section className="record-details space-y-5" aria-label={`${title} Details`}>
          <h2 className="text-lg font-semibold">{item.name || item.title || title}</h2>
          {kind === 'attachments' && (
            <a
              className="btn-primary"
              href={`/api/attachments/files/${encodeURIComponent(id)}/download`}
            >
              Download Attachment
            </a>
          )}
          <dl className="grid gap-5 sm:grid-cols-2">
            {resource.data.fields.map((field) => (
              <div
                key={field}
                className={
                  ['note', 'body', 'message', 'value', 'error'].includes(field)
                    ? 'sm:col-span-2'
                    : ''
                }
              >
                <dt className="field-label">
                  {labels[field] || displayValue(field.replace(/([a-z])([A-Z])/g, '$1 $2'))}
                </dt>
                <dd className="mt-1 whitespace-pre-wrap break-words text-sm">
                  {item[field] === undefined || item[field] === null || item[field] === '' ? (
                    '—'
                  ) : isTimestampField(field) ? (
                    <DateTime value={item[field]} />
                  ) : typeof item[field] === 'boolean' ? (
                    item[field] ? (
                      'Yes'
                    ) : (
                      'No'
                    )
                  ) : (
                    String(item[field])
                  )}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      ) : (
        !resource.error && <Skeleton className="h-64" />
      )}
    </RecordWorkspace>
  );
}
