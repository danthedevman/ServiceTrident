import test from 'node:test';
import assert from 'node:assert/strict';
import { statusTimeZone, statusDay, statusMidnight } from '../shared/domain/status-time-zone.js';
import { Query } from '../shared/persistence/postgres/query.js';

test('zones are bounded and validated before database use', () => {
  for (const value of [null, [], {}, 'invalid', 'x'.repeat(101)]) {
    assert.equal(statusTimeZone(value), 'UTC');
  }
  assert.equal(statusTimeZone('America/New_York'), 'America/New_York');
});

test('day boundaries handle DST and fractional offsets', () => {
  assert.equal(
    statusMidnight('2026-03-08', 'America/New_York').toISOString(),
    '2026-03-08T05:00:00.000Z',
  );
  assert.equal(
    statusMidnight('2026-03-09', 'America/New_York').toISOString(),
    '2026-03-09T04:00:00.000Z',
  );
  assert.equal(
    statusMidnight('2026-10-19', 'Asia/Kathmandu').toISOString(),
    '2026-10-18T18:15:00.000Z',
  );
  assert.equal(statusDay('2026-10-19T02:00:00Z', 'America/New_York'), '2026-10-18');
});

test('Postgres daily grouping applies a parameterized timezone', () => {
  const query = new Query();
  const sql = query.expression({
    $dateToString: { date: '$checkedAt', format: '%Y-%m-%d', timezone: 'America/New_York' },
  });
  assert.match(sql, /AT TIME ZONE/);
  assert.ok(query.values.includes('America/New_York'));
  assert.ok(!sql.includes('America/New_York'));
});
