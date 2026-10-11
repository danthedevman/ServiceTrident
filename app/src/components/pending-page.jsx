import { PageTitle } from './page-title.jsx';
import React from 'react';
import { Loading } from './feedback.jsx';
/** Keep page titles stable while initial data loads. */
export function PendingPage({ pathname }) {
  const parts = pathname.split('/').filter(Boolean);
  const [kind, id, action] = parts;
  let title = 'Monitors';
  let variant = 'monitors';
  let narrow = '';
  if (!kind || kind === 'dashboard') {
    title = 'Dashboard';
    variant = 'dashboard';
  } else if (kind === 'status') {
    title = 'Status Page';
    variant = 'status';
  } else if (kind === 'profile') {
    title = 'Profile settings';
    variant = 'form';
    narrow = 'mx-auto max-w-xl';
  } else if (['services', 'collections'].includes(kind)) {
    const noun = kind === 'services' ? 'service' : 'collection';
    title = id
      ? `${id === 'new' ? 'Create' : 'Edit'} ${noun}`
      : kind === 'services'
        ? 'Services'
        : 'Collections';
    variant = id ? (kind === 'services' ? 'form' : 'collection-form') : 'catalog';
    if (id) narrow = 'mx-auto max-w-3xl';
  } else if (kind === 'monitors') {
    title =
      id === 'new'
        ? 'Add a Monitor'
        : action === 'edit'
          ? 'Edit Monitor'
          : action === 'events'
            ? 'Check Event'
            : 'Monitor';
    variant =
      id === 'new' || action === 'edit'
        ? 'monitor-form'
        : action === 'events'
          ? 'event'
          : 'monitor';
    if (variant === 'monitor-form') narrow = 'mx-auto max-w-xl';
  }
  return (
    <div className={`space-y-6 ${narrow}`}>
      <PageTitle>{title}</PageTitle>
      <Loading label="Loading details…" />
    </div>
  );
}
