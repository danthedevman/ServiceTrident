import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { ObjectId } from 'mongodb';
import { connectDatabase } from '../../shared/persistence/database.js';
import { createApp } from '../../api/src/app.js';
import { unseal } from '../../shared/integrations/secrets.js';

test(
  'ServiceNow exposes its saved root only, encrypts OAuth credentials, and authorizes read-only connection tests',
  { timeout: 30000 },
  async (t) => {
    process.env.INTEGRATION_ENCRYPTION_KEY = randomBytes(32).toString('hex');
    process.env.MONGODB_DB =
      process.env.DATABASE_SCHEMA = `servicenow_test_${randomUUID().replaceAll('-', '')}`;
    const { db, client } = await connectDatabase();
    let status = 200,
      reads = 0;
    const integrationRequest = async (url, method) => {
      if (status !== 200)
        throw Object.assign(new Error('Unsafe response text'), { statusCode: status });
      if (url.endsWith('/oauth_token.do'))
        return { token_type: 'Bearer', access_token: randomBytes(32).toString('hex') };
      assert.equal(method, 'GET');
      reads++;
      return { result: [{ sys_id: 'a'.repeat(32) }] };
    };
    const server = createApp(db, { integrationRequest }).listen(0, '0.0.0.0');
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
    const password = randomBytes(24).toString('hex');
    const owner = await request('/auth/register', null, 'POST', {
      displayName: 'Owner',
      email: 'owner@example.com',
      password,
    });
    const other = await request('/auth/register', null, 'POST', {
      displayName: 'Other',
      email: 'other@example.com',
      password,
    });
    const id = new ObjectId().toHexString(),
      clientSecret = randomBytes(32).toString('hex');
    let revision = (await request('/integrations', owner.cookie)).data.revision;
    const config = {
      name: 'Example ServiceNow',
      type: 'servicenow',
      enabled: false,
      recovery: true,
      onCall: false,
      serviceIds: [],
      url: 'https://example.service-now.com/',
      authType: 'oauth',
      clientId: 'synthetic-client',
      clientSecret,
      scope: 'incident',
      revision,
    };
    assert.equal((await request(`/integrations/${id}`, owner.cookie, 'PUT', config)).status, 200);
    const result = await request('/integrations', owner.cookie);
    assert.equal(result.data.integrations[0].instanceUrl, config.url);
    assert.equal(result.data.integrations[0].authType, 'oauth');
    assert.ok(!JSON.stringify(result.data).includes(clientSecret));
    assert.ok(!JSON.stringify(result.data).includes('clientSecret'));
    revision = result.data.revision;
    assert.equal(
      (
        await request(`/integrations/${id}`, owner.cookie, 'PUT', {
          ...config,
          clientSecret: '',
          revision,
        })
      ).status,
      200,
    );
    const stored = await db
      .collection('operations')
      .findOne({ _id: new ObjectId(owner.data.user.id) });
    assert.ok(unseal(stored.integrations[0].secret).clientSecret === clientSecret);
    assert.equal((await request(`/integrations/${id}/test`, other.cookie, 'POST', {})).status, 404);
    assert.equal((await request(`/integrations/${id}/test`, null, 'POST', {})).status, 401);
    assert.equal((await request(`/integrations/${id}/test`, owner.cookie, 'POST', {})).status, 200);
    assert.equal(reads, 2);
    status = 401;
    const denied = await request(`/integrations/${id}/test`, owner.cookie, 'POST', {});
    assert.equal(denied.status, 400);
    assert.match(denied.data.error, /HTTP 401/);
    assert.ok(!JSON.stringify(denied.data).includes('Unsafe response'));
  },
);
