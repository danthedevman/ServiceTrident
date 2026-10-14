import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { ObjectId } from 'mongodb';
import { connectDatabase } from '../../shared/persistence/database.js';
import { createApp } from '../../api/src/app.js';
import { unseal } from '../../shared/integrations/secrets.js';

test('catalog adapters validate, encrypt and retain credentials through the admin API', async (t) => {
  process.env.DATABASE_SCHEMA =
    process.env.MONGODB_DB = `catalog_test_${randomUUID().replaceAll('-', '')}`;
  process.env.INTEGRATION_ENCRYPTION_KEY = 'ab'.repeat(32);
  const { db, client } = await connectDatabase();
  const server = createApp(db).listen(0, '0.0.0.0');
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await db.dropDatabase();
    await client.close();
  });
  let cookie;
  const request = async (path, method = 'GET', body) => {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'X-Requested-With': 'ServiceTrident',
        ...(cookie ? { Cookie: cookie } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    cookie ||= response.headers.get('set-cookie')?.split(';')[0];
    return {
      status: response.status,
      data: response.status === 204 ? null : await response.json(),
    };
  };
  const owner = await request('/auth/register', 'POST', {
    displayName: 'Owner',
    email: 'owner@example.com',
    password: 'long unique owner password',
  });
  const definitions = {
    discord: { url: 'https://discord.com/api/webhooks/123/secret-webhook-token' },
    pagerduty: { url: 'https://events.pagerduty.com/v2/enqueue', token: 'secret-routing-token' },
    github: { url: 'https://api.github.com/repos/team/project', token: 'secret-github-token' },
    jira: {
      url: 'https://team.atlassian.net',
      username: 'owner@example.com',
      password: 'secret-jira-token',
      projectKey: 'OPS',
      issueTypeId: '1',
    },
    webhook: { url: 'https://alerts.example.com/events', token: 'secret-bearer-token' },
  };
  for (const [type, credentials] of Object.entries(definitions)) {
    const id = new ObjectId().toHexString();
    const values = {
      name: type,
      type,
      enabled: true,
      recovery: true,
      onCall: false,
      serviceIds: [],
      ...credentials,
    };
    let config = (await request('/integrations')).data;
    assert.equal(
      (await request(`/integrations/${id}`, 'PUT', { ...values, revision: config.revision }))
        .status,
      200,
    );
    config = (await request('/integrations')).data;
    assert.ok(!JSON.stringify(config).includes('secret-'));
    const saved = (
      await db.collection('operations').findOne({ _id: new ObjectId(owner.data.user.id) })
    ).integrations.find((item) => item.id === id);
    assert.ok(!saved.secret.includes('secret-'));
    const before = unseal(saved.secret);
    assert.equal(
      (
        await request(`/integrations/${id}`, 'PUT', {
          ...values,
          ...Object.fromEntries(Object.keys(credentials).map((key) => [key, ''])),
          revision: config.revision,
        })
      ).status,
      200,
    );
    const retained = (
      await db.collection('operations').findOne({ _id: new ObjectId(owner.data.user.id) })
    ).integrations.find((item) => item.id === id);
    assert.deepEqual(unseal(retained.secret), before);
  }
  const config = (await request('/integrations')).data;
  const base = {
    name: 'Invalid',
    enabled: true,
    recovery: false,
    onCall: false,
    revision: config.revision,
  };
  for (const values of [
    { type: 'github', url: definitions.github.url },
    { type: 'webhook', url: 'https://127.0.0.1' },
    { type: 'jira', ...definitions.jira, projectKey: 'OPS OR 1=1' },
    { type: 'pagerduty', ...definitions.pagerduty, token: 'secret\r\nInjected: yes' },
  ])
    assert.equal(
      (await request(`/integrations/${new ObjectId()}`, 'PUT', { ...base, ...values })).status,
      400,
    );
});
