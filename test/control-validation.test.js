import test from 'node:test';
import assert from 'node:assert/strict';
import { controlError } from '../shared/validation/form-validation.js';

test('form controls use consistent custom required, email and URL messages', () => {
  assert.equal(
    controlError({ label: 'Display Name', required: true, value: '  ' }),
    'Display Name is required.',
  );
  assert.equal(
    controlError({ label: 'Email address', type: 'email', required: true }),
    'Email address is required.',
  );
  assert.equal(
    controlError({ type: 'email', value: 'bad@example' }),
    'Enter a valid email address, such as you@example.com.',
  );
  assert.equal(controlError({ type: 'email', value: 'person@example.com' }), '');
  assert.equal(
    controlError({ type: 'url', value: 'javascript:alert(1)' }),
    'Enter a complete URL, such as https://example.com.',
  );
  assert.equal(controlError({ type: 'url', value: 'https://example.com' }), '');
  assert.equal(
    controlError({ label: 'Consent', type: 'checkbox', required: true, checked: false }),
    'Consent is required.',
  );
  assert.equal(
    controlError({ label: 'Name', value: 'long', maxLength: 3 }),
    'Name must be 3 characters or fewer.',
  );
  assert.equal(controlError({ type: 'email', required: false, value: '' }), '');
});
