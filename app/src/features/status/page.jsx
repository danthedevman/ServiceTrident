import { useContext } from 'react';
import { AuthContext } from '../../auth/auth-context.js';
import { useTheme } from '../../preferences/theme.jsx';
import { RecordHeader } from '../../components/record-actions.jsx';
import { DateTime } from '../../preferences/date-time.jsx';
import { StatusSubscriptions } from './subscriptions.jsx';
import {
  Cog6ToothIcon,
  ArrowTopRightOnSquareIcon,
  SunIcon,
  MoonIcon,
} from '@heroicons/react/24/outline';
import { Select } from '../../components/forms/select.jsx';
import { statusRange } from '../../../../shared/domain/status-range.js';
import { StatusMessage } from './message.jsx';
import React, { useLayoutEffect, useMemo, useState } from 'react';
import { ServiceHistory } from './service-history.jsx';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { AdminOnly } from '../../auth/role-gates.jsx';
import { useResource } from '../../data/use-resource.js';
import { Logo } from '../../components/brand.jsx';
import { Badge, ErrorNotice } from '../../components/feedback.jsx';

/** A service-only status list shared by authenticated and explicitly public views. */
export function StatusPage({ publicView = false, appearanceOverride }) {
  const { user } = useContext(AuthContext);
  const timeZone =
    (!publicView && user?.timeZone) || Intl.DateTimeFormat().resolvedOptions().timeZone;
  const { token } = useParams();
  const [params, setParams] = useSearchParams();
  const requestedRange = params.get('range') || params.get('days') || '30';
  const range = ['7', '14', '30', 'quarter', 'previous-quarter'].includes(requestedRange)
    ? requestedRange
    : '30';
  const { data, error } = useResource(
    `${publicView ? `/public/status/${token}` : '/status'}?range=${range}&timeZone=${encodeURIComponent(timeZone)}`,
    30000,
  );
  const appearance =
    appearanceOverride ||
    (data ? (data.statusTheme === 'dark' ? 'dark' : 'light') : error ? 'light' : null);
  const { setPageAppearance } = useTheme();
  useLayoutEffect(() => {
    if (!publicView || !appearance) return;
    const previous = document.body.style.backgroundColor;
    setPageAppearance(appearance);
    document.documentElement.dataset.theme = appearance;
    document.documentElement.style.colorScheme = appearance;
    document.documentElement.style.backgroundColor = appearance === 'dark' ? '#000000' : '#ffffff';
    document.body.style.backgroundColor = appearance === 'dark' ? '#000000' : '#ffffff';
    document.documentElement.dataset.publicStatusReady = 'true';
    document.documentElement.style.visibility = '';
    return () => {
      setPageAppearance(null);
      document.body.style.backgroundColor = previous;
    };
  }, [appearance, publicView, setPageAppearance]);
  const historyRange = useMemo(
    () => (data ? statusRange(range, new Date(data.generatedAt), data.timeZone || timeZone) : null),
    [data, range, timeZone],
  );
  const [expanded, setExpanded] = useState(() => new Set());
  return (
    <section className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          {!publicView && data?.iconUrl && (
            <img src={data.iconUrl} alt="" className="h-10 w-10 object-contain" />
          )}
          <h1 className="text-2xl font-semibold">Service Status</h1>
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
        <div aria-busy={!error}>{error ? 'Service status is unavailable.' : null}</div>
      ) : (
        <>
          <StatusMessage message={data.banner} />
          <ul className="divide-y divide-slate-200 dark:divide-slate-800">
            {data.services.map((service) => (
              <li
                key={service.id}
                className="flex flex-wrap items-center justify-between gap-4 py-5"
              >
                <span className="font-medium">{service.name}</span>
                <Badge status={service.status} />
                <StatusMessage message={service.message} compact />
                <ServiceHistory
                  timeZone={data.timeZone || timeZone}
                  days={historyRange.days}
                  endDate={historyRange.end.toISOString()}
                  service={service}
                  services={data.services}
                  monitors={data.monitors}
                  generatedAt={data.generatedAt}
                />
                {!!service.components?.length && (
                  <details
                    className="w-full"
                    data-status-components={service.id}
                    onToggle={(event) => {
                      const open = event.currentTarget.open;
                      setExpanded((current) => {
                        if (current.has(service.id) === open) return current;
                        const next = new Set(current);
                        if (open) next.add(service.id);
                        else next.delete(service.id);
                        return next;
                      });
                    }}
                  >
                    <summary className="w-fit cursor-pointer text-sm text-blue-700 dark:text-blue-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500">
                      Components ({service.components.length})
                    </summary>
                    <ul className="mt-4 space-y-5 border-l border-slate-200 pl-4 dark:border-slate-700">
                      {expanded.has(service.id) &&
                        service.components.map((component) => (
                          <li key={component.id} className="space-y-3">
                            <div className="flex items-center justify-between gap-4">
                              <span className="text-sm font-medium">{component.name}</span>
                              <Badge status={component.status} />
                            </div>
                            <ServiceHistory
                              service={{
                                id: service.id,
                                name: component.name,
                                status: component.status,
                                dependencyIds: [],
                              }}
                              services={[]}
                              monitors={data.monitors.filter(
                                (monitor) =>
                                  monitor.serviceId === service.id &&
                                  monitor.componentId === component.id,
                              )}
                              generatedAt={data.generatedAt}
                              timeZone={data.timeZone || timeZone}
                              days={historyRange.days}
                              endDate={historyRange.end.toISOString()}
                            />
                          </li>
                        ))}
                    </ul>
                  </details>
                )}
              </li>
            ))}
          </ul>
          {!data.services.length && (
            <p className="text-sm text-slate-500">No services have been added yet.</p>
          )}
          <p className="text-xs text-slate-500">Updated {<DateTime value={data.generatedAt} />}</p>
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
  const [visitorAppearance, setVisitorAppearance] = useState(null);
  const { token } = useParams();
  const [params] = useSearchParams();
  const requestedRange = params.get('range') || params.get('days') || '30';
  const range = ['7', '14', '30', 'quarter', 'previous-quarter'].includes(requestedRange)
    ? requestedRange
    : '30';
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const { data } = useResource(
    `/public/status/${token}?range=${range}&timeZone=${encodeURIComponent(timeZone)}`,
    30000,
  );
  return (
    <div className="mx-auto max-w-4xl px-5 py-8">
      <header className="mb-4 flex items-center justify-between gap-4">
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
        <div className="ml-auto flex flex-wrap items-center justify-end gap-0">
          <StatusSubscriptions token={token} capabilities={data?.subscriptions} />
          {data && (
            <button
              type="button"
              className="inline-flex h-9 w-9 shrink-0 items-center justify-end border-0 bg-transparent p-0 text-slate-600 hover:text-slate-900 focus-visible:outline-2 focus-visible:outline-offset-2 dark:text-slate-300 dark:hover:text-white"
              aria-label="Toggle status page appearance"
              title={
                (visitorAppearance || data.statusTheme) === 'dark'
                  ? 'Switch to light mode'
                  : 'Switch to dark mode'
              }
              aria-pressed={(visitorAppearance || data.statusTheme) === 'dark'}
              onClick={() =>
                setVisitorAppearance(
                  (visitorAppearance || data.statusTheme) === 'dark' ? 'light' : 'dark',
                )
              }
            >
              {(visitorAppearance || data.statusTheme) === 'dark' ? (
                <SunIcon className="h-5 w-5" aria-hidden="true" />
              ) : (
                <MoonIcon className="h-5 w-5" aria-hidden="true" />
              )}
            </button>
          )}
        </div>
      </header>
      <main id="main">
        <StatusPage publicView appearanceOverride={visitorAppearance} />
      </main>
    </div>
  );
}
