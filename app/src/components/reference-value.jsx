import { RecordLink } from './record-navigation.jsx';
import React from 'react';
import { ArrowTopRightOnSquareIcon } from '@heroicons/react/24/outline';

export const referenceRoutes = {
  services: '/services',
  collections: '/collections',
  groups: '/groups',
  members: '/workspace',
  incidents: '/incidents',
  knowledge: '/knowledge',
  knowledgeBases: '/knowledge/bases',
  tasks: '/tasks',
  rcas: '/rcas',
  monitors: '/monitors',
  serviceAccounts: '/settings/service-accounts',
};

/** Read-only relationships retain a labeled, keyboard-accessible link to a known route. */
export function ReferenceValue({ type, id, label, empty = 'Unassigned' }) {
  const route = referenceRoutes[type];
  if (!id || !route) return label || empty;
  return (
    <RecordLink
      to={`${route}/${encodeURIComponent(id)}`}
      title={label || 'Unavailable record'}
      className="inline-flex min-w-0 max-w-full items-center gap-1 text-blue-700 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500 dark:text-blue-300"
    >
      <span className="min-w-0 truncate">{label || 'Unavailable record'}</span>
      <ArrowTopRightOnSquareIcon className="h-4 w-4 shrink-0" aria-hidden="true" />
      <span className="sr-only"> (opens in an app record tab)</span>
    </RecordLink>
  );
}

export function ReferenceValues({ type, ids = [], getLabel, empty = 'None' }) {
  if (!ids.length) return empty;
  return (
    <span className="inline-flex min-w-0 max-w-full flex-wrap gap-x-3 gap-y-1">
      {ids.map((id) => (
        <ReferenceValue key={id} type={type} id={id} label={getLabel(id)} />
      ))}
    </span>
  );
}
