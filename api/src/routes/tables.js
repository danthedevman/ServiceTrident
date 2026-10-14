import { systemActor } from '@servicetrident/shared/domain/audit';
import { embeddedImageIds } from '@servicetrident/shared/files/rich-content';
import { dashboardReportTable } from '../repositories/dashboard-report.js';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { InputError } from '@servicetrident/shared/validation/input-error';
import { csvRow } from '@servicetrident/shared/files/csv';
import { DEMO_COUNT, DEMO_TYPES } from '@servicetrident/shared/domain/demo-data';
import { serviceHealth, rollupHealth } from '@servicetrident/shared/domain/service-health';
import { tableQuery, databaseTable, embeddedTable } from '../repositories/table-page.js';
import { members, memberFilter } from '../repositories/members.js';
import { settings } from '../repositories/settings.js';
import { catalog, id } from './services.js';
import { incidentAccess } from '../domain/incidents.js';
import { workspaceMonitorEvents } from '../repositories/workspace-monitor-events.js';
import { incidentMonitorEvents } from '../repositories/incident-monitor-events.js';

const view = ({ _id, ...row }) => ({
  id: String(_id),
  ...row,
  ...(row.actor && !row.actorId ? { actor: systemActor(row.actor) } : {}),
});
const fields = (...names) => Object.fromEntries(names.map((name) => [name, name]));
/** Parent authorization is reused by related tables and their exports. */
async function parent(db, req, kind = 'incidents') {
  const names = { incidents: 'incidents', tasks: 'tasks', knowledge: 'articles' };
  if (!names[kind] || (req.role === 'user' && kind !== 'incidents'))
    throw new InputError('Record not found.', 404);
  const row = await db.collection(names[kind]).findOne({
    _id: id(req.query.recordId),
    ...(kind === 'incidents' ? incidentAccess(req) : { workspaceId: req.workspaceId }),
  });
  if (!row) throw new InputError('Record not found.', 404);
  return row;
}
/** Resolve sources only from server-owned definitions; never accept collection names or query objects. */
async function source(db, req) {
  const kind = req.params.kind,
    workspaceId = req.workspaceId;
  if (req.role === 'user' && !['comments', 'activity', 'attachments'].includes(kind))
    throw new InputError('Your role cannot view this table.', 403);
  if (
    ['audit', 'integrations', 'deliveries', 'invitations', 'inquiries', 'demo'].includes(kind) &&
    req.role !== 'admin'
  )
    throw new InputError('Administrator access required.', 403);
  if (kind === 'events') {
    const data = await catalog(db, workspaceId);
    return workspaceMonitorEvents(
      db,
      workspaceId,
      (
        await db
          .collection('monitors')
          .find({ userId: req.workspaceId }, { projection: { name: 1, serviceId: 1 } })
          .toArray()
      ).map((monitor) => ({
        ...monitor,
        service: data.services.find((service) => String(service.id) === String(monitor.serviceId))
          ?.name,
      })),
      req.query,
    );
  }
  if (kind === 'dashboard-report') return dashboardReportTable(db, req);
  if (kind === 'incident-monitor-events') {
    const incident = await parent(db, req);
    return incidentMonitorEvents(db, workspaceId, incident);
  }
  if (kind === 'audit')
    return databaseTable(
      db,
      'auditEvents',
      { workspaceId },
      fields(
        'createdAt',
        'actor',
        'actorId',
        'actualRole',
        'effectiveRole',
        'source',
        'action',
        'recordType',
        'recordId',
        'parentId',
        'operation',
        'fields',
        'outcome',
        'statusCode',
        'requestId',
      ),
      view,
      'createdAt',
    );
  if (kind === 'members')
    return databaseTable(
      db,
      'users',
      memberFilter(workspaceId),
      fields(
        'displayName',
        'email',
        'role',
        'disabled',
        'jobTitle',
        'department',
        'phone',
        'timeZone',
        'location',
      ),
      (row) => ({
        ...view(row),
        owner: String(row._id) === String(workspaceId),
        role: row.role || 'admin',
      }),
    );
  if (kind === 'invitations')
    return databaseTable(
      db,
      'invitations',
      { workspaceId, expiresAt: { $gt: new Date() } },
      fields('email', 'role', 'expiresAt', 'displayName'),
      view,
      'expiresAt',
    );
  if (kind === 'deliveries')
    return databaseTable(
      db,
      'deliveries',
      { workspaceId },
      fields('createdAt', 'integrationName', 'event', 'status', 'attempts', 'externalId', 'error'),
      view,
      'createdAt',
    );
  if (kind === 'inquiries') {
    if (
      req.actualRole !== 'admin' ||
      !process.env.MARKETING_OWNER_EMAIL ||
      req.user.email.toLowerCase() !== process.env.MARKETING_OWNER_EMAIL.trim().toLowerCase()
    )
      throw new InputError('The marketing inbox is restricted to its configured owner.', 403);
    return databaseTable(
      db,
      'marketingInquiries',
      { expiresAt: { $gt: new Date() } },
      fields('createdAt', 'name', 'email', 'company', 'interest', 'message'),
      view,
      'createdAt',
    );
  }
  if (kind === 'comments') {
    const incident = await parent(db, req);
    return databaseTable(
      db,
      'incidentComments',
      {
        workspaceId,
        incidentId: incident._id,
        ...(!['admin', 'responder'].includes(req.role) ? { kind: 'comment' } : {}),
      },
      fields('createdAt', 'author', 'kind', 'body'),
      view,
      'createdAt',
    );
  }
  if (kind === 'activity') {
    const incident = await parent(db, req);
    return embeddedTable(
      (incident.timeline ?? [])
        .filter((row) => ['admin', 'responder'].includes(req.role) || row.kind !== 'work_note')
        .map((row, index) => ({
          ...row,
          by: systemActor(row.by),
          id: String(index),
          note: row.previousResolutionNotes
            ? `${row.note} — Previous resolution: ${row.previousResolutionNotes}`
            : row.note,
        })),
      ['at', 'by', 'status', 'note'],
      'at',
    );
  }
  if (kind === 'incident-knowledge') {
    const incident = await parent(db, req);
    return databaseTable(
      db,
      'articles',
      { workspaceId, _id: { $in: (incident.knowledgeIds ?? []).map(id) } },
      fields('title', 'summary', 'status', 'updatedAt'),
      view,
      'updatedAt',
    );
  }
  if (kind === 'attachments') {
    const record = await parent(db, req, req.query.recordKind);
    return databaseTable(
      db,
      'attachments',
      {
        workspaceId,
        _id: {
          $in: (record.attachmentIds ?? [])
            .filter((value) => !embeddedImageIds(record.contentDocument).includes(value))
            .map(id),
        },
      },
      fields('name', 'mime', 'size', 'createdAt', 'ownerId'),
      (row) => ({ ...view(row), downloadUrl: `/api/attachments/files/${row._id}/download` }),
      'createdAt',
    );
  }
  if (kind === 'headers') {
    const event = await db.collection('events').findOne({
      _id: id(req.query.eventId),
      monitorId: id(req.query.monitorId),
      userId: workspaceId,
    });
    if (!event) throw new InputError('Event not found.', 404);
    return embeddedTable(
      Object.entries(
        req.query.headerSet === 'request'
          ? (event.details?.requestHeaders ?? {})
          : (event.details?.responses?.[Number(req.query.headerSet)]?.headers ?? {}),
      ).map(([name, value]) => ({
        id: name,
        name,
        value: Array.isArray(value) ? value.join('\n') : String(value ?? ''),
      })),
      ['name', 'value'],
    );
  }
  if (kind === 'demo')
    return embeddedTable(
      DEMO_TYPES.map(([key, label]) => ({ id: key, key, label, count: DEMO_COUNT })),
      ['label', 'count'],
    );
  if (['priority-incidents', 'priority-tasks'].includes(kind)) {
    const incidents = kind === 'priority-incidents';
    return databaseTable(
      db,
      incidents ? 'incidents' : 'tasks',
      {
        workspaceId,
        status: { $in: incidents ? ['open', 'acknowledged'] : ['todo', 'in_progress', 'blocked'] },
      },
      fields(
        'title',
        incidents ? 'severity' : 'priority',
        'status',
        incidents ? 'serviceName' : 'dueDate',
        'createdAt',
      ),
      view,
      'createdAt',
    );
  }
  if (kind === 'impacted-services') {
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
    return embeddedTable(rows.map(view), ['name', 'count', 'critical']);
  }
  const data = await catalog(db, workspaceId);
  if (['services', 'collections', 'monitors'].includes(kind)) {
    if (kind === 'monitors') {
      // Health is a computed SQL/Mongo expression, so sorting and search cover the full inventory.
      const filter = {
        userId: workspaceId,
        ...(req.query.serviceId ? { serviceId: id(req.query.serviceId) } : {}),
      };
      const definitions = fields('name', 'url', 'component', 'intervalMinutes', 'method');
      Object.assign(definitions, {
        status: 'status',
        service: 'service',
        durationMs: 'lastCheck.durationMs',
        checkedAt: 'lastCheck.checkedAt',
      });
      return {
        fields: Object.keys(definitions),
        dateColumn: 'checkedAt',
        async read(q, all) {
          const health = {
            $cond: [
              '$paused',
              'paused',
              {
                $cond: [
                  { $ifNull: ['$lastCheck', false] },
                  {
                    $cond: [
                      {
                        $gt: [
                          '$$NOW',
                          {
                            $dateAdd: {
                              startDate: '$lastCheck.checkedAt',
                              unit: 'minute',
                              amount: { $add: ['$intervalMinutes', 1] },
                            },
                          },
                        ],
                      },
                      'unknown',
                      '$lastCheck.status',
                    ],
                  },
                  'pending',
                ],
              },
            ],
          };
          let service = { $literal: 'Unassigned' };
          for (const row of data.services)
            service = {
              $cond: [{ $eq: ['$serviceId', id(row.id)] }, { $literal: row.name }, service],
            };
          const pipeline = [
            { $match: filter },
            { $addFields: { status: health, service, method: { $ifNull: ['$method', 'GET'] } } },
          ];
          const { tableSearch } = await import('@servicetrident/shared/domain/table-search');
          pipeline.push({
            $match: tableSearch(
              q,
              Object.fromEntries(Object.entries(definitions).map(([k, v]) => [k, `$${v}`])),
            ),
          });
          if (q.from || q.to)
            pipeline.push({
              $match: {
                'lastCheck.checkedAt': {
                  ...(q.from ? { $gte: new Date(q.from) } : {}),
                  ...(q.to ? { $lt: new Date(+new Date(q.to) + 86400000) } : {}),
                },
              },
            });
          const total = all
            ? undefined
            : ((
                await db
                  .collection('monitors')
                  .aggregate([...pipeline, { $count: 'total' }])
                  .toArray()
              )[0]?.total ?? 0);
          pipeline.push({
            $sort: { [definitions[q.sortBy]]: q.order === 'desc' ? -1 : 1, _id: 1 },
          });
          if (!all) pipeline.push({ $skip: (q.page - 1) * q.pageSize }, { $limit: q.pageSize });
          pipeline.push({
            $project: {
              number: 1,
              name: 1,
              url: 1,
              component: 1,
              intervalMinutes: 1,
              method: 1,
              status: 1,
              service: 1,
              serviceId: 1,
              lastCheck: 1,
              revision: 1,
            },
          });
          return {
            total,
            cursor: db.collection('monitors').aggregate(pipeline),
            view: (row) => ({
              ...view(row),
              serviceId: row.serviceId ? String(row.serviceId) : null,
              durationMs: row.lastCheck?.durationMs,
              checkedAt: row.lastCheck?.checkedAt,
            }),
          };
        },
      };
    }
    const [raw, people, operations] = await Promise.all([
      db
        .collection('monitors')
        .find(
          { userId: workspaceId },
          { projection: { serviceId: 1, paused: 1, lastCheck: 1, intervalMinutes: 1 } },
        )
        .toArray(),
      members(db, workspaceId),
      settings(db, workspaceId),
    ]);
    const health = serviceHealth(data.services, raw);
    const person = (value) =>
      people.find((p) => String(p._id) === value)?.displayName ||
      people.find((p) => String(p._id) === value)?.email ||
      'Unassigned';
    const serviceNames = (ids) =>
      ids
        .map((value) => data.services.find((s) => s.id === value)?.name || 'Deleted service')
        .join(', ') || 'None';
    const rows = data[kind].map((row) => ({
      ...row,
      status:
        kind === 'services'
          ? health.get(row.id)
          : rollupHealth(row.serviceIds.map((value) => health.get(value) ?? 'unknown')),
      monitors: raw.filter((m) => String(m.serviceId) === row.id).length,
      owners:
        [
          ...(row.ownerIds ?? []).map(person),
          ...(row.ownerGroupIds ?? []).map(
            (v) => (operations.groups ?? []).find((g) => g.id === v)?.name || 'Deleted group',
          ),
        ].join(', ') || 'Unassigned',
      contact: person(row.primaryContactId),
      dependencies: serviceNames(row.dependencyIds ?? []),
      collections:
        data.collections
          .filter((c) => c.serviceIds.includes(row.id))
          .map((c) => c.name)
          .join(', ') || 'None',
      services: serviceNames(row.serviceIds ?? []),
    }));
    for (const row of rows)
      row.health = { up: 'Operational', degraded: 'Degraded', down: 'Down', unknown: 'Unknown' }[
        row.status
      ];
    return embeddedTable(
      rows,
      kind === 'services'
        ? [
            'name',
            'health',
            'description',
            'monitors',
            'owners',
            'contact',
            'dependencies',
            'collections',
          ]
        : ['name', 'health', 'services'],
    );
  }
  const operations = await settings(db, workspaceId);
  if (kind === 'integrations')
    return embeddedTable(
      operations.integrations.map(({ secret, ...row }) => ({ ...row, configured: !!secret })),
      ['name', 'type', 'destination', 'enabled'],
    );
  const people = await members(db, workspaceId);
  const person = (value) =>
    people.find((p) => String(p._id) === value)?.displayName ||
    people.find((p) => String(p._id) === value)?.email ||
    'Deleted user';
  if (kind === 'groups')
    return embeddedTable(
      (operations.groups ?? []).map((row) => ({
        ...row,
        members: row.memberIds.map(person).join(', ') || 'No members',
      })),
      ['name', 'description', 'members'],
    );
  if (kind === 'coverage')
    return embeddedTable(
      operations.shifts
        .filter(
          (row) =>
            !req.query.serviceId ||
            !row.serviceIds.length ||
            row.serviceIds.includes(req.query.serviceId),
        )
        .map((row) => ({
          ...row,
          person: person(row.userId),
          services: row.serviceIds.length
            ? row.serviceIds
                .map(
                  (value) => data.services.find((s) => s.id === value)?.name || 'Deleted service',
                )
                .join(', ')
            : 'All services',
        })),
      ['person', 'services', 'start', 'end'],
      'start',
    );
  throw new InputError('Table not found.', 404);
}

/** Every table and export uses the same authorization, predicates, and column allowlist. */
export function installTableRoutes(app, db) {
  // Count-only queries avoid fetching inactive panels or their response bodies.
  app.get('/api/related-counts/:kind/:id', async (req, res) => {
    const kind = req.params.kind,
      recordId = req.params.id,
      workspaceId = req.workspaceId;
    const count = (name, filter) => db.collection(name).countDocuments(filter);
    if (kind === 'integrations' && recordId === 'all') {
      if (req.role !== 'admin') throw new InputError('Administrator access required.', 403);
      const [integrations, logs] = await Promise.all([
        settings(db, workspaceId).then((config) => (config.integrations || []).length),
        count('deliveries', { workspaceId }),
      ]);
      return res.json({ counts: { integrations, deliveries: logs } });
    }
    const _id = id(recordId);
    if (kind === 'services') {
      if (req.role === 'user') throw new InputError('Your role cannot view services.', 403);
      const data = await catalog(db, workspaceId);
      if (!data.services.some((service) => String(service.id) === recordId))
        throw new InputError('Service not found.', 404);
      const [incidents, tasks, knowledge, monitors] = await Promise.all([
        count('incidents', { workspaceId, serviceId: recordId }),
        count('tasks', { workspaceId, serviceId: recordId, status: { $ne: 'archived' } }),
        count('articles', { workspaceId, serviceId: recordId, status: { $ne: 'archived' } }),
        count('monitors', { userId: workspaceId, serviceId: _id }),
      ]);
      return res.json({ counts: { incidents, tasks, knowledge, monitors } });
    }
    if (kind === 'monitors') {
      if (req.role === 'user') throw new InputError('Your role cannot view monitors.', 403);
      if (
        !(await db
          .collection('monitors')
          .findOne({ _id, userId: workspaceId }, { projection: { _id: 1 } }))
      )
        throw new InputError('Monitor not found.', 404);
      return res.json({
        counts: {
          events: await count('events', {
            monitorId: _id,
            userId: workspaceId,
            checkedAt: { $gte: new Date(Date.now() - 30 * 86400000) },
          }),
        },
      });
    }
    if (!['incidents', 'tasks', 'knowledge'].includes(kind))
      throw new InputError('Record not found.', 404);
    const record = await parent(db, { ...req, query: { recordId } }, kind);
    if (req.role === 'user' && kind !== 'incidents')
      throw new InputError('Your role cannot view this record.', 403);
    const attachments = await count('attachments', {
      workspaceId,
      _id: {
        $in: (record.attachmentIds || [])
          .filter((value) => !embeddedImageIds(record.contentDocument).includes(value))
          .map(id),
      },
    });
    if (kind !== 'incidents') return res.json({ counts: { attachments } });
    const internal = ['admin', 'responder'].includes(req.role);
    const counts = {
      attachments,
      discussion: await count('incidentComments', {
        workspaceId,
        incidentId: _id,
        ...(!internal ? { kind: 'comment' } : {}),
      }),
      activity: (record.timeline || []).filter((row) => internal || row.kind !== 'work_note')
        .length,
    };
    if (req.role !== 'user') {
      const [tasks, knowledge, monitorEvents] = await Promise.all([
        count('tasks', { workspaceId, incidentId: recordId, status: { $ne: 'archived' } }),
        count('articles', { workspaceId, _id: { $in: (record.knowledgeIds || []).map(id) } }),
        db.collection('events').countDocuments({
          userId: workspaceId,
          checkedAt: { $gte: new Date(Date.now() - 30 * 86400000) },
          ...(record.triggeringChecks?.length
            ? {
                $or: record.triggeringChecks.slice(0, 1000).map((check) => ({
                  monitorId: id(check.monitorId),
                  checkedAt: new Date(check.checkedAt),
                })),
              }
            : { _id: { $in: [] } }),
        }),
      ]);
      Object.assign(counts, { tasks, knowledge, 'monitor-events': monitorEvents });
    }
    res.json({ counts });
  });
  app.get('/api/table-records/:kind/:id', async (req, res) => {
    if (typeof req.params.id !== 'string' || req.params.id.length > 256)
      throw new InputError('Record not found.', 404);
    const definition = await source(db, req);
    const item = await definition.record?.(req.params.id);
    if (!item) throw new InputError('Record not found.', 404);
    res.json({ item, fields: definition.fields, dateColumn: definition.dateColumn });
  });
  app.get('/api/tables/:kind', async (req, res) => {
    const table = await source(db, req),
      q = tableQuery(req.query, table.fields, table.dateColumn);
    const exporting = req.query.export === 'csv';
    const result = await table.read(q, exporting);
    if (!exporting) {
      const rows = [];
      for await (const row of result.cursor) rows.push(result.view(row));
      res.json({ rows, total: result.total, page: q.page, pageSize: q.pageSize });
      return;
    }
    res.set({
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${req.params.kind}.csv"`,
      'Cache-Control': 'private, no-store',
    });
    async function* output() {
      try {
        yield '\uFEFF' + csvRow(table.fields);
        for await (const row of result.cursor) {
          const item = result.view(row);
          yield csvRow(
            table.fields.map((field) =>
              item[field] instanceof Date ? item[field].toISOString() : item[field],
            ),
          );
        }
      } finally {
        await result.cursor.close?.();
      }
    }
    try {
      await pipeline(Readable.from(output()), res);
    } catch (error) {
      if (error.code !== 'ERR_STREAM_PREMATURE_CLOSE') throw error;
    }
  });
}
