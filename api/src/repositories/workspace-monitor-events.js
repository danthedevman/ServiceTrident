import { withEventIncidents } from './event-incidents.js';
import { InputError } from '@servicetrident/shared/validation/input-error';
import { tableSearch } from '@servicetrident/shared/domain/table-search';
import { objectId } from '../domain/identifiers.js';

/** Workspace and retention constrain every list, export, and metric query. */
export function workspaceMonitorEvents(db, workspaceId, monitors, query = {}) {
  const incidentId = query.incidentId;
  const checks = monitors.map((monitor) => ({
    monitorId: String(monitor._id),
    monitorName: monitor.name,
    serviceName: monitor.service || 'Unassigned',
    serviceId: monitor.serviceId ? String(monitor.serviceId) : null,
  }));
  const scope = { userId: workspaceId, checkedAt: { $gte: new Date(Date.now() - 30 * 86400000) } };
  if (query.serviceId)
    scope.monitorId = {
      $in: monitors
        .filter((monitor) => String(monitor.serviceId) === String(objectId(query.serviceId)))
        .map((monitor) => monitor._id),
    };
  if (query.monitorId)
    scope.monitorId = {
      $in: monitors
        .filter(
          (monitor) =>
            String(monitor._id) === String(objectId(query.monitorId)) &&
            (!query.serviceId || String(monitor.serviceId) === query.serviceId),
        )
        .map((monitor) => monitor._id),
    };
  if (query.status) {
    if (!['up', 'down'].includes(query.status)) throw new InputError('Choose Operational or Down.');
    scope.status = query.status;
  }
  const columns = [
    'checkedAt',
    'monitorName',
    'serviceName',
    'status',
    'statusCode',
    'durationMs',
    'error',
  ];
  const ordered = [...checks].sort((a, b) => a.monitorId.localeCompare(b.monitorId));
  // Balance the lookup so large incidents stay below MongoDB's expression nesting limit.
  const name = (key, rows = ordered) => {
    if (!rows.length) return { $literal: 'Not recorded' };
    if (rows.length === 1)
      return {
        $cond: [
          { $eq: ['$monitorId', objectId(rows[0].monitorId)] },
          { $literal: rows[0][key] },
          { $literal: 'Not recorded' },
        ],
      };
    const middle = Math.floor(rows.length / 2);
    return {
      $cond: [
        { $lt: ['$monitorId', objectId(rows[middle].monitorId)] },
        name(key, rows.slice(0, middle)),
        name(key, rows.slice(middle)),
      ],
    };
  };
  return {
    fields: [...columns, 'incidentTitles'],
    dateColumn: 'checkedAt',
    async metrics() {
      const outcomes = await db
        .collection('events')
        .aggregate([
          { $match: scope },
          {
            $group: {
              _id: '$status',
              count: { $sum: 1 },
              durationTotal: { $sum: { $ifNull: ['$durationMs', 0] } },
              durationCount: {
                $sum: { $cond: [{ $ne: [{ $ifNull: ['$durationMs', null] }, null] }, 1, 0] },
              },
            },
          },
        ])
        .toArray();
      const http = await db
        .collection('events')
        .aggregate([{ $match: scope }, { $group: { _id: '$statusCode', count: { $sum: 1 } } }])
        .toArray();
      return {
        outcomes: outcomes.map(({ _id, ...row }) => ({ status: _id, ...row })),
        http: http.map(({ _id, count }) => ({ statusCode: _id, count })),
        days: 30,
        generatedAt: new Date(),
      };
    },
    async read(query, all = false) {
      if (incidentId) {
        const incident = await db
          .collection('incidents')
          .findOne({ _id: objectId(incidentId), workspaceId });
        if (!incident) throw new InputError('Incident not found.', 404);
        scope.$and = [
          {
            $or: (incident.triggeringChecks || []).slice(0, 1000).map((check) => ({
              monitorId: objectId(check.monitorId),
              checkedAt: new Date(check.checkedAt),
            })),
          },
        ];
        if (!incident.triggeringChecks?.length) scope.$and = [{ _id: { $in: [] } }];
      }

      const pipeline = [
        { $match: scope },
        {
          $addFields: {
            monitorName: name('monitorName'),
            serviceName: name('serviceName'),
            serviceId: name('serviceId'),
          },
        },
        { $match: tableSearch(query, Object.fromEntries(columns.map((key) => [key, `$${key}`]))) },
      ];
      if (query.from || query.to)
        pipeline.push({
          $match: {
            checkedAt: {
              ...(query.from ? { $gte: new Date(query.from) } : {}),
              ...(query.to ? { $lt: new Date(+new Date(query.to) + 86400000) } : {}),
            },
          },
        });
      const total = all
        ? undefined
        : ((
            await db
              .collection('events')
              .aggregate([...pipeline, { $count: 'total' }])
              .toArray()
          )[0]?.total ?? 0);
      pipeline.push({ $sort: { [query.sortBy]: query.order === 'desc' ? -1 : 1, _id: 1 } });
      if (!all)
        pipeline.push({ $skip: (query.page - 1) * query.pageSize }, { $limit: query.pageSize });
      pipeline.push({
        $project: {
          monitorId: 1,
          serviceId: 1,
          number: 1,
          ...Object.fromEntries(columns.map((key) => [key, 1])),
        },
      });
      return {
        total,
        cursor: withEventIncidents(db, workspaceId, db.collection('events').aggregate(pipeline)),
        view: ({ _id, monitorId, ...row }) => ({
          id: String(_id),
          monitorId: String(monitorId),
          ...row,
        }),
      };
    },
  };
}
