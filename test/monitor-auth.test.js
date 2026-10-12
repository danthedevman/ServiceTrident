import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { monitorAuthErrors } from '../shared/domain/monitor-auth.js';
import { prepareMonitorAuthentication } from '../api/src/domain/monitor-auth.js';
import { serializeMonitor } from '../api/src/domain/monitor.js';
import { ObjectId } from 'mongodb';
import { monitorAuthorization, clearMonitorTokenCache } from '../workers/src/monitoring/auth.js';
import { checkWebsite } from '../workers/src/monitoring/check.js';
const credential = () => randomBytes(24).toString('base64url');

test('monitor credentials require HTTPS, reject redirects and retain secrets only for the same origin and principal', (t) => {
  const old = process.env.INTEGRATION_ENCRYPTION_KEY;
  process.env.INTEGRATION_ENCRYPTION_KEY = randomBytes(32).toString('hex');
  t.after(() =>
    old === undefined
      ? delete process.env.INTEGRATION_ENCRYPTION_KEY
      : (process.env.INTEGRATION_ENCRYPTION_KEY = old),
  );
  const password = credential(),
    url = 'https://example.com/health',
    auth = { mode: 'basic', username: 'health-agent', password };
  assert.ok(monitorAuthErrors(auth, { url: 'http://example.com' }).url);
  assert.ok(monitorAuthErrors(auth, { url, followRedirects: true }).followRedirects);
  assert.ok(monitorAuthErrors({ ...auth, extra: 'ignored' }, { url })['authentication.mode']);
  const saved = prepareMonitorAuthentication(auth, null, url, false);
  assert.ok(!saved.authSecret.includes(password));
  const current = { _id: new ObjectId(), name: 'Health', url, intervalMinutes: 1, ...saved };
  assert.ok(
    !JSON.stringify(serializeMonitor(current, { includeAuthenticationConfig: true })).includes(
      password,
    ),
  );
  assert.deepEqual(serializeMonitor(current).authentication, { mode: 'basic' });
  assert.equal(
    prepareMonitorAuthentication(
      { mode: 'basic', username: 'health-agent', password: '' },
      current,
      url,
      false,
    ).authSecret,
    saved.authSecret,
  );
  assert.throws(() =>
    prepareMonitorAuthentication(undefined, current, 'https://other.example.com/health', false),
  );
  assert.throws(() =>
    prepareMonitorAuthentication(
      { mode: 'basic', username: 'other', password: '' },
      current,
      url,
      false,
    ),
  );
  assert.equal(
    prepareMonitorAuthentication({ mode: 'none' }, current, url, false).authSecret,
    null,
  );
});

test('OAuth token exchange uses client credentials, bounded expiry reuse and safe failures', async (t) => {
  clearMonitorTokenCache();
  t.after(clearMonitorTokenCache);
  const token = credential(),
    clientSecret = credential();
  const auth = {
    mode: 'oauth',
    tokenUrl: 'https://identity.example.com/token',
    clientId: 'health-client',
    clientSecret,
    scope: 'health.read',
    audience: 'health-api',
    authMethod: 'client_secret_basic',
  };
  let calls = 0,
    time = 1000;
  const request = async (url, method, body, headers) => {
    calls++;
    assert.equal(url, auth.tokenUrl);
    assert.equal(method, 'POST');
    assert.equal(body.get('grant_type'), 'client_credentials');
    assert.equal(body.get('scope'), 'health.read');
    assert.equal(body.get('client_secret'), null);
    assert.ok(headers.Authorization.startsWith('Basic '));
    return { access_token: token, token_type: 'Bearer', expires_in: 60 };
  };
  assert.ok((await monitorAuthorization(auth, { request, now: () => time })) === `Bearer ${token}`);
  await monitorAuthorization(auth, { request, now: () => time });
  assert.equal(calls, 1);
  time += 31000;
  await monitorAuthorization(auth, { request, now: () => time });
  assert.equal(calls, 2);
  clearMonitorTokenCache();
  await assert.rejects(
    monitorAuthorization(auth, {
      request: async () => {
        throw Object.assign(new Error(clientSecret), { statusCode: 401 });
      },
    }),
    (error) => error.message.includes('HTTP 401') && !error.message.includes(clientSecret),
  );
  await assert.rejects(
    monitorAuthorization(
      { ...auth, tokenUrl: 'https://127.0.0.1/token' },
      { request: async () => assert.fail('Private endpoint contacted') },
    ),
  );
  await assert.rejects(
    monitorAuthorization(auth, {
      request: async () => ({ access_token: credential(), token_type: 'Basic' }),
    }),
  );
});

test('authenticated HTTP checks send authorization but omit echoed credentials and reject login redirects', async () => {
  for (const mode of ['basic', 'bearer']) {
    const secret = credential(),
      auth =
        mode === 'basic'
          ? { mode, username: 'health-agent', password: secret }
          : { mode, token: secret };
    let calls = 0;
    const fetchHeaders = async (_url, _signal, _callback, options) => {
      calls++;
      assert.ok(options.authorization.startsWith(mode === 'basic' ? 'Basic ' : 'Bearer '));
      return {
        statusCode: 200,
        statusMessage: secret,
        headers: { server: secret },
        body: { text: secret },
      };
    };
    const result = await checkWebsite('https://example.com/health', {
      authentication: auth,
      fetchHeaders,
    });
    assert.equal(result.status, 'up');
    assert.equal(calls, 1);
    assert.ok(!JSON.stringify(result).includes(secret));
    assert.equal(result.details.requestHeaders.Authorization, '[redacted]');
    const redirect = await checkWebsite('https://example.com/health', {
      authentication: auth,
      fetchHeaders: async () => ({
        statusCode: 302,
        location: 'https://identity.example.com/login',
        body: { text: secret },
      }),
    });
    assert.equal(redirect.status, 'down');
    assert.match(redirect.error, /redirects/);
    const unsafe = await checkWebsite('http://example.com/health', {
      authentication: auth,
      fetchHeaders: async () => assert.fail('Credentials sent over HTTP'),
    });
    assert.equal(unsafe.status, 'down');
  }
});
