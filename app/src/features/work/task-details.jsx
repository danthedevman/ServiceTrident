import React from 'react';
import { ReferenceValue } from '../../components/reference-value.jsx';
import { StateBadge } from '../../components/state-badge.jsx';

/** Shared task detail layout for record pages and the board dialog. */
export function TaskDetails({ item, visibleFields = [] }) {
  return (
    <article className="record-details space-y-6">
      <dl className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <dt>Title</dt>
          <dd>{item.title}</dd>
        </div>
        <div>
          <dt>Status</dt>
          <dd>
            <StateBadge status={item.status} label={item.statusLabel} />
          </dd>
        </div>
        <div>
          <dt>Priority</dt>
          <dd>
            <StateBadge status={item.priority} label={item.priorityLabel} />
          </dd>
        </div>
      </dl>
      <dl className="grid gap-4 text-sm sm:grid-cols-2">
        <div>
          <dt className="font-medium">Service</dt>
          <dd>
            <ReferenceValue type="services" id={item.serviceId} label={item.serviceName} />
          </dd>
        </div>
        <>
          <div>
            <dt className="font-medium">Incident</dt>
            <dd>
              <ReferenceValue type="incidents" id={item.incidentId} label={item.incidentTitle} />
            </dd>
          </div>
          <div>
            <dt className="font-medium">Assignment group</dt>
            <dd>
              <ReferenceValue
                type="groups"
                id={item.assignmentGroupId}
                label={item.assignmentGroupName}
              />
            </dd>
          </div>
          <div>
            <dt className="font-medium">Assigned to</dt>
            <dd>
              <ReferenceValue type="members" id={item.assigneeId} label={item.assigneeName} />
            </dd>
          </div>
          <div>
            <dt className="font-medium">Due date</dt>
            <dd>{item.dueDate || 'No due date'}</dd>
          </div>
        </>
      </dl>
      <dl>
        <div>
          <dt>Description</dt>
          <dd className="whitespace-pre-wrap break-words">
            {item.description || 'No description.'}
          </dd>
        </div>
      </dl>
      {visibleFields.length > 0 && (
        <dl className="grid gap-4 sm:grid-cols-2">
          {visibleFields.map((field) => (
            <div key={field.id}>
              <dt className="text-sm font-medium">{field.label}</dt>
              <dd className="whitespace-pre-wrap break-words">
                {String(item.custom?.[field.id] ?? '—')}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </article>
  );
}
