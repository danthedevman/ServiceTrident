import test from 'node:test';
import assert from 'node:assert/strict';
import {
  automationInput,
  routeEvent,
  activeSilence,
} from '../shared/domain/operational-automation.js';
import { probeConfidence } from '../shared/domain/probe-confidence.js';
import { monitorHealth } from '../shared/domain/service-health.js';
const id = 'a'.repeat(24);
test('event rules use bounded literal predicates and suppression wins', () => {
  const rule = automationInput('eventRules', {
    id,
    name: 'Route high errors',
    enabled: true,
    match: 'all',
    conditions: [
      { field: 'payload.errorRate', operator: 'greater_than', value: '10' },
      { field: 'title', operator: 'contains', value: '[failure]' },
    ],
    actions: { severity: 'critical', suppress: false, createIncident: true },
  });
  const event = { title: 'API [failure]', payload: { errorRate: 12 }, severity: 'medium' };
  assert.equal(routeEvent([rule], event).severity, 'critical');
  assert.equal(routeEvent([rule], { ...event, title: 'API failure' }).matchedRuleIds.length, 0);
  const silenced = {
    ...rule,
    id: 'b'.repeat(24),
    actions: { suppress: true, createIncident: false },
  };
  assert.equal(routeEvent([silenced, rule], event).createIncident, false);
  assert.equal(routeEvent([{ ...rule, demoBatchId: id }], event).matchedRuleIds.length, 0);
  assert.throws(() =>
    automationInput('eventRules', {
      ...rule,
      conditions: [{ field: 'payload.__proto__.x', operator: 'exists' }],
    }),
  );
  assert.throws(() =>
    automationInput('eventRules', { ...rule, actions: { suppress: true, createIncident: true } }),
  );
});
test('maintenance windows expire at their end and scope services', () => {
  const row = automationInput('maintenanceWindows', {
    id,
    name: 'Deploy',
    enabled: true,
    serviceIds: [id],
    startsAt: '2026-10-16T10:00:00Z',
    endsAt: '2026-10-16T11:00:00Z',
    reason: 'Upgrade',
  });
  assert.ok(activeSilence({ maintenanceWindows: [row] }, id, new Date(row.startsAt)));
  assert.equal(activeSilence({ maintenanceWindows: [row] }, id, new Date(row.endsAt)), undefined);
  assert.equal(
    activeSilence({ maintenanceWindows: [row] }, 'b'.repeat(24), new Date(row.startsAt)),
    undefined,
  );
  assert.throws(() => automationInput('maintenanceWindows', { ...row, endsAt: row.startsAt }));
});
test('escalation steps start immediately and have strictly increasing bounded delays', () => {
  const policy = {
    id,
    name: 'Response',
    enabled: true,
    serviceIds: [],
    steps: [
      { afterMinutes: 0, target: 'on_call', integrationIds: [id] },
      { afterMinutes: 5, target: 'user', userId: id, integrationIds: [id] },
    ],
  };
  assert.equal(automationInput('escalationPolicies', policy).steps.length, 2);
  assert.throws(() =>
    automationInput('escalationPolicies', {
      ...policy,
      steps: [{ ...policy.steps[0], afterMinutes: 5 }],
    }),
  );
  assert.throws(() =>
    automationInput('escalationPolicies', { ...policy, steps: [policy.steps[0], policy.steps[0]] }),
  );
});
test('independent confidence never treats missing, stale, changed or conflicting samples as confirmed outages', () => {
  const now = Date.now(),
    monitor = {
      url: 'https://example.com',
      intervalMinutes: 1,
      confirmationProbeId: id,
      lastCheck: { status: 'down', checkedAt: new Date(now) },
    };
  assert.equal(monitorHealth(monitor, {}, now), 'unknown');
  monitor.confirmationCheck = {
    probeId: id,
    targetUrl: monitor.url,
    method: 'GET',
    keywordKey: 'null',
    checkedAt: new Date(now),
    status: 'up',
    region: 'Region B',
  };
  assert.equal(probeConfidence(monitor, now).state, 'locations_disagree');
  assert.equal(monitorHealth(monitor, {}, now), 'degraded');
  monitor.confirmationCheck.status = 'down';
  assert.equal(monitorHealth(monitor, {}, now), 'down');
  monitor.url = 'https://other.example.com';
  assert.equal(monitorHealth(monitor, {}, now), 'unknown');
});
