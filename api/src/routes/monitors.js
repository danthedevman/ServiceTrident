import { prepareMonitorAuthentication } from '../domain/monitor-auth.js';
import { workspaceSettings } from '@servicetrident/shared/domain/workspace-settings';
import { auditStamp } from '@servicetrident/shared/domain/audit';

import { InputError, validateMonitor } from '@servicetrident/shared/validation/validation';

import { monitorPlacement, requireMonitor } from './services.js';

import { serializeMonitor } from '../domain/monitor.js';
import { objectId } from '../domain/identifiers.js';
/** Register monitor CRUD routes; authentication and workspace policy run in app.js. */
export function installMonitorRoutes(app, db) {
  app.get('/api/monitors', async (req, res) => {
    const monitors = await db
      .collection('monitors')
      .find({ userId: req.workspaceId })
      .sort({ createdAt: -1 })
      .toArray();
    res.json({
      monitors: monitors.map((monitor) =>
        serializeMonitor(monitor, { includeAuthenticationConfig: req.role === 'admin' }),
      ),
    });
  });
  app.post('/api/monitors/:id/check', async (req, res) => {
    const monitor = await requireMonitor(db, req.params.id, req.workspaceId);
    if (
      req.body != null &&
      (typeof req.body !== 'object' || Array.isArray(req.body) || Object.keys(req.body).length)
    )
      throw new InputError('This action does not accept monitor settings.', 400);
    if (monitor.demoBatchId || (monitor.type && monitor.type !== 'http'))
      throw new InputError('This monitor cannot run a manual check.', 400);
    const requested = await db.collection('monitors').findOneAndUpdate(
      {
        _id: monitor._id,
        userId: req.workspaceId,
        demoBatchId: { $exists: false },
        type: { $in: [null, 'http'] },
        manualCheckPending: { $ne: true },
        $expr: {
          $lte: [
            { $ifNull: ['$lastManualCheckRequestedAt', new Date(0)] },
            { $dateAdd: { startDate: '$$NOW', unit: 'minute', amount: -1 } },
          ],
        },
      },
      [
        {
          $set: {
            manualCheckPending: true,
            lastManualCheckRequestedAt: '$$NOW',
            // Preserve the one-minute safety interval even when a scheduled check is already running.
            nextCheckAt: {
              $max: [
                '$$NOW',
                {
                  $dateAdd: {
                    startDate: { $ifNull: ['$lastStartedAt', new Date(0)] },
                    unit: 'minute',
                    amount: 1,
                  },
                },
              ],
            },
            updatedAt: '$$NOW',
            updatedBy: { $literal: req.user.email || req.user.displayName || 'System' },
            updatedById: { $literal: String(req.user._id) },
            revision: { $add: [{ $ifNull: ['$revision', -1] }, 1] },
          },
        },
      ],
      { returnDocument: 'after' },
    );
    if (!requested)
      throw new InputError(
        'A check is already queued or was requested within the last minute. Try again shortly.',
        429,
      );
    res
      .status(202)
      .json({ monitor: serializeMonitor(requested, { includeAuthenticationConfig: true }) });
  });
  app.post('/api/monitors', async (req, res) => {
    const owner = await db
      .collection('users')
      .findOne({ _id: req.workspaceId }, { projection: { workspaceSettings: 1 } });
    const preferences = workspaceSettings(owner?.workspaceSettings);
    const body = {
      intervalMinutes: preferences.defaultIntervalMinutes,
      method: preferences.defaultMethod,
      followRedirects: preferences.defaultFollowRedirects,
      ...req.body,
    };
    const input = {
      ...validateMonitor(body, { requireService: true }),
      ...(await monitorPlacement(db, req.body, req.workspaceId)),
      ...prepareMonitorAuthentication(
        req.body.authentication,
        null,
        body.url,
        body.followRedirects,
      ),
    };
    const quota = await db.collection('users').updateOne(
      {
        _id: req.workspaceId,
        $expr: { $lt: ['$monitorCount', { $ifNull: ['$workspaceSettings.monitorLimit', 50] }] },
      },
      { $inc: { monitorCount: 1 } },
    );
    if (!quota.modifiedCount)
      throw new InputError(
        'The workspace monitor limit has been reached. An admin can adjust it in Settings.',
        409,
      );
    const monitor = {
      ...auditStamp(null, req.user),
      ...input,
      userId: req.workspaceId,
      paused: false,
      createdAt: new Date(),
      nextCheckAt: new Date(),
      lastCheck: null,
    };
    let inserted;
    try {
      inserted = await db.collection('monitors').insertOne(monitor);
    } catch (error) {
      await db
        .collection('users')
        .updateOne({ _id: req.workspaceId }, { $inc: { monitorCount: -1 } });
      throw error;
    }
    res.status(201).json({
      monitor: serializeMonitor(
        { ...monitor, _id: inserted.insertedId },
        { includeAuthenticationConfig: true },
      ),
    });
  });
  app.get('/api/monitors/:id', async (req, res) => {
    const monitor = await requireMonitor(db, req.params.id, req.workspaceId);
    if (!monitor) throw new InputError('Monitor not found.', 404);
    res.json({
      monitor: serializeMonitor(monitor, { includeAuthenticationConfig: req.role === 'admin' }),
    });
  });
  app.patch('/api/monitors/:id', async (req, res) => {
    const body = req.body;
    const allowed = [
      'type',
      'name',
      'url',
      'intervalMinutes',
      'method',
      'followRedirects',
      'paused',
      'serviceId',
      'component',
      'authentication',
      'keyword',
    ];
    if (
      !body ||
      typeof body !== 'object' ||
      Array.isArray(body) ||
      !Object.keys(body).length ||
      Object.keys(body).some((key) => !allowed.includes(key))
    ) {
      throw new InputError(
        'Provide monitor settings such as name, URL, intervalMinutes, method, followRedirects, paused, serviceId, or component.',
      );
    }
    if ('paused' in body && typeof body.paused !== 'boolean')
      throw new InputError('paused must be a boolean.');
    const current = await requireMonitor(db, req.params.id, req.workspaceId);
    if (current.type && current.type !== 'http')
      throw new InputError(
        'This monitor type has been retired. Create an HTTP/HTTPS monitor instead.',
        409,
      );
    if (current.demoBatchId && body.paused === false)
      throw new InputError(
        'Demo monitors remain paused. Create a real monitor to run checks.',
        400,
        { paused: 'Demo monitors cannot run checks.' },
      );
    const filter = {
      revision: current.revision ?? { $exists: false },
      _id: current._id,
      userId: req.workspaceId,
      serviceId: current.serviceId ?? null,
    };
    if (!current) throw new InputError('Monitor not found.', 404);
    if (body.type && body.type !== (current.type || 'http'))
      throw new InputError('Create a new monitor to change its provider.');
    const input = {
      ...validateMonitor({ ...current, ...body }),
      ...(await monitorPlacement(db, body, req.workspaceId, current)),
      ...prepareMonitorAuthentication(
        body.authentication,
        current,
        body.url ?? current.url,
        body.followRedirects ?? current.followRedirects,
      ),
    };
    const updates = Object.fromEntries(
      Object.entries({ ...input, ...auditStamp(current, req.user) }).map(([key, value]) => [
        key,
        { $literal: value },
      ]),
    );
    if ('paused' in body) updates.paused = body.paused;
    const requestChanged =
      JSON.stringify(input.keyword) !== JSON.stringify(current.keyword ?? null) ||
      input.url !== current.url ||
      input.method !== (current.method ?? 'GET') ||
      input.followRedirects !== (current.followRedirects === true) ||
      (input.authSecret ?? null) !== (current.authSecret ?? null);
    if (requestChanged) updates.lastCheck = null;
    if (requestChanged || input.intervalMinutes !== current.intervalMinutes) {
      // Use the latest claim timestamp, even if a worker started after the read above.
      updates.nextCheckAt = {
        $max: [
          '$$NOW',
          {
            $dateAdd: {
              startDate: { $ifNull: ['$lastStartedAt', '$$NOW'] },
              unit: 'minute',
              amount: { $cond: [{ $ifNull: ['$lastStartedAt', false] }, input.intervalMinutes, 0] },
            },
          },
        ],
      };
    }
    const monitor = await db.collection('monitors').findOneAndUpdate(
      {
        ...filter,
        name: current.name,
        url: current.url,
        intervalMinutes: current.intervalMinutes,
        $expr: {
          $and: [
            { $eq: [{ $ifNull: ['$method', 'GET'] }, current.method ?? 'GET'] },
            { $eq: [{ $ifNull: ['$followRedirects', false] }, current.followRedirects === true] },
          ],
        },
      },
      [{ $set: updates }],
      { returnDocument: 'after' },
    );
    if (!monitor) throw new InputError('This monitor changed. Reload it and try again.', 409);
    res.json({
      monitor: serializeMonitor(monitor, { includeAuthenticationConfig: req.role === 'admin' }),
    });
  });
  app.delete('/api/monitors/:id', async (req, res) => {
    const _id = objectId(req.params.id);
    const current = await requireMonitor(db, req.params.id, req.workspaceId);
    const result = await db
      .collection('monitors')
      .deleteOne({ _id, userId: req.workspaceId, serviceId: current.serviceId ?? null });
    if (!result.deletedCount) throw new InputError('Monitor not found.', 404);
    await Promise.all([
      current.demoBatchId
        ? Promise.resolve()
        : db.collection('users').updateOne({ _id: current.userId }, { $inc: { monitorCount: -1 } }),
      db.collection('events').deleteMany({ monitorId: _id }),
      db.collection('eventAlerts').deleteMany({
        workspaceId: req.workspaceId,
        monitorId: String(_id),
        sourceType: 'monitor',
      }),
    ]);
    res.status(204).end();
  });
}
