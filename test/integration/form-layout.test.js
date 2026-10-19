import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { ObjectId } from 'mongodb';
import { connectDatabase } from '../../shared/persistence/database.js';
import { createApp } from '../../api/src/app.js';
import { digestToken } from '../../api/src/auth/auth.js';
test('form layouts validate section ownership and preserve role, workspace and revision boundaries', async (t) => {
  process.env.DATABASE_SCHEMA =
    process.env.MONGODB_DB = `test_form_layout_${randomUUID().replaceAll('-', '')}`;
  const { db, client } = await connectDatabase();
  const server = createApp(db).listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await db.dropDatabase();
    await client.close();
  });
  const workspaceId = new ObjectId(),
    foreign = new ObjectId(),
    headers = [];
  for (const [role, tenant] of [
    ['admin', workspaceId],
    ['responder', workspaceId],
    ['viewer', workspaceId],
    ['admin', foreign],
  ]) {
    const _id = new ObjectId(),
      token = randomBytes(32).toString('hex');
    await db.collection('users').insertOne({
      _id,
      workspaceId: tenant,
      role,
      email: `${_id}@example.test`,
      displayName: 'Test operator',
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
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    return { status: response.status, data: await response.json() };
  };
  for (const path of ['/incident-fields', '/task-fields', '/knowledge-fields', '/rca-fields']) {
    const current = (await request(path)).data;
    const section = {
      id: String(new ObjectId()),
      label: 'Core Details',
      columns: 2,
      showName: false,
    };
    const layout = { columns: 1, sections: [section], assignments: { title: section.id } };
    for (const actor of [1, 2])
      assert.equal((await request(path, 'PUT', { ...current, layout }, actor)).status, 403);
    assert.equal(
      (
        await request(path, 'PUT', {
          ...current,
          layout: { ...layout, assignments: { unknown: section.id } },
        })
      ).status,
      400,
    );
    assert.equal((await request(path, 'PUT', { ...current, layout })).status, 200);
    const saved = (await request(path)).data;
    assert.deepEqual(saved.layout, layout);
    assert.equal((await request(path, 'PUT', { ...current, layout })).status, 409);
    assert.deepEqual((await request(path, 'GET', undefined, 3)).data.layout.sections, []);
    const withoutLayout = { fields: saved.fields, revision: saved.revision };
    assert.equal((await request(path, 'PUT', withoutLayout)).status, 200);
    assert.deepEqual(
      (await request(path)).data.layout,
      layout,
      'Legacy field edits retain container layout',
    );
  }
});
