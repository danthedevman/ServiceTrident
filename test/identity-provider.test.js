import test from 'node:test';
import assert from 'node:assert/strict';
import { identityProvider, identityUrl, providerView } from '../shared/domain/identity-provider.js';
import { publicIdentityTarget } from '../api/src/auth/oidc.js';

const valid = {
  name: 'Work',
  provider: 'okta',
  issuer: 'https://identity.example.com/',
  clientId: 'application',
  clientSecret: 'synthetic-value',
  authMethod: 'client_secret_post',
  enabled: true,
};
test('identity settings enforce HTTPS, bounded fields and explicit secrets without serializing them', () => {
  assert.equal(identityProvider(valid).issuer, valid.issuer);
  assert.equal(
    identityProvider({ ...valid, clientSecret: '' }, { secret: 'encrypted' }).name,
    'Work',
  );
  for (const patch of [
    { issuer: 'http://identity.example.com' },
    { issuer: 'https://127.0.0.1' },
    { issuer: 'https://id.example.com/#fragment' },
    { issuer: 'https://id.example.com/?token=hidden' },
    { clientSecret: '' },
    { enabled: 'yes' },
    { provider: 'unsupported' },
    { clientId: 'x'.repeat(513) },
    { authMethod: 'none' },
  ])
    assert.throws(() => identityProvider({ ...valid, ...patch }));
  assert.ok(
    !JSON.stringify(
      providerView({ ...valid, _id: 'id', revision: 0, secret: 'encrypted' }),
    ).includes('encrypted'),
  );
  assert.throws(() => identityUrl('https://identity.example.com/#fragment'));
});
test('identity DNS rejects private and mixed addresses before any request', async () => {
  for (const answers of [
    [{ address: '127.0.0.1', family: 4 }],
    [
      { address: '1.1.1.1', family: 4 },
      { address: '10.0.0.1', family: 4 },
    ],
    [{ address: '::1', family: 6 }],
    [],
  ])
    await assert.rejects(publicIdentityTarget('https://identity.example.com', async () => answers));
  const value = await publicIdentityTarget('https://identity.example.com', async () => [
    { address: '1.1.1.1', family: 4 },
  ]);
  assert.equal(value.target.address, '1.1.1.1');
});
