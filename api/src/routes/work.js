import { assignmentGroup } from '../domain/assignment.js';
import { claimAttachments } from './attachments.js';
import { validateRichContent, textDocument } from '@servicetrident/shared/files/rich-content';
import { ObjectId } from 'mongodb';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { InputError } from '@servicetrident/shared/validation/validation';
import {
  workBuiltinFields,
  recordFields,
  fieldChoices,
} from '@servicetrident/shared/forms/form-options';
import { invalid } from '@servicetrident/shared/validation/fields';
import {
  validateFields,
  validateValues,
  resolveChoices,
  validateMandatory,
} from '@servicetrident/shared/forms/schema';
import { validateWork, workQuery } from '@servicetrident/shared/domain/work';
import { csvRow } from '@servicetrident/shared/files/csv';
import { catalog, id } from './services.js';
import { requireResponder, requireAdmin } from '../auth/auth.js';
import { memberFilter } from '../repositories/members.js';
import { settings } from '../repositories/settings.js';
import { boardRankStage } from '../../../shared/domain/task-board.js';
import { positionTask } from '../domain/task-board.js';

/** Strip internal tenant identifiers while keeping author attribution and revision. */
function view({ _id, workspaceId, ...row }) {
  return { id: String(_id), ...row };
}

/** Resolve every relationship within the authenticated workspace before saving. */
async function associations(db, workspaceId, input, current, task) {
  let serviceId = input.serviceId,
    incidentTitle = '',
    serviceName = '',
    assigneeName = '';
  if (task && input.incidentId) {
    const incident = await db
      .collection('incidents')
      .findOne({ _id: id(input.incidentId), workspaceId });
    if (!incident) invalid('incidentId', 'Choose an incident from this workspace.');
    if (serviceId && serviceId !== incident.serviceId)
      invalid('serviceId', 'The service must match the selected incident.');
    serviceId = incident.serviceId;
    incidentTitle = incident.title;
    serviceName = incident.serviceName;
  }
  if (serviceId) {
    const service = (await catalog(db, workspaceId)).services.find((s) => s.id === serviceId);
    // A deleted service may remain on existing records or on its own incident's tasks.
    if (!service && serviceId !== current?.serviceId && !incidentTitle)
      invalid('serviceId', 'Choose an available service from this workspace.');
    serviceName = service?.name ?? (serviceName || current?.serviceName || 'Deleted service');
  }
  if (task && input.assigneeId) {
    const member = await db
      .collection('users')
      .findOne({ _id: id(input.assigneeId), ...memberFilter(workspaceId) });
    if (!member || (member.disabled && input.assigneeId !== current?.assigneeId))
      invalid('assigneeId', 'Choose an active workspace teammate.');
    assigneeName = member.displayName || member.email;
  }
  const group = task
    ? await assignmentGroup(db, workspaceId, input.assignmentGroupId, input.assigneeId)
    : {};
  return { ...group, serviceId, serviceName, ...(task ? { incidentTitle, assigneeName } : {}) };
}

/** Tasks and knowledge stay private to the workspace. Admins and responders can create/edit both. */
export function installWorkRoutes(app, db, machine = null) {
  app.get('/api/task-board-settings', async (req, res) => {
    const config = await settings(db, req.workspaceId);
    res.json({ order: config.taskLaneOrder ?? [], revision: config.taskLaneRevision ?? 0 });
  });
  app.put('/api/task-board-settings', requireAdmin, async (req, res) => {
    const config = await settings(db, req.workspaceId);
    const { order, revision } = req.body ?? {};
    const active = fieldChoices(
      'tasks',
      (config.taskFields ?? workBuiltinFields('tasks')).find((field) => field.id === 'status'),
    )
      .filter((choice) => !choice.hidden && choice.base !== 'archived')
      .map((choice) => choice.value);
    if (
      !Array.isArray(order) ||
      order.length !== active.length ||
      new Set(order).size !== order.length ||
      order.some((value) => !active.includes(value))
    )
      invalid('order', 'Include every active status lane once. Refresh before saving.');
    if (!Number.isInteger(revision) || revision !== (config.taskLaneRevision ?? 0))
      throw new InputError('Lane order changed. Refresh before saving.', 409);
    // Lane ordering has its own revision so it cannot overwrite a form-builder edit.
    const result = await db
      .collection('operations')
      .updateOne(
        { _id: req.workspaceId, $expr: { $eq: [{ $ifNull: ['$taskLaneRevision', 0] }, revision] } },
        { $set: { taskLaneOrder: order }, $inc: { taskLaneRevision: 1 } },
      );
    if (!result.matchedCount)
      throw new InputError('Lane order changed. Refresh before saving.', 409);
    res.json({ order, revision: revision + 1 });
  });

  for (const kind of ['tasks', 'knowledge']) {
    const task = kind === 'tasks';
    const collection = db.collection(task ? 'tasks' : 'articles');
    const fieldKey = task ? 'taskFields' : 'knowledgeFields',
      fieldPath = task ? 'task-fields' : 'knowledge-fields';
    app.get(`/api/${fieldPath}`, async (req, res) => {
      const config = await settings(db, req.workspaceId);
      res.json({ fields: config[fieldKey] ?? workBuiltinFields(kind), revision: config.revision });
    });
    app.put(`/api/${fieldPath}`, requireAdmin, async (req, res) => {
      const config = await settings(db, req.workspaceId);
      const fields = validateFields(
        req.body?.fields,
        config[fieldKey] ?? workBuiltinFields(kind),
        workBuiltinFields(kind),
        kind,
      );
      if (!Number.isInteger(req.body.revision) || req.body.revision !== config.revision)
        throw new InputError('Settings changed. Reload before saving.', 409);
      const result = await db
        .collection('operations')
        .updateOne(
          { _id: req.workspaceId, revision: config.revision },
          { $set: { [fieldKey]: fields }, $inc: { revision: 1 } },
        );
      if (!result.matchedCount)
        throw new InputError('Settings changed. Reload before saving.', 409);
      res.json({ ok: true });
    });
    app.get(`/api/${kind}`, async (req, res) => {
      const { filter, sort, page, pageSize } = workQuery(req.query, req.workspaceId, kind);
      const [total, rows] = await Promise.all([
        collection.countDocuments(filter),
        task && sort.boardRank
          ? collection
              .aggregate([
                { $match: filter },
                boardRankStage(),
                { $sort: sort },
                { $skip: (page - 1) * pageSize },
                { $limit: pageSize },
                { $project: { description: 0 } },
              ])
              .toArray()
          : collection
              .find(filter, {
                projection: task ? { description: 0 } : { content: 0, contentDocument: 0 },
              })
              .sort(sort)
              .skip((page - 1) * pageSize)
              .limit(pageSize)
              .toArray(),
      ]);
      res.json({ items: rows.map(view), total, page, pageSize });
    });
    app.get(`/api/${kind}/export`, async (req, res) => {
      const { filter, sort } = workQuery(req.query, req.workspaceId, kind);
      const cursor =
        task && sort.boardRank
          ? collection.aggregate([{ $match: filter }, boardRankStage(), { $sort: sort }])
          : collection.find(filter).sort(sort).batchSize(100);
      const headers = task
        ? [
            'ID',
            'Title',
            'Status',
            'Priority',
            'Service',
            'Incident',
            'Assignment group',
            'Assignee',
            'Due date',
            'Description',
            'Created UTC',
            'Updated UTC',
          ]
        : [
            'ID',
            'Title',
            'Status',
            'Knowledge Base',
            'Service',
            'Summary',
            'Content',
            'Created UTC',
            'Updated UTC',
          ];
      res.type('text/csv; charset=utf-8').attachment(`${kind}.csv`);
      async function* rows() {
        try {
          yield '\uFEFF' + csvRow([...headers, 'Custom fields (JSON)']);
          for await (const row of cursor) {
            const values = task
              ? [
                  String(row._id),
                  row.title,
                  row.statusLabel || row.status,
                  row.priorityLabel || row.priority,
                  row.serviceName,
                  row.incidentTitle,
                  row.assignmentGroupName,
                  row.assigneeName,
                  row.dueDate,
                  row.description,
                  row.createdAt.toISOString(),
                  row.updatedAt.toISOString(),
                ]
              : [
                  String(row._id),
                  row.title,
                  row.statusLabel || row.status,
                  row.knowledgeBaseTitle,
                  row.serviceName,
                  row.summary,
                  row.content,
                  row.createdAt.toISOString(),
                  row.updatedAt.toISOString(),
                ];
            const custom = (row.fields ?? []).map((field) => ({
              id: field.id,
              label: field.label,
              value: row.custom?.[field.id] ?? null,
            }));
            yield csvRow([...values, JSON.stringify(custom)]);
          }
        } finally {
          await cursor.close();
        }
      }
      try {
        await pipeline(Readable.from(rows()), res);
      } catch (error) {
        if (error.code !== 'ERR_STREAM_PREMATURE_CLOSE') throw error;
      }
    });
    app.get(`/api/${kind}/:id`, async (req, res) => {
      const item = await collection.findOne({
        _id: id(req.params.id),
        workspaceId: req.workspaceId,
      });
      if (!item) throw new InputError(task ? 'Task not found.' : 'Article not found.', 404);
      res.json({ item: view(item) });
    });
    for (const method of ['post', 'patch']) {
      const saveRecord = async (req, res) => {
        const current =
          method === 'patch'
            ? await collection.findOne({ _id: id(req.params.id), workspaceId: req.workspaceId })
            : null;
        if (method === 'patch' && !current)
          throw new InputError(task ? 'Task not found.' : 'Article not found.', 404);
        const body = req.body;
        const allowed = task
          ? [
              'title',
              'status',
              'serviceId',
              'incidentId',
              'description',
              'priority',
              'assignmentGroupId',
              'assigneeId',
              'dueDate',
              'revision',
              'custom',
              'statusOption',
              'priorityOption',
              'attachmentIds',
              'boardPosition',
            ]
          : [
              'title',
              'status',
              'serviceId',
              'content',
              'summary',
              'revision',
              'custom',
              'statusOption',
              'contentDocument',
              'knowledgeBaseId',
              'articleType',
              'articleTypeOption',
              'steps',
              'attachmentIds',
            ];
        if (
          !body ||
          typeof body !== 'object' ||
          Array.isArray(body) ||
          Object.keys(body).some((key) => !allowed.includes(key))
        )
          throw new InputError('Send only editable fields as a JSON object.');
        if (current && (!Number.isInteger(body.revision) || body.revision !== current.revision))
          throw new InputError('This record changed. Reload it before saving again.', 409);
        const schema = (await settings(db, req.workspaceId))[fieldKey] ?? workBuiltinFields(kind);
        const chosen = resolveChoices(body, schema, kind, current);
        if (body.boardPosition && (!task || !current))
          throw new InputError('Only saved tasks can be reordered.');
        const rich =
          !task &&
          (body.contentDocument ?? (body.content === undefined ? current?.contentDocument : null));
        const article = rich
          ? validateRichContent(rich, {
              required:
                chosen.articleType !== 'runbook' &&
                schema.some((field) => field.id === 'content' && field.required && !field.archived),
            })
          : !task && chosen.articleType === 'runbook'
            ? validateRichContent(textDocument(body.content ?? ''), { required: false })
            : null;
        const input = validateWork(
          { ...current, ...chosen, ...(article ? { content: article.text } : {}) },
          kind,
          schema,
        );
        if (task && body.boardPosition !== undefined)
          input.boardRank = await positionTask(
            collection,
            req.workspaceId,
            current,
            chosen.status,
            chosen.statusOption,
            body.boardPosition,
          );
        validateMandatory(schema, input);
        if (!task) {
          input.contentDocument = article?.document ?? null;
          input.knowledgeBaseTitle = null;
          if (input.knowledgeBaseId) {
            const base = await db
              .collection('knowledgeBases')
              .findOne({ _id: id(input.knowledgeBaseId), workspaceId: req.workspaceId });
            if (base?.deleting)
              throw new InputError(
                'This knowledge base is being deleted. Choose another base.',
                409,
              );
            if (!base) invalid('knowledgeBaseId', 'Choose a knowledge base from this workspace.');
            input.knowledgeBaseTitle = base.title;
          }
        }
        const recordId = current?._id ?? new ObjectId();
        input.attachmentIds = await claimAttachments(
          db,
          req,
          kind,
          recordId,
          body.attachmentIds ?? current?.attachmentIds ?? [],
          current?.attachmentIds ?? [],
          article?.imageIds ?? [],
        );
        const fields = recordFields(schema, current?.fields);
        input.fields = fields;
        input.custom = validateValues(
          body.custom ?? current?.custom ?? {},
          fields,
          current?.custom,
        );
        for (const key of task ? ['status', 'priority'] : ['status', 'articleType']) {
          input[`${key}Option`] = chosen[`${key}Option`];
          input[`${key}Label`] = chosen[`${key}Label`];
        }
        const related = await associations(db, req.workspaceId, input, current, task);
        const updated = {
          ...input,
          ...related,
          updatedAt: new Date(),
          updatedBy: req.user.email,
          updatedById: String(req.user._id),
          updatedByType: req.serviceAccount ? 'service_account' : 'user',
        };
        if (current) {
          const result = await collection.findOneAndUpdate(
            { _id: current._id, workspaceId: req.workspaceId, revision: current.revision },
            { $set: updated, $inc: { revision: 1 } },
            { returnDocument: 'after' },
          );
          if (!result)
            throw new InputError('This record changed. Reload it before saving again.', 409);
          res.json({ item: view(result) });
        } else {
          const row = {
            _id: recordId,
            workspaceId: req.workspaceId,
            ...updated,
            createdAt: new Date(),
            createdBy: req.user.email,
            createdById: String(req.user._id),
            createdByType: req.serviceAccount ? 'service_account' : 'user',
            revision: 0,
          };
          await collection.insertOne(row);
          res.status(201).json({ item: view(row) });
        }
      };
      app.locals.aiRecordWriters ??= {};
      app.locals.aiRecordWriters[`${kind}:${method}`] = saveRecord;
      app[method](`/api/${kind}${method === 'patch' ? '/:id' : ''}`, requireResponder, saveRecord);
      if (method === 'post' && machine) machine.post(`/${kind}`, requireResponder, saveRecord);
    }
  }
}
