import {
  externalEventInput,
  stableEventId,
  reconcileEventAlert,
} from '@servicetrident/shared/domain/events';
import express from 'express';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { ObjectId } from 'mongodb';
import { rateLimit } from 'express-rate-limit';
import { InputError } from '@servicetrident/shared/validation/validation';
import {
  serviceAccountInput,
  serviceAccountView,
  credentialDays,
} from '@servicetrident/shared/domain/service-account';
import { requireAdmin, digestToken } from '../auth/auth.js';
import { catalog, id } from './services.js';
import { settings } from '../repositories/settings.js';
import { workBuiltinFields } from '@servicetrident/shared/forms/form-options';
import { resolveChoices } from '@servicetrident/shared/forms/schema';
import { auditStamp } from '@servicetrident/shared/domain/audit';

const secret = (prefix) => `${prefix}_${randomBytes(32).toString('hex')}`;
const equalHash = (raw, stored) => {
  const actual = Buffer.from(digestToken(raw), 'hex');
  const expected = Buffer.from(stored || '0'.repeat(64), 'hex');
  return expected.length === actual.length && timingSafeEqual(actual, expected) && !!stored;
};
const expires = (days) => new Date(Date.now() + credentialDays(days) * 86400000);
const unauthorized = (res) => {
  res.set('WWW-Authenticate', 'Bearer realm="external-api"');
  throw new InputError('Invalid or expired integration credential.', 401);
};
const cleanBody = (body, allowed) => {
  if (
    !body ||
    typeof body !== 'object' ||
    Array.isArray(body) ||
    Object.keys(body).some((key) => !allowed.includes(key))
  )
    throw new InputError('Send only supported fields as an object.');
};
function credentialsFor(method, days) {
  const value = secret(method === 'api-key' ? 'stk' : 'sts');
  return method === 'api-key'
    ? {
        update: { apiKeyHash: digestToken(value), apiKeyExpiresAt: expires(days) },
        shown: { apiKey: value },
      }
    : {
        update: {
          clientSecretHash: digestToken(value),
          oauthExpiresAt: expires(days),
          oauthVersion: randomBytes(16).toString('hex'),
        },
        shown: { clientSecret: value },
      };
}
async function activeAccount(db, accountId) {
  const account = await db.collection('serviceAccounts').findOne({ _id: accountId, enabled: true });
  if (
    !account ||
    !(await db.collection('users').findOne({ _id: account.workspaceId, disabled: { $ne: true } }))
  )
    return null;
  return account;
}
function assignIdentity(req, account) {
  req.workspaceId = account.workspaceId;
  req.actualRole = 'service_account';
  // Existing creation validators are reused only behind the machine router's scope gate.
  req.role = 'responder';
  req.user = {
    _id: account._id,
    email: `Service account: ${account.name}`,
    displayName: `Service account: ${account.name}`,
  };
  req.serviceAccount = account;
}
function requireTransport(req, res, next) {
  const configured = new URL(process.env.APP_ORIGIN ?? 'http://127.0.0.1:8090');
  const local =
    ['localhost', '127.0.0.1', '[::1]'].includes(configured.hostname) &&
    ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.ip);
  if (!req.secure && !local)
    throw new InputError('HTTPS is required for integration credentials.', 403);
  next();
}

/** Dedicated machine boundary: session cookies never authenticate these endpoints. */
export function installMachineRoutes(app, db) {
  const machine = express.Router();
  const tokenLimit = rateLimit({
    windowMs: 60000,
    limit: 30,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { error: 'temporarily_unavailable' },
  });
  app.post(
    '/api/oauth/token',
    requireTransport,
    tokenLimit,
    express.urlencoded({ extended: false, limit: '8kb', parameterLimit: 4 }),
    async (req, res) => {
      res.set('Pragma', 'no-cache');
      const fail = (code, status = 400) => {
        if (status === 401) res.set('WWW-Authenticate', 'Basic realm="oauth-token"');
        return res.status(status).json({ error: code });
      };
      if (!req.is('application/x-www-form-urlencoded')) return fail('invalid_request');
      if (
        req.headers.cookie ||
        Object.keys(req.query).length ||
        !req.body ||
        Object.keys(req.body).some(
          (key) => !['grant_type', 'scope', 'client_id', 'client_secret'].includes(key),
        )
      )
        return fail('invalid_request');
      if (req.body.grant_type !== 'client_credentials') return fail('unsupported_grant_type');
      let clientId = req.body.client_id,
        clientSecret = req.body.client_secret;
      const header = req.get('authorization');
      if (header) {
        if (
          clientId !== undefined ||
          clientSecret !== undefined ||
          !/^Basic [A-Za-z0-9+/=]{1,512}$/.test(header)
        )
          return fail('invalid_request');
        try {
          const decoded = Buffer.from(header.slice(6), 'base64').toString('utf8');
          const separator = decoded.indexOf(':');
          if (separator < 0) return fail('invalid_client', 401);
          clientId = decodeURIComponent(decoded.slice(0, separator));
          clientSecret = decodeURIComponent(decoded.slice(separator + 1));
        } catch {
          return fail('invalid_client', 401);
        }
      }
      if (
        typeof clientId !== 'string' ||
        !/^stc_[a-f\d]{24}$/.test(clientId) ||
        typeof clientSecret !== 'string' ||
        !/^sts_[a-f\d]{64}$/.test(clientSecret)
      )
        return fail('invalid_client', 401);
      const account = await activeAccount(db, new ObjectId(clientId.slice(4)));
      if (
        !account ||
        !equalHash(clientSecret, account.clientSecretHash) ||
        !(account.oauthExpiresAt > new Date())
      )
        return fail('invalid_client', 401);
      assignIdentity(req, account);
      if (
        req.body.scope !== undefined &&
        (typeof req.body.scope !== 'string' ||
          req.body.scope.length > 200 ||
          !req.body.scope.trim())
      )
        return fail('invalid_scope');
      const scopes =
        req.body.scope === undefined ? account.scopes : req.body.scope.trim().split(/ +/);
      if (
        new Set(scopes).size !== scopes.length ||
        scopes.some((scope) => !account.scopes.includes(scope))
      )
        return fail('invalid_scope');
      const accessToken = secret('sto');
      const ttl = Math.min(
        3600,
        Math.floor((account.oauthExpiresAt.getTime() - Date.now()) / 1000),
      );
      if (ttl < 1) return fail('invalid_client', 401);
      await db.collection('serviceAccessTokens').insertOne({
        _id: digestToken(accessToken),
        accountId: account._id,
        workspaceId: account.workspaceId,
        scopes,
        version: account.oauthVersion,
        expiresAt: new Date(Date.now() + ttl * 1000),
      });
      res.json({
        access_token: accessToken,
        token_type: 'Bearer',
        expires_in: ttl,
        scope: scopes.join(' '),
      });
    },
  );

  app.use('/api/external/v1', requireTransport, machine);
  machine.use(async (req, res, next) => {
    if (req.headers.cookie || Object.keys(req.query).length) return unauthorized(res);
    const header = req.get('authorization');
    if (typeof header !== 'string' || !/^Bearer (stk|sto)_[a-f\d]{64}$/.test(header))
      return unauthorized(res);
    const token = header.slice(7);
    let account, scopes;
    if (token.startsWith('stk_')) {
      account = await db.collection('serviceAccounts').findOne({
        apiKeyHash: digestToken(token),
        enabled: true,
        apiKeyExpiresAt: { $gt: new Date() },
      });
      if (account) account = await activeAccount(db, account._id);
      scopes = account?.scopes;
    } else {
      const stored = await db
        .collection('serviceAccessTokens')
        .findOne({ _id: digestToken(token), expiresAt: { $gt: new Date() } });
      account = stored && (await activeAccount(db, stored.accountId));
      if (
        !account?.clientSecretHash ||
        stored?.version !== account.oauthVersion ||
        !(account.oauthExpiresAt > new Date())
      )
        account = null;
      scopes = stored?.scopes;
    }
    if (!account) return unauthorized(res);
    assignIdentity(req, account);
    req.machineScopes = scopes.filter((scope) => account.scopes.includes(scope));
    next();
  });
  machine.use(
    rateLimit({
      windowMs: 60000,
      limit: 60,
      keyGenerator: (req) => String(req.serviceAccount._id),
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      message: { error: 'Service account request limit reached. Try again in a minute.' },
    }),
  );
  machine.use(async (req, res, next) => {
    const kind = req.path.slice(1);
    res.locals.auditOperation = `${req.method} /api/external/v1/${['incidents', 'tasks', 'knowledge', 'events'].includes(kind) ? kind : 'unknown'}`;
    res.locals.auditRecordType = ['incidents', 'tasks', 'knowledge', 'events'].includes(kind)
      ? kind
      : 'external-api';
    if (req.method !== 'POST' || !['incidents', 'tasks', 'knowledge', 'events'].includes(kind))
      throw new InputError('External endpoint not found.', 404);
    if (!req.machineScopes.includes(`${kind}:create`)) {
      res.set('WWW-Authenticate', `Bearer error="insufficient_scope", scope="${kind}:create"`);
      throw new InputError('This service account cannot create this record type.', 403);
    }
    if (!req.is('application/json')) throw new InputError('Send an application/json request.', 415);
    if (kind === 'events') {
      const input = externalEventInput(req.body),
        account = req.serviceAccount;
      if (
        account.serviceIds !== null &&
        (!input.serviceId || !account.serviceIds.includes(input.serviceId))
      )
        throw new InputError(
          'This service account cannot send events for the selected service.',
          403,
        );
      const service = (await catalog(db, req.workspaceId)).services.find(
        (item) => item.id === input.serviceId,
      );
      if (input.serviceId && !service)
        throw new InputError('Choose a service from this workspace.');
      const eventId = stableEventId(
        'external-event',
        String(req.workspaceId),
        String(account._id),
        input.externalId,
      );
      const fingerprint = digestToken(
        JSON.stringify({ ...input, occurredAt: req.body.occurredAt ?? null }),
      );
      let event = await db.collection('events').findOne({ _id: eventId, userId: req.workspaceId });
      let duplicate = !!event;
      if (event && event.fingerprint !== fingerprint)
        throw new InputError('This external ID was already used for a different event.', 409);
      if (!event) {
        event = {
          _id: eventId,
          userId: req.workspaceId,
          ...input,
          checkedAt: new Date(),
          receivedAt: new Date(),
          sourceType: 'external',
          sourceName: account.name,
          sourceAccountId: String(account._id),
          serviceName: service?.name ?? 'Unassigned',
          status: input.signal === 'firing' ? 'down' : 'up',
          fingerprint,
          ...(input.eventType === 'alert'
            ? {
                alertId: String(
                  stableEventId(
                    'external-alert',
                    String(req.workspaceId),
                    String(account._id),
                    input.serviceId,
                    input.correlationKey,
                  ),
                ),
              }
            : {}),
        };
        try {
          await db.collection('events').insertOne(event);
        } catch (error) {
          if (error.code !== 11000) throw error;
          duplicate = true;
          event = await db.collection('events').findOne({ _id: eventId, userId: req.workspaceId });
          if (event?.fingerprint !== fingerprint)
            throw new InputError('This external ID was already used for a different event.', 409);
        }
      }
      await reconcileEventAlert(db, event);
      res.locals.auditRecordId = String(event._id);
      return res.status(duplicate ? 200 : 201).json({
        event: { id: String(event._id), number: event.number, alertId: event.alertId ?? null },
        duplicate,
      });
    }
    const allowed = {
      incidents: [
        'title',
        'description',
        'serviceId',
        'severity',
        'severityOption',
        'assignmentGroupId',
        'assigneeId',
        'openedForId',
        'custom',
      ],
      tasks: [
        'title',
        'description',
        'serviceId',
        'incidentId',
        'priority',
        'priorityOption',
        'assignmentGroupId',
        'assigneeId',
        'dueDate',
        'custom',
      ],
      knowledge: [
        'title',
        'summary',
        'content',
        'serviceId',
        'knowledgeBaseId',
        'articleType',
        'articleTypeOption',
        'steps',
        'status',
        'statusOption',
        'custom',
      ],
    };
    cleanBody(req.body, allowed[kind]);
    const account = req.serviceAccount;
    let serviceId = req.body.serviceId || null;
    if (kind === 'tasks' && req.body.incidentId) {
      const incident = await db
        .collection('incidents')
        .findOne({ _id: id(req.body.incidentId), workspaceId: req.workspaceId });
      if (!incident) throw new InputError('Choose an incident from this workspace.');
      serviceId = incident.serviceId;
    }
    if (serviceId && (typeof serviceId !== 'string' || !/^[a-f\d]{24}$/.test(serviceId)))
      throw new InputError('Choose a valid service.');
    if (account.serviceIds !== null && (!serviceId || !account.serviceIds.includes(serviceId)))
      throw new InputError(
        'This service account cannot create records for the selected service.',
        403,
      );
    if (kind === 'incidents')
      req.body = { ...req.body, openedForId: req.body.openedForId ?? null, source: 'integration' };
    if (kind === 'knowledge') {
      const schema =
        (await settings(db, req.workspaceId)).knowledgeFields ?? workBuiltinFields('knowledge');
      const chosen = resolveChoices(req.body, schema, 'knowledge');
      if (chosen.status === 'published' && !req.machineScopes.includes('knowledge:publish'))
        throw new InputError('Publishing new knowledge requires the knowledge:publish scope.', 403);
      if (chosen.status === 'archived')
        throw new InputError('Create knowledge as a draft or publish it with permission.');
    }
    next();
  });
  return machine;
}

/** Human administrators manage accounts; machine credentials have no access to management. */
export function installServiceAccountSettings(app, db) {
  const collection = db.collection('serviceAccounts');
  app.use('/api/settings/service-accounts', requireAdmin);
  const lookup = async (req) => {
    const account = await collection.findOne({
      _id: id(req.params.id),
      workspaceId: req.workspaceId,
    });
    if (!account) throw new InputError('Service account not found.', 404);
    return account;
  };
  const checkServices = async (input, req) => {
    if (
      input.serviceIds?.some(
        (value) => !(req.catalogServices || []).some((service) => service.id === value),
      )
    )
      throw new InputError('Choose services from this workspace.', 400, {
        serviceIds: 'Choose available workspace services.',
      });
  };
  app.get('/api/settings/service-accounts', async (req, res) =>
    res.json({
      items: (
        await collection
          .find({ workspaceId: req.workspaceId })
          .sort({ createdAt: -1 })
          .limit(200)
          .toArray()
      ).map(serviceAccountView),
    }),
  );
  app.get('/api/settings/service-accounts/:id', async (req, res) =>
    res.json({ item: serviceAccountView(await lookup(req)) }),
  );
  app.post('/api/settings/service-accounts', async (req, res) => {
    const input = serviceAccountInput(req.body, true);
    req.catalogServices = (await catalog(db, req.workspaceId)).services;
    await checkServices(input, req);
    if ((await collection.countDocuments({ workspaceId: req.workspaceId })) >= 100)
      throw new InputError('Remove unused service accounts before adding more.', 409);
    const item = {
      _id: new ObjectId(),
      workspaceId: req.workspaceId,
      ...input,
      ...auditStamp(null, req.user),
    };
    const revealed = {};
    for (const [method, enabled] of [
      ['api-key', req.body.apiKeyEnabled],
      ['oauth', req.body.oauthEnabled],
    ])
      if (enabled) {
        const credential = credentialsFor(method, req.body.expiresInDays);
        Object.assign(item, credential.update);
        Object.assign(revealed, credential.shown);
      }
    await collection.insertOne(item);
    res.status(201).json({ item: serviceAccountView(item), credentials: revealed });
  });
  app.put('/api/settings/service-accounts/:id', async (req, res) => {
    const current = await lookup(req),
      input = serviceAccountInput(req.body);
    req.catalogServices = (await catalog(db, req.workspaceId)).services;
    await checkServices(input, req);
    if (!Number.isInteger(req.body.revision) || req.body.revision !== current.revision)
      throw new InputError('This account changed. Refresh before saving.', 409);
    const result = await collection.findOneAndUpdate(
      { _id: current._id, workspaceId: req.workspaceId, revision: current.revision },
      {
        $set: {
          ...input,
          updatedAt: new Date(),
          updatedBy: req.user.email,
          updatedById: String(req.user._id),
          oauthVersion: randomBytes(16).toString('hex'),
        },
        $inc: { revision: 1 },
      },
      { returnDocument: 'after' },
    );
    if (!result) throw new InputError('This account changed. Refresh before saving.', 409);
    res.json({ item: serviceAccountView(result) });
  });
  for (const method of ['POST', 'DELETE'])
    app[method.toLowerCase()](
      '/api/settings/service-accounts/:id/credentials/:method',
      async (req, res) => {
        const current = await lookup(req);
        if (!['api-key', 'oauth'].includes(req.params.method))
          throw new InputError('Credential method not found.', 404);
        cleanBody(req.body, method === 'POST' ? ['revision', 'expiresInDays'] : ['revision']);
        if (!Number.isInteger(req.body.revision) || req.body.revision !== current.revision)
          throw new InputError('This account changed. Refresh before changing credentials.', 409);
        const credential =
          method === 'POST'
            ? credentialsFor(req.params.method, req.body.expiresInDays)
            : {
                update:
                  req.params.method === 'api-key'
                    ? { apiKeyHash: null, apiKeyExpiresAt: null }
                    : {
                        clientSecretHash: null,
                        oauthExpiresAt: null,
                        oauthVersion: randomBytes(16).toString('hex'),
                      },
                shown: {},
              };
        const result = await collection.findOneAndUpdate(
          { _id: current._id, workspaceId: req.workspaceId, revision: current.revision },
          {
            $set: {
              ...credential.update,
              updatedAt: new Date(),
              updatedBy: req.user.email,
              updatedById: String(req.user._id),
            },
            $inc: { revision: 1 },
          },
          { returnDocument: 'after' },
        );
        if (!result)
          throw new InputError('This account changed. Refresh before changing credentials.', 409);
        res.json({ item: serviceAccountView(result), credentials: credential.shown });
      },
    );
  app.delete('/api/settings/service-accounts/:id', async (req, res) => {
    const item = await lookup(req);
    cleanBody(req.body, ['revision']);
    if (!Number.isInteger(req.body.revision) || req.body.revision !== item.revision)
      throw new InputError('This account changed. Refresh before deleting.', 409);
    const result = await collection.deleteOne({
      _id: item._id,
      workspaceId: req.workspaceId,
      revision: req.body.revision,
    });
    if (!result.deletedCount)
      throw new InputError('This account changed. Refresh before deleting.', 409);
    await db.collection('serviceAccessTokens').deleteMany({ accountId: item._id });
    res.json({ ok: true });
  });
}
