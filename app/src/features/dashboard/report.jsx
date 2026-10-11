import { PageTitle } from '../../components/page-title.jsx';
import React from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { dashboardReport } from '../../../../shared/domain/dashboard-reports.js';
import { DataTable } from '../../components/data-table.jsx';
import { StateBadge } from '../../components/state-badge.jsx';
import { DateTime } from '../../preferences/date-time.jsx';
import { displayValue } from '../../lib/display-value.js';

/** Dedicated report routes share the standard full-page list table and server paging. */
export function DashboardReport() {
  const [params] = useSearchParams();
  const report = dashboardReport(params.get('report'), params.get('value') || '');
  if (!report)
    return (
      <div className="p-6">
        <PageTitle>Report Not Found</PageTitle>
        <Link to="/">Back to Dashboard</Link>
      </div>
    );
  const { kind } = report;
  const scope = new URLSearchParams({ report: report.report, value: report.value });
  const records = ['incidents', 'tasks'].includes(kind);
  const keys = records
    ? [
        'title',
        kind === 'incidents' ? 'severity' : 'priority',
        'status',
        'serviceName',
        'assignmentGroupName',
        ...(kind === 'tasks' ? ['dueDate'] : []),
        'createdAt',
      ]
    : report.report === 'impacted'
      ? ['name', 'count', 'critical']
      : kind === 'uptime'
        ? ['name', 'day', 'up', 'down', 'total']
        : ['name', 'status'];
  const href = (row) =>
    kind === 'uptime' ? `/monitors/${row.monitorId}` : row.id ? `/${kind}/${row.id}` : null;
  const labels = {
    title: 'Title',
    name: kind === 'uptime' ? 'Monitor' : 'Name',
    serviceName: 'Service',
    assignmentGroupName: 'Assignment Group',
    dueDate: 'Due Date',
    createdAt: 'Created',
    count: 'Unresolved Incidents',
    critical: 'Critical',
    day: 'Day (UTC)',
    up: 'Successful Checks',
    down: 'Other Checks',
    total: 'Recorded Checks',
  };
  return (
    <div className="list-page">
      <DataTable
        key={scope.toString()}
        fullPage
        title={report.title}
        description={
          kind === 'uptime'
            ? 'Last 30 UTC days. Uptime is successful checks divided by recorded checks across these rows.'
            : undefined
        }
        source={`dashboard-report?${scope}`}
        rowHref={href}
        dateColumn={records ? 'createdAt' : kind === 'uptime' ? 'day' : undefined}
        filename={`${report.report}.csv`}
        actions={
          <Link className="btn-secondary" to="/">
            Back to Dashboard
          </Link>
        }
        columns={keys.map((key) => ({
          key,
          label: labels[key] || displayValue(key),
          value: (row) => row[key],
          ...(['title', 'name'].includes(key)
            ? {
                render: (row) =>
                  href(row) ? (
                    <Link
                      className="text-blue-700 hover:underline dark:text-blue-300"
                      to={href(row)}
                    >
                      {row[key]}
                    </Link>
                  ) : (
                    row[key]
                  ),
              }
            : {}),
          ...(['status', 'severity', 'priority'].includes(key)
            ? { render: (row) => <StateBadge status={row[key]} /> }
            : {}),
          ...(key === 'createdAt' ? { render: (row) => <DateTime value={row[key]} /> } : {}),
        }))}
      />
    </div>
  );
}
