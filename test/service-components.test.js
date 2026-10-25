import test from 'node:test';
import assert from 'node:assert/strict';
import { ObjectId } from 'mongodb';
import { componentHealth } from '../shared/domain/service-health.js';
import { demoFixtures } from '../api/src/fixtures/demo-fixtures.js';
import { DEMO_INDUSTRIES } from '../shared/domain/demo-industries.js';
import { validateDemoAction } from '../shared/domain/demo-data.js';

test('component status isolates component and service assignments and never invents healthy checks',()=>{
 const now=Date.now(),service={id:'service',healthPolicy:{failuresBeforeDown:2}}, component={id:'component'};
 const monitor={serviceId:'service',componentId:'component',intervalMinutes:5,lastCheck:{status:'up',checkedAt:new Date(now)}};
 assert.equal(componentHealth(service,component,[monitor],now),'up');
 assert.equal(componentHealth(service,component,[],now),'unknown');
 assert.equal(componentHealth(service,component,[{...monitor,paused:true}],now),'unknown');
 assert.equal(componentHealth(service,component,[{...monitor,serviceId:'other'}],now),'unknown');
 assert.equal(componentHealth(service,component,[{...monitor,componentId:'other'}],now),'unknown');
 assert.equal(componentHealth(service,component,[{...monitor,lastCheck:{status:'down',consecutiveFailures:1,checkedAt:new Date(now)}}],now),'degraded');
});
test('every industry fixture has internally linked managed components and safe demo records', () => {
  const workspaceId = new ObjectId(),
    actor = { _id: workspaceId, email: 'synthetic@example.invalid' };
  for (const industry of DEMO_INDUSTRIES) {
    validateDemoAction('add', { confirmation: 'ADD DEMO DATA', industry: industry.id });
    const data = demoFixtures(
      workspaceId,
      actor,
      new ObjectId().toHexString(),
      {},
      'synthetic-disabled-hash',
      new Date('2026-10-01T12:00:00Z'),
      industry.id,
    );
    assert.equal(data.services.length, industry.count);
    for (const monitor of data.monitors) {
      const service = data.services.find((row) => row.id === String(monitor.serviceId));
      assert.equal(service.componentIds.length, 3);
      assert.ok(
        service.componentIds.includes(monitor.componentId) && data.components.some(row=>String(row._id)===monitor.componentId && row.name===monitor.component),
      );
      assert.equal(monitor.paused, true);
    }
    assert.ok(data.users.every((row) => row.disabled));
    assert.ok(data.integrations.every((row) => !row.enabled));
  }
  assert.throws(
    () => validateDemoAction('add', { confirmation: 'ADD DEMO DATA', industry: 'unknown' }),
    /industry/,
  );
  assert.throws(
    () =>
      validateDemoAction('delete', {
        confirmation: 'DELETE DEMO DATA',
        batchId: new ObjectId().toHexString(),
        industry: 'solo',
      }),
    /only/,
  );
});
