import { ObjectId } from 'mongodb';
import { randomBytes } from 'node:crypto';
import {
  DEMO_COUNT,
  DEMO_TYPES,
  validateDemoAction,
} from '@servicetrident/shared/domain/demo-data';
import { InputError } from '@servicetrident/shared/validation/input-error';
import { requireAdmin, hashPassword } from '../auth/auth.js';
import { catalog } from './services.js';
import { settings } from '../repositories/settings.js';
import { demoFixtures } from '../fixtures/demo-fixtures.js';

const collections = [
  'users',
  'invitations',
  'monitors',
  'events',
  'eventAlerts',
  'incidents',
  'tasks',
  'projectMilestones',
  'projectActivity',
  'rcas',
  'articles',
  'knowledgeBases',
  'incidentComments',
  'attachments',
  'deliveries',
];
const leaseMs = 120000;
/** Scope every destructive operation by workspace and an unguessable, server-created batch marker. */
function scope(workspaceId, batchId, name) {
  return {
    [['monitors', 'events'].includes(name) ? 'userId' : 'workspaceId']: workspaceId,
    demoBatchId: batchId,
  };
}
/** Only public operation state is returned, never password hashes or fixture documents. */
function view(batch) {
  return batch
    ? {
        batchId: batch.batchId,
        status: batch.status,
        createdAt: batch.createdAt,
        createdBy: batch.createdBy,
        counts: batch.counts,
        recoverable:
          ['creating', 'deleting'].includes(batch.status) && +batch.leaseUntil < Date.now(),
      }
    : null;
}
/** Renew before each bounded database operation. Old interrupted requests cannot continue after recovery takes ownership. */
async function renew(db, workspaceId, token) {
  const result = await db
    .collection('demoData')
    .updateOne(
      { _id: workspaceId, operation: token },
      { $set: { leaseUntil: new Date(Date.now() + leaseMs) } },
      { maxTimeMS: 10000 },
    );
  if (!result.matchedCount)
    throw new InputError('The demo-data operation was superseded. Reload settings.', 409);
}
/** Install one workspace-level operation lock. Partial failures remain removable and block duplicate seeds. */
export function installDemoRoutes(app, db) {
  app.use('/api/settings/demo-data', requireAdmin);
  app.get('/api/settings/demo-data', async (req, res) =>
    res.json({
      batch: view(await db.collection('demoData').findOne({ _id: req.workspaceId })),
      types: DEMO_TYPES.map(([key, label]) => ({ key, label, count: DEMO_COUNT })),
    }),
  );
  app.post('/api/settings/demo-data', async (req, res) => {
    validateDemoAction('add', req.body);
    const workspaceId = req.workspaceId,
      batchId = String(new ObjectId()),
      operation = randomBytes(16).toString('hex');
    const batch = {
      _id: workspaceId,
      batchId,
      operation,
      status: 'creating',
      createdAt: new Date(),
      createdBy: req.user.email,
      leaseUntil: new Date(Date.now() + leaseMs),
      counts: Object.fromEntries(DEMO_TYPES.map(([key]) => [key, DEMO_COUNT])),
    };
    try {
      await db.collection('demoData').insertOne(batch);
    } catch (error) {
      if (error.code === 11000)
        throw new InputError(
          'Demo data already exists. Delete it before adding another dataset.',
          409,
        );
      throw error;
    }
    try {
      await catalog(db, workspaceId);
      const config = await settings(db, workspaceId);
      const fixtures = demoFixtures(
        workspaceId,
        req.user,
        batchId,
        config,
        await hashPassword(randomBytes(48).toString('hex')),
      );
      await renew(db, workspaceId, operation);
      await db.collection('catalogs').updateOne(
        { _id: workspaceId },
        {
          $push: {
            services: { $each: fixtures.services },
            collections: { $each: fixtures.collections },
          },
          $inc: { revision: 1 },
        },
        { maxTimeMS: 10000 },
      );
      await renew(db, workspaceId, operation);
      await db.collection('operations').updateOne(
        { _id: workspaceId },
        {
          $push: {
            projects: { $each: fixtures.projects },
            groups: { $each: fixtures.groups },
            shifts: { $each: fixtures.shifts },
            integrations: { $each: fixtures.integrations },
            eventRules: { $each: fixtures.eventRules },
            escalationPolicies: { $each: fixtures.escalationPolicies },
            maintenanceWindows: { $each: fixtures.maintenanceWindows },
            monitorProbes: { $each: fixtures.monitorProbes },
          },
          $inc: { revision: 1 },
        },
        { maxTimeMS: 10000 },
      );
      for (const name of collections) {
        await renew(db, workspaceId, operation);
        await db.collection(name).insertMany(fixtures[name], { ordered: true, maxTimeMS: 10000 });
      }
      const result = await db
        .collection('demoData')
        .findOneAndUpdate(
          { _id: workspaceId, operation },
          { $set: { status: 'active' }, $unset: { leaseUntil: '', operation: '' } },
          { returnDocument: 'after' },
        );
      res.status(201).json({ batch: view(result) });
    } catch (error) {
      await db
        .collection('demoData')
        .updateOne(
          { _id: workspaceId, operation },
          { $set: { status: 'failed' }, $unset: { leaseUntil: '', operation: '' } },
        );
      throw new InputError(
        'Demo setup did not finish. Delete the partial demo data before trying again.',
        409,
      );
    }
  });
  app.delete('/api/settings/demo-data', async (req, res) => {
    validateDemoAction('delete', req.body);
    const workspaceId = req.workspaceId,
      batchId = req.body.batchId,
      operation = randomBytes(16).toString('hex');
    const batch = await db.collection('demoData').findOneAndUpdate(
      {
        _id: workspaceId,
        batchId,
        $or: [{ status: { $in: ['active', 'failed'] } }, { leaseUntil: { $lt: new Date() } }],
      },
      { $set: { status: 'deleting', operation, leaseUntil: new Date(Date.now() + leaseMs) } },
      { returnDocument: 'after' },
    );
    if (!batch)
      throw new InputError(
        'Demo data changed or another operation is running. Reload settings.',
        409,
      );
    try {
      await renew(db, workspaceId, operation);
      await db.collection('catalogs').updateOne(
        { _id: workspaceId },
        {
          $pull: { services: { demoBatchId: batchId }, collections: { demoBatchId: batchId } },
          $inc: { revision: 1 },
        },
        { maxTimeMS: 10000 },
      );
      await renew(db, workspaceId, operation);
      await db.collection('operations').updateOne(
        { _id: workspaceId },
        {
          $pull: {
            projects: { demoBatchId: batchId },
            groups: { demoBatchId: batchId },
            shifts: { demoBatchId: batchId },
            integrations: { demoBatchId: batchId },
            eventRules: { demoBatchId: batchId },
            escalationPolicies: { demoBatchId: batchId },
            maintenanceWindows: { demoBatchId: batchId },
            monitorProbes: { demoBatchId: batchId },
          },
          $inc: { revision: 1 },
        },
        { maxTimeMS: 10000 },
      );
      for (const name of collections) {
        await renew(db, workspaceId, operation);
        await db
          .collection(name)
          .deleteMany(scope(workspaceId, batchId, name), { maxTimeMS: 10000 });
      }
      await db.collection('demoData').deleteOne({ _id: workspaceId, batchId, operation });
      res.json({ batch: null });
    } catch (error) {
      await db
        .collection('demoData')
        .updateOne(
          { _id: workspaceId, operation },
          { $set: { status: 'failed' }, $unset: { leaseUntil: '', operation: '' } },
        );
      throw new InputError(
        'Demo cleanup did not finish. Retry Delete demo data to finish safely.',
        409,
      );
    }
  });
}

/** Block ordinary writes only while bulk demo changes are running; audit fields cannot be client-authored. */
export function demoWriteGuard(db) {
  return async (req, res, next) => {
    if (
      ['GET', 'HEAD', 'OPTIONS'].includes(req.method) ||
      req.path.startsWith('/auth/') ||
      req.path === '/settings/demo-data'
    )
      return next();
    if (req.body && Object.hasOwn(req.body, 'demoBatchId'))
      throw new InputError('Demo markers are managed by the server.', 400);
    const batch = await db
      .collection('demoData')
      .findOne(
        { _id: req.workspaceId, status: { $in: ['creating', 'deleting'] } },
        { projection: { _id: 1 } },
      );
    if (batch)
      throw new InputError('Demo data is being updated. Wait for it to finish in Settings.', 409);
    next();
  };
}
