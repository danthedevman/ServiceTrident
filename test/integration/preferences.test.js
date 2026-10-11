import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_UI_PREFERENCES } from '../../shared/domain/ui-preferences.js';
import { randomUUID } from 'node:crypto';
import { connectDatabase } from '../../shared/persistence/database.js';
import { createApp } from '../../api/src/app.js';

test(
  'personal sidebar preferences persist across sessions and audit metadata remains server-owned',
  { timeout: 30000 },
  async (t) => {
    process.env.DATABASE_SCHEMA =
      process.env.MONGODB_DB = `preferences_test_${randomUUID().replaceAll('-', '')}`;
    const { db, client } = await connectDatabase(),
      server = createApp(db).listen(0, '0.0.0.0');
    await new Promise((resolve) => server.once('listening', resolve));
    t.after(async () => {
      await new Promise((resolve) => server.close(resolve));
      await db.dropDatabase();
      await client.close();
    });
    const base = `http://127.0.0.1:${server.address().port}/api`;
    async function request(path, cookie, method = 'GET', body) {
      const response = await fetch(base + path, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'X-Requested-With': 'ServiceTrident',
          ...(cookie ? { Cookie: cookie } : {}),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      return {
        status: response.status,
        data: await response.json(),
        cookie: response.headers.get('set-cookie')?.split(';')[0],
      };
    }
    const credentials = {
      email: 'owner@example.com',
      displayName: 'Owner',
      password: 'long preferences test password',
    };
    const owner = await request('/auth/register', null, 'POST', credentials);
    const other = await request('/auth/register', null, 'POST', {
      ...credentials,
      email: 'other@example.com',
    });
    assert.equal(
      (await request('/auth/preferences', null, 'PATCH', { leftCollapsed: true })).status,
      401,
    );
    for (const body of [
      { role: 'admin' },
      { leftCollapsed: 'true' },
      { filtersOpen: 'true' },
      { compactTables: 'true' },
      { dashboardTab: 'unknown' },
      { leftCollapsed: true, userId: other.data.user.id },
    ])
      assert.equal((await request('/auth/preferences', owner.cookie, 'PATCH', body)).status, 400);
    assert.equal(
      (await request('/auth/preferences', owner.cookie, 'PATCH', { leftCollapsed: true })).status,
      200,
    );
    const right = await request('/auth/preferences', owner.cookie, 'PATCH', {
      rightCollapsed: true,
    });
    assert.deepEqual(right.data.preferences, {
      ...DEFAULT_UI_PREFERENCES,
      leftCollapsed: true,
      rightCollapsed: true,
    });
    await request('/auth/preferences', owner.cookie, 'PATCH', { filtersOpen: true });
    const tableLayouts = {
      '/incidents::incidents': { order: ['severity', 'title'], hidden: ['createdAt'] },
      '/tasks::tasks': { order: ['title', 'status'], hidden: [] },
    };
    assert.equal(
      (await request('/auth/preferences', owner.cookie, 'PATCH', { tableLayouts })).status,
      200,
    );
    assert.equal(
      (await request('/auth/preferences', owner.cookie, 'PATCH', { dashboardTab: 'tasks' })).status,
      200,
    );
    const appearance = {
      compactTables: true,
      rightPanelWidth: 456,
      dashboardGreeting: 'Hello, {firstName}',
      colorScheme: 'forest',
      highContrast: true,
      reduceMotion: true,
      textScale: 'large',
      timeFormat: '24',
      dateFormat: 'iso',
      aiSummaries: false,
    };
    assert.equal(
      (await request('/auth/preferences', owner.cookie, 'PATCH', appearance)).status,
      200,
    );
    const anotherSession = await request('/auth/login', null, 'POST', credentials);
    assert.deepEqual(anotherSession.data.user.uiPreferences, {
      ...right.data.preferences,
      filtersOpen: true,
      dashboardTab: 'tasks',
      tableLayouts,
      ...appearance,
    });
    assert.equal((await request('/auth/me', other.cookie)).data.user.uiPreferences, null);
    assert.equal(
      (
        await request('/auth/preferences', owner.cookie, 'PATCH', {
          tableLayouts: { '/incidents': { order: ['title', 'title'], hidden: [] } },
        })
      ).status,
      400,
    );
    const reset = await request('/auth/preferences', owner.cookie, 'PATCH', {
      tableLayouts: { '/tasks::tasks': tableLayouts['/tasks::tasks'] },
    });
    assert.deepEqual(reset.data.preferences.tableLayouts, {
      '/tasks::tasks': tableLayouts['/tasks::tasks'],
    });
    await request('/auth/role', owner.cookie, 'POST', { role: 'viewer' });
    assert.equal(
      (await request('/auth/preferences', owner.cookie, 'PATCH', { rightCollapsed: false })).status,
      200,
    );
    assert.equal((await request('/auth/me', owner.cookie)).data.user.role, 'viewer');
    assert.equal(
      (await request('/auth/me', anotherSession.cookie)).data.user.uiPreferences.rightCollapsed,
      false,
    );
    const service = (
      await request('/services', anotherSession.cookie, 'POST', {
        name: 'Audited',
        createdBy: 'forged',
        createdAt: '1900-01-01',
        revision: 999,
      })
    ).data.item;
    assert.equal(service.createdBy, credentials.email);
    assert.equal(service.createdById, owner.data.user.id);
    assert.equal(service.revision, 0);
    const changed = (
      await request(`/services/${service.id}`, anotherSession.cookie, 'PATCH', {
        name: 'Updated',
        createdBy: 'forged',
      })
    ).data.item;
    assert.equal(changed.createdAt, service.createdAt);
    assert.equal(changed.updatedBy, credentials.email);
    assert.equal(changed.revision, 1);
    const collection = (
      await request('/collections', anotherSession.cookie, 'POST', {
        name: 'Collection',
        serviceIds: [service.id],
      })
    ).data.item;
    assert.equal(collection.createdBy, credentials.email);
    await request('/status-settings', anotherSession.cookie, 'PATCH', { visibility: 'public' });
    const settings = (await request('/status-settings', anotherSession.cookie)).data;
    const publicStatus = (
      await request(settings.publicPath.replace('/status/public/', '/public/status/'))
    ).data;
    for (const row of [
      ...publicStatus.services,
      ...publicStatus.collections,
      ...publicStatus.monitors,
    ])
      for (const key of ['createdBy', 'updatedBy', 'createdById', 'updatedById', 'revision'])
        assert.equal(key in row, false);
  },
);
