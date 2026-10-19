import { requireResponder } from '../auth/auth.js';
import { eventIncidents, eventLinkKey } from '../repositories/event-incidents.js';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { csvRow } from '@servicetrident/shared/files/csv';

import { InputError } from '@servicetrident/shared/validation/validation';

import { requireMonitor, catalog } from './services.js';
import { workspaceMonitorEvents } from '../repositories/workspace-monitor-events.js';

import { eventQuery } from '../domain/event-query.js';

import { objectId } from '../domain/identifiers.js';
/** Register monitor history, detail, and CSV routes; authentication and workspace policy run in app.js. */
export function installEventRoutes(app, db) {
  const staff = (req) => {
    if (req.role === 'user') throw new InputError('Your role cannot view events.', 403);
  };
  const alert = async (req) => {
    staff(req);
    const item = await db
      .collection('eventAlerts')
      .findOne({ _id: objectId(req.params.id), workspaceId: req.workspaceId });
    if (!item) throw new InputError('Alert not found.', 404);
    return item;
  };
  const alertView = ({ _id, workspaceId: _workspaceId, eventOrder: _order, ...rest }) => ({
    id: String(_id),
    ...rest,
  });
  app.get('/api/event-alerts/:id', async (req, res) => {
    const item = await alert(req);
    const incidents = await db
      .collection('incidents')
      .find(
        {
          workspaceId: req.workspaceId,
          $or: [
            { eventAlertId: String(item._id) },
            ...(item.monitorId
              ? [{ triggeringChecks: { $elemMatch: { monitorId: item.monitorId } } }]
              : []),
          ],
        },
        { projection: { title: 1, status: 1, number: 1 } },
      )
      .sort({ createdAt: -1 })
      .limit(100)
      .toArray();
    res.json({
      item: alertView(item),
      incidents: incidents.map(({ _id, ...row }) => ({ id: String(_id), ...row })),
    });
  });
  app.patch('/api/event-alerts/:id', requireResponder, async (req, res) => {
    const item = await alert(req),
      body = req.body;
    if (
      !body ||
      Object.keys(body).some((key) => !['status', 'revision', 'confirm'].includes(key)) ||
      !['open', 'acknowledged', 'resolved'].includes(body.status) ||
      !Number.isInteger(body.revision)
    )
      throw new InputError('Choose an alert state and current revision.');
    if (body.confirm !== true) throw new InputError('Confirm this alert state change.');
    const update = {
      status: body.status,
      updatedAt: new Date(),
      updatedBy: req.user.displayName || req.user.email,
      updatedById: String(req.user._id),
    };
    const result = await db
      .collection('eventAlerts')
      .updateOne(
        { _id: item._id, workspaceId: req.workspaceId, revision: body.revision },
        { $set: update, $inc: { revision: 1 } },
      );
    if (!result.matchedCount)
      throw new InputError('This alert changed. Refresh and try again.', 409);
    res.json({ item: alertView({ ...item, ...update, revision: item.revision + 1 }) });
  });
  app.get('/api/events/:id', async (req, res) => {
    staff(req);
    const event = await db.collection('events').findOne({
      _id: objectId(req.params.id),
      userId: req.workspaceId,
      checkedAt: { $gte: new Date(Date.now() - 30 * 86400000) },
    });
    if (!event) throw new InputError('Event not found or expired.', 404);
    const monitor = event.monitorId
      ? await requireMonitor(db, String(event.monitorId), req.workspaceId)
      : null;
    const links = await eventIncidents(db, req.workspaceId, [event]);
    const incidents = links.get(eventLinkKey(event)) || [];
    const keys = [
      'number',
      'title',
      'description',
      'sourceType',
      'sourceName',
      'eventType',
      'severity',
      'signal',
      'serviceId',
      'serviceName',
      'alertId',
      'externalId',
      'payload',
      'region',
      'probeId',
      'matchedRuleIds',
      'suppressed',
      'actionError',
      'ruleIncidentId',
      'correlationKey',
      'occurredAt',
      'receivedAt',
      'checkedAt',
      'status',
      'statusCode',
      'durationMs',
      'error',
      'timing',
      'details',
    ];
    res.json({
      event: {
        id: String(event._id),
        ...Object.fromEntries(
          keys.filter((key) => event[key] !== undefined).map((key) => [key, event[key]]),
        ),
      },
      monitor: monitor
        ? { id: String(monitor._id), name: monitor.name, serviceId: monitor.serviceId }
        : null,
      incidents: incidents.slice(0, 100),
      incidentsTruncated: incidents.length > 100,
    });
  });

  app.get('/api/event-metrics', async (req, res) => {
    if (req.role === 'user') throw new InputError('Your role cannot view monitor events.', 403);
    const data = await catalog(db, req.workspaceId);
    res.json(
      await workspaceMonitorEvents(
        db,
        req.workspaceId,
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
      ).metrics(),
    );
  });
  app.get('/api/monitors/:id/events', async (req, res) => {
    const monitorId = objectId(req.params.id);
    const monitor = await requireMonitor(db, req.params.id, req.workspaceId);
    const query = eventQuery(req.query);
    const filter = { monitorId, userId: monitor.userId, ...query.filter };
    // Preserve the original newest-first cursor API for existing clients.
    const legacyCursor = req.query.before !== undefined;
    const legacyPaging =
      legacyCursor ||
      (req.query.page === undefined &&
        req.query.sortBy === undefined &&
        req.query.order === undefined);
    if (legacyCursor) filter._id = { $lt: objectId(req.query.before) };
    const [total, events] = await Promise.all([
      db.collection('events').countDocuments(filter),
      db
        .collection('events')
        .find(filter, { projection: { details: 0 } })
        .sort(legacyPaging ? { _id: -1 } : query.sort)
        .skip(legacyCursor ? 0 : (query.page - 1) * query.pageSize)
        .limit(query.pageSize + 1)
        .toArray(),
    ]);
    const items = events.slice(0, query.pageSize);
    res.json({
      events: items.map(
        ({ _id, checkedAt, status, statusCode, durationMs, error, timing, number }) => ({
          timing: timing ?? null,
          id: _id.toHexString(),
          number,
          checkedAt,
          status,
          statusCode,
          durationMs,
          error,
        }),
      ),
      nextCursor:
        legacyPaging && events.length > query.pageSize ? items.at(-1)._id.toHexString() : null,
      page: legacyCursor ? 1 : query.page,
      pageSize: query.pageSize,
      total,
      totalPages: Math.ceil(total / query.pageSize),
    });
  });
  /** Export every matching history row using the exact list filters, sort, ownership, and retention. */
  app.get('/api/monitors/:id/events/export', async (req, res) => {
    const monitor = await requireMonitor(db, req.params.id, req.workspaceId);
    const { filter, sort } = eventQuery(req.query);
    filter.checkedAt.$lte = new Date();
    const cursor = db
      .collection('events')
      .find(
        { monitorId: monitor._id, userId: req.workspaceId, ...filter },
        { projection: { details: 0 } },
      )
      .sort(sort)
      .batchSize(250);
    res.type('text/csv; charset=utf-8');
    res.attachment(`monitor-${monitor._id.toHexString()}-events.csv`);
    /** Stream a bounded database batch at a time; disconnects close the cursor. */
    async function* rows() {
      try {
        yield '\uFEFF' +
          csvRow([
            'Event ID',
            'Checked at (UTC)',
            'Status',
            'HTTP',
            'Response (ms)',
            'Start delay (ms)',
            'Error',
          ]);
        for await (const event of cursor)
          yield csvRow([
            event._id.toHexString(),
            event.checkedAt.toISOString(),
            event.status,
            event.statusCode,
            event.durationMs,
            event.timing?.scheduleDelayMs,
            event.error,
          ]);
      } finally {
        await cursor.close();
      }
    }
    try {
      await pipeline(Readable.from(rows()), res);
    } catch (error) {
      if (error.code !== 'ERR_STREAM_PREMATURE_CLOSE') throw error;
    }
  });
  app.get('/api/monitors/:id/events/:eventId', async (req, res) => {
    const monitorId = objectId(req.params.id);
    const eventId = objectId(req.params.eventId);
    const monitor = await requireMonitor(db, req.params.id, req.workspaceId);
    if (!monitor) throw new InputError('Monitor not found.', 404);
    const event = await db.collection('events').findOne({
      _id: eventId,
      monitorId,
      userId: monitor.userId,
      checkedAt: { $gte: new Date(Date.now() - 30 * 86400000) },
    });
    if (!event) throw new InputError('Check event not found or expired.', 404);
    const {
      _id,
      checkedAt,
      status,
      statusCode,
      durationMs,
      error,
      details,
      timing,
      number,
      region,
    } = event;
    // Both identity and timestamp must match the same saved trigger, never separate array entries.
    const incidents = await db
      .collection('incidents')
      .find(
        {
          workspaceId: req.workspaceId,
          $or: [
            { triggeringChecks: { $elemMatch: { monitorId: String(monitorId), checkedAt } } },
            ...(event.alertId ? [{ eventAlertId: event.alertId }] : []),
          ],
        },
        { projection: { _id: 1, title: 1, status: 1, number: 1 } },
      )
      .sort({ createdAt: -1, _id: -1 })
      .limit(101)
      .toArray();
    res.json({
      incidents: incidents.slice(0, 100).map((incident) => ({
        id: String(incident._id),
        title: incident.title,
        number: incident.number,
        status: incident.status,
      })),
      incidentsTruncated: incidents.length > 100,
      monitor: {
        id: monitorId.toHexString(),
        name: monitor.name,
        serviceId: monitor.serviceId ? String(monitor.serviceId) : null,
      },
      event: {
        region,
        id: _id.toHexString(),
        ...Object.fromEntries(
          [
            'title',
            'description',
            'sourceType',
            'sourceName',
            'eventType',
            'severity',
            'signal',
            'serviceId',
            'serviceName',
            'alertId',
            'occurredAt',
          ]
            .filter((key) => event[key] !== undefined)
            .map((key) => [key, event[key]]),
        ),
        number,
        checkedAt,
        status,
        statusCode,
        durationMs,
        error,
        timing: timing ?? null,
        details: details ?? null,
      },
    });
  });
}
