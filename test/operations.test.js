import test from 'node:test';
import assert from 'node:assert/strict';
import { ObjectId } from 'mongodb';
import { BUILTIN_FIELDS, validateFields, validateValues } from '../shared/forms/schema.js';
import { validateShifts, onCall } from '../shared/domain/on-call.js';
import { serviceHealth } from '../shared/domain/service-health.js';
import { seal, unseal } from '../shared/integrations/secrets.js';
import { integrationUrl } from '../shared/integrations/provider-url.js';
import { sendNotification } from '../workers/src/notifications/send.js';
import { coverageTimeInput } from '../app/src/lib/coverage-time.js';

test('editing coverage preserves exact UTC handoffs, including seconds and milliseconds', () => {
  const user = id(),
    service = id(),
    handoff = '2026-10-14T12:34:56.789Z';
  const shifts = [
    {
      id: id(),
      userId: user,
      serviceIds: [service],
      start: '2026-10-14T00:00:00.000Z',
      end: handoff,
    },
    {
      id: id(),
      userId: user,
      serviceIds: [service],
      start: handoff,
      end: '2026-10-15T00:00:00.000Z',
    },
  ];
  const edited = shifts.map((shift) => ({
    ...shift,
    start: new Date(`${coverageTimeInput(shift.start)}Z`).toISOString(),
    end: new Date(`${coverageTimeInput(shift.end)}Z`).toISOString(),
  }));
  assert.deepEqual(validateShifts(edited, [user], [service]), shifts);
  assert.throws(
    () =>
      validateShifts(
        [shifts[0], { ...shifts[1], serviceIds: [], start: '2026-10-14T12:34:00.000Z' }],
        [user],
        [service],
      ),
    /2026-10-14T12:34:00.000Z.*All services/,
  );
});

const id = () => new ObjectId().toHexString();
test('System Field presentation and required policy are configurable while types remain stable', () => {
  assert.throws(() => validateFields(BUILTIN_FIELDS.slice(1)), /cannot be removed/);
  for (const change of [{ type: 'text' }, { choices: [] }]) {
    assert.throws(
      () =>
        validateFields(
          BUILTIN_FIELDS.map((field, index) => (index ? field : { ...field, ...change })),
        ),
      /cannot be changed/,
    );
  }
  assert.deepEqual(validateFields([...BUILTIN_FIELDS].reverse()), [...BUILTIN_FIELDS].reverse());
  assert.deepEqual(validateFields(BUILTIN_FIELDS), BUILTIN_FIELDS);
  assert.equal(
    validateFields(
      BUILTIN_FIELDS.map((field, index) => (index ? field : { ...field, label: 'Summary' })),
    )[0].label,
    'Summary',
  );
  const custom = {
    id: id(),
    label: 'Environment',
    type: 'select',
    required: true,
    options: ['Production', 'Staging'],
    archived: false,
  };
  const all = [...BUILTIN_FIELDS, custom];
  assert.throws(
    () => validateFields([...BUILTIN_FIELDS, { ...custom, type: 'text' }], all),
    /change its type/,
  );
  assert.throws(() => validateFields(BUILTIN_FIELDS, all), /Archive/);
  assert.deepEqual(
    validateFields([...BUILTIN_FIELDS, { ...custom, options: ['Staging', 'Production'] }], all).at(
      -1,
    ).options,
    ['Staging', 'Production'],
  );
  assert.throws(
    () => validateFields([...BUILTIN_FIELDS, { ...custom, options: ['A', 'A'] }]),
    /unique/,
  );
  assert.throws(() => validateValues({}, [custom]), /required/);
  assert.throws(() => validateValues({ [custom.id]: 'Unknown' }, [custom]), /Choose/);
  assert.deepEqual(validateValues({ [custom.id]: 'Production' }, [custom]), {
    [custom.id]: 'Production',
  });
});
test('shift coverage uses UTC half-open intervals and rejects overlapping service scopes', () => {
  const user = id(),
    service = id(),
    other = id(),
    start = '2026-10-01T00:00:00.000Z',
    end = '2026-10-02T00:00:00.000Z';
  const a = { id: id(), userId: user, serviceIds: [service], start, end };
  const b = { ...a, id: id(), start: end, end: '2026-10-03T00:00:00.000Z' };
  assert.equal(validateShifts([a, b], [user], [service]).length, 2);
  assert.equal(onCall([a], service, new Date(start)), user);
  assert.equal(onCall([a], service, new Date(end)), null);
  assert.equal(onCall([a], other, new Date(start)), null);
  assert.throws(
    () => validateShifts([a, { ...a, id: id(), serviceIds: [] }], [user], [service]),
    /overlaps/,
  );
  assert.equal(
    validateShifts([a, { ...a, id: id(), serviceIds: [other] }], [user], [service, other]).length,
    2,
  );
  assert.throws(() => validateShifts([{ ...a, userId: id() }], [user], [service]), /active/);
});
test('service impact includes dependencies without converting missing or stale checks to recovery', () => {
  const a = id(),
    b = id(),
    now = Date.now(),
    services = [
      { id: a, dependencyIds: [] },
      { id: b, dependencyIds: [a] },
    ];
  const monitor = {
    serviceId: a,
    intervalMinutes: 1,
    lastCheck: { checkedAt: new Date(now), status: 'down' },
  };
  assert.equal(serviceHealth(services, [monitor], now).get(b), 'down');
  assert.equal(serviceHealth(services, [monitor], now + 180000).get(b), 'unknown');
  assert.equal(serviceHealth(services, [{ ...monitor, paused: true }], now).get(a), 'unknown');
});
test('integration secrets authenticate ciphertext and provider URLs reject lookalike or unsafe hosts', () => {
  process.env.INTEGRATION_ENCRYPTION_KEY = 'ab'.repeat(32);
  const encrypted = seal({ password: 'secret' });
  assert.ok(!encrypted.includes('secret'));
  assert.deepEqual(unseal(encrypted), { password: 'secret' });
  assert.throws(() => unseal(encrypted.slice(0, -1) + (encrypted.endsWith('0') ? '1' : '0')));
  assert.equal(
    new URL(integrationUrl('https://hooks.slack.com/services/A/B/C', 'slack')).hostname,
    'hooks.slack.com',
  );
  for (const url of [
    'http://hooks.slack.com/services/A',
    'https://hooks.slack.com.evil.example/services/A',
    'https://user:pass@hooks.slack.com/services/A',
    'https://127.0.0.1/services/A',
  ])
    assert.throws(() => integrationUrl(url, 'slack'));
});
test('ServiceNow retries reuse the correlation ID, and recovery updates the same record', async () => {
  process.env.INTEGRATION_ENCRYPTION_KEY = 'ab'.repeat(32);
  const integration = {
    type: 'servicenow',
    secret: seal({ url: 'https://test.service-now.com/', username: 'test', password: 'secret' }),
  };
  const incident = {
    _id: new ObjectId(),
    title: 'Outage',
    description: 'Investigating',
    serviceName: 'Portal',
    severity: 'high',
  };
  const calls = [];
  const request = async (url, method, body) => {
    calls.push({ url, method, body });
    return method === 'GET' ? { result: [{ sys_id: 'a'.repeat(32), number: 'INC001' }] } : {};
  };
  assert.deepEqual(
    await sendNotification(integration, incident, { event: 'impacted' }, null, request),
    { externalId: 'INC001' },
  );
  assert.equal(calls.length, 1);
  await sendNotification(integration, incident, { event: 'recovered' }, null, request);
  assert.equal(calls.at(-1).method, 'PATCH');
  assert.match(calls.at(-1).body.work_notes, /Event: Recovered/);
});

test('required text errors distinguish missing values from invalid types and excessive length', async () => {
  const { text } = await import('../shared/validation/fields.js');
  for (const value of [undefined, null, '', '   '])
    assert.throws(
      () => text(value, 'email', 254),
      (error) => error.fields.email === 'Email is required.',
    );
  assert.throws(
    () => text('', 'displayName', 80),
    (error) => error.fields.displayName === 'Name is required.',
  );
  assert.throws(() => text('x'.repeat(255), 'email', 254), /254 characters or fewer/);
  assert.throws(() => text({ $ne: null }, 'email', 254), /must be text/);
  assert.equal(text('', 'description', 100, false), '');
});
