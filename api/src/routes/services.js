import { statusTheme } from '@servicetrident/shared/status/appearance';
import { healthPolicy } from '@servicetrident/shared/domain/service-health';
import { publicOrigin, subscriptionMailer } from '@servicetrident/shared/status/subscriptions';
import { installStatusIconRoutes } from './status-icon.js';
import { statusMessage } from '@servicetrident/shared/domain/status-messages';
import { auditStamp } from '@servicetrident/shared/domain/audit';
import { ObjectId } from 'mongodb';
import { randomBytes } from 'node:crypto';
import { fieldErrors } from '@servicetrident/shared/validation/form-validation';
import { InputError } from '@servicetrident/shared/validation/validation';

/** Parse a client-supplied identifier without accepting query operators. */
export function id(value) {
  if (typeof value !== 'string' || !/^[a-f\d]{24}$/i.test(value))
    throw new InputError('Invalid identifier.');
  return new ObjectId(value);
}

/** Validate bounded plain text, not HTML. */
function text(value, max, required = false) {
  if (typeof value !== 'string' || value.trim().length > max || (required && !value.trim()))
    throw new InputError(
      `Enter ${required ? 'a nonempty value of ' : ''}at most ${max} characters.`,
    );
  return value.trim();
}

/** Each workspace has one private-by-default catalog. */
export async function catalog(db, userId) {
  const existing = await db.collection('catalogs').findOne({ _id: userId });
  if (existing) {
    const components = await db
      .collection('components')
      .find({ workspaceId: userId }, { projection: { name: 1 } })
      .toArray();
    return {
      ...existing,
      services: existing.services.map((service) => ({
        ...service,
        componentIds: service.componentIds || [],
        components: components
          .filter((row) => (service.componentIds || []).includes(String(row._id)))
          .map((row) => ({ id: String(row._id), name: row.name })),
      })),
    };
  }
  const data = {
    _id: userId,
    services: [],
    collections: [],
    revision: 0,
    componentSchemaVersion: 1,
    visibility: 'private',
    publicToken: randomBytes(24).toString('hex'),
  };
  try {
    await db.collection('catalogs').insertOne(data);
  } catch (error) {
    if (error.code !== 11000) throw error;
  }
  return db.collection('catalogs').findOne({ _id: userId });
}

/** Accept references only to services in this account's catalog. */
function references(values, services, field = 'dependencyIds') {
  if (
    !Array.isArray(values) ||
    values.length > 50 ||
    new Set(values).size !== values.length ||
    values.some(
      (value) => typeof value !== 'string' || !services.some((service) => service.id === value),
    )
  )
    throw new InputError('Choose items from your workspace.', 400, {
      [field]: 'One or more selections are unavailable. Reload and choose again.',
    });
  return values;
}

/** Reject cycles so dependencies have an unambiguous direction. */
export function validateDependencies(services) {
  const visiting = new Set();
  const complete = new Set();
  const byId = new Map(services.map((service) => [service.id, service]));
  /** Traverse each dependency at most once. */
  function visit(serviceId) {
    if (visiting.has(serviceId))
      throw new InputError('Dependencies cannot form a cycle or refer to the same service.', 400, {
        dependencyIds:
          'Remove the dependency that points back to this service, directly or indirectly.',
      });
    if (complete.has(serviceId)) return;
    visiting.add(serviceId);
    for (const dependency of byId.get(serviceId)?.dependencyIds ?? []) visit(dependency);
    visiting.delete(serviceId);
    complete.add(serviceId);
  }
  for (const service of services) visit(service.id);
}

/** Validate monitor grouping while preserving existing personal monitors. */
export async function monitorPlacement(db, body, userId, current) {
  const serviceId =
    body.serviceId === undefined
      ? (current?.serviceId ?? null)
      : body.serviceId === null || body.serviceId === ''
        ? null
        : id(body.serviceId);
  if (!current && !serviceId)
    throw new InputError('Service is required.', 400, { serviceId: 'Service is required.' });
  const data = serviceId ? await catalog(db, userId) : null;
  const service = data?.services.find((row) => row.id === String(serviceId));
  if (serviceId && !service)
    throw new InputError('Service not found.', 404, { serviceId: 'Choose an available service.' });
  const sameService = String(serviceId || '') === String(current?.serviceId || '');
  const requestedId =
    body.componentId !== undefined
      ? body.componentId
      : body.component !== undefined
        ? null
        : sameService
          ? current?.componentId
          : null;
  const name = text(body.component ?? (sameService ? current?.component || '' : ''), 80);
  const component = requestedId
    ? service?.components.find((row) => row.id === requestedId)
    : body.componentId === null || body.componentId === ''
      ? null
      : service?.components.find((row) => row.name.toLowerCase() === name.toLowerCase());
  if (
    (requestedId && (typeof requestedId !== 'string' || !component)) ||
    (!requestedId && name && body.componentId === undefined && !component)
  )
    throw new InputError('Choose a component belonging to the selected service.', 400, {
      componentId: 'Choose an available component for this service, or leave it unassigned.',
    });
  return { serviceId, componentId: component?.id || null, component: component?.name || '' };
}

/** Require workspace ownership for every monitor access. */
export async function requireMonitor(db, monitorId, userId) {
  const monitor = await db.collection('monitors').findOne({ _id: id(monitorId), userId });
  if (!monitor) throw new InputError('Monitor not found.', 404);
  return monitor;
}

/** Save the entire small catalog atomically to prevent concurrent dependency cycles. */
export async function saveCatalog(db, data) {
  const { _id, revision, ...fields } = data;
  fields.services = fields.services.map(({ components: _projection, ...service }) => service);
  const result = await db
    .collection('catalogs')
    .updateOne({ _id, revision }, { $set: fields, $inc: { revision: 1 } });
  if (!result.matchedCount) throw new InputError('Settings changed. Reload and try again.', 409);
}

/** Install account-owned services, collections, and status visibility settings. */
export function installServiceRoutes(app, db) {
  app.use(['/api/services', '/api/collections', '/api/status-settings'], (req, res, next) => {
    if (
      ['POST', 'PATCH'].includes(req.method) &&
      (!req.body || typeof req.body !== 'object' || Array.isArray(req.body))
    )
      throw new InputError('Send a JSON object.');
    next();
  });
  app.get('/api/services', async (req, res) =>
    res.json({
      services: (await catalog(db, req.workspaceId)).services.map((service) =>
        req.role === 'user' ? { id: service.id, name: service.name } : service,
      ),
    }),
  );
  app.get('/api/collections', async (req, res) =>
    res.json({ collections: (await catalog(db, req.workspaceId)).collections }),
  );
  for (const kind of ['services', 'collections']) {
    for (const method of ['post', 'patch'])
      app[method](`/api/${kind}${method === 'patch' ? '/:id' : ''}`, async (req, res) => {
        const data = await catalog(db, req.workspaceId);
        const current =
          method === 'patch' ? data[kind].find((item) => item.id === req.params.id) : null;
        if (method === 'patch' && !current) throw new InputError('Item not found.', 404);
        if (!current && data[kind].filter((item) => !item.demoBatchId).length >= 50)
          throw new InputError(`You can have up to 50 ${kind}.`, 409);
        const errors = fieldErrors(kind, { ...current, ...req.body });
        if (Object.keys(errors).length)
          throw new InputError('Check the highlighted fields.', 400, errors);
        const item = {
          ...auditStamp(current, req.user),
          id: current?.id ?? new ObjectId().toHexString(),
          name: text(req.body.name ?? current?.name, 80, true),
        };
        if (kind === 'services') {
          item.healthPolicy = healthPolicy(
            req.body.healthPolicy === undefined ? current?.healthPolicy : req.body.healthPolicy,
          );
          item.description = text(req.body.description ?? current?.description ?? '', 1000);
          if (req.body.components !== undefined)
            throw new InputError('Use componentIds to select component records.', 400);
          const availableComponents = await db
            .collection('components')
            .find({ workspaceId: req.workspaceId }, { projection: { name: 1 } })
            .toArray();
          item.componentIds = references(
            req.body.componentIds ?? current?.componentIds ?? [],
            availableComponents.map((row) => ({ id: String(row._id) })),
            'componentIds',
          );
          const removed = (current?.componentIds || []).filter(
            (value) => !item.componentIds.includes(value),
          );
          if (
            removed.length &&
            (await db
              .collection('monitors')
              .findOne(
                { userId: req.workspaceId, serviceId: id(item.id), componentId: { $in: removed } },
                { projection: { _id: 1 } },
              ))
          )
            throw new InputError('Reassign monitors before removing a component.', 409, {
              componentIds: 'Reassign monitors before removing a selected component.',
            });
          item.dependencyIds = references(
            req.body.dependencyIds ?? current?.dependencyIds ?? [],
            data.services,
          );
          const members = await db
            .collection('users')
            .find(
              { $or: [{ _id: req.workspaceId }, { workspaceId: req.workspaceId }] },
              { projection: { _id: 1, disabled: 1 } },
            )
            .toArray();
          const available = members
            .filter(
              (u) =>
                !u.disabled ||
                current?.ownerIds?.includes(String(u._id)) ||
                current?.primaryContactId === String(u._id),
            )
            .map((u) => ({ id: String(u._id) }));
          const groups =
            (await db.collection('operations').findOne({ _id: req.workspaceId }))?.groups ?? [];
          item.ownerIds = references(
            req.body.ownerIds ?? current?.ownerIds ?? [],
            available,
            'ownerIds',
          );
          item.ownerGroupIds = references(
            req.body.ownerGroupIds ?? current?.ownerGroupIds ?? [],
            groups,
            'ownerGroupIds',
          );
          const contact =
            req.body.primaryContactId === undefined
              ? (current?.primaryContactId ?? null)
              : req.body.primaryContactId;
          item.primaryContactId =
            contact === '' || contact === null
              ? null
              : references([contact], available, 'primaryContactId')[0];
        } else
          item.serviceIds = references(
            req.body.serviceIds ?? current?.serviceIds ?? [],
            data.services,
            'serviceIds',
          );
        data[kind] = current
          ? data[kind].map((entry) => (entry.id === item.id ? item : entry))
          : [...data[kind], item];
        if (kind === 'services' && req.body.collectionIds !== undefined) {
          const selected = references(req.body.collectionIds, data.collections, 'collectionIds');
          data.collections = data.collections.map((collection) => {
            const serviceIds = selected.includes(collection.id)
              ? [...new Set([...collection.serviceIds, item.id])]
              : collection.serviceIds.filter((value) => value !== item.id);
            return JSON.stringify(serviceIds) === JSON.stringify(collection.serviceIds)
              ? collection
              : { ...collection, ...auditStamp(collection, req.user), serviceIds };
          });
        }
        validateDependencies(data.services);
        await saveCatalog(db, data);
        res.status(current ? 200 : 201).json({ item });
      });
    app.delete(`/api/${kind}/:id`, async (req, res) => {
      const data = await catalog(db, req.workspaceId);
      if (!data[kind].some((item) => item.id === req.params.id))
        throw new InputError('Item not found.', 404);
      data[kind] = data[kind].filter((item) => item.id !== req.params.id);
      if (kind === 'services') {
        data.services = data.services.map((item) =>
          item.dependencyIds.includes(req.params.id)
            ? {
                ...item,
                ...auditStamp(item, req.user),
                dependencyIds: item.dependencyIds.filter((value) => value !== req.params.id),
              }
            : item,
        );
        data.collections = data.collections.map((item) =>
          item.serviceIds.includes(req.params.id)
            ? {
                ...item,
                ...auditStamp(item, req.user),
                serviceIds: item.serviceIds.filter((value) => value !== req.params.id),
              }
            : item,
        );
      }
      await saveCatalog(db, data);
      if (kind === 'services')
        await db.collection('monitors').updateMany(
          { userId: req.workspaceId, serviceId: id(req.params.id) },
          {
            $set: {
              serviceId: null,
              component: '',
              componentId: null,
              updatedAt: new Date(),
              updatedBy: req.user.email,
              updatedById: String(req.user._id),
            },
            $inc: { revision: 1 },
          },
        );
      res.status(204).end();
    });
  }
  installStatusIconRoutes(app, db);
  app.get('/api/status-settings', async (req, res) => {
    const data = await catalog(db, req.workspaceId);
    res.json({
      hasStatusIcon: !!(await db
        .collection('statusIcons')
        .findOne({ _id: req.workspaceId }, { projection: { _id: 1 } })),
      subscriptionButtonVisible: data.subscriptionButtonVisible ?? true,
      rssSubscriptions: data.rssSubscriptions ?? true,
      emailSubscriptions: data.emailSubscriptions ?? false,
      subscriptionIntegrationId: data.subscriptionIntegrationId ?? '',
      publicOrigin: data.publicOrigin || process.env.APP_ORIGIN || 'http://127.0.0.1:8090',
      visibility: data.visibility,
      statusTheme: data.statusTheme || 'light',
      publicPath: `/status/public/${data.publicToken}`,
      revision: data.revision,
      banner: data.banner ?? { enabled: false, level: 'info', text: '' },
      serviceMessages: data.serviceMessages ?? [],
    });
  });
  app.patch('/api/status-settings', async (req, res) => {
    const errors = fieldErrors('status', req.body);
    if (Object.keys(errors).length) throw new InputError('Choose private or public.', 400, errors);
    const data = await catalog(db, req.workspaceId);
    if (req.body.revision !== undefined && req.body.revision !== data.revision)
      throw new InputError('Status settings changed. Reload before saving.', 409);
    if (req.body.statusTheme !== undefined) data.statusTheme = statusTheme(req.body.statusTheme);
    delete data.backgroundColor;
    if (req.body.banner !== undefined) data.banner = statusMessage(req.body.banner);
    if (req.body.serviceMessages !== undefined) {
      const messages = req.body.serviceMessages;
      if (!Array.isArray(messages) || messages.length > 500)
        throw new InputError('Choose at most 500 service messages.', 400);
      const seen = new Set();
      data.serviceMessages = messages.map((message) => {
        if (
          !message ||
          typeof message.serviceId !== 'string' ||
          seen.has(message.serviceId) ||
          !data.services.some((service) => service.id === message.serviceId)
        )
          throw new InputError('Choose a unique service from this workspace.', 400);
        seen.add(message.serviceId);
        return {
          serviceId: message.serviceId,
          ...statusMessage(message, `service-${message.serviceId}`),
        };
      });
    }
    for (const field of ['subscriptionButtonVisible', 'rssSubscriptions']) {
      if (req.body[field] !== undefined) {
        if (typeof req.body[field] !== 'boolean')
          throw new InputError('Choose an enabled or disabled subscription setting.', 400, {
            [field]: 'Choose enabled or disabled.',
          });
        data[field] = req.body[field];
      }
    }
    if (req.body.emailSubscriptions !== undefined) {
      if (typeof req.body.emailSubscriptions !== 'boolean')
        throw new InputError('Choose whether email subscriptions are enabled.', 400);
      data.emailSubscriptions = req.body.emailSubscriptions;
    }
    if (req.body.publicOrigin !== undefined)
      data.publicOrigin = publicOrigin(req.body.publicOrigin);
    if (req.body.subscriptionIntegrationId !== undefined) {
      if (
        typeof req.body.subscriptionIntegrationId !== 'string' ||
        (req.body.subscriptionIntegrationId &&
          !/^[a-f\d]{24}$/i.test(req.body.subscriptionIntegrationId))
      )
        throw new InputError('Choose an email integration.', 400, {
          subscriptionIntegrationId: 'Choose an email integration.',
        });
      data.subscriptionIntegrationId = req.body.subscriptionIntegrationId;
    }
    if (
      data.subscriptionButtonVisible !== false &&
      data.emailSubscriptions &&
      !(await subscriptionMailer(db, data))
    )
      throw new InputError('Choose an enabled email integration with SMTP credentials.', 400, {
        subscriptionIntegrationId: 'Choose an enabled email integration with SMTP credentials.',
      });
    data.publicOrigin = publicOrigin(
      data.publicOrigin || process.env.APP_ORIGIN || 'http://127.0.0.1:8090',
    );
    data.statusUpdatedAt = new Date();
    data.statusUpdatedById = String(req.user._id);
    data.visibility = req.body.visibility;
    await saveCatalog(db, data);
    res.json({
      hasStatusIcon: !!(await db
        .collection('statusIcons')
        .findOne({ _id: req.workspaceId }, { projection: { _id: 1 } })),
      subscriptionButtonVisible: data.subscriptionButtonVisible ?? true,
      rssSubscriptions: data.rssSubscriptions ?? true,
      emailSubscriptions: data.emailSubscriptions ?? false,
      subscriptionIntegrationId: data.subscriptionIntegrationId ?? '',
      publicOrigin: data.publicOrigin || process.env.APP_ORIGIN || 'http://127.0.0.1:8090',
      visibility: data.visibility,
      statusTheme: data.statusTheme || 'light',
      publicPath: `/status/public/${data.publicToken}`,
      revision: data.revision,
      banner: data.banner ?? { enabled: false, level: 'info', text: '' },
      serviceMessages: data.serviceMessages ?? [],
    });
  });
}
