import { InputError } from '@servicetrident/shared/validation/validation';
import { requireAdmin } from '../auth/auth.js';
import { id } from './services.js';
import { settings, save } from '../repositories/settings.js';

/** Admin-only deletion of workspace records, keeping referenced records and removing private files. */
export function installRecordDeletionRoutes(app, db) {
  for (const [kind, collection] of Object.entries({
    incidents: 'incidents',
    tasks: 'tasks',
    knowledge: 'articles',
    rcas: 'rcas',
  })) {
    app.delete(`/api/${kind}/:id`, requireAdmin, async (req, res) => {
      const _id = id(req.params.id);
      const filter = { _id, workspaceId: req.workspaceId };
      if (req.body?.revision !== undefined) {
        if (!Number.isSafeInteger(req.body.revision) || req.body.revision < 0)
          throw new InputError('Invalid record revision.');
        filter.revision = req.body.revision;
      }
      const record = await db.collection(collection).findOneAndDelete(filter);
      if (!record)
        throw new InputError('Record is unavailable or changed. Refresh before deleting.', 409);
      await db
        .collection('attachments')
        .deleteMany({ workspaceId: req.workspaceId, kind, recordId: req.params.id });
      if (kind === 'incidents') {
        await db
          .collection('incidentComments')
          .deleteMany({ workspaceId: req.workspaceId, incidentId: _id });
        await db
          .collection('deliveries')
          .deleteMany({ workspaceId: req.workspaceId, incidentId: _id });
        await db
          .collection('tasks')
          .updateMany(
            { workspaceId: req.workspaceId, incidentId: req.params.id },
            { $set: { incidentId: '', incidentTitle: '' }, $inc: { revision: 1 } },
          );
      }
      if (kind === 'knowledge')
        await db
          .collection('incidents')
          .updateMany(
            { workspaceId: req.workspaceId, knowledgeIds: req.params.id },
            { $pull: { knowledgeIds: req.params.id }, $inc: { revision: 1 } },
          );
      res.status(204).end();
    });
  }
  for (const [kind, field] of Object.entries({ groups: 'groups', 'on-call': 'shifts' })) {
    app.delete(`/api/${kind}/:id`, requireAdmin, async (req, res) => {
      id(req.params.id);
      const data = await settings(db, req.workspaceId);
      if (!(data[field] ?? []).some((record) => record.id === req.params.id))
        throw new InputError('Record not found.', 404);
      if (
        kind === 'groups' &&
        (await db
          .collection('catalogs')
          .findOne({ _id: req.workspaceId, 'services.ownerGroupIds': req.params.id }))
      )
        throw new InputError('Remove this group from service ownership before deleting it.', 409);
      if (
        kind === 'groups' &&
        ((await db
          .collection('incidents')
          .findOne({ workspaceId: req.workspaceId, assignmentGroupId: req.params.id })) ||
          (await db
            .collection('tasks')
            .findOne({ workspaceId: req.workspaceId, assignmentGroupId: req.params.id })))
      )
        throw new InputError(
          'Remove this group from incident and task assignments before deleting it.',
          409,
        );
      await save(db, data, data.revision, {
        [field]: data[field].filter((record) => record.id !== req.params.id),
      });
      res.status(204).end();
    });
  }
}
