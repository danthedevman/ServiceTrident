import { ScoreGroup } from './score-group.jsx';
import { AuthContext } from '../../auth/auth-context.js';
import React, { useContext, useState } from 'react';
import { Link } from 'react-router-dom';
import { useResource } from '../../data/use-resource.js';
import { Select } from '../../components/forms/select.jsx';
import { ErrorNotice } from '../../components/feedback.jsx';
import { Skeleton } from '../../components/skeleton.jsx';
import { DateTime } from '../../preferences/date-time.jsx';
const duration = (value) => (value == null ? '—' : `${value.toFixed(1)} min`);
export function OperationalReporting() {
  const { user } = useContext(AuthContext);
  const [days, setDays] = useState('30'),
    state = useResource(`/operational-report?days=${days}`, 30000),
    data = state.data;
  return (
    <div className="space-y-5">
      <div className="flex justify-end">
        <Select
          aria-label="Reporting period"
          className="!w-auto"
          value={days}
          onChange={(event) => setDays(event.target.value)}
        >
          {[7, 30, 90].map((value) => (
            <option key={value} value={value}>
              Last {value} days
            </option>
          ))}
        </Select>
      </div>
      <ErrorNotice>{state.error}</ErrorNotice>
      {!data ? (
        <Skeleton className="h-48" />
      ) : (
        <>
          <ScoreGroup>
            {[
              [
                'Mean acknowledgment',
                duration(data.meanAcknowledgmentMinutes),
                `${data.acknowledgmentSamples} recorded acknowledgments`,
                'text-blue-700 dark:text-blue-300',
              ],
              [
                'Mean resolution',
                duration(data.meanResolutionMinutes),
                `${data.resolutionSamples} recorded resolutions`,
                'text-emerald-700 dark:text-emerald-300',
              ],
              [
                'Unowned alerts',
                data.unownedAlerts,
                'Active alerts without an assignment group',
                'text-amber-800 dark:text-amber-300',
              ],
              [
                'Incidents',
                data.incidents,
                `Created in the last ${data.days} days`,
                'text-rose-700 dark:text-rose-300',
              ],
            ].map(([label, value, note, color]) => (
              <section key={label} className="dashboard-score p-5">
                <h3 className="text-sm">{label}</h3>
                <strong className={`mt-2 block text-2xl tabular-nums ${color}`}>{value}</strong>
                <p className="mt-2 text-xs text-slate-500">{note}</p>
              </section>
            ))}
          </ScoreGroup>
          <div className="grid gap-5 lg:grid-cols-2">
            <section className="dashboard-chart panel space-y-4 p-5">
              <h3 className="font-semibold">Noisy Sources</h3>
              <p className="text-xs text-slate-500">
                Top 10 by failure events, then total events. Retained history covers up to{' '}
                {data.eventHistoryDays} days.
              </p>
              <ol className="space-y-4">
                {data.noisySources.map((row, index) => (
                  <li key={index}>
                    <div className="flex justify-between gap-3 text-sm">
                      <span className="min-w-0 break-words">{row.sourceName}</span>
                      <span className="shrink-0">
                        {row.firing} failures / {row.count} events
                      </span>
                    </div>
                    <meter
                      className="mt-2 h-3 w-full"
                      min={0}
                      max={Math.max(1, data.noisySources[0]?.firing || 1)}
                      value={row.firing}
                      aria-label={`${row.sourceName} failure events`}
                    />
                  </li>
                ))}
              </ol>
              {!data.noisySources.length && <p className="text-sm">No events in this period.</p>}
            </section>
            <section className="dashboard-chart panel space-y-4 p-5">
              <h3 className="font-semibold">Services with Repeated Incidents</h3>
              <p className="text-xs text-slate-500">
                Multiple incidents on the same service; this does not establish a shared root cause.
              </p>
              <ul className="space-y-3">
                {data.repeatedServices.map((row) => (
                  <li key={row.serviceId} className="flex justify-between gap-3">
                    <Link
                      className="text-blue-700 hover:underline dark:text-blue-300"
                      to={`/services/${row.serviceId}`}
                    >
                      {row.serviceName}
                    </Link>
                    <span>{row.count}</span>
                  </li>
                ))}
              </ul>
              {!data.repeatedServices.length && (
                <p className="text-sm">No repeated services in this period.</p>
              )}
            </section>
            <section className="dashboard-chart panel space-y-3 p-5">
              <h3 className="font-semibold">Notification Delivery</h3>
              <ul className="space-y-2">
                {data.deliveryStates.map((row) => (
                  <li key={row.state} className="flex justify-between gap-3">
                    <span>{row.state}</span>
                    <span>{row.count}</span>
                  </li>
                ))}
              </ul>
              {user?.role === 'admin' && (
                <Link
                  className="text-sm text-blue-700 hover:underline dark:text-blue-300"
                  to="/integrations?related=deliveries"
                >
                  View delivery history
                </Link>
              )}
            </section>
            <section className="dashboard-chart panel space-y-3 p-5">
              <h3 className="font-semibold">Metric Definitions</h3>
              <p className="text-sm">
                Time to acknowledge and resolve starts when an incident opens, or reopens for its
                current cycle. Only measured transitions are averaged; older records without
                measurements are excluded. Incident cohorts use creation time. Unowned alerts counts
                all currently active alerts without a group.
              </p>
              <p className="text-xs text-slate-500">
                Updated <DateTime value={data.generatedAt} />
              </p>
            </section>
          </div>
        </>
      )}
    </div>
  );
}
