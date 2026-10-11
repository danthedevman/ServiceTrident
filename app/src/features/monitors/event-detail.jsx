import { DateTime } from '../../preferences/date-time.jsx';
import { recordNumber } from '../../lib/record-number.js';
import { Stat } from '../../components/stat.jsx';
import { DataTable } from '../../components/data-table.jsx';

import { useResource } from '../../data/use-resource.js';

import React from 'react';

import { useParams } from 'react-router-dom';

import { layouts } from '../../lib/layouts.js';

import { Badge } from '../../components/feedback.jsx';
import { ErrorNotice } from '../../components/feedback.jsx';
import { Loading } from '../../components/feedback.jsx';

/** Display untrusted response headers as escaped text.
 * @param {{headers?: object}} props
 */
export function HeaderTable({ headerSet = 'request' }) {
  const { id, eventId } = useParams();
  return (
    <DataTable
      source={`headers?monitorId=${id}&eventId=${eventId}&headerSet=${headerSet}`}
      title="Response Headers"
      rowKey={(row) => row.name}
      filename="response-headers.csv"
      defaultSort="name:asc"
      columns={[
        {
          key: 'name',
          label: 'Header',
          value: (row) => row.name,
          className: 'break-all font-mono text-xs',
        },
        {
          key: 'value',
          label: 'Value',
          value: (row) => row.value,
          className: 'whitespace-pre-wrap break-all font-mono text-xs',
        },
      ]}
    />
  );
}

/** A saved event is immutable; loading this page never rechecks the endpoint. */
export function EventDetail() {
  const { id, eventId } = useParams();
  const { data, loading, error } = useResource(`/monitors/${id}/events/${eventId}`, 0);
  const event = data?.event;
  const details = event?.details;
  if (details?.protocol)
    return (
      <section className="space-y-6">
        <h1 className="font-mono text-sm">{recordNumber('events', event)}</h1>
        <ErrorNotice>{error}</ErrorNotice>
        <Badge status={event.status} />
        <dl className="panel space-y-4 p-6">
          {[
            ['Protocol', details.protocol],
            ['Operation', details.operation || 'Connection check'],
            ['Result', details.result],
            ['Duration', `${event.durationMs} ms`],
            ['Checked at', <DateTime value={event.checkedAt} />],
            [
              'TLS',
              details.tls === undefined ? 'Not recorded' : details.tls ? 'Enabled' : 'Disabled',
            ],
          ].map(([label, value]) => (
            <div key={label}>
              <dt className="text-sm text-slate-500">{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      </section>
    );
  return (
    <>
      <h1 className="font-mono text-sm">{recordNumber('events', event)}</h1>
      <ErrorNotice>{error}</ErrorNotice>
      {loading ? (
        <Loading label="Loading response details…" />
      ) : (
        event && (
          <>
            <div>
              <div className="flex flex-wrap items-center gap-3">
                <Badge status={event.status} />
              </div>
              <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                {<DateTime value={event.checkedAt} />} · Event {event.id}
              </p>
            </div>
            <div className={layouts.scores}>
              <Stat
                title="HTTP Status"
                value={event.statusCode ?? '—'}
                note={event.statusCode ? 'Last response received' : 'No HTTP response received'}
              />
              <Stat
                title="Total Duration"
                value={`${event.durationMs} ms`}
                note={
                  details?.method === 'HEAD'
                    ? 'Headers only, including redirects'
                    : 'Includes redirects and captured body'
                }
              />
              <Stat
                title="Responses"
                value={details?.responses?.length ?? '—'}
                note="Each redirect is shown below"
              />
            </div>
            <section className="panel p-6">
              <h2 className="font-semibold">Scheduling</h2>
              {event.timing ? (
                <>
                  <dl className="mt-4 grid gap-5 text-sm sm:grid-cols-3">
                    <div>
                      <dt className="text-slate-500 dark:text-slate-400">Scheduled for</dt>
                      <dd className="mt-1">{<DateTime value={event.timing.scheduledAt} />}</dd>
                    </div>
                    <div>
                      <dt className="text-slate-500 dark:text-slate-400">Queued at</dt>
                      <dd className="mt-1">
                        {event.timing.queuedAt ? (
                          <DateTime value={event.timing.queuedAt} />
                        ) : (
                          'Not recorded'
                        )}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-slate-500 dark:text-slate-400">Actually started</dt>
                      <dd className="mt-1">{<DateTime value={event.timing.startedAt} />}</dd>
                    </div>
                    <div>
                      <dt className="text-slate-500 dark:text-slate-400">Total start delay</dt>
                      <dd className="mt-1">{(event.timing.scheduleDelayMs / 1000).toFixed(3)} s</dd>
                    </div>
                    <div>
                      <dt className="text-slate-500 dark:text-slate-400">Waiting for dispatch</dt>
                      <dd className="mt-1">
                        {event.timing.dispatchDelayMs === null
                          ? 'Not recorded'
                          : `${(event.timing.dispatchDelayMs / 1000).toFixed(3)} s`}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-slate-500 dark:text-slate-400">Waiting in queue</dt>
                      <dd className="mt-1">
                        {event.timing.queueDelayMs === null
                          ? 'Not recorded'
                          : `${(event.timing.queueDelayMs / 1000).toFixed(3)} s`}
                      </dd>
                    </div>
                  </dl>
                  <p className="field-hint">
                    Queue wait includes submitting the job and waiting for a check worker. Start
                    delay does not include the HTTP request duration or page refresh time.
                  </p>
                </>
              ) : (
                <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">
                  Scheduling timestamps were not recorded for this older event.
                </p>
              )}
            </section>
            <ErrorNotice>{event.error}</ErrorNotice>
            {!details ? (
              <div className="panel p-6 text-sm text-slate-500 dark:text-slate-400">
                This event predates detailed response capture. Its original summary is shown above;
                headers and body are available for new checks.
              </div>
            ) : (
              <>
                <section className="panel p-6">
                  <h2 className="font-semibold">Request</h2>
                  <dl className="mt-4 space-y-3 text-sm">
                    <div>
                      <dt className="text-xs text-slate-400">Method</dt>
                      <dd>{details.method}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-slate-400">Follow redirects</dt>
                      <dd>
                        {details.followRedirects === undefined
                          ? 'Not recorded (older event)'
                          : details.followRedirects
                            ? 'Enabled'
                            : 'Disabled — any 3xx result describes the original URL only; the destination was not checked.'}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-slate-400">Requested URL</dt>
                      <dd className="break-all font-mono text-xs">{details.requestedUrl}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-slate-400">Last attempted URL</dt>
                      <dd className="break-all font-mono text-xs">{details.finalUrl}</dd>
                    </div>
                  </dl>
                  <details className="mt-5">
                    <summary className="cursor-pointer text-sm font-medium text-blue-700 dark:text-blue-400">
                      Request headers
                    </summary>
                    <HeaderTable headerSet="request" />
                  </details>
                </section>
                {!details.responses.length && (
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    The check failed before receiving response headers.
                  </p>
                )}
                {details.responses.map((response, index) => (
                  <section key={index} className="panel min-w-0 p-6">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <h2 className="font-semibold">
                        Response {index + 1}
                        {index < details.responses.length - 1 ? ' · Redirect' : ''}
                      </h2>
                      <span className="font-mono text-sm">
                        HTTP {response.httpVersion ?? '—'} · {response.statusCode}{' '}
                        {response.statusMessage}
                      </span>
                    </div>
                    <p className="mt-2 break-all font-mono text-xs text-slate-500 dark:text-slate-400">
                      {response.url}
                    </p>
                    <div className="mt-4 flex flex-wrap gap-5 text-xs text-slate-500 dark:text-slate-400">
                      <span>Connected IP: {response.remoteAddress ?? 'Not recorded'}</span>
                      <span>Headers received: {response.headersMs ?? '—'} ms</span>
                    </div>
                    <h3 className="mt-6 text-sm font-semibold">Response Headers</h3>
                    <HeaderTable headerSet={String(index)} />
                    <h3 className="mt-6 text-sm font-semibold">Response Body</h3>
                    {response.body ? (
                      <>
                        <p className="my-2 text-xs text-slate-500 dark:text-slate-400">
                          {response.body.omitted ??
                            `${response.body.bytesCaptured.toLocaleString()} bytes captured${response.body.truncated ? ' · Truncated at 16 KiB' : ''} · Decoded as UTF-8`}
                        </p>
                        <ErrorNotice>{response.body.error}</ErrorNotice>
                        {!response.body.omitted && (
                          <pre className="mt-3 max-h-96 overflow-auto whitespace-pre-wrap break-all rounded-xl bg-slate-950 p-4 text-xs leading-6 text-slate-100">
                            {response.body.text || '(Empty body)'}
                          </pre>
                        )}
                      </>
                    ) : (
                      <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                        Body was not recorded.
                      </p>
                    )}
                  </section>
                ))}
                <p className="text-xs leading-6 text-slate-400">
                  Bodies are shown as plain text and limited to 16 KiB per response. Encoded and
                  binary bodies are omitted. Credential-bearing headers are redacted. These are the
                  saved results of this check, not a live request.
                </p>
              </>
            )}
          </>
        )
      )}
    </>
  );
}
