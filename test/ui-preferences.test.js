import { navigationActive } from '../app/src/lib/navigation-active.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { uiPreferences, preferencePatch } from '../shared/domain/ui-preferences.js';
import { auditStamp, auditFields } from '../shared/domain/audit.js';

test('layout preferences accept only boolean changes and exclude unrelated user data', () => {
  assert.deepEqual(uiPreferences({ leftCollapsed: true, rightCollapsed: 'true', role: 'admin' }), {
    leftCollapsed: true,
    navMonitorOpen: true,
    navProjectsOpen: true,
    navKnowledgeOpen: true,
    navAutomationOpen: true,
    rightCollapsed: false,
    rightPanelWidth: 320,
    filtersOpen: false,
    compactTables: false,
    tableLayouts: {},
    recordTabOrder: [],
    recentCreateActions: [],
    listFilters: {},
    dashboardTab: 'overview',
    dashboardGreeting: 'Welcome, {firstName}',
    colorScheme: 'black',
    highContrast: false,
    reduceMotion: false,
    textScale: 'standard',
    timeFormat: 'locale',
    dateFormat: 'locale',
    aiChat: true,
    aiSummaries: true,
    aiDrafting: true,
    aiKnowledgeAnswers: true,
  });
  for (const value of [
    null,
    [],
    {},
    { leftCollapsed: 'false' },
    { role: 'admin' },
    { compactTables: 'true' },
    { 'uiPreferences.leftCollapsed': true },
  ])
    assert.throws(() => preferencePatch(value), /valid layout preference/);
  assert.deepEqual(preferencePatch({ rightCollapsed: true }), { rightCollapsed: true });
});
test('audit stamps preserve original authors without inventing legacy creation history', () => {
  const actor = { _id: 'user-1', email: 'admin@example.com' },
    time = new Date('2026-10-05T12:00:00Z');
  const created = auditStamp(null, actor, time);
  assert.equal(created.createdById, 'user-1');
  assert.equal(created.revision, 0);
  const updated = auditStamp(
    created,
    { _id: 'user-2', email: 'responder@example.com' },
    new Date(+time + 1000),
  );
  assert.equal(updated.createdById, 'user-1');
  assert.equal(updated.updatedById, 'user-2');
  assert.equal(updated.revision, 1);
  assert.equal(auditStamp({ id: 'legacy' }, actor, time).createdAt, undefined);
  assert.equal(
    auditFields({ ...updated, passwordHash: 'private', secret: 'private' }).secret,
    undefined,
  );
});

test('dashboard tab preferences accept supported tabs and safely fall back for old or invalid values', () => {
  for (const dashboardTab of ['overview', 'incidents', 'tasks', 'services']) {
    assert.deepEqual(preferencePatch({ dashboardTab }), { dashboardTab });
    assert.equal(uiPreferences({ dashboardTab }).dashboardTab, dashboardTab);
  }
  for (const dashboardTab of [null, true, 'unknown', {}, ['tasks']]) {
    assert.throws(() => preferencePatch({ dashboardTab }));
    assert.equal(uiPreferences({ dashboardTab }).dashboardTab, 'overview');
  }
  assert.equal(uiPreferences().dashboardTab, 'overview');
});

test('appearance preferences allow only supported schemes and accessibility values', () => {
  assert.equal(
    uiPreferences({
      colorScheme: 'forest',
      highContrast: true,
      textScale: 'large',
      reduceMotion: true,
    }).colorScheme,
    'forest',
  );
  for (const value of [{ colorScheme: 'unknown' }, { textScale: 'huge' }, { highContrast: 'yes' }])
    assert.throws(() => preferencePatch(value));
});

test('date preferences reject unsupported date and time formats', () => {
  assert.deepEqual(preferencePatch({ timeFormat: '24', dateFormat: 'iso' }), {
    timeFormat: '24',
    dateFormat: 'iso',
  });
  assert.throws(() => preferencePatch({ timeFormat: '25' }));
  assert.throws(() => preferencePatch({ dateFormat: '<script>' }));
});

test('dashboard greeting validates bounded text and substitutes only the first name', async () => {
  const { dashboardGreeting } = await import('../shared/domain/dashboard-greeting.js');
  assert.equal(dashboardGreeting('Welcome, {firstName}', '  Alex Demo '), 'Welcome, Alex');
  assert.equal(dashboardGreeting('Hi {firstName}', ''), 'Hi there');
  assert.equal(dashboardGreeting('<b>{firstName}</b>', 'Alex'), '<b>Alex</b>');
  assert.deepEqual(preferencePatch({ dashboardGreeting: 'Hello {firstName}' }), {
    dashboardGreeting: 'Hello {firstName}',
  });
  for (const value of ['', ' ', 'x'.repeat(121), null, true, 'Hi\nthere'])
    assert.throws(() => preferencePatch({ dashboardGreeting: value }));
});

test('record sidebar sizes validate saved widths and snap collapsed drags', async () => {
  const { recordSidebarSize } = await import('../shared/domain/record-sidebar-size.js');
  for (const width of [0, 64, 159, 160]) assert.equal(recordSidebarSize(width), 64);
  assert.equal(recordSidebarSize(161), 240);
  assert.equal(recordSidebarSize(444), 444);
  assert.equal(recordSidebarSize(1000), 560);
  for (const rightPanelWidth of [64, 239, 561, 320.5, '320', null])
    assert.throws(() => preferencePatch({ rightPanelWidth }));
  assert.equal(uiPreferences({ rightPanelWidth: 999 }).rightPanelWidth, 320);
  assert.deepEqual(preferencePatch({ rightPanelWidth: 456 }), { rightPanelWidth: 456 });
});

test('primary neutral themes and Events dashboard are valid preferences', () => {
  assert.deepEqual(preferencePatch({ colorScheme: 'white', dashboardTab: 'events' }), {
    colorScheme: 'white',
    dashboardTab: 'events',
  });
  assert.equal(uiPreferences().colorScheme, 'black');
});

test('navigation sections accept only per-user boolean disclosure preferences', () => {
  assert.deepEqual(
    preferencePatch({ navMonitorOpen: false, navKnowledgeOpen: true, navAutomationOpen: false }),
    { navMonitorOpen: false, navKnowledgeOpen: true, navAutomationOpen: false },
  );
  assert.throws(() => preferencePatch({ navMonitorOpen: 'false' }));
});

test('event records keep Events active on direct and nested monitor routes', () => {
  for (const path of ['/events/123', '/monitors/123/events/456']) {
    assert.equal(navigationActive('/events', path), true);
    assert.equal(navigationActive('/monitors', path), false);
  }
  assert.equal(navigationActive('/monitors', '/monitors/123'), true);
  assert.equal(navigationActive('/events', '/events-other'), false);
  assert.equal(navigationActive('/', '/dashboard'), true);
});

test('tab ordering and recent actions accept bounded layout identifiers only', () => {
  const token = 'a'.repeat(32);
  assert.deepEqual(
    preferencePatch({ recordTabOrder: [token], recentCreateActions: ['component', 'incident'] }),
    { recordTabOrder: [token], recentCreateActions: ['component', 'incident'] },
  );
  for (const patch of [
    { recordTabOrder: [token, token] },
    { recordTabOrder: ['/tasks/private-record'] },
    { recordTabOrder: Array.from({ length: 21 }, (_, i) => i.toString(16).padStart(32, '0')) },
    { recentCreateActions: ['component', 'component'] },
    { recentCreateActions: ['unknown'] },
    { recentCreateActions: ['incident', 'task', 'rca', 'component', 'service', 'monitor'] },
  ])
    assert.throws(() => preferencePatch(patch));
  assert.deepEqual(
    uiPreferences({ recordTabOrder: ['/private'], recentCreateActions: ['unknown'] })
      .recordTabOrder,
    [],
  );
});
