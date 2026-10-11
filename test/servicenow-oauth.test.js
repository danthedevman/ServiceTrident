import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { ObjectId } from 'mongodb';
import { seal } from '../shared/integrations/secrets.js';
import { sendNotification } from '../workers/src/notifications/send.js';
import { serviceNowHeaders, serviceNowCaller } from '../shared/integrations/servicenow.js';
import { integrationErrors } from '../shared/integrations/integration-validation.js';

test('ServiceNow OAuth creates with the authenticated integration caller and retains correlation on retry', async () => {
  process.env.INTEGRATION_ENCRYPTION_KEY = randomBytes(32).toString('hex');
  const secret = {
    url: 'https://example.service-now.com/',
    authType: 'oauth',
    clientId: 'synthetic-client',
    clientSecret: randomBytes(32).toString('hex'),
    scope: 'incident',
  };
  const token = randomBytes(32).toString('hex'),
    caller = 'b'.repeat(32);
  let existing = false,
    created = 0;
  const request = async (url, method, payload, headers) => {
    if (url.endsWith('/oauth_token.do')) {
      assert.equal(payload.get('grant_type'), 'client_credentials');
      assert.ok(payload.get('client_secret') === secret.clientSecret);
      return { token_type: 'Bearer', access_token: token };
    }
    assert.ok(headers.Authorization === `Bearer ${token}`);
    if (url.includes('/sys_user?')) {
      assert.equal(
        new URL(url).searchParams.get('sysparm_query'),
        'sys_id=javascript:gs.getUserID()',
      );
      return { result: [{ sys_id: caller }] };
    }
    if (method === 'GET')
      return { result: existing ? [{ sys_id: 'a'.repeat(32), number: 'INC001' }] : [] };
    assert.equal(payload.caller_id, caller);
    assert.match(payload.correlation_id, /^servicetrident:/);
    created++;
    existing = true;
    return { result: { sys_id: 'a'.repeat(32), number: 'INC001' } };
  };
  const integration = { type: 'servicenow', secret: seal(secret) },
    incident = {
      _id: new ObjectId(),
      title: 'Synthetic outage',
      serviceName: 'Example Portal',
      severity: 'high',
    };
  for (let i = 0; i < 2; i++)
    assert.deepEqual(
      await sendNotification(integration, incident, { event: 'impacted' }, null, request),
      { externalId: 'INC001' },
    );
  assert.equal(created, 1);
});

test('OAuth validates required fields, rejects invalid tokens and fails safely without a caller', async () => {
  const input = {
    type: 'servicenow',
    name: 'Example',
    url: 'https://example.service-now.com/',
    authType: 'oauth',
    enabled: true,
    recovery: true,
    onCall: false,
  };
  assert.equal(integrationErrors(input).clientId, 'Client ID is required.');
  assert.equal(integrationErrors(input).clientSecret, 'Client Secret is required.');
  const secret = {
    ...input,
    clientId: 'synthetic-client',
    clientSecret: randomBytes(32).toString('hex'),
  };
  await assert.rejects(
    serviceNowHeaders(secret, async () => ({
      token_type: 'Bearer',
      access_token: 'invalid\nheader',
    })),
    /valid bearer token/,
  );
  await assert.rejects(
    serviceNowHeaders(secret, async () => {
      throw Object.assign(new Error('Untrusted provider content'), { statusCode: 401 });
    }),
    (error) =>
      error.message.includes('HTTP 401') && !error.message.includes('Untrusted provider content'),
  );
  await assert.rejects(
    serviceNowCaller(secret, async () => ({ result: [] }), {}),
    /authenticated integration account/,
  );
});
