import { summarizeStatusHistory } from '../../shared/domain/status-history.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { ObjectId } from 'mongodb';
import { connectDatabase } from '../../shared/persistence/database.js';
import { createApp } from '../../api/src/app.js';

test(
  'services, dependencies, collections, and explicit public status visibility',
  { timeout: 30000 },
  async (t) => {
    process.env.DATABASE_SCHEMA =
      process.env.MONGODB_DB = `service_catalog_test_${randomUUID().replaceAll('-', '')}`;
    const { db, client } = await connectDatabase();
    const server = createApp(db).listen(0, '0.0.0.0');
    await new Promise((resolve) => server.once('listening', resolve));
    t.after(async () => {
      await new Promise((resolve) => server.close(resolve));
      await db.dropDatabase();
      await client.close();
    });
    const base = `http://127.0.0.1:${server.address().port}/api`;
    /** Send test requests without sharing cookies between accounts. */
    async function request(path, cookie, method = 'GET', body) {
      const response = await fetch(`${base}${path}`, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'X-Requested-With': 'ServiceTrident',
          ...(cookie ? { Cookie: cookie } : {}),
        },
        body: body === undefined ? (method === 'DELETE' ? '{}' : undefined) : JSON.stringify(body),
      });
      return {
        status: response.status,
        data: response.status === 204 ? null : await response.json(),
        cookie: response.headers.get('set-cookie')?.split(';')[0],
      };
    }
    const owner = (
      await request('/auth/register', null, 'POST', {
        displayName: 'Test user',
        email: 'owner@example.com',
        password: 'long unique test password',
      })
    ).cookie;
    const other = (
      await request('/auth/register', null, 'POST', {
        displayName: 'Test user',
        email: 'other@example.com',
        password: 'another long test password',
      })
    ).cookie;
    const user = await db.collection('users').findOne({ email: 'owner@example.com' });
    const settings = await request('/status-settings', owner);
    assert.equal(settings.data.visibility, 'private');
    assert.equal(settings.data.subscriptionButtonVisible, true);
    assert.equal(settings.data.subscriptionsEnabled, undefined);
    assert.equal(settings.data.rssSubscriptions, true);
    assert.equal(
      (
        await request('/status-settings', owner, 'PATCH', {
          visibility: 'private',
          rssSubscriptions: 'false',
        })
      ).status,
      400,
    );
    const controls = await request('/status-settings', owner, 'PATCH', {
      visibility: 'private',
      subscriptionButtonVisible: false,
      rssSubscriptions: false,
    });
    assert.equal(controls.status, 200);
    assert.equal(controls.data.subscriptionButtonVisible, false);
    assert.equal(controls.data.subscriptionsEnabled, undefined);
    assert.equal(controls.data.rssSubscriptions, false);

    const publicApi = settings.data.publicPath.replace('/status/public/', '/public/status/');
    assert.equal((await request(publicApi)).status, 404);
    assert.equal((await fetch(`${base}${publicApi}/icon`)).status, 404);
    assert.equal((await request('/status')).status, 401);
    assert.equal(
      (await request('/status-settings', other, 'PATCH', { visibility: 'invalid' })).status,
      400,
    );

    const invalid = await request('/services', owner, 'POST', {
      name: '   ',
      description: 'x'.repeat(1001),
    });
    assert.equal(invalid.status, 400);
    assert.ok(invalid.data.fields.name);
    assert.ok(invalid.data.fields.description);
    const selectedCollection = (
      await request('/collections', owner, 'POST', { name: 'Selected at creation' })
    ).data.item;
    const selectedService = (
      await request('/services', owner, 'POST', {
        name: 'Selected service',
        collectionIds: [selectedCollection.id],
      })
    ).data.item;
    assert.deepEqual((await request('/collections', owner)).data.collections[0].serviceIds, [
      selectedService.id,
    ]);
    assert.equal(
      (
        await request(`/services/${selectedService.id}`, owner, 'PATCH', {
          healthPolicy: { failuresBeforeDown: 0 },
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await request(`/services/${selectedService.id}`, other, 'PATCH', {
          healthPolicy: { manualDegraded: true },
        })
      ).status,
      404,
    );
    assert.equal(
      (
        await request(`/services/${selectedService.id}`, owner, 'PATCH', {
          healthPolicy: { manualDegraded: true },
        })
      ).status,
      200,
    );
    assert.equal(
      (await request('/status', owner)).data.services.find((row) => row.id === selectedService.id)
        .status,
      'degraded',
    );
    await request(`/services/${selectedService.id}`, owner, 'PATCH', {
      healthPolicy: { manualDegraded: false },
    });
    const membershipOnly = await request(`/services/${selectedService.id}`, owner, 'PATCH', {
      collectionIds: [],
    });
    assert.equal(membershipOnly.status, 200);
    assert.equal(membershipOnly.data.item.name, selectedService.name);
    assert.equal(
      (
        await request(`/services/${selectedService.id}`, owner, 'PATCH', {
          collectionIds: [selectedCollection.id],
        })
      ).status,
      200,
    );
    assert.equal(
      (
        await request(`/services/${selectedService.id}`, owner, 'PATCH', {
          name: 'Renamed',
          collectionIds: [],
        })
      ).status,
      200,
    );
    assert.deepEqual((await request('/collections', owner)).data.collections[0].serviceIds, []);
    const invalidCollection = await request(`/services/${selectedService.id}`, owner, 'PATCH', {
      name: 'Should not save',
      collectionIds: [new ObjectId().toHexString()],
    });
    assert.equal(invalidCollection.status, 400);
    assert.ok(invalidCollection.data.fields.collectionIds);
    assert.equal((await request('/services', owner)).data.services[0].name, 'Renamed');
    await request(`/services/${selectedService.id}`, owner, 'DELETE');
    await request(`/collections/${selectedCollection.id}`, owner, 'DELETE');

    const database = (
      await request('/services', owner, 'POST', {
        name: 'Database',
        description: 'Storage health',
        componentIds: [
          (await request('/components', owner, 'POST', { name: 'Storage' })).data.item.id,
        ],
      })
    ).data.item;
    const portal = (
      await request('/services', owner, 'POST', { name: 'Portal', dependencyIds: [database.id] })
    ).data.item;
    assert.equal((await request('/services', other)).data.services.length, 0);
    assert.equal(
      (await request(`/services/${portal.id}`, other, 'PATCH', { name: 'Stolen' })).status,
      404,
    );
    assert.equal(
      (
        await request('/services', other, 'POST', {
          name: 'Foreign dependency',
          dependencyIds: [database.id],
        })
      ).status,
      400,
    );
    assert.equal(
      (await request(`/services/${database.id}`, owner, 'PATCH', { dependencyIds: [portal.id] }))
        .status,
      400,
    );
    assert.equal(
      (await request(`/services/${database.id}`, owner, 'PATCH', { dependencyIds: [database.id] }))
        .status,
      400,
    );
    const collection = (
      await request('/collections', owner, 'POST', {
        name: 'Production',
        serviceIds: [portal.id, database.id],
      })
    ).data.item;
    assert.equal((await request(`/collections/${collection.id}`, other, 'DELETE')).status, 404);
    assert.equal((await request('/collections', other)).data.collections.length, 0);
    assert.equal(
      (await request(`/collections/${collection.id}`, owner, 'PATCH', { name: 'Core production' }))
        .status,
      200,
    );

    for (const serviceId of [undefined, null, '']) {
      const missing = await request('/monitors', owner, 'POST', {
        name: 'Missing service',
        url: 'https://example.com',
        intervalMinutes: 1,
        serviceId,
      });
      assert.equal(missing.status, 400);
      assert.equal(missing.data.fields.serviceId, 'Service is required.');
    }
    const created = await request('/monitors', owner, 'POST', {
      name: 'Database health',
      url: 'https://example.com/private?secret=hidden',
      intervalMinutes: 1,
      serviceId: database.id,
      component: 'Storage',
    });
    assert.equal(created.status, 201);
    const monitorId = created.data.monitor.id;
    assert.equal(created.data.monitor.serviceId, database.id);
    assert.equal(created.data.monitor.component, 'Storage');
    assert.equal((await request(`/monitors/${monitorId}`, other)).status, 404);
    assert.equal((await request(`/monitors/${monitorId}/events`, other)).status, 404);
    assert.equal(
      (
        await request('/monitors', other, 'POST', {
          name: 'Foreign',
          url: 'https://example.com',
          intervalMinutes: 1,
          serviceId: database.id,
        })
      ).status,
      404,
    );
    await db.collection('monitors').updateOne(
      { _id: new ObjectId(monitorId) },
      {
        $set: {
          lastCheck: {
            status: 'down',
            checkedAt: new Date(),
            error: 'secret network detail',
            statusCode: 500,
          },
        },
      },
    );
    await db.collection('events').insertOne({
      userId: user._id,
      monitorId: new ObjectId(monitorId),
      checkedAt: new Date(),
      status: 'down',
      statusCode: 500,
      details: { secret: 'response-body-secret' },
    });
    await summarizeStatusHistory(db);
    await summarizeStatusHistory(db);
    const summaries = await db.collection('statusDaily').find({ '_id.userId': user._id }).toArray();
    assert.equal(summaries.length, 1);
    assert.equal(summaries[0].total, 1);
    // A TTL-truncated day must never overwrite a more complete retained summary.
    await db.collection('statusDaily').updateOne({ _id: summaries[0]._id }, { $set: { total: 2 } });
    await summarizeStatusHistory(db);
    assert.equal((await db.collection('statusDaily').findOne({ _id: summaries[0]._id })).total, 2);
    await db.collection('statusDaily').updateOne({ _id: summaries[0]._id }, { $set: { total: 1 } });
    const privateStatus = (await request('/status', owner)).data;
    assert.equal(privateStatus.services.find((service) => service.id === portal.id).status, 'down');
    assert.equal(privateStatus.collections[0].status, 'down');
    assert.equal(privateStatus.monitors[0].history[0].total, 1);
    assert.equal(
      (await request('/status-settings', owner, 'PATCH', { visibility: 'public' })).status,
      200,
    );
    const banner = { enabled: true, level: 'critical', text: 'Investigating elevated errors' };
    const serviceMessages = [
      {
        serviceId: database.id,
        enabled: true,
        level: 'maintenance',
        text: 'Storage maintenance in progress',
      },
    ];
    const beforeMessages = (await request('/status-settings', owner)).data;
    assert.equal(
      (
        await request('/status-settings', owner, 'PATCH', {
          visibility: 'public',
          revision: beforeMessages.revision,
          banner,
          serviceMessages,
        })
      ).status,
      200,
    );
    assert.equal(
      (
        await request('/status-settings', owner, 'PATCH', {
          visibility: 'public',
          revision: beforeMessages.revision,
          banner,
        })
      ).status,
      409,
    );
    assert.equal(
      (
        await request('/status-settings', owner, 'PATCH', {
          visibility: 'public',
          banner: { ...banner, text: '' },
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await request('/status-settings', owner, 'PATCH', {
          visibility: 'public',
          banner: { ...banner, level: 'arbitrary-css' },
        })
      ).status,
      400,
    );
    assert.equal(
      (await request('/status-settings', other, 'PATCH', { visibility: 'public', serviceMessages }))
        .status,
      400,
    );
    const invitation = await request('/invitations', owner, 'POST', {
      role: 'viewer',
      email: 'viewer@example.com',
      displayName: 'Status viewer',
    });
    const viewer = await request('/auth/invite', null, 'POST', {
      token: invitation.data.inviteUrl.split('/').at(-1),
      password: 'a long invited password',
    });
    assert.equal(
      (await request('/status-settings', viewer.cookie, 'PATCH', { visibility: 'public', banner }))
        .status,
      403,
    );
    const base64 =
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=';
    assert.equal(
      (await request('/status-settings/icon', viewer.cookie, 'POST', { base64 })).status,
      403,
    );
    assert.equal(
      (
        await request('/status-settings/icon', owner, 'POST', {
          base64: Buffer.from('<svg onload="alert(1)"></svg>').toString('base64'),
        })
      ).status,
      400,
    );
    assert.equal((await request('/status-settings/icon', owner, 'POST', { base64 })).status, 200);
    const iconResponse = await fetch(`${base}${publicApi}/icon`);
    assert.equal(iconResponse.status, 200);
    assert.equal(iconResponse.headers.get('content-type'), 'image/png');
    assert.equal(iconResponse.headers.get('cache-control'), 'no-store');
    assert.equal(Buffer.from(await iconResponse.arrayBuffer()).toString('base64'), base64);
    assert.equal((await fetch(`${base}/status-settings/icon`)).status, 401);
    const publicStatus = await request(publicApi);
    assert.equal(publicStatus.status, 200);
    assert.deepEqual(publicStatus.data.banner, banner);
    assert.equal(
      publicStatus.data.services.find((service) => service.id === database.id).message.text,
      serviceMessages[0].text,
    );
    await request('/status-settings', owner, 'PATCH', {
      visibility: 'public',
      banner: { ...banner, enabled: false },
      serviceMessages: [{ ...serviceMessages[0], enabled: false }],
    });
    const hiddenMessages = (await request(publicApi)).data;
    assert.equal(hiddenMessages.banner, null);
    assert.equal(
      hiddenMessages.services.find((service) => service.id === database.id).message,
      null,
    );
    assert.equal(publicStatus.data.monitors[0].status, 'down');
    assert.equal(publicStatus.data.monitors[0].uptime, 0);
    for (const key of ['url', 'lastCheck', 'details', 'userId', 'method', 'nextCheckAt'])
      assert.equal(key in publicStatus.data.monitors[0], false, key);
    assert.equal(JSON.stringify(publicStatus.data).includes('secret'), false);
    assert.equal((await request(`/monitors/${monitorId}/events`)).status, 401);
    assert.equal((await request('/status-settings/icon', viewer.cookie, 'DELETE')).status, 403);
    assert.equal((await request('/status-settings/icon', other, 'DELETE')).status, 204);
    assert.equal((await fetch(`${base}${publicApi}/icon`)).status, 200);
    assert.equal((await request('/status-settings/icon', owner, 'DELETE')).status, 204);
    assert.equal((await request('/status-settings', owner)).data.hasStatusIcon, false);
    assert.equal((await fetch(`${base}${publicApi}/icon`)).status, 404);
    assert.equal((await request('/status-settings/icon', owner, 'DELETE')).status, 204);
    await request('/status-settings', owner, 'PATCH', { visibility: 'private' });
    assert.equal((await request(publicApi)).status, 404);
    assert.equal((await fetch(`${base}${publicApi}/icon`)).status, 404);
    assert.equal((await request('/status', other)).data.monitors.length, 0);
    // Catalog removal keeps check data and removes dangling dependency/collection references.
    assert.equal((await request(`/services/${database.id}`, owner, 'DELETE')).status, 204);
    assert.equal((await request(`/monitors/${monitorId}`, owner)).data.monitor.serviceId, null);
    assert.equal((await request(`/monitors/${monitorId}/events`, owner)).data.total, 1);
    assert.deepEqual((await request('/services', owner)).data.services[0].dependencyIds, []);
    assert.deepEqual((await request('/collections', owner)).data.collections[0].serviceIds, [
      portal.id,
    ]);
    assert.equal((await request(`/collections/${collection.id}`, owner, 'DELETE')).status, 204);
    assert.equal((await request('/services', owner)).data.services.length, 1);
  },
);
