import test from 'node:test';
import assert from 'node:assert/strict';
import { statusRange } from '../shared/domain/status-range.js';

test('status quarters use UTC calendar boundaries, including year rollover and leap years', () => {
  const previous = statusRange('previous-quarter', new Date('2026-01-15T15:00:00Z'));
  assert.equal(previous.start.toISOString(), '2025-10-01T00:00:00.000Z');
  assert.equal(previous.end.toISOString(), '2025-12-31T00:00:00.000Z');
  assert.equal(previous.days, 92);
  const current = statusRange('quarter', new Date('2024-03-31T12:00:00Z'));
  assert.equal(current.days, 91);
  assert.equal(statusRange('7').days, 7);
  assert.equal(statusRange('invalid').days, 30);
});

test('history range uses viewer date across UTC midnight', () => {
  const range = statusRange('7', new Date('2026-10-19T02:00:00Z'), 'America/New_York');
  assert.equal(range.end.toISOString(), '2026-10-18T00:00:00.000Z');
});
