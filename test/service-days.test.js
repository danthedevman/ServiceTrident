import test from 'node:test';
import assert from 'node:assert/strict';
import { serviceDays } from '../app/src/features/status/service-days.js';

/** Current health is an explicitly labeled overlay, never a backdated historical observation. */
test('today reflects degraded/down health without rewriting previous history or success counts', () => {
  const service = { id: 'a', dependencyIds: [], status: 'degraded' };
  const monitors = [
    {
      serviceId: 'a',
      history: [
        { day: '2026-10-07', total: 10, up: 10 },
        { day: '2026-10-08', total: 10, up: 9 },
      ],
    },
  ];
  const now = '2026-10-08T12:00:00Z';
  let days = serviceDays(service, [service], monitors, now, 2, now);
  assert.equal(days[0].status, 'up');
  assert.equal(days[1].status, 'degraded');
  assert.match(days[1].label, /Currently degraded.*90.0%/);
  service.status = 'down';
  days = serviceDays(service, [service], monitors, now, 2, now);
  assert.match(days[1].label, /Currently down/);
  assert.equal(days[1].status, 'down');
  service.status = 'up';
  assert.equal(serviceDays(service, [service], monitors, now, 2, now)[1].status, 'down');
  service.status = 'degraded';
  assert.equal(serviceDays(service, [service], monitors, '2026-10-07', 1, now)[0].status, 'up');
});

test('viewer day stays October 18 in New York after UTC midnight and is partial', () => {
  const service = { id: 'a', status: 'up' };
  const monitors = [{ serviceId: 'a', history: [{ day: '2026-10-18', total: 2, up: 2 }] }];
  const days = serviceDays(
    service,
    [service],
    monitors,
    '2026-10-18T00:00:00Z',
    1,
    '2026-10-19T02:00:00Z',
    'America/New_York',
  );
  assert.equal(days[0].day, '2026-10-18');
  assert.equal(days[0].isToday, true);
  assert.match(days[0].label, /100.0% of checks successful so far/);
});
