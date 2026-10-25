import { migrateComponents } from '../../shared/domain/migrate-components.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { ObjectId } from 'mongodb';
import { connectDatabase } from '../../shared/persistence/database.js';
import { createApp } from '../../api/src/app.js';

test(
  'service component ownership, legacy conversion, renames and industry batches',
  { timeout: 60000 },
  async (t) => {
    process.env.DATABASE_SCHEMA =
      process.env.MONGODB_DB = `components_test_${randomUUID().replaceAll('-', '')}`;
    const { db, client } = await connectDatabase();
    const server = createApp(db).listen(0, '0.0.0.0');
    await new Promise((resolve) => server.once('listening', resolve));
    t.after(async () => {
      await new Promise((resolve) => server.close(resolve));
      await db.dropDatabase();
      await client.close();
    });
    async function request(path, cookie, method = 'GET', body) {
      const response = await fetch(`http://127.0.0.1:${server.address().port}/api${path}`, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'X-Requested-With': 'ServiceTrident',
          ...(cookie ? { Cookie: cookie } : {}),
        },
        body: body === undefined && method !== 'DELETE' ? undefined : JSON.stringify(body ?? {}),
      });
      return {
        status: response.status,
        data: response.status === 204 ? null : await response.json(),
        cookie: response.headers.get('set-cookie')?.split(';')[0],
      };
    }
    async function register(email) {
      return (
        await request('/auth/register', null, 'POST', {
          displayName: 'Synthetic tester',
          email,
          password: 'isolated synthetic test password',
        })
      ).cookie;
    }
    const owner = await register('owner@example.invalid'),
      other = await register('other@example.invalid');
    const component = (await request('/components', owner, 'POST', { name: 'Payment API' })).data
      .item;
    const login = (await request('/components', owner, 'POST', { name: 'Login API' })).data.item;
    const created = await request('/services', owner, 'POST', {
      name: 'My Webapp',
      componentIds: [component.id, login.id],
    });
    assert.equal(created.status, 201);
    const service = created.data.item;
    assert.equal(
      (await request('/components', owner, 'POST', { name: 'payment api' })).status,
      409,
    );
    const foreign = (await request('/components', other, 'POST', { name: 'Foreign API' })).data
      .item;
    assert.equal(
      (await request(`/services/${service.id}`, owner, 'PATCH', { componentIds: [foreign.id] }))
        .status,
      400,
    );
    const input = {
      name: 'Payment health',
      url: 'https://example.com/health',
      intervalMinutes: 5,
      serviceId: service.id,
      componentId: component.id,
    };
    assert.equal((await request('/monitors', other, 'POST', input)).status, 404);
    assert.equal(
      (
        await request('/monitors', owner, 'POST', {
          ...input,
          componentId: foreign.id,
        })
      ).status,
      400,
    );
    const monitor = (await request('/monitors', owner, 'POST', input)).data.monitor;
    assert.equal(monitor.componentId, component.id);
    assert.equal(
      (await request(`/services/${service.id}`, owner, 'PATCH', { componentIds: [] })).status,
      409,
    );
    assert.equal(
      (
        await request(`/components/${component.id}`, owner, 'PATCH', {
          name: 'Payments API',
          revision: component.revision,
        })
      ).status,
      200,
    );
    assert.equal(
      (await request(`/monitors/${monitor.id}`, owner)).data.monitor.component,
      'Payments API',
    );
    assert.equal((await request(`/components/${component.id}`, owner, 'DELETE')).status, 409);
    assert.equal((await request(`/components/${component.id}`, other)).status, 404);
    assert.equal(
      (
        await request(`/components/${component.id}`, other, 'PATCH', {
          name: 'Override',
          revision: 1,
        })
      ).status,
      404,
    );
    assert.equal(
      (await request('/tables/components?serviceId=' + service.id, owner)).data.total,
      2,
    );
    assert.equal((await request('/references/components?q=Payments', owner)).status, 200);
    const unlinked = (await request('/components', owner, 'POST', { name: 'Unlinked API' })).data
      .item;
    const scopedReferences = await request(
      `/references/components?serviceId=${service.id}&selected=${unlinked.id}`,
      owner,
    );
    assert.equal(scopedReferences.data.options.length, 2);
    assert.equal(scopedReferences.data.selected.length, 0);
    assert.equal(
      (await request(`/references/components?serviceId=${service.id}`, other)).status,
      404,
    );
    assert.equal((await request('/search?q=Payments&type=components', owner)).status, 200);
    await db.collection('monitors').updateOne(
      { _id: new ObjectId(monitor.id) },
      {
        $set: {
          paused: false,
          lastCheck: { checkedAt: new Date(), status: 'up', durationMs: 10 },
        },
      },
    );
    const status = await request('/status', owner);
    const publicComponent = status.data.services
      .find((row) => row.id === service.id)
      .components.find((row) => row.id === component.id);
    assert.equal(publicComponent.status, 'up');
    assert.equal(
      status.data.services
        .find((row) => row.id === service.id)
        .components.find((row) => row.id === login.id).status,
      'unknown',
    );
    const user = await db.collection('users').findOne({ email: 'owner@example.invalid' });
    const legacyId = new ObjectId();
    await db.collection('monitors').insertOne({
      _id: legacyId,
      userId: user._id,
      serviceId: new ObjectId(service.id),
      component: 'Legacy API',
      name: 'Legacy',
      url: 'https://example.com',
      intervalMinutes: 5,
      paused: true,
    });
    await db
      .collection('catalogs')
      .updateOne({ _id: user._id }, { $unset: { componentSchemaVersion: '' } });
    await migrateComponents(db);
    const projected = (await request('/services', owner)).data.services.find(
      (row) => row.id === service.id,
    );
    const legacy = projected.components.find((row) => row.name === 'Legacy API');
    assert.ok(legacy);
    assert.equal(
      (await request(`/monitors/${legacyId}`, owner)).data.monitor.componentId,
      legacy.id,
    );
    assert.equal(
      (await request(`/monitors/${monitor.id}`, owner, 'PATCH', { componentId: null })).status,
      200,
    );
    assert.equal((await request(`/monitors/${monitor.id}`, owner)).data.monitor.component, '');
    assert.equal(
      (
        await request('/settings/demo-data', owner, 'POST', {
          confirmation: 'ADD DEMO DATA',
          industry: 'unknown',
        })
      ).status,
      400,
    );
    const batch = await request('/settings/demo-data', owner, 'POST', {
      confirmation: 'ADD DEMO DATA',
      industry: 'solo',
    });
    assert.equal(batch.status, 201);
    assert.equal(batch.data.batch.industry, 'solo');
    assert.equal(batch.data.batch.counts.services, 10);
    assert.equal(batch.data.batch.counts.components, 30);
    const demos = (await request('/services', owner)).data.services.filter(
      (row) => row.demoBatchId === batch.data.batch.batchId,
    );
    assert.equal(demos.length, 10);
    assert.ok(demos.every((row) => row.componentIds.length === 3));
    assert.equal(
      (
        await request('/settings/demo-data', owner, 'POST', {
          confirmation: 'ADD DEMO DATA',
          industry: 'retail',
        })
      ).status,
      409,
    );
    const demoComponentId = demos[0].componentIds[0];
    const linkedRealService = await request('/services', owner, 'POST', {
      name: 'Retained Application',
      componentIds: [demoComponentId],
    });
    const retainedMonitor = await request('/monitors', owner, 'POST', {
      ...input,
      serviceId: linkedRealService.data.item.id,
      componentId: demoComponentId,
    });
    await request('/settings/demo-data', owner, 'DELETE', {
      confirmation: 'DELETE DEMO DATA',
      batchId: batch.data.batch.batchId,
    });
    assert.ok(
      (await request('/services', owner)).data.services.some((row) => row.id === service.id),
    );
    assert.deepEqual(
      (await request('/services', owner)).data.services.find(
        (row) => row.id === linkedRealService.data.item.id,
      ).componentIds,
      [],
    );
    assert.equal(
      (await request(`/monitors/${retainedMonitor.data.monitor.id}`, owner)).data.monitor
        .componentId,
      null,
    );
    await db
      .collection('users')
      .updateOne(
        { email: 'other@example.invalid' },
        { $set: { workspaceId: user._id, role: 'viewer' } },
      );
    assert.equal(
      (await request(`/services/${service.id}`, other, 'PATCH', { componentIds: [] })).status,
      403,
    );
  },
);
