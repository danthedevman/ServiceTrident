import test from 'node:test';
import assert from 'node:assert/strict';
import {
  monitorIntervalMinutes,
  convertMonitorInterval,
} from '../shared/validation/monitor-interval.js';
import { validateMonitor } from '../shared/validation/validation.js';
test('monitor units preserve whole-minute schedules through repeated conversions', () => {
  for (const minutes of [1, 5, 60, 90, 400, 1440]) {
    const hours = convertMonitorInterval(String(minutes), 'minutes', 'hours');
    assert.equal(monitorIntervalMinutes(hours, 'hours'), minutes);
    assert.equal(
      monitorIntervalMinutes(convertMonitorInterval(hours, 'hours', 'minutes')),
      minutes,
    );
  }
  assert.equal(monitorIntervalMinutes('1.5', 'hours'), 90);
  assert.equal(monitorIntervalMinutes('0.1', 'hours'), 6);
});
test('invalid or sub-minute monitor intervals cannot be saved, and the API still requires canonical minutes', () => {
  for (const [value, unit] of [
    ['', 'hours'],
    ['0', 'minutes'],
    ['24.1', 'hours'],
    ['0.01', 'hours'],
    ['1.1', 'minutes'],
    ['Infinity', 'hours'],
    ['1', 'days'],
  ])
    assert.ok(Number.isNaN(monitorIntervalMinutes(value, unit)));
  assert.throws(() =>
    validateMonitor({ name: 'Check', url: 'https://example.com', intervalMinutes: 1.5 }),
  );
});
