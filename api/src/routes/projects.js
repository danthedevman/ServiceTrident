import { projectActivity } from '../repositories/project-hub.js';
import { withProjectMutation } from '../domain/project-lock.js';
import { ObjectId } from 'mongodb';
import { requireResponder } from '../auth/auth.js';
import { settings, save } from '../repositories/settings.js';
import { members, memberFilter } from '../repositories/members.js';
import { InputError } from '@servicetrident/shared/validation/input-error';
import { text, identifier, invalid, references } from '@servicetrident/shared/validation/fields';
import { auditStamp, writeAudit } from '@servicetrident/shared/domain/audit';

async function input(db, workspaceId, body, current, config) {
  if (
    !body ||
    typeof body !== 'object' ||
    Array.isArray(body) ||
    Object.keys(body).some(
      (key) =>
        ![
          'name',
          'description',
          'ownerIds',
          'ownerGroupIds',
          ...(current ? ['revision'] : []),
        ].includes(key),
    )
  )
    throw new InputError('Send only editable project fields.');
  const name = text(body.name ?? current?.name, 'name', 160);
  if (
    (config.projects || []).some(
      (row) => row.id !== current?.id && row.name.toLocaleLowerCase() === name.toLocaleLowerCase(),
    )
  )
    invalid('name', 'A project with this name already exists.');
  const ownerIds = body.ownerIds ?? current?.ownerIds ?? [];
  if (
    !Array.isArray(ownerIds) ||
    ownerIds.length > 50 ||
    new Set(ownerIds).size !== ownerIds.length
  )
    invalid('ownerIds', 'Choose up to 50 owners.');
  for (const owner of ownerIds) {
    identifier(owner, 'ownerIds');
    if (
      !(await db.collection('users').findOne({
        _id: new ObjectId(owner),
        ...memberFilter(workspaceId),
        disabled: { $ne: true },
      }))
    )
      invalid('ownerIds', 'Choose active owners from this workspace.');
  }
  return {
    name,
    description: text(body.description ?? current?.description ?? '', 'description', 2000, false),
    ownerIds,
    ownerGroupIds: references(
      body.ownerGroupIds ?? current?.ownerGroupIds ?? [],
      (config.groups || []).map((group) => group.id),
      'ownerGroupIds',
    ),
  };
}
export function installProjectRoutes(app, db) {
  app.get('/api/projects/:id', async (req, res) => {
    if (req.role === 'user') throw new InputError('Workspace access required.', 403);
    const projectId = identifier(req.params.id);
    const config = await settings(db, req.workspaceId);
    const item = config.projects.find((row) => row.id === projectId);
    if (!item) throw new InputError('Project not found.', 404);
    const people = await members(db, req.workspaceId);
    res.json({
      item,
      owners: people
        .filter((p) => (item.ownerIds || []).includes(String(p._id)))
        .map((p) => ({ id: String(p._id), label: p.displayName || p.email })),
      groups: (config.groups || [])
        .filter((g) => (item.ownerGroupIds || []).includes(g.id))
        .map((g) => ({ id: g.id, label: g.name })),
      projectCount: config.projects.filter((row) => !row.deleting).length,
    });
  });
  app.post('/api/projects', requireResponder, async (req, res) =>
    withProjectMutation(
      db,
      req.workspaceId,
      async () => {
        const config = await settings(db, req.workspaceId);
        if (config.projects.length >= 500)
          throw new InputError('The workspace project limit is 500.');
        const values = await input(db, req.workspaceId, req.body, null, config);
        const item = {
          ...auditStamp(null, req.user),
          ...values,
          id: String(new ObjectId()),
          revision: 0,
        };
        await save(db, config, config.revision, { projects: [...config.projects, item] });
        await projectActivity(db, req, item.id, 'Project created');
        res.status(201).json({ item });
      },
      res,
    ),
  );
  app.patch('/api/projects/:id', requireResponder, async (req, res) =>
    withProjectMutation(
      db,
      req.workspaceId,
      async () => {
        const config = await settings(db, req.workspaceId);
        const current = config.projects.find(
          (row) => row.id === identifier(req.params.id) && !row.deleting,
        );
        if (!current) throw new InputError('Project not found.', 404);
        if (config.projects.some((row) => row.deleting && row.moveTargetId === current.id))
          throw new InputError('Tasks are moving into this project. Try again shortly.', 409);
        if (!Number.isInteger(req.body?.revision) || req.body.revision !== (current.revision || 0))
          throw new InputError('Project changed. Reload before saving.', 409);
        const item = {
          ...current,
          ...auditStamp(current, req.user),
          ...(await input(db, req.workspaceId, req.body, current, config)),
          revision: (current.revision || 0) + 1,
        };
        await save(db, config, config.revision, {
          projects: config.projects.map((row) => (row.id === item.id ? item : row)),
        });
        await db
          .collection('tasks')
          .updateMany(
            { workspaceId: req.workspaceId, projectId: item.id },
            { $set: { projectName: item.name }, $inc: { revision: 1 } },
          );
        await projectActivity(db, req, item.id, 'Project updated');
        res.json({ item });
      },
      res,
    ),
  );
  app.delete('/api/projects/:id', requireResponder, async (req, res) =>
    withProjectMutation(
      db,
      req.workspaceId,
      async () => {
        const body = req.body;
        if (
          !body ||
          typeof body !== 'object' ||
          Array.isArray(body) ||
          Object.keys(body).some(
            (key) => !['confirmed', 'revision', 'targetProjectId'].includes(key),
          ) ||
          body.confirmed !== true
        )
          throw new InputError('Confirm deletion and choose another project.');
        const projectId = identifier(req.params.id),
          targetProjectId = identifier(body.targetProjectId, 'targetProjectId');
        const config = await settings(db, req.workspaceId);
        const current = config.projects.find((row) => row.id === projectId);
        if (!current) throw new InputError('Project not found.', 404);
        if (config.projects.some((row) => row.deleting && row.moveTargetId === projectId))
          throw new InputError(
            'Tasks are moving into this project. Delete it after that move completes.',
            409,
          );
        if (current.deleting && current.moveTargetId !== targetProjectId)
          invalid('targetProjectId', 'Resume deletion using the original destination project.');
        const active = config.projects.filter((row) => !row.deleting);
        if (!current.deleting && active.length < 2)
          throw new InputError('Keep at least one project in the workspace.', 409);
        const target = active.find((row) => row.id === targetProjectId && row.id !== projectId);
        if (!target || (target.demoBatchId && !current.demoBatchId))
          invalid('targetProjectId', 'Choose a different available project.');
        if (!Number.isInteger(body.revision) || body.revision !== (current.revision || 0))
          throw new InputError('Project changed. Reload before deleting.', 409);
        const milestoneCount = await db
          .collection('projectMilestones')
          .countDocuments({
            workspaceId: req.workspaceId,
            projectId: { $in: [projectId, target.id] },
          });
        if (milestoneCount > 200)
          throw new InputError(
            'Choose a destination with enough capacity for the project milestones.',
            409,
          );
        if (!current.deleting)
          await save(db, config, config.revision, {
            projects: config.projects.map((row) =>
              row.id === projectId
                ? { ...row, deleting: true, moveTargetId: targetProjectId }
                : row,
            ),
          });
        const moved = await db.collection('tasks').updateMany(
          { workspaceId: req.workspaceId, projectId },
          {
            $set: {
              projectId: target.id,
              projectName: target.name,
              updatedAt: new Date(),
              updatedBy: req.user.email,
              updatedById: String(req.user._id),
            },
            $inc: { revision: 1 },
          },
        );
        await db
          .collection('operations')
          .updateOne(
            { _id: req.workspaceId },
            { $pull: { projects: { id: projectId, deleting: true } }, $inc: { revision: 1 } },
          );
        await db
          .collection('projectMilestones')
          .updateMany(
            { workspaceId: req.workspaceId, projectId },
            { $set: { projectId: target.id, projectName: target.name }, $inc: { revision: 1 } },
          );
        await db
          .collection('projectActivity')
          .updateMany(
            { workspaceId: req.workspaceId, projectId },
            { $set: { projectId: target.id } },
          );
        await projectActivity(db, req, target.id, 'Project tasks and milestones moved');
        if (moved.modifiedCount)
          await writeAudit(db, {
            workspaceId: req.workspaceId,
            actorId: req.user._id,
            actor: req.user.email,
            actualRole: req.actualRole || req.role,
            effectiveRole: req.role,
            action: 'project_tasks_moved',
            recordType: 'projects',
            recordId: projectId,
            parentId: target.id,
            fields: 'projectId,projectName,revision',
            operation: 'Move project tasks before deletion',
            requestId: req.requestId,
          });
        res.locals.auditChanges = [{ id: projectId, action: 'delete' }];
        res.json({ ok: true, targetProjectId: target.id, movedTasks: moved.modifiedCount });
      },
      res,
    ),
  );
}
