import {
  dashboardReport,
  dashboardReportFilter,
} from '@servicetrident/shared/domain/dashboard-reports';
import { reportAssignments } from '../repositories/report-assignments.js';
import { memberFilter } from '../repositories/members.js';
import { incidentView } from '../domain/incidents.js';
/** Register response-dashboard routes; authentication and workspace policy run in app.js. */
export function installResponseDashboardRoutes(app, db, appOrigin) {
  /** Aggregate all workspace records so dashboard totals never depend on a list page. */
  app.get('/api/response-dashboard', async (req, res) => {
    const workspaceId = req.workspaceId,
      today = new Date().toISOString().slice(0, 10);
    const active = { workspaceId, status: { $in: ['open', 'acknowledged'] } };
    const outstanding = { workspaceId, status: { $in: ['todo', 'in_progress', 'blocked'] } };
    const [
      severity,
      services,
      tasks,
      unassigned,
      overdue,
      incidents,
      urgentTasks,
      incidentStatus,
      taskPriority,
    ] = await Promise.all([
      db
        .collection('incidents')
        .aggregate([{ $match: active }, { $group: { _id: '$severity', count: { $sum: 1 } } }])
        .toArray(),
      db
        .collection('incidents')
        .aggregate([
          { $match: active },
          {
            $group: {
              _id: '$serviceId',
              name: { $first: '$serviceName' },
              count: { $sum: 1 },
              critical: { $sum: { $cond: [{ $eq: ['$severity', 'critical'] }, 1, 0] } },
            },
          },
          { $sort: { critical: -1, count: -1, name: 1 } },
        ])
        .toArray(),
      db
        .collection('tasks')
        .aggregate([{ $match: outstanding }, { $group: { _id: '$status', count: { $sum: 1 } } }])
        .toArray(),
      db.collection('incidents').countDocuments({ ...active, assigneeId: null }),
      db
        .collection('tasks')
        .countDocuments({ ...outstanding, dueDate: { $type: 'string', $gt: '', $lt: today } }),
      db
        .collection('incidents')
        .aggregate([
          { $match: active },
          {
            $addFields: {
              rank: { $indexOfArray: [['critical', 'high', 'medium', 'low'], '$severity'] },
            },
          },
          { $sort: { rank: 1, createdAt: 1, _id: 1 } },
          { $limit: 10 },
          { $project: { title: 1, severity: 1, status: 1, serviceName: 1, createdAt: 1 } },
        ])
        .toArray(),
      db
        .collection('tasks')
        .aggregate([
          { $match: outstanding },
          { $addFields: { rank: { $indexOfArray: [['high', 'medium', 'low'], '$priority'] } } },
          { $sort: { rank: 1, createdAt: 1, _id: 1 } },
          { $limit: 10 },
          { $project: { title: 1, priority: 1, status: 1, dueDate: 1 } },
        ])
        .toArray(),
      db
        .collection('incidents')
        .aggregate([{ $match: active }, { $group: { _id: '$status', count: { $sum: 1 } } }])
        .toArray(),
      db
        .collection('tasks')
        .aggregate([{ $match: outstanding }, { $group: { _id: '$priority', count: { $sum: 1 } } }])
        .toArray(),
    ]);
    const [bases, articleStatus, operations, catalog, members] = await Promise.all([
      db.collection('knowledgeBases').countDocuments({ workspaceId }),
      db
        .collection('articles')
        .aggregate([
          { $match: { workspaceId } },
          { $group: { _id: '$status', count: { $sum: 1 } } },
        ])
        .toArray(),
      db
        .collection('operations')
        .findOne({ _id: workspaceId }, { projection: { groups: 1, shifts: 1, integrations: 1 } }),
      db
        .collection('catalogs')
        .findOne({ _id: workspaceId }, { projection: { services: 1, collections: 1 } }),
      req.role === 'admin'
        ? db
            .collection('users')
            .countDocuments({ $and: [memberFilter(workspaceId), { disabled: { $ne: true } }] })
        : null,
    ]);
    const assignments = await reportAssignments(db, workspaceId, req.user._id);
    const assignmentReports = ['my-incidents', 'team-incidents', 'my-tasks', 'team-tasks'];
    const assignedWork = Object.fromEntries(
      await Promise.all(
        assignmentReports.map(async (key) => {
          const report = dashboardReport(key);
          const filter = dashboardReportFilter(report, workspaceId, today, assignments);
          const attention =
            report.kind === 'incidents'
              ? { severity: { $in: ['critical', 'high'] } }
              : { dueDate: { $type: 'string', $gt: '', $lt: today } };
          const [total, needsAttention] = await Promise.all([
            db.collection(report.kind).countDocuments(filter),
            db.collection(report.kind).countDocuments({ ...filter, ...attention }),
          ]);
          return [key, { total, needsAttention }];
        }),
      ),
    );
    const now = Date.now();
    const overview = {
      knowledgeBases: bases,
      articleStatus: Object.fromEntries(articleStatus.map((row) => [row._id, row.count])),
      services: catalog?.services?.length ?? 0,
      collections: catalog?.collections?.length ?? 0,
      groups: operations?.groups?.length ?? 0,
      activeShifts:
        operations?.shifts?.filter(
          (shift) => Date.parse(shift.start) <= now && Date.parse(shift.end) > now,
        ).length ?? 0,
      scheduledShifts:
        operations?.shifts?.filter((shift) => Date.parse(shift.end) > now).length ?? 0,
      ...(req.role === 'admin'
        ? {
            users: members,
            enabledIntegrations:
              operations?.integrations?.filter((integration) => integration.enabled !== false)
                .length ?? 0,
          }
        : {}),
    };
    res.json({
      overview,
      assignedWork,
      teamCount: assignments.teamIds.length,
      incidentStatus: Object.fromEntries(incidentStatus.map((row) => [row._id, row.count])),
      taskPriority: Object.fromEntries(taskPriority.map((row) => [row._id, row.count])),
      severity: Object.fromEntries(severity.map((row) => [row._id, row.count])),
      taskStatus: Object.fromEntries(tasks.map((row) => [row._id, row.count])),
      services: services.map(({ _id, ...row }) => ({ id: _id, ...row })),
      unassigned,
      overdue,
      incidents: incidents.map(incidentView),
      tasks: urgentTasks.map(incidentView),
      generatedAt: new Date(),
    });
  });
}
