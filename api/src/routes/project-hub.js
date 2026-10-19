import { ObjectId } from 'mongodb';
import { requireResponder } from '../auth/auth.js';
import { InputError } from '@servicetrident/shared/validation/input-error';
import { identifier, text } from '@servicetrident/shared/validation/fields';
import { auditStamp } from '@servicetrident/shared/domain/audit';
import { withProjectMutation } from '../domain/project-lock.js';
import {
  projectScope,
  projectStats,
  projectActivity,
  milestoneInput,
} from '../repositories/project-hub.js';
const view = ({ _id, workspaceId, ...row }) => ({ id: String(_id), ...row });
export function installProjectHubRoutes(app, db) {
  app.get('/api/project-overview', async (req, res) => res.json(await projectStats(db, req)));
  app.get('/api/project-milestones/:id', async (req, res) => {
    await projectScope(db, req);
    const item = await db
      .collection('projectMilestones')
      .findOne({ _id: new ObjectId(identifier(req.params.id)), workspaceId: req.workspaceId });
    if (!item) throw new InputError('Milestone not found.', 404);
    await projectScope(db, req, item.projectId);
    const tasks = await db
      .collection('tasks')
      .find(
        {
          workspaceId: req.workspaceId,
          projectId: item.projectId,
          _id: { $in: (item.taskIds || []).map((id) => new ObjectId(id)) },
        },
        { projection: { title: 1 } },
      )
      .toArray();
    res.json({
      item: view(item),
      tasks: tasks.map((t) => ({ id: String(t._id), label: t.title })),
    });
  });
  for (const method of ['post', 'patch'])
    app[method](
      `/api/project-milestones${method === 'patch' ? '/:id' : ''}`,
      requireResponder,
      async (req, res) =>
        withProjectMutation(
          db,
          req.workspaceId,
          async () => {
            const current =
              method === 'patch'
                ? await db.collection('projectMilestones').findOne({
                    _id: new ObjectId(identifier(req.params.id)),
                    workspaceId: req.workspaceId,
                  })
                : null;
            if (method === 'patch' && !current) throw new InputError('Milestone not found.', 404);
            if (current && req.body?.revision !== current.revision)
              throw new InputError('Milestone changed. Reload before saving.', 409);
            const input = await milestoneInput(db, req, req.body, current);
            if (
              !current &&
              (await db
                .collection('projectMilestones')
                .countDocuments({ workspaceId: req.workspaceId, projectId: input.projectId })) >=
                200
            )
              throw new InputError('Each project supports up to 200 milestones.');
            const item = {
              ...current,
              ...input,
              ...auditStamp(current, req.user),
              _id: current?._id ?? new ObjectId(),
              workspaceId: req.workspaceId,
            };
            if (current)
              await db
                .collection('projectMilestones')
                .updateOne(
                  { _id: current._id, workspaceId: req.workspaceId, revision: current.revision },
                  { $set: { ...input, ...auditStamp(current, req.user) } },
                );
            else await db.collection('projectMilestones').insertOne(item);
            await projectActivity(
              db,
              req,
              item.projectId,
              current ? 'Milestone updated' : 'Milestone created',
            );
            res.status(current ? 200 : 201).json({ item: view(item) });
          },
          res,
        ),
    );
  app.post('/api/projects/:id/comments', requireResponder, async (req, res) => {
    const { item } = await projectScope(db, req, req.params.id);
    if (!req.body || Object.keys(req.body).some((k) => !['body'].includes(k)))
      throw new InputError('Send a comment only.');
    await db.collection('projectActivity').insertOne({
      workspaceId: req.workspaceId,
      projectId: item.id,
      action: 'Comment',
      body: text(req.body.body, 'body', 2000),
      actor: req.user.displayName || req.user.email,
      actorId: String(req.user._id),
      createdAt: new Date(),
    });
    res.status(201).json({ ok: true });
  });
}
