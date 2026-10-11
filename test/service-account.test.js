import test from 'node:test';
import assert from 'node:assert/strict';
import { credentialDays, serviceAccountInput, serviceAccountView } from '../shared/domain/service-account.js';

test('service accounts require explicit scopes, service boundaries and bounded credential lifetimes', () => {
  const input = { name: 'External automation', description: '', enabled: true, scopes: ['incidents:create'], serviceIds: null, apiKeyEnabled: true, oauthEnabled: false, expiresInDays: 90 };
  assert.deepEqual(serviceAccountInput(input, true).scopes, ['incidents:create']);
  for (const change of [{ scopes: [] }, { scopes: ['admin'] }, { scopes: ['knowledge:publish'] }, { scopes: ['incidents:create', 'incidents:create'] }, { serviceIds: [] }, { serviceIds: [{ $ne: null }] }, { workspaceId: 'spoofed' }, { apiKeyEnabled: false, oauthEnabled: false }, { enabled: 'true' }, { expiresInDays: 366 }]) assert.throws(() => serviceAccountInput({ ...input, ...change }, true));
  for (const days of [0, -1, '90', 1.5, Infinity]) assert.throws(() => credentialDays(days));
  assert.equal(credentialDays(365), 365);
  const serialized = serviceAccountView({ _id: 'synthetic-id', ...input, apiKeyHash: 'hash-only', clientSecretHash: 'hash-only', oauthVersion: 'internal-version', workspaceId: 'tenant' });
  for (const field of ['apiKeyHash', 'clientSecretHash', 'oauthVersion', 'workspaceId', 'password']) assert.equal(field in serialized, false);
});
