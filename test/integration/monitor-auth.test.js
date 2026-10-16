import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, randomBytes } from 'node:crypto';
import { ObjectId } from 'mongodb';
import { connectDatabase } from '../../shared/persistence/database.js';
import { processMonitor } from '../../workers/src/monitoring/processor.js';
import { checkWebsite } from '../../workers/src/monitoring/check.js';
import { createApp } from '../../api/src/app.js';

test('authenticated monitors enforce admin writes, encrypted storage, origin binding and safe event capture', async (t) => {
  process.env.DATABASE_SCHEMA =
    process.env.MONGODB_DB = `monitor_auth_test_${randomUUID().replaceAll('-', '')}`;
  const { db, client } = await connectDatabase();
  const server = createApp(db).listen(0, '0.0.0.0');
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await db.dropDatabase();
    await client.close();
  });
  const origin = `http://127.0.0.1:${server.address().port}/api`;
  const request = async (path, cookie, body) => {
    const response = await fetch(origin + path, {
      method: body ? 'POST' : 'GET',
      headers: {
        'Content-Type': 'application/json',
        'X-Requested-With': 'ServiceTrident',
        ...(cookie ? { Cookie: cookie } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    return {
      status: response.status,
      data: response.headers.get('content-type')?.includes('json')
        ? await response.json()
        : await response.text(),
      cookie: response.headers.get('set-cookie')?.split(';')[0],
    };
  };
  const register = (email) =>
    request('/auth/register', null, {
      email,
      displayName: 'Demo Owner',
      password: randomBytes(24).toString('hex'),
    });
  const owner = await register('owner@example.test');
  const outside = await register('outside@example.test');
  const workspaceId = new ObjectId(owner.data.user.id);
  const invite = async (role) => {
    const invitation = await request('/invitations', owner.cookie, {
      email: `${role}@example.test`,
      displayName: `Demo ${role}`,
      role,
    });
    assert.equal(invitation.status, 201);
    return request('/auth/invite', null, {
      token: invitation.data.inviteUrl.split('/').at(-1),
      password: randomBytes(24).toString('hex'),
    });
  };
  const responder = await invite('responder'),
    viewer = await invite('viewer'),
    _endUser = await invite('user');
  const originalKey = process.env.INTEGRATION_ENCRYPTION_KEY;
  process.env.INTEGRATION_ENCRYPTION_KEY = randomBytes(32).toString('hex');
  t.after(() =>
    originalKey === undefined
      ? delete process.env.INTEGRATION_ENCRYPTION_KEY
      : (process.env.INTEGRATION_ENCRYPTION_KEY = originalKey),
  );
  const serviceId = new ObjectId();
  await db.collection('catalogs').insertOne({
    _id: workspaceId,
    services: [{ id: String(serviceId), name: 'Demo Service' }],
    collections: [],
    revision: 0,
    visibility: 'private',
  });
  const password = randomBytes(24).toString('base64url');
  const body = {
    serviceId: String(serviceId),
    name: 'Authenticated Health',
    url: 'https://example.com/health',
    intervalMinutes: 1,
    method: 'GET',
    followRedirects: false,
    authentication: { mode: 'basic', username: 'health-agent', password },
  };
  assert.equal(
    (
      await request('/monitors', owner.cookie, {
        ...body,
        keyword: { text: 'ready', condition: 'missing', caseSensitive: false },
      })
    ).status,
    400,
  );
  const keywordMonitor = await request('/monitors', owner.cookie, {
    ...body,
    name: 'Keyword check',
    authentication: { mode: 'none' },
    keyword: { text: 'ready', condition: 'missing', caseSensitive: false },
  });
  assert.equal(keywordMonitor.status, 201);
  assert.equal(keywordMonitor.data.monitor.keyword.text, 'ready');
  const created = await request('/monitors', owner.cookie, body);
  assert.equal(created.status, 201);
  const monitorId = created.data.monitor.id;
  assert.ok(!JSON.stringify(created.data).includes(password));
  const stored = await db.collection('monitors').findOne({ _id: new ObjectId(monitorId) });
  assert.ok(typeof stored.authSecret === 'string' && !stored.authSecret.includes(password));
  for (const person of [responder, viewer]) {
    const detail = await request(`/monitors/${monitorId}`, person.cookie);
    assert.equal(detail.status, 200);
    assert.deepEqual(detail.data.monitor.authentication, { mode: 'basic' });
    assert.ok(!JSON.stringify(detail.data).includes(stored.authSecret));
    assert.ok(!JSON.stringify(detail.data).includes(password));
    assert.equal((await request('/monitors', person.cookie, body)).status, 403);
  }
  const patch = async (data, cookie = owner.cookie) => {
    const response = await fetch(origin + `/monitors/${monitorId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'X-Requested-With': 'ServiceTrident',
        Cookie: cookie,
      },
      body: JSON.stringify(data),
    });
    return { status: response.status, data: await response.json() };
  };
  assert.equal((await patch({ authentication: { mode: 'none' } }, outside.cookie)).status, 404);
  assert.equal((await patch({ authentication: { mode: 'none' } }, responder.cookie)).status, 403);
  assert.equal(
    (await patch({ authentication: { mode: 'basic', username: 'health-agent', password: '' } }))
      .status,
    200,
  );
  assert.equal(
    (await db.collection('monitors').findOne({ _id: new ObjectId(monitorId) })).authSecret,
    stored.authSecret,
  );
  assert.equal((await patch({ url: 'https://other.example.com/health' })).status, 400);
  assert.equal((await patch({ followRedirects: true })).status, 400);
  assert.equal((await patch({ url: 'http://example.com/health' })).status, 400);
  assert.ok(
    await processMonitor(db, monitorId, async (url, options) => {
      const auth = options.authentication();
      assert.ok(auth.password === password);
      return checkWebsite(url, {
        ...options,
        fetchHeaders: async (_url, _signal, _response, options) => {
          assert.ok(options.authorization.startsWith('Basic '));
          return {
            statusCode: 200,
            statusMessage: password,
            headers: { server: password },
            body: { text: password },
          };
        },
      });
    }),
  );
  const event = await db.collection('events').findOne({ monitorId: new ObjectId(monitorId) });
  assert.ok(!JSON.stringify(event).includes(password));
  assert.equal(event.details.responses[0].body.text, '');
  assert.equal((await patch({ authentication: { mode: 'none' } })).status, 200);
  const cleared = await db.collection('monitors').findOne({ _id: new ObjectId(monitorId) });
  assert.equal(cleared.authSecret, null);
  assert.equal(cleared.lastCheck, null);
  const oauth = await patch({
    authentication: {
      mode: 'oauth',
      tokenUrl: 'https://127.0.0.1/token',
      clientId: 'health-client',
      clientSecret: randomBytes(24).toString('hex'),
      authMethod: 'client_secret_basic',
    },
  });
  assert.equal(oauth.status, 400);
});
