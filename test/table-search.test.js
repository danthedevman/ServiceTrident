import { incidentSourceLabel } from '../shared/domain/incident-source.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { incidentQuery } from '../api/src/domain/incidents.js';
import { workQuery } from '../shared/domain/work.js';

/** Server searches must preserve access restrictions and reject arbitrary field paths. */
test('server column search is allowlisted, literal, and keeps incident visibility', () => {
  const req = { workspaceId: 'workspace', role: 'user', user: { _id: 'user' } };
  const { filter } = incidentQuery({ search: 'api.*', searchColumn: 'serviceName' }, req);
  assert.equal(filter.workspaceId, 'workspace');
  assert.equal(filter.$or.length, 2);
  const match = filter.$expr.$or[0].$regexMatch;
  assert.equal(match.input.$convert.input, '$serviceName');
  assert.equal(match.regex, 'api\\.\\*');
  assert.equal(incidentQuery({ search: 'api' }, req).filter.$expr.$or.length, 7);
  assert.equal(
    incidentQuery({ search: 'Platform', searchColumn: 'assignmentGroupName' }, req).filter.$expr.$or
      .length,
    1,
  );
  assert.throws(() => incidentQuery({ searchColumn: '$where' }, req));
  assert.equal(
    workQuery({ search: 'Maya', searchColumn: 'assignee' }, 'workspace', 'tasks').filter
      .workspaceId,
    'workspace',
  );
  assert.throws(() => workQuery({ searchColumn: 'assignee' }, 'workspace', 'knowledge'));
});

test('incident source filters are allowlisted and preserve tenant scope', () => {
  const req = { workspaceId: 'workspace', role: 'user', user: { _id: 'user' } };
  const { filter } = incidentQuery({ source: 'monitor', sortBy: 'source' }, req);
  assert.equal(filter.source, 'monitor');
  assert.equal(filter.workspaceId, 'workspace');
  assert.equal(filter.$or.length, 2);
  assert.ok(incidentQuery({ source: 'unknown' }, req).filter.source.$nin.includes('manual'));
  assert.throws(() => incidentQuery({ source: { $ne: 'manual' } }, req));
});

test('legacy incident origins have safe labels without guessing actor history', () => {
  assert.equal(incidentSourceLabel('manual'), 'Manual');
  assert.equal(incidentSourceLabel('ai'), 'AI Assistant');
  for (const source of [undefined, null, '__proto__', 'toString', 'legacy'])
    assert.equal(incidentSourceLabel(source), 'Unknown');
});
