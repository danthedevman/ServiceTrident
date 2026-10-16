import test from 'node:test';
import assert from 'node:assert/strict';
import { monitorKeyword, evaluateKeyword } from '../shared/domain/monitor-keyword.js';
import { checkWebsite } from '../workers/src/monitoring/check.js';
import { eventPayload } from '../shared/domain/event-payload.js';
import { preferencePatch } from '../shared/domain/ui-preferences.js';

test('keyword triggers use literal case-aware text and fail inconclusive captures', async () => {
  const rule = monitorKeyword({ text: 'Ready', condition: 'missing', caseSensitive: false });
  assert.equal(evaluateKeyword(rule, { text: 'READY', truncated: true }).triggered, false);
  assert.equal(evaluateKeyword(rule, { text: 'offline' }).triggered, true);
  assert.equal(evaluateKeyword(rule, { text: 'partial', truncated: true }).matched, null);
  assert.equal(evaluateKeyword(rule, { text: '', omitted: 'binary' }).triggered, true);
  assert.throws(() => monitorKeyword(rule, { method: 'HEAD' }));
  assert.throws(() => monitorKeyword(rule, { authenticated: true }));
  const literal = { text: 'a.*b', condition: 'contains', caseSensitive: true };
  assert.equal(evaluateKeyword(literal, { text: 'axxb' }).triggered, false);
  assert.equal(evaluateKeyword(literal, { text: 'a.*b' }).triggered, true);
  const result = await checkWebsite('https://example.com', {
    keyword: rule,
    fetchHeaders: async () => ({ statusCode: 200, body: { text: 'offline' } }),
  });
  assert.equal(result.status, 'down');
  assert.equal(result.statusCode, 200);
  assert.equal(result.details.keyword.triggered, true);
  assert.equal(result.error, 'Configured keyword condition triggered.');
});

test('diagnostic payload bounds and credential redaction', () => {
  assert.deepEqual(
    eventPayload({ nested: { token: 'synthetic', count: 3 }, text: '<script>untrusted</script>' }),
    { nested: { token: '[redacted]', count: 3 }, text: '<script>untrusted</script>' },
  );
  assert.throws(() => eventPayload({ items: Array(101).fill(1) }));
  assert.throws(() => eventPayload({ text: 'x'.repeat(8193) }));
  assert.throws(() => eventPayload(JSON.parse('{"__proto__":{}}')));
  assert.throws(() => eventPayload({ a: { b: { c: { d: { e: { f: { g: 1 } } } } } } }));
  assert.match(
    eventPayload({ url: 'https://name:pass@example.test/?token=value' }).url,
    /redacted/,
  );
});

test('saved list filters reject malformed fields and oversized values', () => {
  const listFilters = { '/events:events:default:admin': { search: 'synthetic', pageSize: 25 } };
  assert.deepEqual(preferencePatch({ listFilters }), { listFilters });
  assert.throws(() => preferencePatch({ listFilters: { '/events': { search: 'x'.repeat(201) } } }));
});
