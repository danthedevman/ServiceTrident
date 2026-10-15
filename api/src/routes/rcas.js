import { settings, save as saveSettings } from '../repositories/settings.js';
import {
  validateFields,
  validateValues,
  validateMandatory,
} from '@servicetrident/shared/forms/schema';
import { recordFields } from '@servicetrident/shared/forms/form-options';
import { ObjectId } from 'mongodb';
import { validateRca, RCA_STATUSES, RCA_FIELDS } from '@servicetrident/shared/domain/rca';
import { auditStamp } from '@servicetrident/shared/domain/audit';
import { InputError } from '@servicetrident/shared/validation/input-error';
import { invalid } from '@servicetrident/shared/validation/fields';
import { requireResponder, requireAdmin } from '../auth/auth.js';
import { id } from './services.js';

const view = ({ _id, workspaceId, ...row }) => ({ id: String(_id), ...row });
/** Internal analyses use the same tenant and role boundaries as incidents and tasks. */
export function installRcaRoutes(app, db) {
  const records = db.collection('rcas');
  app.get('/api/rca-fields', async (req, res) => {
    const config = await settings(db, req.workspaceId);
    res.json({ fields: config.rcaFields ?? RCA_FIELDS, revision: config.revision });
  });
  app.put('/api/rca-fields', requireAdmin, async (req, res) => {
    const config = await settings(db, req.workspaceId);
    const fields = validateFields(
      req.body?.fields,
      config.rcaFields ?? RCA_FIELDS,
      RCA_FIELDS,
      'rcas',
    );
    await saveSettings(db, config, req.body.revision, { rcaFields: fields });
    res.json({ ok: true });
  });
  app.get('/api/rcas/:id', async (req, res) => {
    const item = await records.findOne({ _id: id(req.params.id), workspaceId: req.workspaceId });
    if (!item) throw new InputError('RCA not found.', 404);
    const linked = async (name, ids) =>
      (
        await db
          .collection(name)
          .find(
            { workspaceId: req.workspaceId, _id: { $in: ids.map(id) } },
            { projection: { title: 1 } },
          )
          .limit(50)
          .toArray()
      ).map(view);
    const [incidents, tasks] = await Promise.all([
      linked('incidents', item.incidentIds),
      linked('tasks', item.taskIds),
    ]);
    res.json({ item: view(item), incidents, tasks });
  });
  for (const method of ['post', 'patch'])
    app[method](
      `/api/rcas${method === 'patch' ? '/:id' : ''}`,
      requireResponder,
      async (req, res) => {
        const current =
          method === 'patch'
            ? await records.findOne({ _id: id(req.params.id), workspaceId: req.workspaceId })
            : null;
        if (method === 'patch' && !current) throw new InputError('RCA not found.', 404);
        const input = validateRca(req.body);
        const schema = (await settings(db, req.workspaceId)).rcaFields ?? RCA_FIELDS;
        validateMandatory(schema, input);
        input.fields = recordFields(schema, current?.fields);
        input.custom = validateValues(
          req.body.custom ?? current?.custom ?? {},
          input.fields,
          current?.custom,
        );
        if (
          current &&
          (!Number.isSafeInteger(req.body.revision) || req.body.revision !== current.revision)
        )
          throw new InputError('RCA changed. Reload before saving.', 409);
        for (const [key, name] of [
          ['incidentIds', 'incidents'],
          ['taskIds', 'tasks'],
        ]) {
          const found = await db
            .collection(name)
            .countDocuments({ workspaceId: req.workspaceId, _id: { $in: input[key].map(id) } });
          if (found !== input[key].length)
            invalid(key, 'Choose existing records in this workspace.');
        }
        const item = {
          ...input,
          statusLabel: RCA_STATUSES[input.status],
          ...auditStamp(current, req.user),
        };
        if (current) {
          const result = await records.updateOne(
            { _id: current._id, workspaceId: req.workspaceId, revision: current.revision },
            { $set: item },
          );
          if (!result.matchedCount) throw new InputError('RCA changed. Reload before saving.', 409);
          res.json({ item: view({ ...current, ...item }) });
        } else {
          const created = { ...item, _id: new ObjectId(), workspaceId: req.workspaceId };
          await records.insertOne(created);
          res.locals.auditRecordId = created._id;
          res.status(201).json({ item: view(created) });
        }
      },
    );
}
