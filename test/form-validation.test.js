import test from 'node:test';
import assert from 'node:assert/strict';
import { fieldErrors, dateRangeErrors } from '../shared/validation/form-validation.js';
import { validateMonitor } from '../shared/validation/validation.js';

test('custom validation returns simultaneous field errors and accepts trimmed valid names', () => {
  assert.deepEqual(Object.keys(fieldErrors('auth', { email: 'bad', password: 'short' })), [
    'email',
    'password',
  ]);
  assert.deepEqual(
    fieldErrors('services', { name: ' Service ', description: '', collectionIds: [] }),
    {},
  );
  assert.ok(fieldErrors('collections', { name: '   ' }).name);
  assert.ok(fieldErrors('services', { name: 'Site', collectionIds: ['a', 'a'] }).collectionIds);
  assert.ok(fieldErrors('services', { name: 'Site', description: 'x'.repeat(1001) }).description);
});

test('monitor custom validation covers required values, security formats, and intervals', () => {
  const valid = {
    name: 'Site',
    url: 'https://example.com',
    intervalMinutes: 1,
    method: 'HEAD',
    followRedirects: false,
  };
  assert.deepEqual(fieldErrors('monitor', valid), {});
  for (const intervalMinutes of [0, 0.5, 1441, NaN, '1'])
    assert.ok(fieldErrors('monitor', { ...valid, intervalMinutes }).intervalMinutes);
  for (const url of [
    '',
    'bad',
    'ftp://example.com',
    'https://user:pass@example.com',
    'https://example.com:8443',
  ])
    assert.ok(fieldErrors('monitor', { ...valid, url }).url);
  assert.ok(fieldErrors('monitor', { ...valid, component: 'API' }).component);
  assert.throws(
    () => validateMonitor({ ...valid, url: 'http://127.0.0.1' }),
    (error) => Boolean(error.fields.url),
  );
  assert.ok(fieldErrors('status', { visibility: 'invalid' }).visibility);
});

test('date validation catches impossible and reversed dates while allowing open ranges', () => {
  assert.deepEqual(dateRangeErrors('', '2026-10-01'), {});
  assert.ok(dateRangeErrors('2026-02-30', '').from);
  assert.ok(dateRangeErrors('2026-10-02', '2026-10-01').to);
  assert.deepEqual(dateRangeErrors('2024-02-29', '2024-02-29'), {});
});

test('names are required for registration and profile saves but not login', () => {
  const credentials = { email: 'person@example.com', password: 'long test password' };
  assert.equal(fieldErrors('register', credentials).displayName, 'Name is required.');
  assert.equal(
    fieldErrors('register', { ...credentials, displayName: '   ' }).displayName,
    'Name is required.',
  );
  assert.deepEqual(fieldErrors('register', { ...credentials, displayName: ' Morgan ' }), {});
  assert.deepEqual(fieldErrors('auth', credentials), {});
  assert.equal(
    fieldErrors('profile', { ...credentials, currentPassword: credentials.password }).displayName,
    'Name is required.',
  );
});

test('new monitors require services while legacy edits remain valid', () => {
  const input = { name: 'Health', url: 'https://example.com', intervalMinutes: 1 };
  for (const serviceId of [undefined, null, '', '  ']) {
    assert.equal(
      fieldErrors('monitor-create', { ...input, serviceId }).serviceId,
      'Service is required.',
    );
    assert.throws(
      () => validateMonitor({ ...input, serviceId }, { requireService: true }),
      (error) => error.fields.serviceId === 'Service is required.',
    );
  }
  assert.deepEqual(fieldErrors('monitor-create', { ...input, serviceId: 'a'.repeat(24) }), {});
  assert.deepEqual(fieldErrors('monitor', input), {});
  assert.equal(validateMonitor(input).name, 'Health');
});

// Only resolution notes may change a system required flag; enforcement follows saved policy.
import { BUILTIN_FIELDS, validateFields, mandatoryErrors } from '../shared/forms/schema.js';
test('system-field required policy and resolution notes are configurable', () => {
  assert.equal(BUILTIN_FIELDS.find((f) => f.id === 'resolutionNotes').required, false);
  const required = validateFields(
    BUILTIN_FIELDS.map((f) => (f.id === 'resolutionNotes' ? { ...f, required: true } : f)),
  );
  const values = { title: 'Example', serviceId: 'example', severity: 'medium', status: 'resolved' };
  assert.equal(mandatoryErrors(required, values).resolutionNotes, 'Resolution notes is required.');
  assert.equal(mandatoryErrors(required, { ...values, status: 'open' }).resolutionNotes, undefined);
  assert.equal(
    mandatoryErrors(required, { ...values, resolutionNotes: 'Restored service.' }).resolutionNotes,
    undefined,
  );
  const optional = validateFields(
    required.map((f) => (f.id === 'resolutionNotes' ? { ...f, required: false } : f)),
    required,
  );
  assert.deepEqual(mandatoryErrors(optional, values), {});
  assert.equal(
    validateFields(
      optional.map((f) => (f.id === 'title' ? { ...f, required: false } : f)),
      optional,
    ).find((f) => f.id === 'title').required,
    false,
  );
  assert.throws(() =>
    validateFields(
      optional.map((f) => (f.id === 'resolutionNotes' ? { ...f, required: 'false' } : f)),
      optional,
    ),
  );
});
