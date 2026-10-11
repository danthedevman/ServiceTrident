import {
  dashboardReport,
  dashboardReportFilter,
} from '@servicetrident/shared/domain/dashboard-reports';
import { reportAssignments } from './report-assignments.js';
import { InputError } from '@servicetrident/shared/validation/input-error';
import { databaseTable, embeddedTable } from './table-page.js';
import { statusData } from '../domain/status.js';
import { serializeMonitor } from '../domain/monitor.js';

/** Report pagination and exports use the same workspace-scoped dashboard predicates. */
export async function dashboardReportTable(db, req) {
  const report = dashboardReport(req.query.report, req.query.value || '');
  if (!report) throw new InputError('Choose a valid dashboard report.');
  const workspaceId = req.workspaceId;
  if (['incidents', 'tasks'].includes(report.kind)) {
    const filter = dashboardReportFilter(
      report,
      workspaceId,
      new Date().toISOString().slice(0, 10),
      ['my-incidents', 'team-incidents', 'my-tasks', 'team-tasks'].includes(report.report)
        ? await reportAssignments(db, workspaceId, req.user._id)
        : {},
    );
    const columns = [
      'title',
      report.kind === 'incidents' ? 'severity' : 'priority',
      'status',
      'serviceName',
      'assignmentGroupName',
      ...(report.kind === 'tasks' ? ['dueDate'] : []),
      'createdAt',
    ];
    const fields = Object.fromEntries(columns.map((key) => [key, key]));
    return databaseTable(
      db,
      report.kind,
      filter,
      fields,
      ({ _id, ...row }) => ({ id: String(_id), ...row }),
      'createdAt',
    );
  }
  if (report.report === 'impacted') {
    const rows = await db
      .collection('incidents')
      .aggregate([
        { $match: { workspaceId, status: { $in: ['open', 'acknowledged'] } } },
        {
          $group: {
            _id: '$serviceId',
            name: { $first: '$serviceName' },
            count: { $sum: 1 },
            critical: { $sum: { $cond: [{ $eq: ['$severity', 'critical'] }, 1, 0] } },
          },
        },
      ])
      .toArray();
    return embeddedTable(
      rows.map(({ _id, ...row }) => ({ id: _id ? String(_id) : null, ...row })),
      ['name', 'count', 'critical'],
    );
  }
  const health = await statusData(db, workspaceId, serializeMonitor);
  if (report.kind === 'uptime') {
    const rows = health.monitors.flatMap((monitor) =>
      monitor.history.map((day) => ({
        id: `${monitor.id}-${day.day}`,
        monitorId: monitor.id,
        name: monitor.name,
        day: day.day,
        up: day.up,
        down: day.total - day.up,
        total: day.total,
      })),
    );
    return embeddedTable(rows, ['name', 'day', 'up', 'down', 'total'], 'day');
  }
  return embeddedTable(
    health[report.kind].filter((row) => !report.value || row.status === report.value),
    ['name', 'status'],
  );
}
