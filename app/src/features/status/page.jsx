import { RecordHeader } from '../../components/record-actions.jsx';
import { DateTime } from '../../preferences/date-time.jsx';
import { StatusSubscriptions } from './subscriptions.jsx';
import { Cog6ToothIcon, ArrowTopRightOnSquareIcon } from '@heroicons/react/24/outline';
import { Select } from '../../components/forms/select.jsx';
import { statusRange } from '../../../../shared/domain/status-range.js';
import { StatusMessage } from './message.jsx';
import React, { useEffect } from 'react';
import { backgroundInk } from '../../../../shared/status/appearance.js';
import { ServiceHistory } from './service-history.jsx';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { AdminOnly } from '../../auth/role-gates.jsx';
import { useResource } from '../../data/use-resource.js';
import { Logo } from '../../components/brand.jsx';
import { Badge, ErrorNotice } from '../../components/feedback.jsx';

/** A service-only status list shared by authenticated and explicitly public views. */
export function StatusPage({ publicView = false }) {
  const { token } = useParams();
  const [params, setParams] = useSearchParams();
  const requestedRange = params.get('range') || params.get('days') || '30';
  const range = ['7', '14', '30', 'quarter', 'previous-quarter'].includes(requestedRange)
    ? requestedRange
    : '30';
  const { data, error } = useResource(
    `${publicView ? `/public/status/${token}` : '/status'}?range=${range}`,
    30000,
  );
  useEffect(() => {
    if (!data?.backgroundColor && !publicView) return;
    const previous = document.body.style.backgroundColor;
    document.body.style.backgroundColor = data?.backgroundColor || '#f7f9fa';
    return () => {
      document.body.style.backgroundColor = previous;
    };
  }, [data?.backgroundColor, publicView]);
  const ink = backgroundInk(data?.backgroundColor);
  return (
    <section
      className="space-y-6"
      style={
        data?.backgroundColor
          ? { backgroundColor: data.backgroundColor, padding: '1.5rem', borderRadius: '4px' }
          : undefined
      }
    >
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          {!publicView && data?.iconUrl && (
            <img src={data.iconUrl} alt="" className="h-10 w-10 object-contain" />
          )}
          <h1 className="text-2xl font-semibold" style={{ color: ink }}>
            Service Status
          </h1>
        </div>
        <div className="flex w-full min-w-0 items-center gap-2 sm:w-auto">
          <label className="field-label !min-w-0 flex-1 sm:w-64">
            <span className="sr-only">History range</span>
            <Select
              className="!mt-0 h-11"
              aria-label="History range"
              value={range}
              onChange={(event) =>
                setParams(
                  (current) => {
                    const next = new URLSearchParams(current);
                    next.delete('days');
                    next.set('range', event.target.value);
                    return next;
                  },
                  { replace: true },
                )
              }
            >
              {[7, 14, 30].map((value) => (
                <option key={value} value={value}>
                  Last {value} days
                </option>
              ))}
              <option value="quarter">This quarter</option>
              <option value="previous-quarter">Previous quarter</option>
            </Select>
          </label>
          {!publicView && (
            <RecordHeader>
              <div className="flex items-center gap-2">
                <AdminOnly>
                  <Link
                    className="btn-secondary h-9 w-9 shrink-0 !p-0"
                    to="/status/settings"
                    aria-label="Manage Status Page"
                    title="Manage Status Page"
                  >
                    <Cog6ToothIcon className="h-5 w-5" aria-hidden="true" />
                  </Link>
                  <PublicStatusLink />
                </AdminOnly>
              </div>
            </RecordHeader>
          )}
        </div>
      </header>
      <ErrorNotice>{error}</ErrorNotice>
      {!data ? (
        <p role="status" className={error ? undefined : 'sr-only'}>
          {error ? 'Service status is unavailable.' : 'Loading service status…'}
        </p>
      ) : (
        <>
          <StatusMessage message={data.banner} />
          <ul className="panel px-5 divide-y divide-slate-200 border-y border-slate-200 dark:divide-slate-800 dark:border-slate-800">
            {data.services.map((service) => (
              <li
                key={service.id}
                className="flex flex-wrap items-center justify-between gap-4 py-5"
              >
                <span className="font-medium">{service.name}</span>
                <Badge status={service.status} />
                <StatusMessage message={service.message} compact />
                <ServiceHistory
                  days={statusRange(range, new Date(data.generatedAt)).days}
                  endDate={statusRange(range, new Date(data.generatedAt)).end.toISOString()}
                  service={service}
                  services={data.services}
                  monitors={data.monitors}
                  generatedAt={data.generatedAt}
                />
              </li>
            ))}
          </ul>
          {!data.services.length && (
            <p className="text-sm text-slate-500">No services have been added yet.</p>
          )}
          <p style={{ color: ink }} className="text-xs text-slate-500">
            Updated {<DateTime value={data.generatedAt} />}
          </p>
        </>
      )}
    </section>
  );
}
/** Show the public launch action only after saved visibility settings confirm public access. */
function PublicStatusLink() {
  const { data } = useResource('/status-settings', 30000);
  if (data?.visibility !== 'public' || !data.publicPath) return null;
  return (
    <a
      href={data.publicPath}
      target="_blank"
      rel="noopener noreferrer"
      className="btn-secondary h-9 w-9 shrink-0 !p-0"
      aria-label="Open Public Status Page in a new tab"
      title="Open Public Status Page"
    >
      <ArrowTopRightOnSquareIcon className="h-5 w-5" aria-hidden="true" />
    </a>
  );
}
/** Public pages omit private record links and management actions. */
export function PublicStatusPage() {
  const { token } = useParams();
  const [params] = useSearchParams();
  const requestedRange = params.get('range') || params.get('days') || '30';
  const range = ['7', '14', '30', 'quarter', 'previous-quarter'].includes(requestedRange)
    ? requestedRange
    : '30';
  const { data } = useResource(`/public/status/${token}?range=${range}`, 30000);
  return (
    <div className="mx-auto max-w-4xl px-5 py-8">
      <header className="mb-10 flex items-center justify-between gap-4">
        <div className="flex h-14 min-w-0 items-center">
          {data &&
            (data.iconUrl ? (
              <img
                src={data.iconUrl}
                alt="Status page logo"
                className="h-14 max-w-48 object-contain"
              />
            ) : (
              <Logo />
            ))}
        </div>
        <div className="flex flex-wrap items-center justify-end gap-3">
          <StatusSubscriptions token={token} capabilities={data?.subscriptions} />
        </div>
      </header>
      <main id="main">
        <StatusPage publicView />
      </main>
    </div>
  );
}
