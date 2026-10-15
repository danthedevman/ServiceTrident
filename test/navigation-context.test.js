import test from 'node:test';
import assert from 'node:assert/strict';
import {
  historyParent,
  historyBreadcrumbs,
  recordAncestors,
} from '../app/src/lib/navigation-context.js';
const id = 'a'.repeat(24),
  baseId = 'b'.repeat(24);
test('article and history breadcrumbs retain real list, settings and related-section paths', () => {
  assert.deepEqual(
    recordAncestors(
      'knowledge',
      { knowledgeBaseId: baseId, knowledgeBaseTitle: 'Old title' },
      { title: 'Current base' },
    ).map((item) => [item.label, item.to]),
    [
      ['Knowledge Bases', '/knowledge'],
      ['Current base', `/knowledge/bases/${baseId}`],
    ],
  );
  assert.equal(recordAncestors('knowledge')[0].to, '/knowledge/articles');
  const context = historyParent('activity', new URLSearchParams({ recordId: id }));
  const crumbs = historyBreadcrumbs('activity', {}, context, {
    incident: { title: 'Checkout impact' },
  });
  assert.equal(crumbs[0].to, '/incidents');
  assert.equal(crumbs[1].label, 'Checkout impact');
  assert.equal(crumbs[2].to, `/incidents/${id}?related=activity`);
  assert.equal(historyBreadcrumbs('audit')[1].to, '/settings/audit');
  assert.equal(historyBreadcrumbs('deliveries')[1].to, '/integrations?related=deliveries');
  assert.equal(historyBreadcrumbs('invitations')[1].to, '/workspace');
});
test('untrusted history scope cannot invent a navigation destination or expose IDs as titles', () => {
  assert.equal(
    historyParent(
      'attachments',
      new URLSearchParams({ recordKind: '../../settings', recordId: id }),
    ),
    null,
  );
  assert.equal(
    historyParent('comments', new URLSearchParams({ recordId: 'javascript:alert(1)' })),
    null,
  );
  assert.equal(
    historyParent('headers', new URLSearchParams({ monitorId: id, eventId: 'bad' })),
    null,
  );
  const context = historyParent('headers', new URLSearchParams({ monitorId: id, eventId: baseId }));
  const crumbs = historyBreadcrumbs('headers', {}, context, {
    monitor: { name: 'Portal' },
    event: { number: 'EVT0000001' },
  });
  assert.equal(crumbs[2].label, 'Event EVT0000001');
  assert.ok(crumbs.every((crumb) => !crumb.label.includes(id) && !crumb.label.includes(baseId)));
});
