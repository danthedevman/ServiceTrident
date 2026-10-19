import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyPins, pinPath, validatePins } from '../shared/domain/pins.js';
test('personal pins accept only bounded internal record links and safe history scope', () => {
  const id = 'abcdefabcdefabcdefabcdef';
  assert.ok(pinPath(`/tasks/${id}`));
  assert.ok(pinPath(`/records/activity/${id}?recordId=${id}`));
  assert.ok(pinPath(`/monitors/${id}/events/${id}`));
  for (const path of [
    'https://example.test',
    '//evil.test',
    '/tasks/new',
    `/tasks/${id}?token=private`,
    `/records/activity/${id}?recordId=${id}&recordId=${id}`,
    `/records/activity/${id}?url=https%3A%2F%2Fexample.test`,
  ])
    assert.equal(pinPath(path), false);
  const pins = {
    ...emptyPins(),
    revision: 0,
    items: [{ path: `/tasks/${id}`, label: 'Task', groupId: 'general' }],
  };
  assert.equal(validatePins(pins).items[0].label, 'Task');
  assert.throws(() => validatePins({ ...pins, items: [...pins.items, ...pins.items] }));
  assert.throws(() => validatePins({ ...pins, items: [{ ...pins.items[0], groupId: 'missing' }] }));
  assert.throws(() => validatePins({ ...pins, role: 'admin' }));
  assert.throws(() =>
    validatePins({ ...pins, items: Array.from({ length: 201 }, () => pins.items[0]) }),
  );
});

test('pin descriptions are optional, bounded and safely projected', () => {
  const item = {
    path: '/tasks/abcdefabcdefabcdefabcdef',
    label: 'Task',
    groupId: 'general',
    number: 'TASK0000001',
    context: 'Service: Checkout',
  };
  const body = { ...emptyPins(), revision: 0, items: [item] };
  assert.deepEqual(validatePins(body).items[0], item);
  for (const changes of [
    { number: 'secret\nvalue' },
    { context: 'x'.repeat(161) },
    { context: { token: 'bad' } },
  ])
    assert.throws(() => validatePins({ ...body, items: [{ ...item, ...changes }] }));
});
