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
      events: items.map(({ _id, checkedAt, status, statusCode, durationMs, error, timing }) => ({
        timing: timing ?? null,
        id: _id.toHexString(),
        checkedAt,
        status,
        statusCode,
        durationMs,
        error,
      })),
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
    const { _id, checkedAt, status, statusCode, durationMs, error, details, timing } = event;
    // Both identity and timestamp must match the same saved trigger, never separate array entries.
    const incidents = await db
      .collection('incidents')
      .find(
        {
          workspaceId: req.workspaceId,
          triggeringChecks: { $elemMatch: { monitorId: String(monitorId), checkedAt } },
        },
        { projection: { _id: 1, title: 1, status: 1 } },
      )
      .sort({ createdAt: -1, _id: -1 })
      .limit(101)
      .toArray();
    res.json({
      incidents: incidents
        .slice(0, 100)
        .map((incident) => ({
          id: String(incident._id),
          title: incident.title,
          status: incident.status,
        })),
      incidentsTruncated: incidents.length > 100,
      monitor: { id: monitorId.toHexString(), name: monitor.name },
      event: {
        id: _id.toHexString(),
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
