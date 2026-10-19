import test from 'node:test';
import assert from 'node:assert/strict';
import { validateWork, workQuery } from '../shared/domain/work.js';
import { displayValue } from '../app/src/lib/display-value.js';

test('task and article values are bounded, typed, and keep machine enums', () => {
  assert.equal(validateWork({ title: 'Test', dueDate: '2026-10-05' }, 'tasks').status, 'todo');
  assert.throws(
    () => validateWork({ title: 'Test', dueDate: '2026-02-30' }, 'tasks'),
    /valid due date/,
  );
  assert.throws(
    () => validateWork({ title: 'Test', serviceId: { $ne: null } }, 'tasks'),
    /valid serviceId/,
  );
  assert.throws(() => validateWork({ title: 'Test', status: 'In progress' }, 'tasks'), /Choose/);
  assert.throws(
    () => validateWork({ title: 'Test', content: ' ' }, 'knowledge'),
    (error) => error.fields.content === 'Content is required.',
  );
  assert.throws(
    () => validateWork({ title: 'Test', content: 'x'.repeat(30001) }, 'knowledge'),
    /30000/,
  );
  assert.equal(
    validateWork({ title: 'Guide', content: '<script>plain text</script>' }, 'knowledge').content,
    '<script>plain text</script>',
  );
});

test('work queries preserve tenant scope, escape regex, and validate paging/sorting', () => {
  const query = workQuery(
    { search: '[outage]', page: '2', pageSize: '25', sortBy: 'title', order: 'asc' },
    'workspace',
    'tasks',
  );
  assert.equal(query.filter.workspaceId, 'workspace');
  assert.equal(query.filter.$expr.$or[0].$regexMatch.regex, '\\[outage\\]');
  assert.deepEqual(query.filter.status, { $ne: 'archived' });
  assert.deepEqual(query.sort, { title: 1, _id: -1 });
  assert.equal(
    workQuery({ status: 'archived' }, 'workspace', 'knowledge').filter.status,
    'archived',
  );
  for (const input of [
    { pageSize: '1000' },
    { sortBy: '$where' },
    { status: { $ne: '' } },
    { serviceId: 'bad' },
  ])
    assert.throws(() => workQuery(input, 'workspace', 'tasks'));
});

test('built-in display labels are human-readable without changing stored values', () => {
  assert.equal(displayValue('in_progress'), 'In progress');
  assert.equal(displayValue('responder'), 'Responder');
  assert.equal(displayValue('servicenow'), 'ServiceNow');
  assert.equal(displayValue('high'), 'High');
});

test('runbooks validate bounded ordered steps and default older records to articles', () => {
  assert.equal(
    validateWork({ title: 'Guide', content: 'Text' }, 'knowledge').articleType,
    'article',
  );
  const runbook = validateWork(
    {
      title: 'Recovery',
      articleType: 'runbook',
      steps: [{ title: 'Check', instructions: 'Verify health.' }],
    },
    'knowledge',
  );
  assert.equal(runbook.steps[0].title, 'Check');
  assert.match(runbook.content, /1. Check/);
  assert.throws(
    () => validateWork({ title: 'Recovery', articleType: 'runbook', steps: [] }, 'knowledge'),
    /runbook steps/,
  );
  assert.throws(() =>
    validateWork(
      { title: 'Recovery', articleType: 'runbook', steps: [{ title: '', instructions: 'Check' }] },
      'knowledge',
    ),
  );
});

test('task and article record numbers support both sort directions', () => {
  for (const kind of ['tasks', 'knowledge'])
    for (const order of ['asc', 'desc']) {
      const query = workQuery({ sortBy: 'number', order }, 'workspace', kind);
      assert.equal(query.sort.number, order === 'asc' ? 1 : -1);
    }
});
