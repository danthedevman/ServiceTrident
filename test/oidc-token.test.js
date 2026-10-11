import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, generateKeyPairSync, sign } from 'node:crypto';
import { seal } from '../shared/integrations/secrets.js';
import { identityConfiguration, oidc } from '../api/src/auth/oidc.js';

test('OIDC grants require valid signatures, issuer, audience, expiry, state, and nonce', async (t) => {
  const oldKey = process.env.INTEGRATION_ENCRYPTION_KEY;
  process.env.INTEGRATION_ENCRYPTION_KEY = randomBytes(32).toString('hex');
  t.after(() => {
    if (oldKey === undefined) delete process.env.INTEGRATION_ENCRYPTION_KEY;
    else process.env.INTEGRATION_ENCRYPTION_KEY = oldKey;
  });
  const issuer = 'https://identity.example.com',
    clientId = 'demo-client';
  const keys = generateKeyPairSync('rsa', { modulusLength: 2048 }),
    wrong = generateKeyPairSync('rsa', { modulusLength: 2048 });
  let mode = 'valid';
  const fixture = async (raw) => {
    const url = String(raw);
    let result;
    if (url.endsWith('/.well-known/openid-configuration'))
      result = {
        issuer,
        authorization_endpoint: `${issuer}/authorize`,
        token_endpoint: `${issuer}/token`,
        jwks_uri: `${issuer}/keys`,
        response_types_supported: ['code'],
        subject_types_supported: ['public'],
        id_token_signing_alg_values_supported: ['RS256'],
      };
    else if (url.endsWith('/keys'))
      result = {
        keys: [{ ...keys.publicKey.export({ format: 'jwk' }), kid: 'demo', alg: 'RS256' }],
      };
    else {
      const claims = {
        iss: mode === 'issuer' ? 'https://other.example.com' : issuer,
        aud: mode === 'audience' ? 'other-client' : clientId,
        sub: 'subject',
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + (mode === 'expired' ? -3600 : 300),
        nonce: mode === 'nonce' ? 'wrong' : 'nonce',
      };
      const data = [
        Buffer.from(JSON.stringify({ alg: 'RS256', kid: 'demo' })).toString('base64url'),
        Buffer.from(JSON.stringify(claims)).toString('base64url'),
      ].join('.');
      result = {
        access_token: randomBytes(16).toString('hex'),
        token_type: 'Bearer',
        id_token: `${data}.${sign('RSA-SHA256', Buffer.from(data), mode === 'signature' ? wrong.privateKey : keys.privateKey).toString('base64url')}`,
      };
    }
    return new Response(JSON.stringify(result), {
      headers: { 'content-type': 'application/json' },
    });
  };
  const config = await identityConfiguration(
    {
      issuer,
      clientId,
      authMethod: 'client_secret_post',
      secret: seal({ clientSecret: randomBytes(16).toString('hex') }),
    },
    fixture,
  );
  const current = new URL('https://app.example.com/api/auth/sso/callback?code=demo&state=state');
  const checks = {
    pkceCodeVerifier: 'verifier',
    expectedState: 'state',
    expectedNonce: 'nonce',
    idTokenExpected: true,
  };
  assert.equal(
    (await oidc.authorizationCodeGrant(config, current, checks)).claims().sub,
    'subject',
  );
  for (mode of ['signature', 'issuer', 'audience', 'expired', 'nonce'])
    await assert.rejects(oidc.authorizationCodeGrant(config, current, checks));
  mode = 'valid';
  await assert.rejects(
    oidc.authorizationCodeGrant(config, current, { ...checks, expectedState: 'other' }),
  );
});
