import test from 'node:test';
import assert from 'node:assert/strict';
import { aiDestinations } from '../shared/domain/ai-navigation.js';
test('Athena navigation exposes only canonical destinations authorized for each role', () => {
  assert.deepEqual(aiDestinations('user'), []);
  assert.deepEqual(aiDestinations('unknown'), []);
  for (const role of ['admin', 'responder', 'viewer']) {
    const destinations = aiDestinations(role);
    assert.equal(new Set(destinations.map((row) => row.id)).size, destinations.length);
    assert.ok(destinations.every((row) => row.href.startsWith('/') && !row.href.startsWith('//')));
    assert.ok(destinations.some((row) => row.id === 'help'));
    assert.equal(
      destinations.some((row) => row.id === 'athena-settings'),
      role === 'admin',
    );
    assert.equal(
      destinations.some((row) => row.id === 'create-component'),
      role === 'admin',
    );
    assert.equal(
      destinations.some((row) => row.id === 'create-task'),
      role !== 'viewer',
    );
  }
});
