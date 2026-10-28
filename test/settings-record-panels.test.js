import test from 'node:test';
import assert from 'node:assert/strict';
import {
  recordPanelParams,
  RECORD_PANEL_PAGE_SIZE,
} from '../app/src/features/settings/record-panel-query.js';
import { tableQuery } from '../api/src/repositories/table-page.js';

test('settings panel requests satisfy the real API pagination contract for people and activity', () => {
  for (const [sortBy, order, fields] of [
    ['name', 'asc', ['name', 'description', 'members']],
    ['displayName', 'asc', ['displayName', 'email', 'role']],
    ['createdAt', 'desc', ['createdAt', 'actor', 'action']],
  ]) {
    const params = recordPanelParams({ search: 'operations', sortBy, order, page: 2 });
    const query = tableQuery(Object.fromEntries(params), fields);
    assert.equal(query.pageSize, RECORD_PANEL_PAGE_SIZE);
    assert.equal(query.page, 2);
    assert.equal(query.search, 'operations');
  }
});
