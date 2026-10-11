import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, randomBytes, randomUUID, sign, createHash } from 'node:crypto';
import { ObjectId } from 'mongodb';
import { connectDatabase } from '../../shared/persistence/database.js';
import { createApp } from '../../api/src/app.js';
import { hashPassword, digestToken } from '../../api/src/auth/auth.js';

function jwt(claims, key) {
  const data = [
    Buffer.from(JSON.stringify({ alg: 'RS256', kid: 'demo-key' })).toString('base64url'),
    Buffer.from(JSON.stringify(claims)).toString('base64url'),
  ].join('.');
  return `${data}.${sign('RSA-SHA256', Buffer.from(data), key).toString('base64url')}`;
}

test(
  'OIDC configuration and password-confirmed linking preserve workspace roles and validate signed, browser-bound one-use callbacks',
  { timeout: 30000 },
  async (t) => {
    const keyBefore = process.env.INTEGRATION_ENCRYPTION_KEY;
    process.env.INTEGRATION_ENCRYPTION_KEY = randomBytes(32).toString('hex');
    process.env.MONGODB_DB =
      process.env.DATABASE_SCHEMA = `identity_test_${randomUUID().replaceAll('-', '')}`;
    const { db, client } = await connectDatabase();
    const issuer = 'https://identity.example.com';
    const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const jwk = {
      ...publicKey.export({ format: 'jwk' }),
      kid: 'demo-key',
      alg: 'RS256',
      use: 'sig',
    };
    const codes = new Map();
    let wrongNonce = false,
      wrongAudience = false,
      subject = 'demo-subject';
    const oidcFetch = async (url, options = {}) => {
      url = String(url);
      let payload;
      if (url.endsWith('/.well-known/openid-configuration'))
        payload = {
          issuer,
          authorization_endpoint: `${issuer}/authorize`,
          token_endpoint: `${issuer}/token`,
          jwks_uri: `${issuer}/keys`,
          response_types_supported: ['code'],
          subject_types_supported: ['public'],
          id_token_signing_alg_values_supported: ['RS256'],
          token_endpoint_auth_methods_supported: ['client_secret_post'],
          code_challenge_methods_supported: ['S256'],
        };
      else if (url.endsWith('/keys')) payload = { keys: [jwk] };
      else if (url.endsWith('/token')) {
        const params = new URLSearchParams(String(options.body));
        const auth = codes.get(params.get('code'));
        assert.ok(auth);
        assert.equal(
          createHash('sha256').update(params.get('code_verifier')).digest('base64url'),
          auth.challenge,
        );
        codes.delete(params.get('code'));
        payload = {
          access_token: randomBytes(16).toString('hex'),
          token_type: 'Bearer',
          expires_in: 300,
          id_token: jwt(
            {
              iss: issuer,
              aud: wrongAudience ? 'other-app' : 'demo-app',
              sub: subject,
              nonce: wrongNonce ? 'other-nonce' : auth.nonce,
              iat: Math.floor(Date.now() / 1000),
              exp: Math.floor(Date.now() / 1000) + 300,
              role: 'admin',
            },
            privateKey,
          ),
        };
      } else throw new Error('Unexpected identity request');
      return new Response(JSON.stringify(payload), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    };
    const server = createApp(db, { oidcFetch }).listen(0, '0.0.0.0');
    await new Promise((resolve) => server.once('listening', resolve));
    t.after(async () => {
      await new Promise((resolve) => server.close(resolve));
      await db.dropDatabase();
      await client.close();
      if (keyBefore === undefined) delete process.env.INTEGRATION_ENCRYPTION_KEY;
      else process.env.INTEGRATION_ENCRYPTION_KEY = keyBefore;
    });
    const base = `http://127.0.0.1:${server.address().port}/api`;
    async function request(path, cookie, method = 'GET', body) {
      const response = await fetch(base + path, {
        redirect: 'manual',
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
        data: response.headers.get('content-type')?.includes('application/json')
          ? await response.json()
          : await response.text(),
        location: response.headers.get('location'),
        cookie:
          response.headers
            .getSetCookie()
            .find((c) => c.startsWith('servicetrident_session='))
            ?.split(';')[0] ||
          response.headers
            .getSetCookie()
            .find((c) => c.startsWith('servicetrident_sso='))
            ?.split(';')[0],
      };
    }
    const password = randomBytes(24).toString('hex');
    const owner = await request('/auth/register', null, 'POST', {
      email: 'owner@example.com',
      displayName: 'Demo Owner',
      password,
    });
    const other = await request('/auth/register', null, 'POST', {
      email: 'other@example.com',
      displayName: 'Other Owner',
      password,
    });
    const workspaceId = new ObjectId(owner.data.user.id);
    const memberId = new ObjectId();
    await db.collection('users').insertOne({
      _id: memberId,
      workspaceId,
      email: 'viewer@example.com',
      displayName: 'Demo Viewer',
      role: 'viewer',
      passwordHash: await hashPassword(password),
    });
    const member = await request('/auth/login', null, 'POST', {
      email: 'viewer@example.com',
      password,
    });
    const settings = {
      name: 'Demo Work',
      provider: 'okta',
      issuer,
      clientId: 'demo-app',
      clientSecret: randomBytes(24).toString('hex'),
      authMethod: 'client_secret_post',
      enabled: true,
    };
    assert.equal(
      (await request('/settings/identity-providers', member.cookie, 'POST', settings)).status,
      403,
    );
    const created = await request('/settings/identity-providers', owner.cookie, 'POST', settings);
    assert.equal(created.status, 201);
    assert.ok(!JSON.stringify(created.data).includes(settings.clientSecret));
    const id = created.data.provider.id;
    assert.equal(
      (
        await request(`/settings/identity-providers/${id}`, other.cookie, 'PUT', {
          ...settings,
          revision: 0,
        })
      ).status,
      404,
    );
    assert.equal((await request('/settings/identity-providers', member.cookie)).status, 403);
    assert.equal(
      (await request(`/settings/identity-providers/${id}/test`, owner.cookie, 'POST', {})).status,
      200,
    );
    const list = await request('/settings/identity-providers', owner.cookie);
    const workspaceKey = new URL(list.data.signInUrl).searchParams.get('workspace');
    assert.deepEqual(
      Object.keys(
        (await request(`/public/identity-providers/${workspaceKey}`)).data.providers[0],
      ).sort(),
      ['id', 'name', 'provider'],
    );
    assert.equal(
      (
        await request(`/auth/identity-providers/${id}/connect`, other.cookie, 'POST', {
          currentPassword: password,
        })
      ).status,
      404,
    );
    assert.equal(
      (
        await request(`/auth/identity-providers/${id}/connect`, member.cookie, 'POST', {
          currentPassword: 'incorrect',
        })
      ).status,
      400,
    );
    function callbackFor(start, url = start.location || start.data.url) {
      const auth = new URL(url),
        code = randomBytes(16).toString('hex');
      codes.set(code, {
        nonce: auth.searchParams.get('nonce'),
        challenge: auth.searchParams.get('code_challenge'),
      });
      assert.equal(auth.searchParams.get('code_challenge_method'), 'S256');
      return `/auth/sso/callback?state=${auth.searchParams.get('state')}&code=${code}`;
    }
    const connect = await request(`/auth/identity-providers/${id}/connect`, member.cookie, 'POST', {
      currentPassword: password,
    });
    assert.equal(connect.status, 200);
    const connectCallback = callbackFor(connect);
    assert.equal((await request(connectCallback)).location, '/login?ssoError=failed');
    assert.equal(
      (await request(connectCallback, connect.cookie)).location,
      '/profile?ssoConnected=1',
    );
    assert.equal(await db.collection('identityTransactions').countDocuments({}), 0);
    assert.equal(
      (await request('/auth/identity-providers', member.cookie)).data.providers[0].connected,
      true,
    );
    const start = await request(`/auth/sso/${id}/start?workspace=${workspaceKey}`);
    const signedIn = await request(callbackFor(start), start.cookie);
    assert.equal(signedIn.location, '/');
    const identity = await request('/auth/me', signedIn.cookie);
    assert.equal(identity.data.user.id, String(memberId));
    assert.equal(identity.data.user.role, 'viewer');
    for (const option of ['nonce', 'audience']) {
      wrongNonce = option === 'nonce';
      wrongAudience = option === 'audience';
      const attempt = await request(`/auth/sso/${id}/start?workspace=${workspaceKey}`);
      const result = await request(callbackFor(attempt), attempt.cookie);
      assert.equal(result.location, '/login?ssoError=failed');
    }
    wrongNonce = false;
    wrongAudience = false;
    subject = 'unlinked-subject';
    const unlinked = await request(`/auth/sso/${id}/start?workspace=${workspaceKey}`);
    assert.equal(
      (await request(callbackFor(unlinked), unlinked.cookie)).location,
      '/login?ssoError=unlinked',
    );
    assert.equal(await db.collection('users').countDocuments({}), 3);
    const pending = await request(`/auth/sso/${id}/start?workspace=${workspaceKey}`);
    const pendingCallback = callbackFor(pending);
    await db
      .collection('identityTransactions')
      .updateOne(
        { _id: digestToken(new URL(pending.location).searchParams.get('state')) },
        { $set: { expiresAt: new Date(0) } },
      );
    assert.equal(
      (await request(pendingCallback, pending.cookie)).location,
      '/login?ssoError=failed',
    );
    const saved = await request(`/settings/identity-providers/${id}`, owner.cookie, 'PUT', {
      ...settings,
      clientSecret: '',
      revision: 0,
      enabled: false,
    });
    assert.equal(saved.status, 200);
    assert.equal(
      (
        await request(`/settings/identity-providers/${id}`, owner.cookie, 'PUT', {
          ...settings,
          revision: 0,
        })
      ).status,
      409,
    );
    assert.equal((await request(`/auth/sso/${id}/start?workspace=${workspaceKey}`)).status, 404);
    assert.equal(
      (await request(`/settings/identity-providers/${id}`, owner.cookie, 'DELETE', { revision: 1 }))
        .status,
      200,
    );
    assert.equal(await db.collection('identityLinks').countDocuments({}), 0);
  },
);
