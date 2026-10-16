import { publicAppearanceCss } from '@servicetrident/shared/status/appearance';
import { installCollaborationRoutes } from './routes/collaboration.js';
import { validateInputShape } from './middleware/input-shape.js';
import { installRcaRoutes } from './routes/rcas.js';
import { installMachineRoutes, installServiceAccountSettings } from './routes/service-accounts.js';
import {
  installPublicIdentityRoutes,
  installIdentitySettings,
} from './routes/identity-providers.js';
import { installKnowledgeBases } from './routes/knowledge-bases.js';
import { installAI } from './routes/ai.js';
import { installStatusSubscriptions } from './routes/status-subscriptions.js';
import { installWorkspaceSettings } from './routes/workspace-settings.js';
import { auditActivity } from './middleware/audit.js';
import { installReferenceRoutes } from './routes/references.js';
import { installTableRoutes } from './routes/tables.js';
import { installRecordDeletionRoutes } from './routes/record-deletion.js';
import { sendStatusIcon } from './routes/status-icon.js';
import { installMarketingInbox } from './routes/marketing.js';
import { installDemoRoutes, demoWriteGuard } from './routes/demo-data.js';

import { installAttachmentRoutes } from './routes/attachments.js';
import { installSearchRoute } from './routes/search.js';
import { installWorkRoutes } from './routes/work.js';

import express from 'express';

import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';

import { InputError } from '@servicetrident/shared/validation/validation';
import { requireUser, requireAdmin } from './auth/auth.js';
import { isAllowedOrigin } from './middleware/origin.js';
import { installServiceRoutes } from './routes/services.js';
import { statusData } from './domain/status.js';
import { installOperationsRoutes } from './routes/operations.js';
import { installInviteRoute } from './routes/invite.js';

import { serializeMonitor } from './domain/monitor.js';

import { installPublicAuthRoutes } from './routes/auth-public.js';
import { installAccountRoutes } from './routes/account.js';
import { installMonitorRoutes } from './routes/monitors.js';
import { installEventRoutes } from './routes/events.js';
/** Build an Express API with injected database access for integration testing.
 * @param {import('mongodb').Db} db @returns {import('express').Express}
 */
export function createApp(db, { aiFetch, oidcFetch, integrationRequest } = {}) {
  const configuredOrigin = new URL(process.env.APP_ORIGIN ?? 'http://127.0.0.1:8090');
  if (!['http:', 'https:'].includes(configuredOrigin.protocol))
    throw new Error('APP_ORIGIN must use HTTP or HTTPS.');
  const appOrigin = configuredOrigin.origin;
  const app = express();
  app.disable('x-powered-by');
  if (process.env.TRUST_PROXY === '1') app.set('trust proxy', 1);
  app.use(helmet());
  app.use('/api', (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });
  app.use('/api', auditActivity(db));
  app.get('/api/health', async (req, res) => {
    await db.command({ ping: 1 });
    res.json({ status: 'ok' });
  });
  app.use(
    '/api',
    rateLimit({
      windowMs: 60000,
      limit: 180,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      message: { error: 'Too many requests. Try again in a minute.' },
    }),
  );
  app.use(express.json({ limit: '256kb' }));
  app.use('/api', validateInputShape);
  const machine = installMachineRoutes(app, db);
  installStatusSubscriptions(app, db, appOrigin);
  app.use('/api', (req, res, next) => {
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      const origin = req.get('origin');
      if (req.get('x-requested-with') !== 'ServiceTrident')
        throw new InputError('Missing request header. Reload the app and try again.', 403);
      if (origin && !isAllowedOrigin(origin, appOrigin)) {
        throw new InputError(
          `Request origin is not allowed. Open the app at ${appOrigin}, or update APP_ORIGIN and recreate the API.`,
          403,
        );
      }
      if (
        !req.is('application/json') &&
        !(
          req.method === 'POST' &&
          /^\/attachments\/(incidents|tasks|knowledge)$/.test(req.path) &&
          req.is('application/octet-stream')
        )
      )
        throw new InputError('Send an application/json request.', 415);
    }
    next();
  });
  const authLimit = rateLimit({
    windowMs: 15 * 60000,
    limit: 20,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { error: 'Too many sign-in attempts. Try again in 15 minutes.' },
  });
  installPublicAuthRoutes(app, db, authLimit);
  installPublicIdentityRoutes(app, db, authLimit, appOrigin, oidcFetch);

  app.get('/api/public/status/:token/appearance.css', async (req, res) => {
    if (!/^[a-f\d]{48}$/.test(req.params.token))
      throw new InputError('Status page not found.', 404);
    const page = await db
      .collection('catalogs')
      .findOne(
        { publicToken: req.params.token, visibility: 'public' },
        { projection: { statusTheme: 1 } },
      );
    if (!page) throw new InputError('Status page not found.', 404);
    req.workspaceId = page._id;
    res.type('text/css').send(publicAppearanceCss(page.statusTheme));
  });

  app.get('/api/public/status/:token/icon', async (req, res) => {
    if (!/^[a-f\d]{48}$/.test(req.params.token))
      throw new InputError('Status page not found.', 404);
    const page = await db
      .collection('catalogs')
      .findOne({ publicToken: req.params.token, visibility: 'public' });
    if (!page) throw new InputError('Status page not found.', 404);
    req.workspaceId = page._id;
    await sendStatusIcon(db, page._id, res);
  });
  app.get('/api/public/status/:token', async (req, res) => {
    if (!/^[a-f\d]{48}$/.test(req.params.token))
      throw new InputError('Status page not found.', 404);
    const page = await db
      .collection('catalogs')
      .findOne({ publicToken: req.params.token, visibility: 'public' });
    if (!page) throw new InputError('Status page not found.', 404);
    req.workspaceId = page._id;
    res.json(await statusData(db, page._id, serializeMonitor, true, req.query.range));
  });
  installInviteRoute(app, db, authLimit);
  app.use('/api', requireUser(db));
  installServiceAccountSettings(app, db);
  installAccountRoutes(app, db, authLimit);
  installIdentitySettings(app, db, appOrigin, oidcFetch, authLimit);
  installWorkspaceSettings(app, db);
  installTableRoutes(app, db);
  installReferenceRoutes(app, db);

  app.use(
    ['/api/monitors', '/api/services', '/api/collections', '/api/status-settings'],
    (req, res, next) => {
      if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return requireAdmin(req, res, next);
      next();
    },
  );
  app.use('/api', (req, res, next) => {
    // End users have an incident portal, not general workspace access.
    if (
      req.role === 'user' &&
      !/^\/(incidents|attachments)(?:\/|$)/.test(req.path) &&
      !(req.path === '/notifications/read' && req.method === 'POST') &&
      !(
        [
          '/search',
          '/services',
          '/members',
          '/incident-fields',
          '/notifications',
          '/communication-options',
        ].includes(req.path) && ['GET', 'HEAD'].includes(req.method)
      )
    )
      throw new InputError('Your role does not have access to this section.', 403);
    next();
  });
  installMarketingInbox(app, db);
  installDemoRoutes(app, db);
  app.use('/api', demoWriteGuard(db));
  installAttachmentRoutes(app, db);
  installOperationsRoutes(app, db, appOrigin, integrationRequest, machine);
  installKnowledgeBases(app, db);
  installAI(app, db, aiFetch);
  installCollaborationRoutes(app, db);
  installWorkRoutes(app, db, machine);
  installRcaRoutes(app, db);
  installRecordDeletionRoutes(app, db);
  installSearchRoute(app, db);
  installServiceRoutes(app, db);
  installMonitorRoutes(app, db);

  app.get('/api/status', async (req, res) =>
    res.json(await statusData(db, req.workspaceId, serializeMonitor, false, req.query.range)),
  );

  installEventRoutes(app, db);

  app.use((req, res) => res.status(404).json({ error: 'Route not found.' }));
  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    if (error instanceof InputError)
      return res.status(error.status).json({ error: error.message, fields: error.fields });
    if (error.type === 'entity.parse.failed')
      return res.status(400).json({ error: 'Invalid JSON body.' });
    if (error.type === 'entity.too.large')
      return res.status(413).json({ error: 'Request body is too large.' });
    // Stack frames identify code locations without logging error messages or request data.
    const frames =
      typeof error.stack === 'string'
        ? error.stack
            .split('\n')
            .slice(1, 5)
            .filter((line) => /^\s+at /.test(line))
            .map((line) => line.slice(0, 240))
        : [];
    console.error(
      'API request failed:',
      error.name,
      error.code ?? 'unknown',
      typeof req.route?.path === 'string' ? req.route.path : '/api/unknown',
      frames.join(' | '),
    );
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  });
  return app;
}
