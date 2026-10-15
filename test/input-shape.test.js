import { safeLink } from '../shared/files/rich-content.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { validateInputShape } from '../api/src/middleware/input-shape.js';
import { text } from '../shared/validation/fields.js';
import { fieldErrors, controlError } from '../shared/validation/form-validation.js';
const check = (body, query = {}) => {
  let called = false;
  validateInputShape({ body, query }, {}, () => {
    called = true;
  });
  return called;
};
test('request shapes reject prototype keys, ambiguous queries, excessive nesting and control characters', () => {
  for (const key of ['__proto__', 'constructor', 'prototype'])
    assert.throws(() => check(JSON.parse(`{"nested":{"${key}":{}}}`)), /unsupported field/);
  assert.equal({}.polluted, undefined);
  for (const query of [{ q: ['a', 'b'] }, { q: { $ne: '' } }, { q: 'a'.repeat(16385) }])
    assert.throws(() => check(undefined, query), /query parameter/);
  let deep = {};
  for (let i = 0; i < 50; i++) deep = { child: deep };
  assert.throws(() => check(deep), /complex/);
  assert.throws(() => check({ summary: 'bad\u0000value' }), /control characters/);
  assert.throws(() => text('bad\u0000value', 'summary'), /control characters/);
  assert.ok(fieldErrors('services', { name: 'bad\u0000name' }).name);
  assert.ok(controlError({ value: 'bad\u0000value' }));
});
test('request validation preserves literal markup, multiline Unicode, password bytes and valid rich structures', () => {
  assert.equal(
    check({
      description: '<script>literal text</script>\nRésumé\t日本語',
      password: 'safe\u0000password',
    }),
    true,
  );
  assert.equal(
    check({
      contentDocument: {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: 'Use $set as literal documentation.' }],
          },
        ],
      },
    }),
    true,
  );
  assert.equal(check(Buffer.from([0, 1, 2])), true);
});

test('article links reject credential-bearing and control-character URLs', () => {
  assert.equal(safeLink('https://example.com/guide'), true);
  for (const link of [
    'javascript:alert(1)',
    'https://user:password@example.com',
    'https://example.com/line\nbreak',
  ])
    assert.equal(safeLink(link), false);
});
