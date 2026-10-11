import test from 'node:test';
import assert from 'node:assert/strict';
import { auditStamp, auditFields, systemActor } from '../shared/domain/audit.js';

test('automated updates use System while legacy labels normalize without changing user attribution', () => {
  assert.equal(auditStamp(null, {}).createdBy, 'System');
  assert.equal(auditStamp(null, { email: 'person@example.com' }).updatedBy, 'person@example.com');
  const legacy = { createdBy: 'ServiceTrident', updatedBy: 'ServiceTrident' };
  assert.equal(auditFields(legacy).createdBy, 'System');
  assert.equal(legacy.createdBy, 'ServiceTrident');
  assert.equal(auditFields({ ...legacy, createdById: 'person' }).createdBy, 'ServiceTrident');
  assert.equal(systemActor('ServiceTrident'), 'System');
});
