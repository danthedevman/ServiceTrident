import { withEventIncidents } from './event-incidents.js';
import { InputError } from '@servicetrident/shared/validation/input-error';
import { tableSearch } from '@servicetrident/shared/domain/table-search';
import { objectId } from '../domain/identifiers.js';

/** Workspace and retention constrain every list, export, and metric query. */
export function workspaceMonitorEvents(db, workspaceId, monitors, query = {}) {
  const incidentId = query.incidentId,
    requestedSeverity = query.severity;
  const checks = monitors.map((monitor) => ({
    monitorId: String(monitor._id),
    monitorName: monitor.name,
    serviceName: monitor.service || 'Unassigned',
    serviceId: monitor.serviceId ? String(monitor.serviceId) : null,
  }));
  const scope = { userId: workspaceId, checkedAt: { $gte: new Date(Date.now() - 30 * 86400000) } };
  if (query.serviceId) {
    const serviceId = String(objectId(query.serviceId));
    scope.$or = [
      { serviceId },
      {
        monitorId: {
          $in: monitors.filter((m) => String(m.serviceId) === serviceId).map((m) => m._id),
        },
      },
    ];
  }
  if (query.monitorId) scope.monitorId = objectId(query.monitorId);
  if (query.sourceType) {
    if (!['monitor', 'external'].includes(query.sourceType))
      throw new InputError('Choose a valid event source.');
    scope.sourceType = query.sourceType === 'monitor' ? { $ne: 'external' } : 'external';
  }
  if (query.alertId) scope.alertId = String(objectId(query.alertId));
  if (query.eventType) {
    if (!['check', 'alert', 'change', 'information'].includes(query.eventType))
      throw new InputError('Choose a valid event type.');
    scope.eventType =
      query.eventType === 'check' ? { $nin: ['alert', 'change', 'information'] } : query.eventType;
  }
  if (query.severity) {
    if (!['critical', 'high', 'medium', 'low', 'info'].includes(query.severity))
      throw new InputError('Choose a valid severity.');
  }
  if (query.status) {
    if (!['up', 'down'].includes(query.status)) throw new InputError('Choose Operational or Down.');
    scope.status = query.status;
  }
  const columns = [
    'number',
    'region',
    'checkedAt',
    'occurredAt',
    'receivedAt',
    'externalId',
    'correlationKey',
    'title',
    'sourceType',
    'sourceName',
    'eventType',
    'severity',
    'signal',
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
    if (!rows.length) return { $literal: key === 'serviceId' ? null : 'Not recorded' };
    if (rows.length === 1)
      return {
        $cond: [
          { $eq: ['$monitorId', objectId(rows[0].monitorId)] },
          { $literal: rows[0][key] },
          { $literal: key === 'serviceId' ? null : 'Not recorded' },
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
      const monitorScope = { ...scope, sourceType: { $ne: 'external' } };
      const sources = await db
        .collection('events')
        .aggregate([
          { $match: scope },
          { $group: { _id: { $ifNull: ['$sourceType', 'monitor'] }, count: { $sum: 1 } } },
        ])
        .toArray();
      const alertFilter = {
        workspaceId,
        status: { $in: ['open', 'acknowledged'] },
        ...(query.serviceId ? { serviceId: String(objectId(query.serviceId)) } : {}),
      };
      const activeAlerts = await db.collection('eventAlerts').countDocuments(alertFilter);
      const outcomes = await db
        .collection('events')
        .aggregate([
          { $match: monitorScope },
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
        .aggregate([
          { $match: monitorScope },
          { $group: { _id: '$statusCode', count: { $sum: 1 } } },
        ])
        .toArray();
      return {
        sources: sources.map(({ _id, count }) => ({ sourceType: _id, count })),
        activeAlerts,
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
        if (incident.eventAlertId) scope.$and[0].$or.push({ alertId: incident.eventAlertId });
        if (!incident.triggeringChecks?.length && !incident.eventAlertId)
          scope.$and = [{ _id: { $in: [] } }];
      }

      const pipeline = [
        { $match: scope },
        {
          $addFields: {
            monitorName: name('monitorName'),
            serviceName: { $ifNull: ['$serviceName', name('serviceName')] },
            serviceId: { $ifNull: ['$serviceId', name('serviceId')] },
            sourceType: { $ifNull: ['$sourceType', 'monitor'] },
            sourceName: { $ifNull: ['$sourceName', name('monitorName')] },
            title: { $ifNull: ['$title', name('monitorName')] },
            eventType: { $ifNull: ['$eventType', 'check'] },
            severity: {
              $ifNull: ['$severity', { $cond: [{ $eq: ['$status', 'down'] }, 'high', 'info'] }],
            },
            signal: {
              $ifNull: ['$signal', { $cond: [{ $eq: ['$status', 'down'] }, 'firing', 'recovery'] }],
            },
          },
        },
        { $match: tableSearch(query, Object.fromEntries(columns.map((key) => [key, `$${key}`]))) },
      ];
      if (requestedSeverity) pipeline.push({ $match: { severity: requestedSeverity } });
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
          alertId: 1,
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
          monitorId: monitorId ? String(monitorId) : null,
          ...row,
        }),
      };
    },
  };
}
