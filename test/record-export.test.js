import test from 'node:test';
import assert from 'node:assert/strict';
import {
  recordExportRows,
  recordCsv,
  recordPdfDefinition,
  documentText,
} from '../app/src/lib/record-export.js';

test('record exports allowlist public fields and omit archived custom data and credentials', () => {
  const rows = recordExportRows(
    'rcas',
    {
      number: 'RCA0000001',
      title: '=unsafe title',
      rootCause: '<script>literal text</script>',
      password: 'NEVER_EXPORT',
      apiKey: 'NEVER_EXPORT',
      secret: 'NEVER_EXPORT',
      custom: { active: 'Useful finding', archived: 'NEVER_EXPORT' },
    },
    [
      { id: 'active', label: 'Finding', type: 'text' },
      { id: 'archived', label: 'Archived', type: 'text', archived: true },
    ],
  );
  const csv = recordCsv(rows);
  assert.ok(!csv.includes('NEVER_EXPORT'));
  assert.match(csv, /'=unsafe title/);
  assert.match(csv, /Useful finding/);
  assert.match(csv, /<script>literal text<\/script>/);
  assert.ok(recordPdfDefinition('RCA review', rows).content.length > 2);
});
test('knowledge exports retain rich text and runbook instructions without fetching images', () => {
  const document = {
    type: 'doc',
    content: [
      { type: 'paragraph', content: [{ type: 'text', text: 'Résumé — finding' }] },
      { type: 'image', attrs: { src: 'https://private.example/NEVER_FETCH' } },
    ],
  };
  assert.match(documentText(document), /Résumé — finding/);
  assert.ok(!documentText(document).includes('NEVER_FETCH'));
  const rows = recordExportRows('knowledge', {
    title: 'Runbook',
    contentDocument: document,
    steps: [{ title: 'Check', instructions: 'Verify recovery' }],
  });
  assert.match(recordCsv(rows), /Verify recovery/);
  assert.match(recordCsv(rows), /Résumé — finding/);
});
test('event and integration exports exclude authentication config and sanitize URL queries', () => {
  const rows = recordExportRows('monitors', {
    name: 'Monitor',
    url: 'https://example.test/health?token=NEVER_EXPORT',
    authentication: { password: 'NEVER_EXPORT' },
    lastCheck: { status: 'down', statusCode: 503, secret: 'NEVER_EXPORT' },
  });
  assert.ok(!recordCsv(rows).includes('NEVER_EXPORT'));
  assert.match(recordCsv(rows), /503/);
  const log = recordExportRows('tableRecord', { status: 'sent', secret: 'NEVER_EXPORT' }, [], {
    tableFields: ['status'],
  });
  assert.ok(!recordCsv(log).includes('NEVER_EXPORT'));
});
test('every saved record kind has a bounded export projection', () => {
  for (const kind of [
    'incidents',
    'tasks',
    'knowledge',
    'rcas',
    'services',
    'collections',
    'monitors',
    'events',
    'groups',
    'workspace',
    'integrations',
    'serviceAccounts',
    'knowledgeBases',
    'on-call',
  ]) {
    const rows = recordExportRows(kind, {
      title: 'Synthetic record',
      secret: 'NEVER_EXPORT',
      createdAt: '2026-10-14T12:00:00Z',
    });
    assert.equal(rows[0].value, 'Synthetic record');
    assert.ok(!recordCsv(rows).includes('NEVER_EXPORT'));
  }
});
