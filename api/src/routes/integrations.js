import { providerRequest } from '@servicetrident/shared/integrations/provider-request';
import {
  serviceNowHeaders,
  serviceNowCaller,
} from '@servicetrident/shared/integrations/servicenow';
import { providers } from '@servicetrident/shared/integrations/providers';
import { providerFields } from '@servicetrident/shared/integrations/provider-fields';
import { integrationErrors } from '@servicetrident/shared/integrations/integration-validation';
import { isPublicAddress } from '@servicetrident/shared/validation/validation';
import { isIP } from 'node:net';
import { auditStamp } from '@servicetrident/shared/domain/audit';

import { InputError } from '@servicetrident/shared/validation/validation';
import {
  text,
  choice,
  identifier,
  references,
  invalid,
} from '@servicetrident/shared/validation/fields';

import { seal, unseal } from '@servicetrident/shared/integrations/secrets';
import { integrationUrl } from '@servicetrident/shared/integrations/provider-url';
import { catalog } from './services.js';
import { requireAdmin } from '../auth/auth.js';
import { settings } from '../repositories/settings.js';
import { save } from '../repositories/settings.js';

/** Register integrations routes; authentication and workspace policy run in app.js. */
export function installIntegrationsRoutes(app, db, appOrigin, request = providerRequest) {
  app.get('/api/integrations', requireAdmin, async (req, res) => {
    const data = await settings(db, req.workspaceId);
    res.json({
      revision: data.revision,
      integrations: data.integrations.map(({ secret, ...item }) => ({
        ...item,
        configured: !!secret,
        ...(item.type === 'servicenow' && secret
          ? (() => {
              const saved = unseal(secret);
              return {
                instanceUrl: integrationUrl(saved.url, 'servicenow'),
                authType: saved.authType || 'basic',
                clientId: saved.authType === 'oauth' ? saved.clientId : '',
                scope: saved.authType === 'oauth' ? saved.scope || '' : '',
              };
            })()
          : {}),
      })),
      encryptionReady: /^[a-f\d]{64}$/i.test(process.env.INTEGRATION_ENCRYPTION_KEY ?? ''),
    });
  });
  app.put('/api/integrations/:id', requireAdmin, async (req, res) => {
    const data = await settings(db, req.workspaceId),
      integrationId = identifier(req.params.id);
    const previous = data.integrations.find((i) => i.id === integrationId);
    if (!previous && data.integrations.filter((item) => !item.demoBatchId).length >= 20)
      invalid('name', 'Use at most 20 integrations.');
    const body = req.body;
    if (previous?.demoBatchId && body.enabled)
      invalid('enabled', 'Demo integrations cannot send messages.');
    const type = choice(
      body.type,
      providers.map((provider) => provider.id),
      'type',
    );
    if (previous && previous.type !== type)
      invalid('type', 'Create a new integration to change its type.');
    const serviceIds = references(
      body.serviceIds ?? [],
      (await catalog(db, req.workspaceId)).services.map((s) => s.id),
      'serviceIds',
    );
    let secrets = previous?.secret ? unseal(previous.secret) : {};
    const fields = integrationErrors(
      {
        ...body,
        onCall: body.onCall ?? false,
        recovery: body.recovery ?? false,
        enabled: body.enabled ?? false,
      },
      {
        configured:
          !!previous?.secret &&
          (type !== 'servicenow' || (body.authType || 'basic') === (secrets.authType || 'basic')),
        smtpConfigured: !!previous?.smtpConfigured,
      },
    );
    if (Object.keys(fields).length)
      throw new InputError('Check the highlighted integration fields.', 400, fields);
    if (type === 'email' && (body.smtpHost || !secrets.smtp)) {
      const host = text(body.smtpHost, 'smtpHost', 253).toLowerCase();
      if (isIP(host) && !isPublicAddress(host)) invalid('smtpHost', 'Use a public SMTP server.');
      secrets.smtp = {
        host,
        port: Number(body.smtpPort),
        from: text(body.smtpFrom, 'smtpFrom', 254),
        user: text(body.smtpUser ?? '', 'smtpUser', 200, false),
        password: body.smtpPassword
          ? text(body.smtpPassword, 'smtpPassword', 1000)
          : (secrets.smtp?.password ?? ''),
      };
      if (secrets.smtp.user && !secrets.smtp.password)
        invalid('smtpPassword', 'SMTP password is required when a username is supplied.');
    }
    if (
      type === 'email' &&
      body.enabled &&
      body.commentNotifications &&
      data.integrations.some(
        (item) =>
          item.id !== integrationId &&
          item.enabled &&
          item.type === 'email' &&
          item.commentNotifications &&
          !item.demoBatchId,
      )
    )
      invalid(
        'commentNotifications',
        'Disable comment notifications on the other email integration first.',
      );
    if (type !== 'email') {
      if (body.url) secrets.url = integrationUrl(body.url, type);
      if (!secrets.url) invalid('url', 'Enter a provider URL.');
      for (const field of providerFields[type] || []) {
        if (body[field.key]) secrets[field.key] = text(body[field.key], field.key, field.max);
        if (!field.optional && !secrets[field.key])
          invalid(field.key, `${field.label} is required.`);
      }
      if (type === 'servicenow') {
        const authType = body.authType || 'basic';
        if (authType === 'oauth') {
          const clientId = body.clientId ? text(body.clientId, 'clientId', 512) : secrets.clientId;
          const clientSecret = body.clientSecret
            ? text(body.clientSecret, 'clientSecret', 4096)
            : secrets.clientSecret;
          if (!clientId) invalid('clientId', 'Client ID is required.');
          if (!clientSecret) invalid('clientSecret', 'Client Secret is required.');
          secrets = {
            url: secrets.url,
            authType,
            clientId,
            clientSecret,
            scope: text(body.scope ?? secrets.scope ?? '', 'scope', 1000, false),
          };
        } else {
          const username = body.username ? text(body.username, 'username', 200) : secrets.username;
          const password = body.password ? text(body.password, 'password', 1000) : secrets.password;
          if (!username || !password)
            invalid('username', 'Enter the ServiceNow integration user and password.');
          secrets = { url: secrets.url, authType, username, password };
        }
      }
    }
    const recipients =
      type === 'email'
        ? text(body.recipients ?? '', 'recipients', 2500, false)
            .split(',')
            .map((s) => s.trim().toLowerCase())
            .filter(Boolean)
        : [];
    if (
      recipients.length > 10 ||
      recipients.some((v) => !/^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(v))
    )
      invalid('recipients', 'Enter up to 10 comma-separated email addresses.');
    if (type === 'email' && !recipients.length)
      invalid('recipients', 'Provide at least one fallback recipient for coverage gaps.');
    const item = {
      ...auditStamp(previous, req.user),
      id: integrationId,
      name: text(body.name, 'name', 80),
      type,
      enabled: body.enabled === true,
      recovery: body.recovery === true,
      onCall: body.onCall === true,
      recipients,
      serviceIds,
      commentNotifications: type === 'email' && body.commentNotifications === true,
      smtpConfigured: type === 'email' && !!secrets.smtp,
      destination: type === 'email' ? secrets.smtp?.host || 'SMTP' : new URL(secrets.url).hostname,
      secret: seal(secrets),
    };
    await save(db, data, body.revision, {
      integrations: [...data.integrations.filter((i) => i.id !== integrationId), item],
    });
    res.locals.auditRecordId = integrationId;
    res.json({ ok: true });
  });
  app.post('/api/integrations/:id/test', requireAdmin, async (req, res) => {
    const data = await settings(db, req.workspaceId);
    const item = data.integrations.find((i) => i.id === identifier(req.params.id));
    if (!item || item.type !== 'servicenow' || !item.secret)
      throw new InputError('ServiceNow integration not found.', 404);
    if (item.demoBatchId)
      throw new InputError('This integration cannot contact external services.', 400);
    const secret = unseal(item.secret);
    const root = integrationUrl(secret.url, 'servicenow').replace(/\/$/, '');
    try {
      const headers = await serviceNowHeaders(secret, request);
      await serviceNowCaller(secret, request, headers);
      await request(
        `${root}/api/now/table/incident?sysparm_limit=1&sysparm_fields=sys_id`,
        'GET',
        undefined,
        headers,
      );
    } catch (error) {
      const status = Number.isInteger(error.statusCode) ? error.statusCode : null;
      const message =
        status === 401
          ? 'ServiceNow returned HTTP 401. Check the saved credentials and whether this authentication method is enabled for the integration account.'
          : status === 403
            ? 'ServiceNow returned HTTP 403. Check Incident table permissions and REST API access policies.'
            : status
              ? `ServiceNow returned HTTP ${status}. Check the instance and API configuration.`
              : 'ServiceNow connection failed. Check the instance URL, public DNS, TLS, and OAuth configuration.';
      throw new InputError(message, 400);
    }
    res.json({
      message:
        'Connection succeeded. Incident table read access verified; no incident was created.',
    });
  });
  app.delete('/api/integrations/:id', requireAdmin, async (req, res) => {
    const data = await settings(db, req.workspaceId);
    await save(db, data, req.body.revision, {
      integrations: data.integrations.filter((i) => i.id !== identifier(req.params.id)),
    });
    res.status(204).end();
  });
  app.get('/api/deliveries', requireAdmin, async (req, res) => {
    const rows = await db
      .collection('deliveries')
      .find({ workspaceId: req.workspaceId }, { projection: { leaseUntil: 0, leaseToken: 0 } })
      .sort({ createdAt: -1 })
      .limit(500)
      .toArray();
    res.json({ deliveries: rows.map(({ _id, ...row }) => ({ id: String(_id), ...row })) });
  });
  app.post('/api/deliveries/:id/retry', requireAdmin, async (req, res) => {
    if (req.body.confirm !== true) throw new InputError('Confirm retrying this failed delivery.');
    const result = await db.collection('deliveries').updateOne(
      {
        _id: req.params.id,
        workspaceId: req.workspaceId,
        demoBatchId: { $exists: false },
        status: 'failed',
        $and: [
          { $or: [{ manualRetries: { $exists: false } }, { manualRetries: { $lt: 3 } }] },
          {
            $or: [
              { lastManualRetryAt: { $exists: false } },
              { lastManualRetryAt: { $lte: new Date(Date.now() - 60000) } },
            ],
          },
        ],
      },
      {
        $set: {
          status: 'pending',
          deliveryState: 'queued',
          attempts: 0,
          nextAttemptAt: new Date(),
          lastManualRetryAt: new Date(),
        },
        $inc: { manualRetries: 1 },
        $unset: { leaseUntil: '', leaseToken: '' },
      },
    );
    if (!result.matchedCount) throw new InputError('Only failed deliveries can be retried.', 409);
    res.json({ ok: true });
  });
}
