import { AdminOnly } from '../../auth/role-gates.jsx';

import { layouts } from '../../lib/layouts.js';

import React from 'react';
import { Link } from 'react-router-dom';

import { useCatalog } from './use-catalog.js';

import { ServiceOwnership } from './detail.jsx';
import { ReferenceValue } from '../../components/reference-value.jsx';

/** Show monitor organization with direct editing links; component edits use the monitor form. */
export function MonitorOrganization({ monitor }) {
  const { data, error, refresh } = useCatalog();
  const service = data?.services.find((item) => item.id === monitor.serviceId);
  const collections =
    data?.collections.filter((item) => item.serviceIds.includes(service?.id)) ?? [];
  const dependencies =
    service?.dependencyIds
      .map((id) => data.services.find((item) => item.id === id))
      .filter(Boolean) ?? [];
  return (
    <section className="panel space-y-4 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-semibold">Service and Organization</h2>
        <AdminOnly>
          <Link className="btn-secondary" to={`/monitors/${monitor.id}/edit`}>
            Edit assignment / component
          </Link>
        </AdminOnly>
      </div>
      {error && (
        <div role="alert" className="text-sm text-rose-700 dark:text-rose-400">
          {error}{' '}
          <button className="underline" onClick={refresh}>
            Retry
          </button>
        </div>
      )}
      {!data ? (
        error ? (
          <p>Organization details unavailable.</p>
        ) : (
          <p role="status" className="sr-only">
            Loading service assignments…
          </p>
        )
      ) : (
        <>
          {service && (
            <ServiceOwnership service={service} members={data.members} groups={data.groups} />
          )}
          <dl className={layouts.organization}>
            <div>
              <dt className="field-label">Service</dt>
              <dd className="mt-2 text-sm">
                <ReferenceValue type="services" id={monitor.serviceId} label={service?.name} />
              </dd>
              {service?.description && (
                <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                  {service.description}
                </p>
              )}
            </div>
            <div>
              <dt className="field-label">Component / subservice</dt>
              <dd className="mt-2 text-sm">
                {service ? (
                  <ReferenceValue
                    type="components"
                    id={monitor.componentId}
                    label={monitor.component || 'General'}
                  />
                ) : (
                  'None'
                )}
              </dd>
            </div>
            <div>
              <dt className="field-label">Direct dependencies</dt>
              <dd className="mt-2 flex flex-wrap gap-3 text-sm">
                {dependencies.length
                  ? dependencies.map((dependency) => (
                      <ReferenceValue
                        key={dependency.id}
                        type="services"
                        id={dependency.id}
                        label={dependency.name}
                      />
                    ))
                  : 'None'}
                {service && (
                  <Link
                    className="text-blue-700 dark:text-blue-400 underline"
                    to={`/services/${service.id}/edit`}
                  >
                    Edit dependencies
                  </Link>
                )}
              </dd>
            </div>
            <div>
              <dt className="field-label">Collections</dt>
              <dd className="mt-2 flex flex-wrap gap-3 text-sm">
                {collections.length
                  ? collections.map((collection) => (
                      <ReferenceValue
                        key={collection.id}
                        type="collections"
                        id={collection.id}
                        label={collection.name}
                      />
                    ))
                  : 'None'}
                <Link className="text-blue-700 dark:text-blue-400 underline" to="/collections">
                  Manage collections
                </Link>
              </dd>
            </div>
          </dl>
          {!service && (
            <p className="field-hint">
              Choose a service in Edit monitor to organize this monitor, or{' '}
              <Link className="underline" to="/services/new">
                create a service
              </Link>
              .
            </p>
          )}
        </>
      )}
    </section>
  );
}
