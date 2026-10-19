import { ObjectId } from 'mongodb';
import { writeAudit } from '@servicetrident/shared/domain/audit';
import { workBuiltinFields } from '@servicetrident/shared/forms/form-options';
import { InputError } from '@servicetrident/shared/validation/validation';

import { BUILTIN_FIELDS } from '@servicetrident/shared/forms/schema';

/** A bounded settings document gives schedules and form edits optimistic concurrency. */
export async function settings(db, workspaceId) {
  const initialProject = {
    id: String(new ObjectId()),
    name: 'General',
    description: '',
    ownerIds: [],
    ownerGroupIds: [],
    revision: 0,
    createdAt: new Date(),
    createdBy: 'System',
  };
  const initialized = await db.collection('operations').updateOne(
    { _id: workspaceId },
    {
      $setOnInsert: {
        revision: 0,
        fields: BUILTIN_FIELDS,
        shifts: [],
        integrations: [],
        projects: [initialProject],
      },
    },
    { upsert: true },
  );
  if (initialized.upsertedId)
    await writeAudit(db, {
      workspaceId,
      source: 'worker',
      action: 'create',
      recordType: 'projects',
      recordId: initialProject.id,
      operation: 'Initialize default project',
    });
  let data = await db.collection('operations').findOne({ _id: workspaceId });
  if (!data.projects?.length) {
    const project = {
      id: String(new ObjectId()),
      name: 'General',
      description: '',
      ownerIds: [],
      ownerGroupIds: [],
      revision: 0,
      createdAt: new Date(),
      createdBy: 'System',
    };
    const created = await db
      .collection('operations')
      .updateOne(
        { _id: workspaceId, revision: data.revision },
        { $set: { projects: [project] }, $inc: { revision: 1 } },
      );
    if (created.modifiedCount)
      await writeAudit(db, {
        workspaceId,
        source: 'worker',
        action: 'create',
        recordType: 'projects',
        recordId: project.id,
        operation: 'Initialize default project',
      });
    data = await db.collection('operations').findOne({ _id: workspaceId });
  }
  const missing = BUILTIN_FIELDS.filter(
    (field) => !data.fields.some((saved) => saved.id === field.id),
  );
  if (missing.length) {
    await db
      .collection('operations')
      .updateOne(
        { _id: workspaceId, revision: data.revision },
        { $push: { fields: { $each: missing } }, $inc: { revision: 1 } },
      );
    data = await db.collection('operations').findOne({ _id: workspaceId });
  }
  for (const [key, kind] of [
    ['taskFields', 'tasks'],
    ['knowledgeFields', 'knowledge'],
  ]) {
    if (data[key])
      data[key] = [
        ...data[key],
        ...workBuiltinFields(kind).filter(
          (field) => !data[key].some((saved) => saved.id === field.id),
        ),
      ];
  }
  // Present the previous built-in label consistently while retaining custom labels.
  data.fields = data.fields.map((field) =>
    field.id === 'knowledgeIds' && field.label === 'Knowledge articles'
      ? { ...field, label: 'Knowledge' }
      : field,
  );
  // Retain legacy project associations in storage while task forms return to standalone work.
  if (data.taskFields)
    data.taskFields = data.taskFields.filter((field) => field.id !== 'projectId');
  return data;
}

/** Save with compare-and-swap, never silently overwrite another administrator. */
export async function save(db, data, revision, changes) {
  if (!Number.isInteger(revision) || revision !== data.revision)
    throw new InputError('Settings changed. Refresh before saving again.', 409);
  const result = await db
    .collection('operations')
    .updateOne({ _id: data._id, revision }, { $set: changes, $inc: { revision: 1 } });
  if (!result.matchedCount)
    throw new InputError('Settings changed. Refresh before saving again.', 409);
}
