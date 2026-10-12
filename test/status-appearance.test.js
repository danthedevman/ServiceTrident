import test from 'node:test';
import assert from 'node:assert/strict';
import { statusTheme } from '../shared/status/appearance.js';
test('status page appearance accepts only fixed modes', () => {
  assert.equal(statusTheme('dark'), 'dark');
  assert.equal(statusTheme('light'), 'light');
  for (const value of ['system', '#ffffff', null, [], {}]) assert.throws(() => statusTheme(value));
});
