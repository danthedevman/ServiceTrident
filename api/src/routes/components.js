import { auditStamp, auditFields } from '@servicetrident/shared/domain/audit';
import { InputError } from '@servicetrident/shared/validation/input-error';
import { requireAdmin } from '../auth/auth.js';
import { catalog, id } from './services.js';

export const componentView = (row) => ({
  id: String(row._id),
  name: row.name,
  description: row.description || '',
  number: row.number,
  ...auditFields(row),
});
/** Workspace-owned component records are reusable references, with admin-only lifecycle changes. */
export function installComponentRoutes(app, db) {
  app.use('/api/components', (req, res, next) => {
    if (req.role === 'user') throw new InputError('Component access is not available.', 403);
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return requireAdmin(req, res, next);
    next();
  });
  app.get('/api/components', async (req, res) => {
    const data = await catalog(db, req.workspaceId);
    const service = req.query.serviceId
      ? data.services.find((row) => row.id === req.query.serviceId)
      : null;
    if (req.query.serviceId && !service) throw new InputError('Service not found.', 404);
    const filter = {
      workspaceId: req.workspaceId,
      ...(service ? { _id: { $in: (service.componentIds || []).map(id) } } : {}),
    };
    res.json({
      items: (
        await db.collection('components').find(filter).sort({ name: 1 }).limit(5000).toArray()
      ).map(componentView),
    });
  });
  app.get('/api/components/:id', async (req, res) => {
    const row = await db
      .collection('components')
      .findOne({ _id: id(req.params.id), workspaceId: req.workspaceId });
    if (!row) throw new InputError('Component not found.', 404);
    res.json({ item: componentView(row) });
  });
  for (const method of ['post', 'patch'])
    app[method](`/api/components${method === 'patch' ? '/:id' : ''}`, async (req, res) => {
      const body = req.body;
      if (
        !body ||
        typeof body !== 'object' ||
        Array.isArray(body) ||
        Object.keys(body).some((key) => !['name', 'description', 'revision'].includes(key))
      )
        throw new InputError('Send only component name, description and revision.', 400);
      const current =
        method === 'patch'
          ? await db
              .collection('components')
              .findOne({ _id: id(req.params.id), workspaceId: req.workspaceId })
          : null;
      if (method === 'patch' && !current) throw new InputError('Component not found.', 404);
      const name = body.name ?? current?.name,
        description = body.description ?? current?.description ?? '';
      const errors = {};
      if (typeof name !== 'string' || !name.trim() || name.trim().length > 80)
        errors.name = 'Enter a component name of 1–80 characters.';
      if (typeof description !== 'string' || description.trim().length > 1000)
        errors.description = 'Use at most 1,000 characters.';
      if (Object.keys(errors).length)
        throw new InputError('Check the highlighted fields.', 400, errors);
      if (
        !current &&
        (await db
          .collection('components')
          .countDocuments({ workspaceId: req.workspaceId, demoBatchId: { $exists: false } })) >=
          1000
      )
        throw new InputError('A workspace supports up to 1,000 components.', 409);
      const row = {
        ...auditStamp(current, req.user),
        workspaceId: req.workspaceId,
        name: name.trim(),
        nameKey: name.trim().toLowerCase(),
        description: description.trim(),
      };
      let _id = current?._id;
      try {
        if (current) {
          if (body.revision !== current.revision)
            throw new InputError('This component changed. Reload before saving.', 409);
          const result = await db
            .collection('components')
            .updateOne(
              { _id, workspaceId: req.workspaceId, revision: body.revision },
              { $set: row },
            );
          if (!result.matchedCount)
            throw new InputError('This component changed. Reload before saving.', 409);
          await db
            .collection('monitors')
            .updateMany(
              { userId: req.workspaceId, componentId: String(_id), component: { $ne: row.name } },
              {
                $set: {
                  component: row.name,
                  updatedAt: row.updatedAt,
                  updatedBy: row.updatedBy,
                  updatedById: row.updatedById,
                },
                $inc: { revision: 1 },
              },
            );
        } else _id = (await db.collection('components').insertOne(row)).insertedId;
      } catch (error) {
        if (error.code === 11000)
          throw new InputError('A component with this name already exists.', 409, {
            name: 'Choose a unique component name.',
          });
        throw error;
      }
      res.status(current ? 200 : 201).json({ item: componentView({ ...row, _id }) });
    });
  app.delete('/api/components/:id', async (req, res) => {
    const _id = id(req.params.id),
      row = await db.collection('components').findOne({ _id, workspaceId: req.workspaceId });
    if (!row) throw new InputError('Component not found.', 404);
    const data = await catalog(db, req.workspaceId);
    if (
      data.services.some((service) => (service.componentIds || []).includes(String(_id))) ||
      (await db
        .collection('monitors')
        .findOne({ userId: req.workspaceId, componentId: String(_id) }, { projection: { _id: 1 } }))
    )
      throw new InputError(
        'Remove this component from services and reassign its monitors before deleting it.',
        409,
      );
    await db.collection('components').deleteOne({ _id, workspaceId: req.workspaceId });
    res.status(204).end();
  });
}
