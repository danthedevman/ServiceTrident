import test from 'node:test';
import assert from 'node:assert/strict';
import {
  recordTabToken,
  orderedRecordTabs,
  moveRecordTab,
} from '../shared/domain/record-tab-order.js';

test('personal order preserves tab objects, active drafts, opening chronology and unknown tabs', () => {
  const tabs = [
    { key: '/tasks/one', dirty: true },
    { key: '/services/two' },
    { key: '/incidents/three' },
  ];
  const moved = moveRecordTab(tabs, tabs[0].key, tabs[1].key);
  assert.deepEqual(
    moved.map((tab) => tab.key),
    ['/services/two', '/tasks/one', '/incidents/three'],
  );
  assert.equal(moved[1], tabs[0]);
  const tokens = moved.map((tab) => recordTabToken(tab.key));
  assert.ok(tokens.every((token) => /^[a-f0-9]{32}$/.test(token)));
  assert.equal(new Set(tokens).size, 3);
  assert.equal(recordTabToken('/tasks/one'), tokens[1]);
  assert.notEqual(
    recordTabToken('/tasks/new?serviceId=one'),
    recordTabToken('/tasks/new?serviceId=two'),
  );
  assert.deepEqual(
    orderedRecordTabs([...tabs, { key: '/monitors/new' }], tokens).map((tab) => tab.key),
    [...moved.map((tab) => tab.key), '/monitors/new'],
  );
  assert.equal(
    tabs[0].key,
    '/tasks/one',
    'oldest-opening replacement must not follow visual reordering',
  );
  assert.equal(moveRecordTab(tabs, 'missing', tabs[0].key), tabs);
  assert.equal(moveRecordTab(tabs, tabs[0].key, tabs[0].key), tabs);
});
