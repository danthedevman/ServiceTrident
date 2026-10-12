import { ReferenceField } from '../../components/forms/reference-field.jsx';
import { RecordHeader } from '../../components/record-actions.jsx';
import { useUiPreferences } from '../../preferences/ui-preferences.jsx';
import { DateTime } from '../../preferences/date-time.jsx';
import { StateBadge } from '../../components/state-badge.jsx';
import React, { useContext } from 'react';
import { AuthContext } from '../../auth/auth-context.js';
import { dashboardGreeting as greeting } from '../../../../shared/domain/dashboard-greeting.js';
import { Link } from 'react-router-dom';
import { arc, pie, scaleLinear, format } from 'd3';
import { DataTable } from '../../components/data-table.jsx';
import { Select } from '../../components/forms/select.jsx';
import { useResource } from '../../data/use-resource.js';
import { RefreshButton } from '../../components/icon-button.jsx';
import { displayValue } from '../../lib/display-value.js';
import { dashboardReportHref as reportHref } from '../../../../shared/domain/dashboard-reports.js';
import { dashboardData } from './dashboard-data.js';

const number = format(',d'),
  palette = ['#2563eb', '#d97706', '#e11d48', '#7c3aed', '#64748b'];
const severityColors = { critical: '#e11d48', high: '#e11d48', medium: '#d97706', low: '#2563eb' };
/** Scores show complete workspace aggregates, never just a paginated list's counts. */
const scoreColors = {
  blue: 'text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/40',
  rose: 'text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/40',
  amber:
    'text-amber-800 dark:text-amber-300 border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40',
  emerald:
    'text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40',
  slate:
    'text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/40',
};
function Score({ label, value, note, href, tone = 'blue', compact = false }) {
  if (compact)
    return (
      <Link
        to={href}
        aria-label={`View data: ${label}`}
        data-score-tone={tone}
        className={`flex items-center justify-between gap-3 rounded-xl border p-3 hover:brightness-95 focus-visible:outline-2 focus-visible:outline-offset-2 ${scoreColors[tone]}`}
      >
        <div className="min-w-0">
          <h3 className="text-xs font-semibold">{label}</h3>
          <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">{note}</p>
        </div>
        <strong className="shrink-0 text-2xl tabular-nums">
          {typeof value === 'number' ? number(value) : value}
        </strong>
      </Link>
    );
  return (
    <section className={`rounded-xl border p-5 ${scoreColors[tone]}`} data-score-tone={tone}>
      <h2 className="text-xs font-medium text-slate-500 dark:text-slate-400">{label}</h2>
      <p className="mt-2 text-3xl font-semibold tabular-nums">
        {typeof value === 'number' ? number(value) : value}
      </p>
      <p className="mt-2 text-xs text-slate-500">{note}</p>
      <Link
        className="mt-3 inline-block text-sm text-blue-700 dark:text-blue-300"
        to={href}
        aria-label={`View data: ${label}`}
      >
        View data
      </Link>
    </section>
  );
}
/** D3 donut geometry, with exact accessible values and an explicit empty state. */
function PieChart({ title, rows, note, href }) {
  const total = rows.reduce((sum, row) => sum + row.value, 0),
    shape = arc().innerRadius(65).outerRadius(100).padAngle(0.02).cornerRadius(3);
  const slices = pie()
    .value((row) => row.value)
    .sort(null)(rows);
  return (
    <section className="panel min-w-0 p-6">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-semibold">{title}</h2>
        <Link
          className="shrink-0 text-sm text-blue-700 dark:text-blue-300"
          to={href}
          aria-label={`View data: ${title}`}
        >
          View data
        </Link>
      </div>
      <p className="mt-1 text-xs text-slate-500">{note}</p>
      <svg
        viewBox="-120 -120 240 240"
        className="mx-auto my-3 w-full max-w-60"
        role="group"
        aria-label={title}
      >
        {!total && (
          <circle
            r="82"
            fill="none"
            strokeWidth="34"
            className="stroke-slate-200 dark:stroke-slate-700"
          />
        )}
        {slices
          .filter((row) => row.value)
          .map((slice, index) => (
            <path
              key={slice.data.label}
              d={shape(slice)}
              fill={slice.data.color ?? palette[index % palette.length]}
              tabIndex={0}
              role="img"
              aria-label={`${slice.data.label}: ${slice.value}, ${format('.1%')(slice.value / total)}`}
            >
              <title>
                {slice.data.label}: {number(slice.value)} ({format('.1%')(slice.value / total)})
              </title>
            </path>
          ))}
        <text textAnchor="middle" className="fill-current text-3xl font-semibold" y="8">
          {number(total)}
        </text>
      </svg>
      <ul className="space-y-2">
        {rows.map((row, index) => (
          <li key={row.label} className="flex justify-between gap-3 text-sm">
            <span className="inline-flex items-center gap-2">
              <svg width="10" height="10" aria-hidden="true">
                <circle cx="5" cy="5" r="5" fill={row.color ?? palette[index % palette.length]} />
              </svg>
              <Link
                className="text-blue-700 dark:text-blue-300"
                to={row.href}
                aria-label={`View ${row.label} data: ${title}`}
              >
                {row.label}
              </Link>
            </span>
            <strong>{number(row.value)}</strong>
          </li>
        ))}
      </ul>
      {!total && <p className="mt-3 text-sm text-slate-500">No records to report.</p>}
    </section>
  );
}
/** D3 horizontal bars make differences comparable; labels remain readable on narrow screens. */
function BarChart({ title, rows, note, href }) {
  const width = scaleLinear()
    .domain([0, Math.max(1, ...rows.map((row) => row.value))])
    .range([0, 360]);
  return (
    <section className="panel min-w-0 p-6">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-semibold">{title}</h2>
        <Link
          className="shrink-0 text-sm text-blue-700 dark:text-blue-300"
          to={href}
          aria-label={`View data: ${title}`}
        >
          View data
        </Link>
      </div>
      <p className="mt-1 text-xs text-slate-500">{note}</p>
      <ul className="mt-6 space-y-5">
        {rows.map((row, index) => (
          <li key={row.label}>
            <div className="flex justify-between gap-4 text-sm">
              <Link
                className="min-w-0 break-words text-blue-700 dark:text-blue-300"
                to={row.href}
                aria-label={`View ${row.label} data: ${title}`}
              >
                {row.label}
              </Link>
              <strong>{number(row.value)}</strong>
            </div>
            <svg
              viewBox="0 0 360 14"
              className="mt-2 w-full"
              role="img"
              aria-label={`${row.label}: ${row.value}`}
            >
              <rect width="360" height="14" rx="7" className="fill-slate-100 dark:fill-slate-800" />
              <rect
                width={width(row.value)}
                height="14"
                rx="7"
                fill={row.color ?? palette[index % palette.length]}
              />
            </svg>
          </li>
        ))}
      </ul>
      {!rows.length && <p className="mt-6 text-sm text-slate-500">No records to report.</p>}
    </section>
  );
}
/** Separate response, workload, and health views without clearing charts during refreshes. */
export function Dashboard() {
  const { user } = useContext(AuthContext);
  const {
    dashboardTab,
    dashboardGreeting,
    setPreference,
    ready: preferencesReady,
  } = useUiPreferences();
  const [eventServiceId, setEventServiceId] = React.useState('');
  const eventMetrics = useResource(
    dashboardTab === 'events'
      ? `/event-metrics${eventServiceId ? `?serviceId=${encodeURIComponent(eventServiceId)}` : ''}`
      : null,
    30000,
  );
  const response = useResource(dashboardTab === 'events' ? null : '/response-dashboard', 30000),
    health = useResource(dashboardTab === 'events' ? null : '/status', 30000),
    data = response.data;
  const chart = health.data ? dashboardData(health.data, 30) : null;
  const total = (values) => Object.values(values ?? {}).reduce((sum, value) => sum + value, 0);
  const rows = (values, keys, report) =>
    keys.map((key) => ({
      label: displayValue(key),
      value: values?.[key] ?? 0,
      color: severityColors[key],
      href: reportHref(report, key),
    }));
  const link = (kind, row) => (
    <Link className="text-blue-700 dark:text-blue-300" to={`/${kind}/${row.id}`}>
      {row.title}
    </Link>
  );
  const healthLabels = {
    up: 'Operational',
    down: 'Down',
    degraded: 'Degraded',
    unknown: 'Unknown / stale',
    pending: 'Awaiting check',
    paused: 'Paused',
  };
  const healthColors = {
    up: '#10b981',
    down: '#e11d48',
    degraded: '#d97706',
    unknown: '#64748b',
    pending: '#d97706',
    paused: '#64748b',
  };
  const healthRows = (counts, report) =>
    Object.entries(counts).map(([key, value]) => ({
      label: healthLabels[key],
      value,
      color: healthColors[key],
      href: reportHref(report, key),
    }));
  const incidents = data ? (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <Score
          label="Assigned to Me"
          href={reportHref('my-incidents')}
          value={data.assignedWork?.['my-incidents']?.total ?? 0}
          note={`${data.assignedWork?.['my-incidents']?.needsAttention ?? 0} critical or high`}
        />
        <Score
          label="Assigned to My Team"
          href={reportHref('team-incidents')}
          value={data.assignedWork?.['team-incidents']?.total ?? 0}
          note={
            data.teamCount
              ? 'Unresolved incidents in your assignment groups'
              : 'You are not in an assignment group'
          }
        />
        <Score
          label="Unresolved incidents"
          href={reportHref('incidents')}
          value={total(data.severity)}
          note="Open and acknowledged"
        />
        <Score
          label="Critical / high"
          tone={(data.severity.critical ?? 0) + (data.severity.high ?? 0) ? 'rose' : 'emerald'}
          href={reportHref('urgent')}
          value={(data.severity.critical ?? 0) + (data.severity.high ?? 0)}
          note={`${data.severity.critical ?? 0} critical · ${data.severity.high ?? 0} high`}
        />
        <Score
          label="Unassigned"
          tone={data.unassigned ? 'amber' : 'emerald'}
          href={reportHref('unassigned')}
          value={data.unassigned}
          note="Unresolved incidents without an assignee"
        />
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        <BarChart
          title="Unresolved Incidents by Severity"
          href={reportHref('incidents')}
          rows={rows(data.severity, ['critical', 'high', 'medium', 'low'], 'severity')}
          note="All unresolved incidents · custom labels use their workflow mapping"
        />
        <PieChart
          title="Response Status"
          href={reportHref('incidents')}
          rows={rows(data.incidentStatus, ['open', 'acknowledged'], 'incidentStatus')}
          note="How much active work has been acknowledged"
        />
      </div>
      <DataTable
        title="Priority Incidents"
        description="Highest severity first, then oldest within severity. Export covers this queue."
        rows={data.incidents}
        rowKey={(row) => row.id}
        source="priority-incidents"
        filename="priority-incidents.csv"
        deletePath="/incidents"
        columns={[
          {
            key: 'title',
            label: 'Incident',
            value: (row) => row.title,
            render: (row) => link('incidents', row),
          },
          {
            key: 'severity',
            label: 'Severity',
            value: (row) => row.severityLabel || displayValue(row.severity),
            render: (row) => <StateBadge status={row.severity} label={row.severityLabel} />,
          },
          {
            key: 'status',
            label: 'Status',
            value: (row) => row.statusLabel || displayValue(row.status),
            render: (row) => <StateBadge status={row.status} label={row.statusLabel} />,
          },
          { key: 'serviceName', label: 'Service', value: (row) => row.serviceName },
        ]}
      />
    </div>
  ) : (
    <p role="status" className={response.error ? undefined : 'sr-only'}>
      {response.error ? 'Incident reporting unavailable.' : 'Loading incident reporting…'}
    </p>
  );
  const tasks = data ? (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <Score
          label="Assigned to Me"
          href={reportHref('my-tasks')}
          value={data.assignedWork?.['my-tasks']?.total ?? 0}
          note={`${data.assignedWork?.['my-tasks']?.needsAttention ?? 0} overdue`}
        />
        <Score
          label="Assigned to My Team"
          href={reportHref('team-tasks')}
          value={data.assignedWork?.['team-tasks']?.total ?? 0}
          note={
            data.teamCount
              ? 'Outstanding tasks in your assignment groups'
              : 'You are not in an assignment group'
          }
        />
        <Score
          label="Outstanding tasks"
          href={reportHref('tasks')}
          value={total(data.taskStatus)}
          note="To do, in progress, and blocked"
        />
        <Score
          label="Blocked tasks"
          tone={data.taskStatus.blocked ? 'amber' : 'emerald'}
          href={reportHref('taskStatus', 'blocked')}
          value={data.taskStatus.blocked ?? 0}
          note="Work requiring intervention"
        />
        <Score
          label="Overdue tasks"
          tone={data.overdue ? 'amber' : 'emerald'}
          href={reportHref('overdue')}
          value={data.overdue}
          note="Outstanding tasks due before today (UTC)"
        />
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        <PieChart
          title="Task Workload by Status"
          href={reportHref('tasks')}
          rows={rows(data.taskStatus, ['todo', 'in_progress', 'blocked'], 'taskStatus')}
          note="Outstanding tasks only"
        />
        <BarChart
          title="Outstanding Tasks by Priority"
          href={reportHref('tasks')}
          rows={rows(data.taskPriority, ['high', 'medium', 'low'], 'taskPriority')}
          note="All outstanding tasks, including overdue work"
        />
      </div>
      <DataTable
        title="Priority Tasks"
        description="Search and export all outstanding records."
        rows={data.tasks}
        rowKey={(row) => row.id}
        source="priority-tasks"
        filename="priority-tasks.csv"
        deletePath="/tasks"
        columns={[
          {
            key: 'title',
            label: 'Task',
            value: (row) => row.title,
            render: (row) => link('tasks', row),
          },
          {
            key: 'priority',
            label: 'Priority',
            value: (row) => row.priorityLabel || displayValue(row.priority),
            render: (row) => <StateBadge status={row.priority} label={row.priorityLabel} />,
          },
          {
            key: 'status',
            label: 'Status',
            value: (row) => row.statusLabel || displayValue(row.status),
            render: (row) => <StateBadge status={row.status} label={row.statusLabel} />,
          },
          { key: 'dueDate', label: 'Due date', value: (row) => row.dueDate || '—' },
        ]}
      />
    </div>
  ) : (
    <p role="status" className={response.error ? undefined : 'sr-only'}>
      {response.error ? 'Task reporting unavailable.' : 'Loading task reporting…'}
    </p>
  );
  const services =
    chart && data ? (
      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-3">
          <Score
            label="Services with incidents"
            tone={data.services.length ? 'amber' : 'emerald'}
            href={reportHref('impacted')}
            value={data.services.length}
            note="Distinct services with unresolved incidents"
          />
          <Score
            label="Services down"
            tone={
              health.data.services.some((service) => service.status === 'down') ? 'rose' : 'slate'
            }
            href={reportHref('serviceHealth', 'down')}
            value={health.data.services.filter((service) => service.status === 'down').length}
            note="Current checks and dependencies"
          />
          <Score
            label="Recorded monitor uptime"
            tone={
              chart.uptime === null
                ? 'slate'
                : chart.uptime >= 0.99
                  ? 'emerald'
                  : chart.uptime >= 0.95
                    ? 'amber'
                    : 'rose'
            }
            href={reportHref('uptime')}
            value={chart.uptime === null ? '—' : format('.2%')(chart.uptime)}
            note="30 UTC days · weighted by recorded checks"
          />
        </div>
        <div className="grid gap-5 lg:grid-cols-2">
          <PieChart
            title="Service Health"
            href={reportHref('services')}
            rows={healthRows(
              Object.fromEntries(
                ['up', 'degraded', 'down', 'unknown'].map((status) => [
                  status,
                  health.data.services.filter((service) => service.status === status).length,
                ]),
              ),
              'serviceHealth',
            )}
            note="Missing and stale checks are not treated as healthy"
          />
          <BarChart
            title="Services with the Most Active Incidents"
            href={reportHref('impacted')}
            rows={[...data.services]
              .sort((a, b) => b.count - a.count)
              .slice(0, 8)
              .map((service) => ({
                label: service.name,
                value: service.count,
                color: service.critical ? '#e11d48' : '#2563eb',
                href: reportHref('serviceIncidents', service.id || 'none'),
              }))}
            note="Top 8 by unresolved incident count · rose indicates critical incidents"
          />
        </div>
        <DataTable
          title="Services with Active Incidents"
          rows={data.services}
          rowKey={(row) => row.id}
          source="impacted-services"
          filename="impacted-services.csv"
          deletePath="/services"
          defaultSort="count:desc"
          columns={[
            {
              key: 'name',
              label: 'Service',
              value: (row) => row.name,
              render: (row) => (
                <Link className="text-blue-700 dark:text-blue-300" to={`/services/${row.id}`}>
                  {row.name}
                </Link>
              ),
            },
            { key: 'count', label: 'Unresolved incidents', value: (row) => row.count },
            { key: 'critical', label: 'Critical', value: (row) => row.critical },
          ]}
        />
        <PieChart
          title="Monitor Health"
          href={reportHref('monitors')}
          rows={healthRows(chart.counts, 'monitorHealth')}
          note="Current state including paused and unverified monitors"
        />
      </div>
    ) : (
      <p role="status" className={health.error || response.error ? undefined : 'sr-only'}>
        {health.error || response.error
          ? 'Service reporting unavailable.'
          : 'Loading service health…'}
      </p>
    );
  return (
    <div className="space-y-6">
      <RecordHeader>
        <div className="flex w-full flex-wrap items-center justify-between gap-4">
          <p className="min-w-0 flex-1 basis-full text-xl font-semibold break-words sm:basis-0">
            {greeting(dashboardGreeting, user?.displayName)}
          </p>
          <div className="flex shrink-0 items-center gap-2">
            <label className="field-label block w-48 !min-w-0">
              <span className="sr-only">Dashboard View</span>
              <Select
                aria-label="Dashboard View"
                className="!mt-0"
                value={dashboardTab}
                disabled={!preferencesReady}
                onChange={(event) => setPreference('dashboardTab', event.target.value)}
              >
                <option value="overview">Overview</option>
                <option value="incidents">Incidents</option>
                <option value="tasks">Tasks</option>
                <option value="services">Service Health</option>
                <option value="events">Events</option>
              </Select>
            </label>
            <RefreshButton
              busy={response.pending || health.pending || eventMetrics.pending}
              label="Refresh dashboard"
              bare
              onClick={() =>
                dashboardTab === 'events'
                  ? eventMetrics.refresh()
                  : Promise.all([response.refresh(), health.refresh()])
              }
            />
          </div>
        </div>
      </RecordHeader>
      {(response.error || health.error) && (
        <p role="alert" className="text-rose-700 dark:text-rose-400">
          {response.error || health.error}
        </p>
      )}
      {preferencesReady &&
        (dashboardTab === 'overview' ? (
          <Overview
            data={data}
            chart={chart}
            services={health.data?.services ?? []}
            reportHref={reportHref}
          />
        ) : dashboardTab === 'events' ? (
          <EventDashboard
            state={eventMetrics}
            serviceId={eventServiceId}
            setService={setEventServiceId}
          />
        ) : dashboardTab === 'tasks' ? (
          tasks
        ) : dashboardTab === 'services' ? (
          services
        ) : (
          incidents
        ))}
      {(data || eventMetrics.data) && (
        <p className="text-xs text-slate-500">
          Updated{' '}
          {
            <DateTime
              value={dashboardTab === 'events' ? eventMetrics.data?.generatedAt : data.generatedAt}
            />
          }{' '}
          · Refreshes every 30 seconds
        </p>
      )}
    </div>
  );
}

/** Summarize authorized domains with complete server counts and actionable report links. */
function Overview({ data, chart, services, reportHref }) {
  if (!data?.overview || !chart) return null;
  const overview = data.overview;
  return (
    <div className="space-y-6">
      <section className="space-y-4" aria-labelledby="overview-work-title">
        <div>
          <h2 id="overview-work-title" className="text-lg font-semibold">
            Your Work
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Start with your active assignments, then review work shared with your team.
          </p>
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          {[
            ['My Assignments', 'my'],
            ['My Team', 'team'],
          ].map(([title, scope]) => (
            <div key={scope} className="panel p-5">
              <h3 className="font-semibold">{title}</h3>
              <div className="mt-3 space-y-2">
                {['incidents', 'tasks'].map((kind) => {
                  const report = `${scope}-${kind}`;
                  const work = data.assignedWork?.[report];
                  return (
                    <Link
                      key={kind}
                      to={reportHref(report)}
                      className="flex items-center justify-between gap-4 rounded-lg p-3 hover:bg-slate-100 dark:hover:bg-slate-800"
                    >
                      <div>
                        <span className="font-medium">
                          {kind === 'incidents' ? 'Unresolved incidents' : 'Outstanding tasks'}
                        </span>
                        <p className="mt-1 text-sm text-slate-500">
                          {scope === 'team' && !data.teamCount
                            ? 'No assignment group membership'
                            : `${work?.needsAttention ?? 0} ${kind === 'incidents' ? 'critical or high priority' : 'overdue'}`}
                        </p>
                      </div>
                      <span className="text-2xl font-semibold text-blue-700 dark:text-blue-300">
                        {work?.total ?? 0}
                      </span>
                    </Link>
                  );
                })}
              </div>
              {scope === 'team' && (
                <p className="mt-3 text-xs text-slate-500">
                  Includes all your assignment groups and may overlap your personal assignments.
                </p>
              )}
            </div>
          ))}
        </div>
      </section>
      <section className="space-y-4" aria-labelledby="overview-attention-title">
        <h2 id="overview-attention-title" className="text-lg font-semibold">
          Needs Attention
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Score
            compact
            label="Critical / High Incidents"
            tone={(data.severity.critical ?? 0) + (data.severity.high ?? 0) ? 'rose' : 'emerald'}
            value={(data.severity.critical ?? 0) + (data.severity.high ?? 0)}
            note="Prioritize unresolved incidents"
            href={reportHref('urgent')}
          />
          <Score
            compact
            label="Unassigned Incidents"
            tone={data.unassigned ? 'amber' : 'emerald'}
            value={data.unassigned}
            note="Find work that needs an owner"
            href={reportHref('unassigned')}
          />
          <Score
            compact
            label="Overdue Tasks"
            tone={data.overdue ? 'amber' : 'emerald'}
            value={data.overdue}
            note="Outstanding tasks due before today (UTC)"
            href={reportHref('overdue')}
          />
          <Score
            compact
            label="Services Down"
            tone={
              services.some((service) => service.status === 'down')
                ? 'rose'
                : services.some((service) => service.status === 'degraded')
                  ? 'amber'
                  : services.some((service) => !service.status || service.status === 'unknown') ||
                      !services.length
                    ? 'slate'
                    : 'emerald'
            }
            value={services.filter((service) => service.status === 'down').length}
            note={`${services.filter((service) => service.status === 'degraded').length} degraded · ${services.filter((service) => !service.status || service.status === 'unknown').length} unknown`}
            href={reportHref('serviceHealth', 'down')}
          />
        </div>
      </section>
      <div className="grid gap-6 lg:grid-cols-2" aria-label="Overview charts">
        <BarChart
          title="Incident Priority"
          note="Select a severity to review unresolved incidents"
          href={reportHref('incidents')}
          rows={['critical', 'high', 'medium', 'low'].map((key) => ({
            label: displayValue(key),
            value: data.severity[key] ?? 0,
            color: severityColors[key],
            href: reportHref('severity', key),
          }))}
        />
        <PieChart
          title="Service Health"
          note="Select a health state to see affected services"
          href={reportHref('services')}
          rows={['up', 'degraded', 'down', 'unknown'].map((key) => ({
            label: key === 'up' ? 'Operational' : displayValue(key),
            value: services.filter((service) => (service.status || 'unknown') === key).length,
            href: reportHref('serviceHealth', key),
          }))}
        />
      </div>
      <section className="panel p-5" aria-labelledby="important-reports-title">
        <h2 id="important-reports-title" className="font-semibold">
          Useful Shortcuts
        </h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <Link className="btn-secondary" to="/knowledge">
            Browse Knowledge
          </Link>
          <Link className="btn-secondary" to="/on-call">
            On-call Coverage · {overview.activeShifts} active
          </Link>
          <Link className="btn-secondary" to="/status">
            Service Status
          </Link>
        </div>
      </section>
    </div>
  );
}

function EventDashboard({ state, serviceId, setService }) {
  const eventsHref = `/events?${new URLSearchParams({ serviceId })}`;
  const data = state.data;
  const outcomes = data?.outcomes || [];
  const total = outcomes.reduce((sum, row) => sum + row.count, 0);
  const up = outcomes.find((row) => row.status === 'up')?.count || 0;
  const durationCount = outcomes.reduce((sum, row) => sum + row.durationCount, 0);
  const average = durationCount
    ? outcomes.reduce((sum, row) => sum + (row.durationTotal || 0), 0) / durationCount
    : null;
  return (
    <section className="space-y-6" aria-busy={state.pending}>
      <ReferenceField
        label="Service"
        referenceType="services"
        value={serviceId}
        onChange={setService}
      />
      <p className="text-sm text-slate-500">
        Monitor checks from the last 30 days. Successful checks do not imply current service health.
      </p>
      {state.error && <p role="alert">{state.error}</p>}
      {data && (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <Score compact label="Checks" value={total} href={eventsHref} />
            <Score
              compact
              label="Successful Checks"
              value={total ? `${((100 * up) / total).toFixed(1)}%` : '—'}
              tone={total && up === total ? 'emerald' : 'amber'}
              href={eventsHref}
            />
            <Score
              compact
              label="Average Duration"
              value={average === null ? '—' : `${Math.round(average)} ms`}
              href={eventsHref}
            />
          </div>
          <div className="grid gap-6 lg:grid-cols-2">
            <BarChart
              title="Check Outcomes"
              rows={outcomes.map((row) => ({
                label: row.status === 'up' ? 'Operational' : 'Down',
                value: row.count,
                href: eventsHref,
              }))}
              href={eventsHref}
            />
            <BarChart
              title="HTTP Responses"
              rows={data.http.map((row) => ({
                label: row.statusCode === null ? 'No response' : String(row.statusCode),
                value: row.count,
                href: eventsHref,
              }))}
              href={eventsHref}
            />
          </div>
        </>
      )}
    </section>
  );
}
