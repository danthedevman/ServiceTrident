import test from 'node:test';
import assert from 'node:assert/strict';
import {
  dashboardReport,
  dashboardReportFilter,
  dashboardReportHref,
} from '../shared/domain/dashboard-reports.js';
import { dashboardReportTable } from '../api/src/repositories/dashboard-report.js';
import { tableQuery } from '../api/src/repositories/table-page.js';

const filter = (report, value = '') =>
  dashboardReportFilter(dashboardReport(report, value), 'workspace-a', '2026-10-09');

test('dashboard report scopes preserve active work, canonical categories and UTC overdue boundaries', () => {
  assert.deepEqual(filter('incidents'), {
    workspaceId: 'workspace-a',
    status: { $in: ['open', 'acknowledged'] },
  });
  assert.deepEqual(filter('urgent').severity, { $in: ['critical', 'high'] });
  assert.equal(filter('unassigned').assigneeId, null);
  assert.equal(filter('severity', 'critical').severity, 'critical');
  assert.equal(filter('incidentStatus', 'acknowledged').status, 'acknowledged');
  assert.deepEqual(filter('tasks').status, { $in: ['todo', 'in_progress', 'blocked'] });
  assert.equal(filter('taskStatus', 'blocked').status, 'blocked');
  assert.equal(filter('taskPriority', 'high').priority, 'high');
  assert.deepEqual(filter('overdue').dueDate, { $type: 'string', $gt: '', $lt: '2026-10-09' });
  const serviceId = 'abcdef123456abcdef123456';
  assert.equal(filter('serviceIncidents', serviceId).serviceId, serviceId);
  assert.equal(filter('serviceIncidents', 'none').serviceId, null);
});

test('report links round-trip and reject invalid categories instead of showing unrelated data', () => {
  for (const [report, value] of [
    ['services', ''],
    ['serviceHealth', 'down'],
    ['monitorHealth', 'paused'],
    ['uptime', ''],
    ['severity', 'high'],
  ]) {
    const url = new URL(dashboardReportHref(report, value), 'https://example.com');
    const resolved = dashboardReport(
      url.searchParams.get('report'),
      url.searchParams.get('value') || '',
    );
    assert.equal(resolved.report, report);
    assert.equal(resolved.value, value);
  }
  for (const [report, value] of [
    ['constructor', ''],
    ['tasks', 'resolved'],
    ['severity', 'arbitrary'],
    ['serviceIncidents', '../other'],
    ['incidentStatus', 'resolved'],
    ['monitorHealth', 'degraded'],
  ])
    assert.equal(dashboardReport(report, value), null);
});

test('report pagination and CSV preserve identical workspace and category filters', async () => {
  const predicates = [];
  const db = {
    collection(name) {
      assert.equal(name, 'incidents');
      return {
        find(predicate) {
          predicates.push(predicate);
          return {
            sort() {
              return this;
            },
            skip() {
              return this;
            },
            limit() {
              return this;
            },
          };
        },
        async countDocuments(predicate) {
          predicates.push(predicate);
          return 12;
        },
      };
    },
  };
  const table = await dashboardReportTable(db, {
    workspaceId: 'workspace-a',
    query: { report: 'severity', value: 'critical' },
  });
  const query = tableQuery({ search: 'outage', page: 2 }, table.fields, table.dateColumn);
  const page = await table.read(query);
  await table.read(query, true);
  assert.equal(page.total, 12);
  assert.deepEqual(predicates[0], predicates[2]);
  assert.deepEqual(predicates[0].$and[0], filter('severity', 'critical'));
  await assert.rejects(
    dashboardReportTable(db, { query: { report: 'invalid' } }),
    /valid dashboard report/,
  );
});

test('dashboard links open dedicated report views with the selected filter', () => {
  for (const [report, value] of [
    ['incidents', ''],
    ['severity', 'critical'],
    ['overdue', ''],
    ['impacted', ''],
    ['serviceHealth', 'down'],
    ['monitorHealth', 'paused'],
    ['uptime', ''],
  ]) {
    const url = new URL(dashboardReportHref(report, value), 'https://example.com');
    assert.equal(url.pathname, '/dashboard/reports');
    assert.equal(url.searchParams.get('report'), report);
  }
});

test('personal reports accept only server-derived identity and membership', () => {
  const assignments = { assigneeId: 'user-a', teamIds: ['team-a', 'team-b'] };
  for (const report of ['my-incidents', 'my-tasks']) {
    assert.equal(
      dashboardReportFilter(dashboardReport(report), 'workspace-a', '2026-10-10', assignments)
        .assigneeId,
      'user-a',
    );
    assert.deepEqual(filter(report).assigneeId, { $in: [] });
    assert.equal(dashboardReport(report, 'user-b'), null);
  }
  for (const report of ['team-incidents', 'team-tasks']) {
    assert.deepEqual(
      dashboardReportFilter(dashboardReport(report), 'workspace-a', '2026-10-10', assignments)
        .assignmentGroupId,
      { $in: ['team-a', 'team-b'] },
    );
    assert.deepEqual(filter(report).assignmentGroupId, { $in: [] });
    assert.equal(dashboardReport(report, 'team-b'), null);
  }
});
