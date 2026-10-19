import { ObjectId } from 'mongodb';
import { settings } from './settings.js';
import { InputError } from '@servicetrident/shared/validation/input-error';
import { identifier } from '@servicetrident/shared/validation/fields';

export async function projectScope(db, req, raw = req.query.projectId) {
  if (req.role === 'user') throw new InputError('Workspace access required.', 403);
  const config = await settings(db, req.workspaceId);
  const projectId = raw ? identifier(raw, 'projectId') : null;
  const item = projectId ? config.projects.find((p) => p.id === projectId && !p.deleting) : null;
  if (projectId && !item) throw new InputError('Project not found.', 404);
  return {
    config,
    item,
    filter: { workspaceId: req.workspaceId, ...(projectId ? { projectId } : {}) },
  };
}
/** The feed contains only explicit project changes and comments, never request payloads. */
export async function projectActivity(db, req, projectId, action, taskId = null, taskTitle = '') {
  if (!projectId) return;
  await db.collection('projectActivity').insertOne({
    workspaceId: req.workspaceId,
    projectId,
    taskId,
    taskTitle: String(taskTitle).slice(0, 160),
    action,
    actor: req.user.displayName || req.user.email || 'System',
    actorId: String(req.user._id),
    createdAt: new Date(),
  });
}
export async function projectStats(db, req) {
  const { config, item, filter } = await projectScope(db, req);
  const tasks = await db
    .collection('tasks')
    .aggregate([
      { $match: { ...filter, status: { $ne: 'archived' } } },
      {
        $group: {
          _id: { projectId: '$projectId', status: '$status', assignee: '$assigneeName' },
          count: { $sum: 1 },
        },
      },
    ])
    .toArray();
  const today = new Date().toISOString().slice(0, 10);
  const open = { ...filter, status: { $nin: ['done', 'archived'] } };
  const [overdue, upcoming, blocked, overdueTasks] = await Promise.all([
    db.collection('tasks').countDocuments({ ...open, dueDate: { $gt: '', $lt: today } }),
    db
      .collection('projectMilestones')
      .find({ ...filter, status: { $nin: ['completed', 'archived'] }, targetDate: { $gte: today } })
      .sort({ targetDate: 1, _id: 1 })
      .limit(6)
      .toArray(),
    db.collection('projectMilestones').countDocuments({ ...filter, status: 'blocked' }),
    db
      .collection('tasks')
      .find(
        { ...open, dueDate: { $gt: '', $lt: today } },
        { projection: { title: 1, number: 1, dueDate: 1, projectId: 1, projectName: 1 } },
      )
      .sort({ dueDate: 1, _id: 1 })
      .limit(6)
      .toArray(),
  ]);
  const projects = config.projects
    .filter((p) => !p.deleting && (!item || item.id === p.id))
    .map((p) => {
      const rows = tasks.filter((r) => r._id.projectId === p.id);
      const total = rows.reduce((n, r) => n + r.count, 0),
        done = rows.filter((r) => r._id.status === 'done').reduce((n, r) => n + r.count, 0);
      return { ...p, total, done, progress: total ? Math.round((done * 100) / total) : 0 };
    });
  const workload = new Map();
  for (const row of tasks.filter((r) => r._id.status !== 'done')) {
    const name = row._id.assignee || 'Unassigned';
    workload.set(name, (workload.get(name) || 0) + row.count);
  }
  return {
    projects,
    overdue,
    blocked,
    total: tasks.reduce((n, r) => n + r.count, 0),
    done: tasks.filter((r) => r._id.status === 'done').reduce((n, r) => n + r.count, 0),
    upcoming: upcoming.map(({ _id, workspaceId, ...r }) => ({ id: String(_id), ...r })),
    overdueTasks: overdueTasks.map(({ _id, ...r }) => ({ id: String(_id), ...r })),
    workload: [...workload]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([name, count]) => ({ name, count })),
  };
}
export async function milestoneInput(db, req, body, current) {
  if (
    !body ||
    typeof body !== 'object' ||
    Array.isArray(body) ||
    Object.keys(body).some(
      (k) =>
        ![
          'title',
          'description',
          'targetDate',
          'status',
          'taskIds',
          'projectId',
          'revision',
        ].includes(k),
    )
  )
    throw new InputError('Send only editable milestone fields.');
  const { text, choice, invalid } = await import('@servicetrident/shared/validation/fields');
  const { item } = await projectScope(db, req, body.projectId ?? current?.projectId);
  if (!item) invalid('projectId', 'Choose a project.');
  const targetDate = body.targetDate ?? current?.targetDate ?? '';
  if (
    typeof targetDate !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}$/.test(targetDate) ||
    !Number.isFinite(Date.parse(targetDate)) ||
    new Date(targetDate).toISOString().slice(0, 10) !== targetDate
  )
    invalid('targetDate', 'Enter a valid target date.');
  const taskIds = body.taskIds ?? current?.taskIds ?? [];
  if (!Array.isArray(taskIds) || taskIds.length > 100 || new Set(taskIds).size !== taskIds.length)
    invalid('taskIds', 'Choose up to 100 distinct tasks.');
  for (const taskId of taskIds) identifier(taskId, 'taskIds');
  if (
    taskIds.length &&
    (await db.collection('tasks').countDocuments({
      workspaceId: req.workspaceId,
      projectId: item.id,
      _id: { $in: taskIds.map((id) => new ObjectId(id)) },
    })) !== taskIds.length
  )
    invalid('taskIds', 'Choose tasks belonging to this project.');
  return {
    projectId: item.id,
    projectName: item.name,
    title: text(body.title ?? current?.title, 'title', 160),
    description: text(body.description ?? current?.description ?? '', 'description', 2000, false),
    targetDate,
    status: choice(
      body.status ?? current?.status ?? 'planned',
      ['planned', 'in_progress', 'blocked', 'completed', 'archived'],
      'status',
    ),
    taskIds,
  };
}
