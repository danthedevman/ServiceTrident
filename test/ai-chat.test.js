import test from 'node:test';
import assert from 'node:assert/strict';
import { AI_DEMO_EXAMPLES, validateAIAction } from '../shared/domain/ai-chat.js';
import { BUILTIN_FIELDS, validateFields } from '../shared/forms/schema.js';

test('AI actions reject arbitrary APIs, ownership overrides, unsupported status, and oversized content', () => {
  const action = {
    kind: 'incidents',
    operation: 'update',
    id: 'a'.repeat(24),
    changes: { status: 'resolved', resolutionNotes: 'Verified recovery' },
  };
  assert.deepEqual(validateAIAction(action), action);
  for (const patch of [
    { url: '/settings' },
    { kind: 'users' },
    { kind: '__proto__' },
    { kind: 'constructor' },
    { changes: { constructor: 'ignored' } },
    { operation: 'delete' },
    { id: 'bad' },
    { changes: { workspaceId: 'a'.repeat(24) } },
    { changes: { assigneeId: 'b'.repeat(24) } },
    { changes: { status: 'published' } },
    { changes: { description: 'x'.repeat(5001) } },
    { changes: { title: { $ne: null } } },
  ])
    assert.throws(() => validateAIAction({ ...action, ...patch }));
  assert.throws(() =>
    validateAIAction({ kind: 'knowledge', operation: 'create', changes: { title: 'Draft' } }),
  );
});
test('six demo examples have fixed output and no workspace links or tokens', () => {
  assert.equal(AI_DEMO_EXAMPLES.length, 6);
  assert.equal(new Set(AI_DEMO_EXAMPLES.map((row) => row.id)).size, 6);
  assert.equal(JSON.stringify(AI_DEMO_EXAMPLES).includes('href'), false);
  assert.equal(JSON.stringify(AI_DEMO_EXAMPLES).includes('token'), false);
});
test('legacy system fields can change labels and required policy but cannot archive', () => {
  const next = BUILTIN_FIELDS.map((field) => ({
    ...field,
    label: `${field.label} Updated`,
    required: !field.required,
  }));
  const result = validateFields(next, BUILTIN_FIELDS);
  assert.equal(result.find((field) => field.id === 'resolutionNotes').required, true);
  assert.equal(result[0].label, 'Title Updated');
  assert.throws(
    () =>
      validateFields(
        next.map((field) => ({ ...field, archived: true })),
        BUILTIN_FIELDS,
      ),
    /cannot be archived/,
  );
});
