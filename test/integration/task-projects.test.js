import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { ObjectId } from 'mongodb';
import { connectDatabase } from '../../shared/persistence/database.js';
import { createApp } from '../../api/src/app.js';
import { digestToken } from '../../api/src/auth/auth.js';

test('projects are workspace scoped and tasks have one project across create, update and filtering', async (t) => {
  process.env.DATABASE_SCHEMA =
    process.env.MONGODB_DB = `test_projects_${randomUUID().replaceAll('-', '')}`;
  const { db, client } = await connectDatabase();
  const server = createApp(db).listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await db.dropDatabase();
    await client.close();
  });
  const owner = new ObjectId(),
    foreign = new ObjectId();
  const headers = [];
  for (const [role, workspaceId] of [
    ['admin', owner],
    ['responder', owner],
    ['viewer', owner],
    ['user', owner],
    ['admin', foreign],
  ]) {
    const _id = new ObjectId(),
      token = randomBytes(32).toString('hex');
    await db.collection('users').insertOne({
      _id,
      role,
      workspaceId,
      displayName: 'Test user',
      email: `${_id}@example.test`,
    });
    await db.collection('sessions').insertOne({
      _id: digestToken(token),
      userId: _id,
      expiresAt: new Date(Date.now() + 3600000),
    });
    headers.push({
      Cookie: `servicetrident_session=${token}`,
      'X-Requested-With': 'ServiceTrident',
      'Content-Type': 'application/json',
    });
  }
  const request = async (path, method = 'GET', body, actor = 0) => {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api${path}`, {
      method,
      headers: headers[actor],
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return { status: response.status, data: await response.json() };
  };
  assert.equal((await request('/projects', 'POST', { name: '' })).status, 400);
  assert.equal(
    (await request('/projects', 'POST', { name: 'No', workspaceId: String(foreign) })).status,
    400,
  );
  for (const actor of [2, 3])
    assert.equal((await request('/projects', 'POST', { name: 'No' }, actor)).status, 403);
  const first = await request('/projects', 'POST', { name: 'Launch' });
  assert.equal(first.status, 201);
  const second = await request('/projects', 'POST', { name: 'Operations' }, 1);
  assert.equal(second.status, 201);
  assert.equal((await request('/projects', 'POST', { name: 'launch' })).status, 400);
  const foreignProject = (await request('/projects', 'POST', { name: 'Foreign' }, 4)).data.item;
  const refs = await request('/references/projects');
  assert.equal(refs.data.options.length, 3);
  assert.equal(
    (await request(`/references/projects?selected=${foreignProject.id}`)).data.selected.length,
    0,
  );
  assert.equal(
    (await request('/tasks', 'POST', { title: 'Bad', projectId: foreignProject.id })).status,
    400,
  );
  assert.equal(
    (
      await request('/tasks', 'POST', {
        title: 'Bad',
        projectId: [first.data.item.id, second.data.item.id],
      })
    ).status,
    400,
  );
  const missingProject = await request('/tasks', 'POST', { title: 'Needs a project' });
  assert.equal(missingProject.status, 201);
  const created = await request('/tasks', 'POST', {
    title: 'Launch task',
    projectId: first.data.item.id,
  });
  assert.equal(created.status, 201);
  assert.equal(created.data.item.projectName, 'Launch');
  const projectId = first.data.item.id;
  const milestone = await request('/project-milestones', 'POST', {
    title: 'Release',
    projectId,
    targetDate: '2030-01-01',
    taskIds: [created.data.item.id],
    status: 'blocked',
  });
  assert.equal(milestone.status, 201, JSON.stringify(milestone.data));
  assert.match(milestone.data.item.number, /^MS\d{7,}$/);
  assert.equal(
    (await request(`/project-milestones/${milestone.data.item.id}`)).data.tasks[0].label,
    'Launch task',
  );
  assert.equal(
    (
      await request('/project-milestones', 'POST', {
        title: 'No',
        projectId: foreignProject.id,
        targetDate: '2030-01-01',
      })
    ).status,
    404,
  );
  assert.equal(
    (
      await request('/project-milestones', 'POST', {
        title: 'No',
        projectId,
        targetDate: '2030-02-30',
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await request('/project-milestones', 'POST', {
        title: 'No',
        projectId,
        targetDate: '2030-01-01',
        workspaceId: String(foreign),
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await request(
        '/project-milestones',
        'POST',
        { title: 'No', projectId, targetDate: '2030-01-01' },
        2,
      )
    ).status,
    403,
  );
  assert.equal(
    (await request(`/project-milestones/${milestone.data.item.id}`, 'GET', undefined, 4)).status,
    404,
  );
  const overview = await request(`/project-overview?projectId=${projectId}`);
  assert.equal(overview.status, 200, JSON.stringify(overview.data));
  assert.equal(overview.data.total, 1);
  assert.equal(overview.data.blocked, 1);
  assert.equal((await request('/project-overview', 'GET', undefined, 3)).status, 403);
  assert.equal((await request('/tables/projects?sortBy=name')).status, 200);
  assert.equal(
    (await request(`/tables/project-milestones?projectId=${projectId}&sortBy=targetDate`)).data
      .total,
    1,
  );
  assert.equal(
    (await request(`/projects/${projectId}/comments`, 'POST', { body: 'Review the release.' }, 1))
      .status,
    201,
  );
  assert.equal(
    (await request(`/projects/${projectId}/comments`, 'POST', { body: 'No' }, 2)).status,
    403,
  );
  const activity = await request(
    `/tables/project-activity?projectId=${projectId}&sortBy=createdAt`,
  );
  assert.ok(activity.data.rows.some((r) => r.body === 'Review the release.'));
  assert.ok(activity.data.rows.some((r) => r.action === 'Task created'));
  const pins = await request('/pins');
  assert.equal(pins.status, 200);
  const values = {
    revision: pins.data.revision,
    groups: [{ id: 'general', name: 'General' }],
    items: [{ path: `/projects/${projectId}`, label: 'Launch', groupId: 'general' }],
  };
  assert.equal((await request('/pins', 'PUT', values)).status, 200);
  assert.equal((await request('/pins', 'PUT', values)).status, 409);
  assert.equal((await request('/pins', 'GET', undefined, 1)).data.items.length, 0);
  assert.equal(
    (
      await request('/pins', 'PUT', {
        ...values,
        revision: 1,
        items: [{ path: 'https://example.test', label: 'No', groupId: 'general' }],
      })
    ).status,
    400,
  );
  assert.equal(
    (await request('/pins', 'PUT', { ...values, revision: 1, workspaceId: String(foreign) }))
      .status,
    400,
  );

  const task = created.data.item;
  const update = await request(`/tasks/${task.id}`, 'PATCH', {
    revision: task.revision,
    projectId: second.data.item.id,
  });
  assert.equal(update.status, 200);
  assert.equal((await request(`/tasks?projectId=${first.data.item.id}`)).data.total, 0);
  assert.equal((await request(`/tasks?projectId=${second.data.item.id}`)).data.total, 1);
  assert.equal((await request('/tasks?projectId=unassigned')).data.total, 1);
  assert.equal((await request('/tasks?projectId=invalid')).status, 400);
  const detail = await request(`/projects/${second.data.item.id}`);
  const changed = await request(`/projects/${second.data.item.id}`, 'PATCH', {
    revision: detail.data.item.revision,
    name: 'Operations Updated',
    description: 'Release operations',
    ownerIds: [
      String((await db.collection('users').findOne({ workspaceId: owner, role: 'responder' }))._id),
    ],
    ownerGroupIds: [],
  });
  assert.equal(changed.status, 200);
  assert.equal(changed.data.item.description, 'Release operations');
  assert.equal((await request(`/tasks/${task.id}`)).data.item.projectName, 'Operations Updated');
  assert.equal(
    (await request(`/projects/${second.data.item.id}`, 'PATCH', { revision: 0, name: 'Stale' }))
      .status,
    409,
  );
  assert.equal(
    (
      await request(`/projects/${first.data.item.id}`, 'DELETE', {
        confirmed: true,
        revision: 0,
        targetProjectId: first.data.item.id,
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await request(`/projects/${second.data.item.id}`, 'DELETE', {
        confirmed: true,
        revision: changed.data.item.revision,
        targetProjectId: foreignProject.id,
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await request(`/projects/${second.data.item.id}`, 'DELETE', {
        confirmed: true,
        revision: changed.data.item.revision,
        targetProjectId: first.data.item.id,
      })
    ).status,
    200,
  );
  assert.equal((await request(`/tasks/${task.id}`)).data.item.projectId, first.data.item.id);
  const general = (await request('/references/projects')).data.options.find(
    (row) => row.label === 'General',
  );
  assert.ok(general);
  assert.equal(
    (
      await request(`/projects/${first.data.item.id}`, 'DELETE', {
        confirmed: true,
        revision: 0,
        targetProjectId: general.id,
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await request(`/projects/${general.id}`, 'DELETE', {
        confirmed: true,
        revision: 0,
        targetProjectId: general.id,
      })
    ).status,
    409,
  );
  assert.equal((await request('/references/projects')).data.options.length, 1);
  const audit = await db.collection('auditEvents').find({ workspaceId: owner }).toArray();
  assert.ok(audit.some((row) => JSON.stringify(row).includes('/api/projects')));
});
