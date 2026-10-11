import { tableSearch } from '@servicetrident/shared/domain/table-search';
import { ObjectId } from 'mongodb';
import { InputError } from '@servicetrident/shared/validation/validation';
import { text } from '@servicetrident/shared/validation/fields';
import { workQuery } from '@servicetrident/shared/domain/work';
import { requireResponder, requireAdmin } from '../auth/auth.js';
import { id } from './services.js';

const view = ({ _id, workspaceId, ...row }) => ({ id: String(_id), ...row });
/** Bases and articles share workspace access; creating a base precedes creating articles. */
export function installKnowledgeBases(app, db) {
  const collection = db.collection('knowledgeBases');
  app.get('/api/knowledge-bases', async (req, res) => {
    const { filter, sort, page, pageSize } = workQuery(
      { ...req.query, search: '', searchColumn: '' },
      req.workspaceId,
      'knowledge',
    );
    delete filter.status;
    Object.assign(filter, tableSearch(req.query, { title: '$title', description: '$description' }));
    const [total, items] = await Promise.all([
      collection.countDocuments(filter),
      collection
        .find(filter)
        .sort(sort)
        .skip((page - 1) * pageSize)
        .limit(pageSize)
        .toArray(),
    ]);
    res.json({ items: items.map(view), total, page, pageSize });
  });
  app.get('/api/knowledge-bases/:id', async (req, res) => {
    const item = await collection.findOne({ _id: id(req.params.id), workspaceId: req.workspaceId });
    if (!item) throw new InputError('Knowledge base not found.', 404);
    const articleCount = await db
      .collection('articles')
      .countDocuments({ workspaceId: req.workspaceId, knowledgeBaseId: req.params.id });
    res.json({ item: { ...view(item), articleCount } });
  });
  app.delete('/api/knowledge-bases/:id', requireAdmin, async (req, res) => {
    const filter = { _id: id(req.params.id), workspaceId: req.workspaceId };
    const current = await collection.findOne(filter);
    if (!current) throw new InputError('Knowledge base not found.', 404);
    const { mode, targetId, revision, articleCount } = req.body ?? {};
    if (
      !['move', 'delete'].includes(mode) ||
      !Number.isSafeInteger(revision) ||
      revision !== current.revision
    )
      throw new InputError('Choose a content action and refresh the base before deleting.', 409);
    const articles = db.collection('articles'),
      scope = { workspaceId: req.workspaceId, knowledgeBaseId: req.params.id };
    const count = await articles.countDocuments(scope);
    if (articleCount !== count)
      throw new InputError('The article count changed. Refresh before confirming deletion.', 409);
    const target =
      mode === 'move'
        ? await collection.findOne({
            _id: id(targetId),
            workspaceId: req.workspaceId,
            deleting: { $exists: false },
          })
        : null;
    if (mode === 'move' && (!target || String(target._id) === String(current._id)))
      throw new InputError('Choose another available knowledge base in this workspace.');
    if (
      current.deleting &&
      (current.deleting.mode !== mode || current.deleting.targetId !== (targetId ?? null))
    )
      throw new InputError('Retry the original deletion action for this base.', 409);
    // Keep a recoverable source record until article/file cleanup completes, and block new article writes.
    const claim = await collection.updateOne(
      { ...filter, revision },
      { $set: { deleting: { mode, targetId: targetId ?? null } }, $inc: { revision: 1 } },
    );
    if (!claim.matchedCount)
      throw new InputError('Knowledge base changed. Refresh before deleting.', 409);
    if (mode === 'move') {
      await articles.updateMany(scope, {
        $set: {
          knowledgeBaseId: targetId,
          knowledgeBaseTitle: target.title,
          updatedAt: new Date(),
          updatedById: String(req.user._id),
        },
        $inc: { revision: 1 },
      });
    } else {
      const records = await articles.find(scope, { projection: { _id: 1 } }).toArray();
      const ids = records.map((row) => String(row._id));
      await db
        .collection('attachments')
        .deleteMany({ workspaceId: req.workspaceId, kind: 'knowledge', recordId: { $in: ids } });
      for (const articleId of ids)
        await db
          .collection('incidents')
          .updateMany(
            { workspaceId: req.workspaceId, knowledgeIds: articleId },
            { $pull: { knowledgeIds: articleId }, $inc: { revision: 1 } },
          );
      await articles.deleteMany(scope);
    }
    await collection.deleteOne({ ...filter, revision: revision + 1 });
    res.status(204).end();
  });
  for (const method of ['post', 'patch'])
    app[method](
      `/api/knowledge-bases${method === 'patch' ? '/:id' : ''}`,
      requireResponder,
      async (req, res) => {
        const current =
          method === 'patch'
            ? await collection.findOne({ _id: id(req.params.id), workspaceId: req.workspaceId })
            : null;
        if (method === 'patch' && !current) throw new InputError('Knowledge base not found.', 404);
        if (current?.deleting)
          throw new InputError(
            'This knowledge base is being deleted. Complete its deletion first.',
            409,
          );
        const body = req.body;
        if (
          !body ||
          Object.keys(body).some((key) => !['title', 'description', 'revision'].includes(key))
        )
          throw new InputError('Send only editable fields.');
        if (current && body.revision !== current.revision)
          throw new InputError('Knowledge base changed. Reload before saving.', 409);
        const item = {
          title: text(body.title, 'title', 160),
          description: text(body.description ?? '', 'description', 2000, false),
          updatedAt: new Date(),
          updatedById: String(req.user._id),
          revision: (current?.revision ?? 0) + 1,
        };
        if (current) {
          const result = await collection.updateOne(
            { _id: current._id, workspaceId: req.workspaceId, revision: current.revision },
            { $set: item },
          );
          if (!result.matchedCount)
            throw new InputError('Knowledge base changed. Reload before saving.', 409);
          res.json({ item: view({ ...current, ...item }) });
        } else {
          const record = {
            ...item,
            _id: new ObjectId(),
            workspaceId: req.workspaceId,
            createdAt: new Date(),
            createdById: String(req.user._id),
          };
          await collection.insertOne(record);
          res.status(201).json({ item: view(record) });
        }
      },
    );
}
