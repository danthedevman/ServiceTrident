import { randomBytes, timingSafeEqual } from 'node:crypto';
import { ObjectId } from 'mongodb';
import { rateLimit } from 'express-rate-limit';
import { requireAdmin, digestToken } from '../auth/auth.js';
import { settings, save } from '../repositories/settings.js';
import { InputError } from '@servicetrident/shared/validation/input-error';
import { identifier, text } from '@servicetrident/shared/validation/fields';
import { normalizedMonitorEvent } from '@servicetrident/shared/domain/events';
const safeProbe = ({ tokenHash: _hash, ...probe }) => probe;
export function installProbeSettings(app, db) {
  app.get('/api/monitor-probes', requireAdmin, async (req, res) => {
    const config = await settings(db, req.workspaceId);
    res.json({ revision: config.revision, probes: (config.monitorProbes || []).map(safeProbe) });
  });
  app.post('/api/monitor-probes', requireAdmin, async (req, res) => {
    const config = await settings(db, req.workspaceId);
    if ((config.monitorProbes || []).length >= 100)
      throw new InputError('Keep at most 100 probe agents.');
    const token = randomBytes(32).toString('hex');
    const probe = {
      id: String(new ObjectId()),
      name: text(req.body.name, 'name', 80),
      region: text(req.body.region, 'region', 80),
      enabled: true,
      tokenHash: digestToken(token),
      expiresAt: new Date(Date.now() + 90 * 86400000).toISOString(),
    };
    await save(db, config, req.body.revision, {
      monitorProbes: [...(config.monitorProbes || []), probe],
    });
    res.status(201).json({ probe: safeProbe(probe), token });
  });
  app.delete('/api/monitor-probes/:id', requireAdmin, async (req, res) => {
    const config = await settings(db, req.workspaceId);
    const id = identifier(req.params.id);
    await save(db, config, req.body.revision, {
      monitorProbes: (config.monitorProbes || []).filter((probe) => probe.id !== id),
    });
    await db
      .collection('monitors')
      .updateMany(
        { userId: req.workspaceId, confirmationProbeId: id },
        { $set: { confirmationCheck: null } },
      );
    await db.collection('probeJobs').deleteMany({ workspaceId: req.workspaceId, probeId: id });
    res.json({ ok: true });
  });
}
export function installProbeEndpoints(app, db) {
  const limit = rateLimit({
    windowMs: 60000,
    limit: 120,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
  });
  app.use('/api/probe/v1/:probeId', limit, async (req, res, next) => {
    const configured = new URL(process.env.APP_ORIGIN || 'http://127.0.0.1:8090');
    const local =
      ['localhost', '127.0.0.1', '[::1]'].includes(configured.hostname) &&
      ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.ip);
    if (!req.secure && !local)
      throw new InputError('HTTPS is required for probe credentials.', 403);
    const probeId = identifier(req.params.probeId);
    if (
      req.headers.cookie ||
      Object.keys(req.query).length ||
      !/^Bearer [a-f\d]{64}$/.test(req.get('authorization') || '')
    )
      throw new InputError('Invalid probe credential.', 401);
    const config = await db.collection('operations').findOne({
      monitorProbes: {
        $elemMatch: { id: probeId, enabled: true, expiresAt: { $gt: new Date().toISOString() } },
      },
    });
    const probe = config?.monitorProbes.find((row) => row.id === probeId);
    const actual = Buffer.from(digestToken(req.get('authorization').slice(7)), 'hex'),
      expected = Buffer.from(probe?.tokenHash || '0'.repeat(64), 'hex');
    if (!probe || expected.length !== actual.length || !timingSafeEqual(actual, expected))
      throw new InputError('Invalid probe credential.', 401);
    req.workspaceId = config._id;
    req.probe = probe;
    req.actualRole = req.role = 'probe';
    next();
  });
  app.post('/api/probe/v1/:probeId/jobs', async (req, res) => {
    if (!req.body || Object.keys(req.body).length)
      throw new InputError('This action accepts an empty object only.');
    const now = new Date();
    const job = await db.collection('probeJobs').findOneAndUpdate(
      {
        workspaceId: req.workspaceId,
        probeId: req.probe.id,
        status: 'queued',
        expiresAt: { $gt: now },
      },
      {
        $set: {
          status: 'leased',
          leaseId: randomBytes(16).toString('hex'),
          leaseUntil: new Date(+now + 60000),
        },
      },
      { returnDocument: 'after', sort: { createdAt: 1 } },
    );
    res.json({
      job: job
        ? {
            id: String(job._id),
            leaseId: job.leaseId,
            url: job.url,
            method: job.method,
            followRedirects: job.followRedirects,
            keyword: job.keyword,
          }
        : null,
    });
  });
  app.post('/api/probe/v1/:probeId/results', async (req, res) => {
    const body = req.body;
    if (
      !body ||
      Object.keys(body).some(
        (key) => !['jobId', 'leaseId', 'status', 'statusCode', 'durationMs'].includes(key),
      ) ||
      !['up', 'down'].includes(body.status) ||
      (body.status === 'up' && !(body.statusCode >= 200 && body.statusCode < 400)) ||
      !(
        body.statusCode === null ||
        (Number.isInteger(body.statusCode) && body.statusCode >= 100 && body.statusCode <= 599)
      ) ||
      !Number.isInteger(body.durationMs) ||
      body.durationMs < 0 ||
      body.durationMs > 120000 ||
      !/^[a-f\d]{32}$/.test(body.leaseId || '')
    )
      throw new InputError('Send a valid bounded probe result.');
    const now = new Date();
    const job = await db.collection('probeJobs').findOneAndUpdate(
      {
        _id: new ObjectId(identifier(body.jobId)),
        workspaceId: req.workspaceId,
        probeId: req.probe.id,
        status: 'leased',
        leaseId: body.leaseId,
        leaseUntil: { $gt: now },
      },
      { $set: { status: 'completed' } },
      { returnDocument: 'after' },
    );
    if (!job) throw new InputError('Probe job expired or was already completed.', 409);
    const monitor = await db.collection('monitors').findOne({
      _id: job.monitorId,
      userId: req.workspaceId,
      confirmationProbeId: req.probe.id,
      url: job.url,
      paused: { $ne: true },
    });
    if (
      !monitor ||
      monitor.authSecret ||
      (monitor.method || 'GET') !== job.method ||
      JSON.stringify(monitor.keyword || null) !== JSON.stringify(job.keyword || null)
    )
      throw new InputError('Monitor settings changed.', 409);
    const checkedAt = job.createdAt;
    const sample = {
      probeId: req.probe.id,
      expiresAt: req.probe.expiresAt,
      region: req.probe.region,
      targetUrl: job.url,
      method: job.method,
      keywordKey: JSON.stringify(job.keyword || null),
      checkedAt,
      receivedAt: now,
      status: body.status,
      statusCode: body.statusCode,
      durationMs: body.durationMs,
    };
    await db.collection('monitors').updateOne(
      {
        _id: monitor._id,
        userId: req.workspaceId,
        $or: [
          { 'confirmationCheck.checkedAt': { $lt: checkedAt } },
          { confirmationCheck: { $exists: false } },
          { confirmationCheck: null },
        ],
      },
      { $set: { confirmationCheck: sample } },
    );
    await db.collection('events').insertOne(
      normalizedMonitorEvent(monitor, {
        _id: new ObjectId(),
        monitorId: monitor._id,
        userId: req.workspaceId,
        checkedAt,
        receivedAt: now,
        probeId: req.probe.id,
        region: req.probe.region,
        status: body.status,
        statusCode: body.statusCode,
        durationMs: body.durationMs,
        details: { method: job.method, responses: [], probe: true },
        error: body.status === 'down' ? 'Independent probe check failed.' : null,
      }),
    );
    res.json({ ok: true });
  });
}
