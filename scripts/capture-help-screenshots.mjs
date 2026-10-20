import { DEFAULT_FORM_LAYOUT, validateFormLayout } from '../shared/forms/layout.js';
import { helpTopics } from '../app/src/features/help/topics.js';
import { publicAppearanceCss } from '../shared/status/appearance.js';
import { DEMO_TYPES, DEMO_COUNT } from '../shared/domain/demo-data.js';
import { monitorIntervalMinutes } from '../shared/validation/monitor-interval.js';
import { validateRca, RCA_FIELDS } from '../shared/domain/rca.js';
import { workspaceSettings } from '../shared/domain/workspace-settings.js';
import { AI_DEMO_EXAMPLES } from '../shared/domain/ai-chat.js';
import { dateTime } from '../app/src/lib/date-time.js';
import { validateWork } from '../shared/domain/work.js';
import { uiPreferences } from '../shared/domain/ui-preferences.js';
import { validateRichContent } from '../shared/files/rich-content.js';
/** Capture the real UI with fully synthetic responses; no API request reaches a backend. */
import { mkdir, readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { fieldChoices, workBuiltinFields } from '../shared/forms/form-options.js';
import { validateFields, resolveChoices, BUILTIN_FIELDS } from '../shared/forms/schema.js';
import { rankBetween, taskRank } from '../shared/domain/task-board.js';
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright'
);
const incidentListSources = [];
const monitorIntervalSaves = [];
let knowledgeFailPage = 0;
const knowledgePages = [];
let rcaFields = RCA_FIELDS;
let rcaRevision = 0;
const formLayouts = {
  incidents: DEFAULT_FORM_LAYOUT,
  tasks: DEFAULT_FORM_LAYOUT,
  knowledge: { ...DEFAULT_FORM_LAYOUT, columns: 1 },
  rcas: { ...DEFAULT_FORM_LAYOUT, columns: 1 },
};
const base = process.env.HELP_CAPTURE_URL || 'http://127.0.0.1:5173';
const output = resolve(process.env.HELP_CAPTURE_OUTPUT || 'app/public/help');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  executablePath:
    process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
});
const context = await browser.newContext({
  viewport: { width: 1440, height: 960 },
  colorScheme: 'light',
  serviceWorkers: 'block',
});
const page = await context.newPage();
page.setDefaultTimeout(15000);
const captureScreenshot = page.screenshot.bind(page);
// Record documentation shows the reading area; panel behavior is tested separately.
page.screenshot = async (options) => {
  if (options?.path?.endsWith('/failure.png')) return captureScreenshot(options);
  const collapse = page.locator(
    '.record-sticky-header button[aria-label="Collapse record information"]',
  );
  const restore = (await collapse.count()) > 0;
  if (restore) await collapse.evaluate((button) => button.click());
  try {
    await page.evaluate(() => {
      for (const menu of document.querySelectorAll('.action-menu:popover-open')) {
        const trigger = [...document.querySelectorAll('[aria-controls]')].find(
          (node) => node.getAttribute('aria-controls') === menu.id,
        );
        if (!trigger) continue;
        const anchor = trigger.getBoundingClientRect(),
          bounds = menu.getBoundingClientRect();
        menu.style.left = `${Math.max(8, Math.min(anchor.right - bounds.width, innerWidth - bounds.width - 8))}px`;
        menu.style.top = `${Math.max(8, Math.min(anchor.bottom + 6, innerHeight - bounds.height - 8))}px`;
      }
    });
    return await captureScreenshot(options);
  } finally {
    if (restore)
      await page
        .locator('.record-sticky-header button[aria-label="Expand record information"]')
        .evaluate((button) => button.click());
  }
};

const faults = [];
page.on('pageerror', (error) => faults.push(error.message));
const demoAuditRows = Array.from({ length: 12 }, (_, i) => ({
  id: (i + 1).toString(16).padStart(24, 'a'),
  createdAt: '2026-10-10T17:05:06Z',
  actor: 'Alex Demo',
  action: 'update',
  recordType: 'tasks',
  recordId: '111111111111111111111111',
  outcome: 'success',
  statusCode: 200,
  operation: 'PATCH /api/tasks/:id',
  fields: 'title',
  actualRole: 'admin',
  effectiveRole: 'admin',
}));
const demoIdentity = {
  id: 'dddddddddddddddddddddddf',
  name: 'Demo Work Identity',
  provider: 'auth0',
  issuer: 'https://demo-work.auth0.com/',
  clientId: 'demo-public-client-id',
  enabled: true,
  authMethod: 'client_secret_post',
  revision: 0,
  hasSecret: true,
};
let anonymous = false;
const demoProjects = [
  {
    id: 'abcdefabcdefabcdefabcdef',
    number: 'PRJ0000001',
    name: 'Service Reliability',
    description: 'Improve service readiness and response.',
    ownerIds: [],
    ownerGroupIds: [],
    revision: 0,
  },
];
const demoMilestones = [
  {
    id: 'abcdabcdabcdabcdabcdabcd',
    number: 'MS0000001',
    title: 'Launch Readiness',
    projectId: demoProjects[0].id,
    projectName: demoProjects[0].name,
    targetDate: '2026-11-01',
    status: 'blocked',
    description: 'Complete the readiness review.',
    taskIds: [],
    revision: 0,
  },
];
const projectFeed = [
  {
    id: 'fedcfedcfedcfedcfedcfedc',
    projectId: demoProjects[0].id,
    action: 'Project created',
    actor: 'Alex Demo',
    createdAt: '2026-10-16T12:00:00Z',
  },
];
let pinnedRecords = { groups: [{ id: 'general', name: 'General' }], items: [], revision: 0 };
const user = {
  id: 'demo-user',
  email: 'alex@example.test',
  displayName: 'Alex Demo',
  role: 'admin',
  uiPreferences: { leftCollapsed: false, filtersOpen: false },
};
const services = [
  {
    id: '111111111111111111111111',
    name: 'Demo Customer Portal',
    dependencyIds: [],
    status: 'up',
    health: 'Operational',
    description: 'Example customer self-service',
    monitors: 2,
    owners: 'Demo Operations',
    contact: 'Alex Demo',
    dependencies: 'Demo Payments API',
    collections: 'Demo Production',
  },
  {
    id: '222222222222222222222222',
    name: 'Demo Payments API',
    status: 'down',
    health: 'Down',
    description: 'Example payment processing',
    monitors: 1,
    owners: 'Demo Platform',
    contact: 'Sam Demo',
    dependencies: 'None',
    collections: 'Demo Production',
  },
];
const monitors = [
  {
    id: '333333333333333333333333',
    name: 'Demo Portal Availability',
    serviceId: services[0].id,
    history: [],
    authenticationConfigured: true,
    authentication: {
      mode: 'oauth',
      tokenUrl: 'https://identity.example.test/oauth2/token',
      clientId: 'monitor-client',
      scope: 'health.read',
      audience: '',
      authMethod: 'client_secret_basic',
    },
    status: 'up',
    service: services[0].name,
    url: 'https://portal.example.test/health',
    intervalMinutes: 5,
    method: 'HEAD',
    createdAt: '2026-10-01T12:00:00Z',
    createdBy: 'System',
    lastCheck: {
      status: 'up',
      statusCode: 200,
      durationMs: 142,
      checkedAt: '2026-10-09T12:00:00Z',
    },
  },
  {
    id: '444444444444444444444444',
    name: 'Demo Payments Health',
    status: 'down',
    service: services[1].name,
    url: 'https://payments.example.test/health',
    intervalMinutes: 1,
    method: 'GET',
    lastCheck: { durationMs: 850, checkedAt: '2026-10-09T12:00:00Z' },
  },
];
let tasks = [
  ['Document portal recovery', 'todo', 'medium'],
  ['Review payment timeouts', 'in_progress', 'high'],
  ['Await provider response', 'blocked', 'high'],
  ['Verify portal recovery', 'done', 'low'],
  ['Previous demo follow-up', 'archived', 'low'],
  ['Confirm rollback checklist', 'todo', 'medium'],
].map(([title, status, priority], index) => ({
  id: (index + 5).toString(16).repeat(24),
  title,
  status,
  priority,
  revision: 0,
  serviceId: services[index % 2].id,
  serviceName: services[index % 2].name,
  assigneeId: 'aaaaaaaaaaaaaaaaaaaaaaaa',
  assigneeName: index % 2 ? 'Sam Demo' : 'Alex Demo',
  assignmentGroupId: 'bbbbbbbbbbbbbbbbbbbbbbbb',
  assignmentGroupName: 'Demo Operations',
  description: 'Example follow-up used only in documentation.',
  updatedAt: '2026-10-09T12:00:00Z',
  dueDate: '2026-10-12',
}));
let failMove = false;
let aiProvider = null;
let aiRevision = 0;
let aiChatEnabled = true,
  aiDemoEnabled = false;
let statusAppearance = 'light';
let statusVisibility = 'private';
const mutations = [];
let builderFields = workBuiltinFields('tasks');
let builderRevision = 0;
const demoArticles = [];
const visibilityFields = [];
const demoIncident = {
  id: 'abababababababababababab',
  title: 'Demo recovered portal incident',
  description: 'Synthetic incident for reopening confirmation.',
  status: 'resolved',
  statusOption: 'resolved',
  severity: 'low',
  severityOption: 'low',
  serviceId: services[0].id,
  serviceName: services[0].name,
  revision: 1,
  custom: {},
  fields: [],
  timeline: [],
  source: 'monitor',
  createdBy: 'System',
  createdAt: '2026-10-10T16:05:00Z',
  updatedAt: '2026-10-10T16:06:00Z',
  monitorTriggersRecorded: true,
  hasMonitorEvents: true,
};
let incidentWrites = 0;
let demoComments = [];
let detailedEvent = false;
const demoRcas = [];
let workspaceConfig = workspaceSettings(),
  workspaceRevision = 0;
const demoBases = [
  {
    id: 'cccccccccccccccccccccccc',
    title: 'Demo Operations Runbooks',
    description: 'Example recovery procedures and operating guides.',
  },
];
const demoServiceNow = {
  id: 'efefefefefefefefefefefef',
  name: 'Example ServiceNow',
  type: 'servicenow',
  enabled: false,
  recovery: true,
  onCall: false,
  configured: true,
  instanceUrl: 'https://example.service-now.com/',
  authType: 'oauth',
  clientId: 'synthetic-client',
  scope: 'incident',
  serviceIds: [],
};
const demoDeliveryRows = [
  {
    id: 'abababababababababababcd',
    createdAt: '2024-01-15T16:30:00Z',
    integrationName: 'Example ServiceNow',
    event: 'impacted',
    status: 'failed',
    attempts: 1,
    error: 'Provider returned HTTP 401.',
  },
];
let laneOrder = [],
  laneRevision = 0;
let authWait = null;
let authStarted;
user.number = 'USR0000001';
services.forEach((row, index) => {
  row.number = `SVC${String(index + 1).padStart(7, '0')}`;
});
monitors.forEach((row, index) => {
  row.number = `MON${String(index + 1).padStart(7, '0')}`;
});
tasks.forEach((row, index) => {
  row.number = `TASK${String(index + 1).padStart(7, '0')}`;
});
demoIncident.number = 'INC0000001';
demoBases.forEach((row, index) => {
  row.number = `KBASE${String(index + 1).padStart(7, '0')}`;
});
demoServiceNow.number = 'INT0000001';
const demoExternalEvent = {
  id: 'edededededededededededed',
  number: 'EVT0000041',
  title: 'Checkout error threshold exceeded',
  description:
    'Errors increased after a deployment. Review the release and recent service metrics.',
  sourceType: 'external',
  sourceName: 'Deployment Pipeline',
  eventType: 'alert',
  severity: 'high',
  signal: 'firing',
  serviceId: services[0].id,
  serviceName: services[0].name,
  alertId: 'ecececececececececececec',
  externalId: 'release-42-failure',
  correlationKey: 'checkout-errors',
  payload: { release: '42', region: 'test-east', errorRate: 0.12 },
  occurredAt: '2026-10-15T12:00:00Z',
  receivedAt: '2026-10-15T12:00:02Z',
  checkedAt: '2026-10-15T12:00:02Z',
  status: 'down',
};
const demoEventAlert = {
  id: demoExternalEvent.alertId,
  number: 'ALT0000001',
  title: demoExternalEvent.title,
  description: demoExternalEvent.description,
  sourceType: 'external',
  sourceName: 'Deployment Pipeline',
  severity: 'high',
  serviceId: services[0].id,
  serviceName: services[0].name,
  status: 'open',
  lastOccurredAt: demoExternalEvent.occurredAt,
  latestEventId: demoExternalEvent.id,
  revision: 0,
  createdAt: demoExternalEvent.receivedAt,
  updatedAt: demoExternalEvent.receivedAt,
};
const recordRequests = [];
let notificationCount = 1,
  notificationsRead = false;
let watcherUserIds = [],
  watcherGroupIds = [];
await context.route('**/api/**', async (route) => {
  const request = route.request();
  const url = new URL(request.url());
  const path = url.pathname.slice(4);
  recordRequests.push(path);
  let data = {};
  if (path === `/event-alerts/${demoEventAlert.id}`) {
    if (request.method() === 'PATCH') {
      const body = request.postDataJSON();
      assert.equal(body.confirm, true);
      assert.equal(body.revision, demoEventAlert.revision);
      demoEventAlert.status = body.status;
      demoEventAlert.revision++;
    }
    data = {
      item: demoEventAlert,
      incidents: [
        {
          id: demoIncident.id,
          number: demoIncident.number,
          title: demoIncident.title,
          status: demoIncident.status,
        },
      ],
    };
  } else if (path === `/events/${demoExternalEvent.id}`)
    data = {
      event: demoExternalEvent,
      monitor: null,
      incidents: [
        {
          id: demoIncident.id,
          number: demoIncident.number,
          title: demoIncident.title,
          status: demoIncident.status,
        },
      ],
    };
  else if (path === '/communication-options') data = { slack: true };
  else if (path === '/notifications') {
    const state = url.searchParams.get('state') || 'all',
      size = Number(url.searchParams.get('pageSize') || 100);
    const offset = Number((url.searchParams.get('cursor') || 'page-0').replace('page-', ''));
    const entries = Array.from({ length: notificationCount }, (_, index) => ({
      id: `notice-${index}`,
      incidentId: demoIncident.id,
      title: demoIncident.title,
      number: demoIncident.number,
      author: index % 2 ? 'Taylor Chen' : 'Morgan Lee',
      kind: index % 2 ? 'work_note' : 'comment',
      unread: !notificationsRead && index % 3 !== 2,
      createdAt: new Date(Date.UTC(2026, 9, 15, 11, 30) - index * 60000).toISOString(),
    })).filter((row) => state === 'all' || (state === 'unread' ? row.unread : !row.unread));
    data = {
      notifications: entries.slice(offset, offset + size),
      checkedAt: new Date().toISOString(),
      nextCursor: offset + size < entries.length ? `page-${offset + size}` : null,
      hasMore: offset + size < entries.length,
    };
  } else if (path === '/notifications/read') {
    notificationsRead = true;
    data = { ok: true };
  } else if (path === `/incidents/${demoIncident.id}/collaboration`)
    data = {
      members: [
        { id: user.id, label: user.displayName, staff: true },
        { id: 'abcabcabcabcabcabcabcabc', label: 'Morgan Lee', staff: true },
      ],
      groups: [{ id: 'defdefdefdefdefdefdefdef', label: 'Response team' }],
      watcherUserIds,
      watcherGroupIds,
      revision: 0,
    };
  else if (path === `/incidents/${demoIncident.id}/watchers`) {
    const body = request.postDataJSON();
    assert.ok(Array.isArray(body.watcherUserIds));
    watcherUserIds = body.watcherUserIds;
    watcherGroupIds = body.watcherGroupIds;
    data = { ok: true };
  } else if (path === `/incidents/${demoIncident.id}/comments`) {
    const body = request.postDataJSON();
    assert.ok(body.body.includes('@Morgan Lee'));
    assert.deepEqual(body.mentionIds, ['abcabcabcabcabcabcabcabc']);
    data = { ok: true };
  } else if (path.startsWith('/related-counts/'))
    data = {
      counts: {
        incidents: 1,
        tasks: 2,
        knowledge: 1,
        monitors: 2,
        events: path.startsWith('/related-counts/monitors/') ? 2 : 30,
        discussion: 0,
        rcas: demoRcas.length,
        attachments: 0,
        activity: 1,
        milestones: demoMilestones.length,
        'monitor-events': 1,
        integrations: 1,
        deliveries: 2,
      },
    };
  else if (path === '/settings/workspace') {
    if (request.method() === 'PUT') {
      workspaceConfig = request.postDataJSON().settings;
      workspaceRevision++;
    }
    data = { settings: workspaceConfig, revision: workspaceRevision, monitorCount: 2 };
  } else if (path === '/rca-fields') {
    if (request.method() === 'PUT') {
      rcaFields = validateFields(request.postDataJSON().fields, rcaFields, RCA_FIELDS, 'rcas');
      if (request.postDataJSON().layout)
        formLayouts.rcas = validateFormLayout(request.postDataJSON().layout, rcaFields);
      rcaRevision++;
    }
    data = { fields: rcaFields, layout: formLayouts.rcas, revision: rcaRevision };
  } else if (path === '/rcas' && request.method() === 'POST') {
    const input = {
      ...validateRca(request.postDataJSON()),
      custom: request.postDataJSON().custom ?? {},
      fields: rcaFields.filter((field) => field.type !== 'builtin'),
    };
    const item = {
      ...input,
      id: 'fafafafafafafafafafafafa',
      number: 'RCA0000001',
      revision: 0,
      createdBy: user.displayName,
      createdAt: '2026-10-10T17:05:06Z',
      updatedAt: '2026-10-10T17:05:06Z',
    };
    demoRcas.push(item);
    data = { item };
  } else if (path.startsWith('/rcas/')) {
    const item = demoRcas.find((row) => row.id === path.split('/').at(-1));
    if (request.method() === 'PATCH') {
      Object.assign(item, validateRca(request.postDataJSON()));
      item.revision++;
    }
    data = {
      item,
      incidents: item.incidentIds.includes(demoIncident.id) ? [demoIncident] : [],
      tasks: tasks.filter((row) => item.taskIds.includes(row.id)),
    };
  } else if (path === '/tables/rcas') {
    data = {
      rows: demoRcas.filter((row) =>
        url.searchParams.get('status')
          ? row.status === url.searchParams.get('status')
          : row.status !== 'archived',
      ),
      total: demoRcas.length,
    };
  } else if (path === '/event-metrics')
    data = {
      activeAlerts: 4,
      sources: [
        { sourceType: 'monitor', count: 30 },
        { sourceType: 'external', count: 12 },
      ],
      outcomes: [
        { status: 'up', count: 24, durationTotal: 4800, durationCount: 24 },
        { status: 'down', count: 6, durationTotal: 1800, durationCount: 6 },
      ],
      http: [
        { statusCode: 200, count: 24 },
        { statusCode: 503, count: 6 },
      ],
      days: 30,
      generatedAt: '2026-10-10T17:05:06Z',
    };
  else if (path === '/incident-fields')
    data = {
      fields: [...BUILTIN_FIELDS, ...visibilityFields],
      layout: formLayouts.incidents,
      revision: 0,
    };
  else if (path === '/incidents') {
    incidentListSources.push(url.searchParams.get('source'));
    const rows =
      !url.searchParams.get('source') || url.searchParams.get('source') === demoIncident.source
        ? [demoIncident]
        : [];
    data = { incidents: rows, total: rows.length, page: 1, pageSize: 50 };
  } else if (path === `/incidents/${demoIncident.id}`) {
    if (request.method() === 'PATCH') {
      incidentWrites++;
      demoIncident.status = request.postDataJSON().statusOption;
      demoIncident.statusOption = demoIncident.status;
      demoIncident.revision++;
    }
    data = {
      incident: demoIncident,
      knowledge: [],
      comments: demoComments,
      origin:
        user.role === 'user'
          ? undefined
          : [
              {
                key: 'monitor',
                label: `Monitor: ${monitors[0].name}`,
                href: `/monitors/${monitors[0].id}`,
              },
              {
                key: 'event',
                label: 'Event: EVT0000001',
                href: `/monitors/${monitors[0].id}/events/cdcdcdcdcdcdcdcdcdcdcdcd`,
              },
            ],
    };
  } else if (path === '/ai/settings') {
    if (request.method() === 'PUT') {
      const body = request.postDataJSON();
      aiProvider = { type: body.type, model: body.model, configured: true };
      aiRevision++;
    }
    data = {
      provider: aiProvider,
      revision: aiRevision,
      chatEnabled: aiChatEnabled && !!aiProvider?.configured,
      demoAvailable: true,
      demoEnabled: aiDemoEnabled,
      canAct: ['admin', 'responder'].includes(user.role),
    };
  } else if (path === '/ai/features') {
    const body = request.postDataJSON();
    aiChatEnabled = body.chatEnabled;
    aiDemoEnabled = body.demoEnabled;
    aiRevision++;
    data = { ok: true };
  } else if (path === '/ai/chat') {
    const body = request.postDataJSON();
    if (body.demo) {
      const example = AI_DEMO_EXAMPLES.find((row) => row.id === body.exampleId);
      data = {
        ...example,
        demo: true,
        ...(example.action
          ? {
              demoAction: {
                label: 'Resolve Checkout API unavailable',
                changes: {
                  status: 'resolved',
                  resolutionNotes: 'Recovery verified by successful checks',
                },
              },
            }
          : {}),
      };
      data.records = example.records.map((record, index) => {
        const item =
          record.type === 'Incident'
            ? demoIncident
            : record.type === 'Task'
              ? tasks[index % tasks.length]
              : record.type === 'Runbook'
                ? demoArticles[0]
                : null;
        return {
          ...record,
          title: item?.title ?? `${monitors[0].name} · Check Event`,
          href:
            record.type === 'Incident'
              ? `/incidents/${demoIncident.id}`
              : record.type === 'Task'
                ? `/tasks/${item.id}`
                : record.type === 'Runbook'
                  ? `/knowledge/${item.id}`
                  : `/monitors/${monitors[0].id}/events/cdcdcdcdcdcdcdcdcdcdcdcd`,
        };
      });
      data.text = `${example.text}\n\nDemo record examples (the scenario above is fictional):\n${data.records.map((record, i) => `[${i + 1}] ${record.title}`).join('\n')}`;
      delete data.action;
    } else {
      const record = tasks.find((row) => row.id === body.context?.id) ?? tasks[0];
      data = {
        text: 'This task can be marked done after confirmation [1].',
        records: [{ ...record, kind: 'tasks', href: `/tasks/${record.id}` }],
        filters: { kind: 'tasks', search: '', status: null, assignedToMe: false, limit: 8 },
        action: {
          kind: 'tasks',
          id: record.id,
          operation: 'update',
          title: record.title,
          revision: record.revision,
          changes: { status: 'done' },
          token: 'synthetic-action-proposal',
        },
      };
    }
  } else if (path === '/ai/actions') {
    tasks[0].status = 'done';
    tasks[0].statusOption = 'done';
    tasks[0].statusLabel = 'Done';
    tasks[0].revision++;
    data = { item: tasks[0] };
  } else if (path === '/ai/generate') {
    const body = request.postDataJSON();
    data =
      body.action === 'draft'
        ? {
            draft: {
              title: 'Demo portal recovery',
              summary: 'Synthetic recovery guide.',
              content: 'Review service health and confirm recovery before closing the incident.',
              steps: [],
            },
          }
        : {
            text: 'Demo guidance: review portal health, verify successful checks, and document recovery [1].',
            sources:
              body.action === 'answer'
                ? [
                    {
                      id: 'eeeeeeeeeeeeeeeeeeeeeeee',
                      title: 'Demo portal recovery guide',
                      number: 1,
                    },
                  ]
                : [],
          };
  } else if (path === '/ai/test') data = { ok: true };
  else if (path === '/knowledge' && request.method() === 'POST') {
    const body = request.postDataJSON();
    const chosen = resolveChoices(body, workBuiltinFields('knowledge'), 'knowledge');
    const rich = validateRichContent(body.contentDocument, {
      required: chosen.articleType !== 'runbook',
    });
    const input = validateWork({ ...chosen, content: rich.text }, 'knowledge');
    const item = {
      ...input,
      id: 'eeeeeeeeeeeeeeeeeeeeeeee',
      contentDocument: rich.document,
      revision: 1,
      createdBy: user.displayName,
      updatedAt: '2026-10-10T17:05:06Z',
      knowledgeBaseTitle: demoBases.find((base) => base.id === input.knowledgeBaseId)?.title,
    };
    demoArticles.push(item);
    data = { item };
  } else if (path.startsWith('/knowledge/') && path !== '/knowledge/fields') {
    const item = demoArticles.find((article) => article.id === path.split('/').pop());
    if (request.method() === 'PATCH') {
      const body = request.postDataJSON();
      assert.equal(body.revision, item.revision);
      assert.ok(['published', 'draft', 'archived'].includes(body.statusOption));
      item.status = body.statusOption;
      item.statusOption = body.statusOption;
      item.statusLabel = body.statusOption.charAt(0).toUpperCase() + body.statusOption.slice(1);
      item.revision++;
    }
    data = { item };
  } else if (request.method() === 'PATCH' && path.startsWith('/tasks/')) {
    const body = request.postDataJSON();
    mutations.push(body);
    const item = tasks.find((task) => task.id === path.split('/').pop());
    if (failMove)
      return route.fulfill({
        status: 409,
        json: { error: 'This record changed. Reload it before saving again.' },
      });
    assert.equal(body.revision, item.revision);
    if (body.statusOption) {
      item.statusOption = body.statusOption;
      item.status = fieldChoices(
        'tasks',
        builderFields.find((field) => field.id === 'status'),
      ).find((choice) => choice.value === body.statusOption).base;
    }
    for (const key of [
      'title',
      'description',
      'dueDate',
      'serviceId',
      'assigneeId',
      'assignmentGroupId',
      'incidentId',
      'priorityOption',
      'custom',
    ])
      if (Object.hasOwn(body, key)) item[key] = body[key];
    if (body.boardPosition) {
      const target = tasks.find((task) => task.id === body.boardPosition.targetId);
      const others = tasks
        .filter(
          (task) =>
            (task.statusOption ?? task.status) === (item.statusOption ?? item.status) &&
            task.id !== item.id,
        )
        .sort((a, b) => taskRank(a).localeCompare(taskRank(b)));
      const index = others.findIndex((task) => task.id === target.id);
      item.boardRank =
        body.boardPosition.side === 'before'
          ? rankBetween(index ? taskRank(others[index - 1]) : null, taskRank(target))
          : rankBetween(taskRank(target), others[index + 1] ? taskRank(others[index + 1]) : null);
    }
    item.revision += 1;
    data = { item };
  } else if (path === '/knowledge-bases') {
    if (request.method() === 'POST') {
      const body = request.postDataJSON();
      demoBases.push({ id: 'dddddddddddddddddddddddd', ...body });
      data = { item: demoBases.at(-1) };
    } else {
      const matches = demoBases.filter(
        (item) =>
          `${item.title} ${item.description}`
            .toLowerCase()
            .includes((url.searchParams.get('search') || '').toLowerCase()) &&
          (!url.searchParams.get('columnSearch') ||
            String(row[url.searchParams.get('searchColumn')] || '')
              .toLowerCase()
              .includes(url.searchParams.get('columnSearch').toLowerCase())),
      );
      const pageNumber = Number(url.searchParams.get('page') || 1);
      knowledgePages.push(pageNumber);
      if (pageNumber === knowledgeFailPage) {
        knowledgeFailPage = 0;
        return route.fulfill({
          status: 503,
          json: { error: 'Unable to load more knowledge bases.' },
        });
      }
      data = {
        items: matches.slice((pageNumber - 1) * 25, pageNumber * 25),
        total: matches.length,
        page: pageNumber,
        pageSize: 25,
      };
    }
  } else if (path.startsWith('/knowledge-bases/'))
    data = {
      item: {
        ...demoBases.find((item) => item.id === path.split('/').pop()),
        articleCount: demoArticles.filter(
          (article) => article.knowledgeBaseId === path.split('/').pop(),
        ).length,
      },
    };
  else if (path === '/knowledge') {
    const items = demoArticles.filter(
      (article) =>
        !url.searchParams.get('knowledgeBaseId') ||
        article.knowledgeBaseId === url.searchParams.get('knowledgeBaseId'),
    );
    const filtered = items.filter((article) => {
      const status = url.searchParams.get('status');
      const search = (url.searchParams.get('search') || '').toLowerCase();
      return (
        (status ? article.status === status : article.status !== 'archived') &&
        `${article.title} ${article.content || ''}`.toLowerCase().includes(search)
      );
    });
    data = { items: filtered, total: filtered.length, page: 1, pageSize: 10 };
  } else if (path === '/knowledge-fields')
    data = {
      fields: [...workBuiltinFields('knowledge'), ...visibilityFields],
      layout: formLayouts.knowledge,
      revision: 0,
    };
  else if (path === '/on-call')
    data = {
      shifts: [
        {
          id: 'edededededededededededed',
          userId: user.id,
          serviceIds: [services[0].id],
          start: '2026-10-11T08:00:56.789Z',
          end: '2026-10-12T08:00:00Z',
        },
      ],
      revision: 0,
    };
  else if (path === '/coverage') data = { items: [], total: 0, page: 1, pageSize: 10 };
  else if (path === '/references/incidents')
    data = {
      options: [{ id: demoIncident.id, label: `INC0000001 · ${demoIncident.title}` }],
      selected: url.searchParams.get('selected')
        ? [{ id: demoIncident.id, label: `INC0000001 · ${demoIncident.title}` }]
        : [],
      hasMore: false,
    };
  else if (path === '/references/services')
    data = {
      options: services.map((item) => ({ id: item.id, label: item.name })),
      selected: [],
      hasMore: false,
    };
  else if (path === '/references/knowledgeBases')
    data = {
      options: demoBases.map((item) => ({ id: item.id, label: item.title })),
      selected: demoBases.map((item) => ({ id: item.id, label: item.title })),
      hasMore: false,
    };
  else if (path === '/task-board-settings') {
    if (request.method() === 'PUT') {
      const body = request.postDataJSON();
      assert.equal(user.role, 'admin');
      assert.equal(body.revision, laneRevision);
      laneOrder = body.order;
      laneRevision++;
    }
    data = { order: laneOrder, revision: laneRevision };
  } else if (path === '/auth/me') {
    authStarted?.();
    if (authWait) await authWait;
    data = { user: anonymous ? null : user };
  } else if (path === '/task-fields' && request.method() === 'PUT') {
    const body = request.postDataJSON();
    builderFields = validateFields(body.fields, builderFields, workBuiltinFields('tasks'), 'tasks');
    if (body.layout) formLayouts.tasks = validateFormLayout(body.layout, builderFields);
    builderRevision++;
    data = { ok: true };
  } else if (path === '/task-fields')
    data = {
      fields: [...builderFields, ...visibilityFields],
      layout: formLayouts.tasks,
      revision: builderRevision,
    };
  else if (path === '/services' && request.method() === 'POST')
    data = { item: { ...services[0], name: request.postDataJSON().name } };
  else if (path === '/services') data = { services };
  else if (path === '/collections') data = { collections: [] };
  else if (path === '/members')
    data = { members: [{ ...user, groupNames: [], revision: 0, timeZone: 'America/New_York' }] };
  else if (path === '/auth/identity-providers') data = { providers: [] };
  else if (path === '/settings/identity-providers')
    data = {
      providers: [demoIdentity],
      callbackUrl: `${base}/api/auth/sso/callback`,
      signInUrl: `${base}/login?workspace=${'f'.repeat(48)}`,
    };
  else if (
    path === '/settings/service-accounts' ||
    path.startsWith('/settings/service-accounts/')
  ) {
    const item = {
      id: 'fefefefefefefefefefefefe',
      name: 'Demo External Automation',
      description: 'Creates operational records for the selected service.',
      enabled: true,
      scopes: ['incidents:create', 'tasks:create'],
      serviceIds: [services[0].id],
      revision: 0,
      apiKeyConfigured: true,
      oauthConfigured: true,
      apiKeyExpiresAt: '2027-01-10T12:00:00Z',
      oauthExpiresAt: '2027-01-10T12:00:00Z',
      clientId: 'stc_fefefefefefefefefefefefe',
      createdAt: '2026-10-10T17:05:06Z',
      updatedAt: '2026-10-10T17:05:06Z',
      createdBy: 'alex@example.test',
      createdById: user.id,
    };
    data = path === '/settings/service-accounts' ? { items: [item] } : { item };
  } else if (path === '/settings/demo-data')
    data = {
      batch: null,
      types: DEMO_TYPES.map(([key, label]) => ({ key, label, count: DEMO_COUNT })),
    };
  else if (path === '/settings/marketing') data = { available: false };
  else if (path.startsWith('/public/identity-providers/'))
    data = {
      providers: [
        { id: demoIdentity.id, name: demoIdentity.name, provider: demoIdentity.provider },
      ],
    };
  else if (path.startsWith('/table-records/activity/'))
    data = {
      item: {
        id: path.split('/').pop(),
        at: '2026-10-15T11:00:00Z',
        by: 'Morgan Lee',
        note: 'Service health reviewed.',
      },
      fields: ['at', 'by', 'note'],
      dateColumn: 'at',
    };
  else if (path.startsWith('/table-records/audit/')) {
    const item = demoAuditRows.find((row) => row.id === path.split('/').pop());
    data = {
      item,
      fields: Object.keys(item).filter((key) => key !== 'id'),
      dateColumn: 'createdAt',
    };
  } else if (path === '/integrations') data = { integrations: [demoServiceNow], revision: 0 };
  else if (path === `/integrations/${demoServiceNow.id}/test`)
    return route.fulfill({
      status: 400,
      contentType: 'application/json',
      body: JSON.stringify({
        error:
          'ServiceNow returned HTTP 401. Check the saved credentials and whether this authentication method is enabled for the integration account.',
      }),
    });
  else if (path === '/tables/deliveries')
    data = { rows: demoDeliveryRows, total: demoDeliveryRows.length };
  else if (path === '/response-dashboard')
    data = {
      overview: {
        knowledgeBases: 2,
        articleStatus: { published: 4, draft: 1 },
        services: 2,
        collections: 1,
        groups: 2,
        activeShifts: 1,
        scheduledShifts: 3,
        users: 4,
        enabledIntegrations: 1,
      },
      assignedWork: {
        'my-incidents': { total: 1, needsAttention: 1 },
        'team-incidents': { total: 3, needsAttention: 3 },
        'my-tasks': { total: 2, needsAttention: 1 },
        'team-tasks': { total: 4, needsAttention: 2 },
      },
      teamCount: 1,
      severity: { critical: 1, high: 2 },
      taskStatus: { todo: 3, blocked: 1 },
      incidentStatus: { open: 3 },
      taskPriority: { high: 2 },
      unassigned: 1,
      overdue: 2,
      services: [],
      incidents: [],
      tasks: [],
      generatedAt: '2026-10-10T17:05:06Z',
    };
  else if (/^\/public\/status\/[^/]+\/appearance\.css$/.test(path))
    return route.fulfill({ contentType: 'text/css', body: publicAppearanceCss(statusAppearance) });
  else if (path.startsWith('/public/status/'))
    data = {
      services,
      monitors,
      generatedAt: '2026-10-10T17:05:06Z',
      statusTheme: statusAppearance,
    };
  else if (path === '/status')
    data = {
      services,
      monitors,
      generatedAt: '2026-10-10T17:05:06Z',
      statusTheme: statusAppearance,
    };
  else if (path === '/status-settings') {
    if (request.method() === 'PATCH')
      statusAppearance = request.postDataJSON().statusTheme || 'light';
    data = {
      visibility: statusVisibility,
      publicPath: '/public/status/demo-share',
      statusTheme: statusAppearance,
      revision: 0,
      serviceMessages: [],
      subscriptionButtonVisible: false,
    };
  } else if (path === '/groups') data = { groups: [] };
  else if (path === '/monitors' && request.method() === 'POST')
    data = { monitor: { ...monitors[0], name: request.postDataJSON().name } };
  else if (path === '/monitors') data = { monitors };
  else if (path === `/monitors/${monitors[0].id}/check` && request.method() === 'POST') {
    monitors[0].manualCheckPending = true;
    return route.fulfill({ status: 202, json: { monitor: monitors[0] } });
  } else if (path === `/monitors/${monitors[0].id}`) {
    if (request.method() === 'PATCH') {
      const body = request.postDataJSON();
      monitorIntervalSaves.push(body.intervalMinutes);
      assert.ok(
        Number.isInteger(body.intervalMinutes) &&
          body.intervalMinutes >= 1 &&
          body.intervalMinutes <= 1440,
      );
      assert.equal(body.intervalUnit, undefined);
      Object.assign(monitors[0], body);
    }
    data = { monitor: monitors[0] };
  } else if (path.startsWith(`/monitors/${monitors[0].id}/events/`) || /^\/events\/[a-f\d]{24}$/.test(path))
    data = {
      monitor: { id: monitors[0].id, name: monitors[0].name, serviceId: monitors[0].serviceId },
      event: {
        id: path.split('/').at(-1),
        number: 'EVT0000001',
        checkedAt: '2026-10-10T16:05:00Z',
        status: 'down',
        statusCode: 503,
        durationMs: 210,
        details: detailedEvent
          ? {
              method: 'GET',
              requestedUrl: 'https://status.example.invalid/health',
              finalUrl: 'https://status.example.invalid/health',
              followRedirects: true,
              responses: [
                {
                  url: 'https://status.example.invalid/health',
                  statusCode: 503,
                  statusMessage: 'Service Unavailable',
                  httpVersion: '1.1',
                  headersMs: 12,
                  body: { text: 'Temporarily unavailable', bytesCaptured: 23, truncated: false },
                },
              ],
            }
          : null,
      },
      incidents: [
        {
          id: demoIncident.id,
          title: demoIncident.title,
          number: 'INC0000001',
          status: demoIncident.status,
        },
      ],
    };
  else if (path === `/monitors/${monitors[0].id}/events`)
    data = {
      events: [0, 1].map((index) => ({
        id: index === 0 ? 'cdcdcdcdcdcdcdcdcdcdcdcd' : String(index + 1).padStart(24, 'a'),
        number: `EVT${String(index + 1).padStart(7, '0')}`,
        checkedAt: index ? '2026-10-09T11:55:00Z' : '2026-10-09T12:00:00Z',
        status: 'up',
        statusCode: 200,
        durationMs: 142,
        error: null,
      })),
      total: 2,
      totalPages: 1,
      pageSize: 10,
      page: 1,
    };
  else if (path === '/pins') {
    if (request.method() === 'PUT')
      pinnedRecords = { ...request.postDataJSON(), revision: pinnedRecords.revision + 1 };
    data = pinnedRecords;
  } else if (path === '/project-overview') {
    data = {
      projects: demoProjects.map((p) => ({ ...p, total: 5, done: 2, progress: 40 })),
      total: 5,
      done: 2,
      overdue: 1,
      blocked: 1,
      upcoming: demoMilestones,
      overdueTasks: [{ ...tasks[0], dueDate: '2026-10-01' }],
      workload: [{ name: 'Alex Demo', count: 3 }],
    };
  } else if (path === '/tables/projects')
    data = {
      rows: demoProjects.map((p) => ({
        ...p,
        total: 5,
        done: 2,
        progress: 40,
        owners: 'Alex Demo',
        groups: 'Operations',
      })),
      total: demoProjects.length,
    };
  else if (path === '/tables/project-milestones')
    data = { rows: demoMilestones, total: demoMilestones.length };
  else if (path === '/tables/project-activity')
    data = { rows: projectFeed, total: projectFeed.length };
  else if (path === '/project-milestones' && request.method() === 'POST') {
    const item = {
      id: 'aaaabbbbccccddddeeeeffff',
      number: 'MS0000002',
      ...request.postDataJSON(),
      revision: 0,
    };
    demoMilestones.push(item);
    data = { item };
  } else if (path.startsWith('/project-milestones/')) {
    const item = demoMilestones.find((m) => m.id === path.split('/').pop());
    if (request.method() === 'PATCH')
      Object.assign(item, request.postDataJSON(), { revision: item.revision + 1 });
    data = { item, tasks: [] };
  } else if (path.endsWith('/comments') && path.startsWith('/projects/')) {
    projectFeed.unshift({
      id: 'ffffeeeeaaaabbbbccccdddd',
      projectId: demoProjects[0].id,
      action: 'Comment',
      actor: 'Alex Demo',
      body: request.postDataJSON().body,
      createdAt: new Date().toISOString(),
    });
    data = { ok: true };
  } else if (path === '/tables/audit') {
    const size = Number(url.searchParams.get('pageSize') || 10),
      start = (Number(url.searchParams.get('page') || 1) - 1) * size;
    data = { rows: demoAuditRows.slice(start, start + size), total: demoAuditRows.length };
  } else if (path === '/tables/headers') {
    data = { rows: [{ id: 'content-type', name: 'content-type', value: 'text/plain' }], total: 1 };
  } else if (path.startsWith('/tables/')) {
    if (path === '/tables/event-incidents')
      return route.fulfill({ json: { rows: [demoIncident], total: 1 } });
    if (path === '/tables/event-alerts') {
      const rows = [demoEventAlert].filter(
        (row) =>
          (!url.searchParams.get('status') || row.status === url.searchParams.get('status')) &&
          (!url.searchParams.get('sourceType') ||
            row.sourceType === url.searchParams.get('sourceType')),
      );
      return route.fulfill({ json: { rows, total: rows.length } });
    }
    if (path === '/tables/events') {
      if (url.searchParams.get('alertId') === demoEventAlert.id)
        return route.fulfill({ json: { rows: [demoExternalEvent], total: 1 } });
      const rows = Array.from({ length: 30 }, (_, index) => ({
        id: index.toString(16).padStart(24, 'c'),
        monitorId: monitors[0].id,
        serviceId: services[0].id,
        number: `EVT${String(index + 1).padStart(7, '0')}`,
        monitorName: 'Demo Portal Health',
        serviceName: services[0].name,
        incidents:
          index % 5
            ? []
            : [
                {
                  id: demoIncident.id,
                  title: demoIncident.title,
                  number: 'INC0000001',
                  status: demoIncident.status,
                },
              ],
        incidentTitles: index % 5 ? '' : 'INC0000001',
        checkedAt: '2026-10-10T16:05:00Z',
        status: index % 5 ? 'up' : 'down',
        statusCode: index % 5 ? 200 : 503,
        durationMs: 210,
        error: index % 5 ? '' : 'HTTP 503',
      })).filter(
        (row) =>
          (!url.searchParams.get('status') || row.status === url.searchParams.get('status')) &&
          (!url.searchParams.get('search') ||
            JSON.stringify(row)
              .toLowerCase()
              .includes(url.searchParams.get('search').toLowerCase())),
      );
      const size = Number(url.searchParams.get('pageSize') || 10),
        start = (Number(url.searchParams.get('page') || 1) - 1) * size;
      return route.fulfill({ json: { rows: rows.slice(start, start + size), total: rows.length } });
    }
    if (path === '/tables/incident-monitor-events') {
      assert.equal(url.searchParams.get('recordId'), demoIncident.id);
      return route.fulfill({
        json: {
          rows: [
            {
              id: 'cdcdcdcdcdcdcdcdcdcdcdcd',
              monitorId: '333333333333333333333333',
              monitorName: 'Demo Portal Health',
              serviceName: 'Demo Customer Portal',
              checkedAt: '2026-10-10T16:05:00Z',
              status: 'down',
              statusCode: 503,
              durationMs: 210,
              error: 'HTTP 503',
            },
          ],
          total: 1,
          page: 1,
          pageSize: 10,
        },
      });
    }
    const rows = (
      path.endsWith('services') ? services : path.endsWith('monitors') ? monitors : []
    ).filter(
      (row) =>
        JSON.stringify(row)
          .toLowerCase()
          .includes((url.searchParams.get('search') || '').toLowerCase()) &&
        (!url.searchParams.get('columnSearch') ||
          String(row[url.searchParams.get('searchColumn')] || '')
            .toLowerCase()
            .includes(url.searchParams.get('columnSearch').toLowerCase())),
    );
    data = { rows, total: rows.length };
  } else if (path === '/projects' && request.method() === 'POST') {
    const item = { id: 'fedcbafedcbafedcbafedcba', ...request.postDataJSON(), revision: 0 };
    demoProjects.push(item);
    data = { item };
  } else if (path === '/operational-automation')
    data = { revision: 0, eventRules: [], escalationPolicies: [], maintenanceWindows: [] };
  else if (path === '/monitor-probes') data = { revision: 0, probes: [] };
  else if (path.startsWith('/projects/') && request.method() === 'GET')
    data = {
      item: demoProjects.find((row) => row.id === path.split('/').pop()),
      projectCount: demoProjects.length,
      owners: [],
      groups: [],
    };
  else if (path.startsWith('/projects/') && request.method() === 'PATCH') {
    const item = demoProjects.find((row) => row.id === path.split('/').pop());
    Object.assign(item, request.postDataJSON(), { revision: (item.revision || 0) + 1 });
    data = { item };
  } else if (path.startsWith('/projects/') && request.method() === 'DELETE') {
    const index = demoProjects.findIndex((row) => row.id === path.split('/').pop());
    assert.notEqual(demoProjects[index].id, request.postDataJSON().targetProjectId);
    assert.ok(demoProjects.length > 1);
    demoProjects.splice(index, 1);
    data = { ok: true, targetProjectId: request.postDataJSON().targetProjectId };
  } else if (path === '/references/projects')
    data = {
      options: demoProjects
        .filter((row) => row.id !== url.searchParams.get('excludeId'))
        .map((row) => ({ id: row.id, label: row.name })),
      selected: demoProjects
        .filter((row) => row.id === url.searchParams.get('selected'))
        .map((row) => ({ id: row.id, label: row.name })),
      hasMore: false,
    };
  else if (path === '/tasks') {
    const rows = tasks
      .filter(
        (task) =>
          (!url.searchParams.get('projectId') ||
            task.projectId === url.searchParams.get('projectId')) &&
          (!url.searchParams.get('status') || task.status === url.searchParams.get('status')) &&
          (!url.searchParams.get('statusOption') ||
            (task.statusOption ?? task.status) === url.searchParams.get('statusOption')) &&
          task.title.toLowerCase().includes((url.searchParams.get('search') || '').toLowerCase()),
      )
      .sort((a, b) => taskRank(a).localeCompare(taskRank(b)));
    const start =
      (Number(url.searchParams.get('page') || 1) - 1) *
      Number(url.searchParams.get('pageSize') || 10);
    data = {
      items: rows.slice(start, start + Number(url.searchParams.get('pageSize') || 10)),
      total: rows.length,
      page: Number(url.searchParams.get('page') || 1),
      pageSize: Number(url.searchParams.get('pageSize') || 10),
    };
  } else if (path === '/references/tasks')
    data = {
      options: tasks.map((row) => ({ id: row.id, label: row.title })),
      selected: tasks
        .filter((row) => (url.searchParams.get('selected') || '').includes(row.id))
        .map((row) => ({ id: row.id, label: row.title })),
      hasMore: false,
    };
  else if (path.startsWith('/references/')) data = { options: [], selected: [], hasMore: false };
  else if (path === '/auth/preferences') {
    user.uiPreferences = uiPreferences({ ...user.uiPreferences, ...request.postDataJSON() });
    data = { preferences: user.uiPreferences };
  } else if (path.startsWith('/tasks/'))
    data = { item: tasks.find((task) => task.id === path.split('/').pop()) };
  else if (path.startsWith('/attachments/')) data = { attachments: [] };
  else return route.fulfill({ status: 404, json: { error: `No demo fixture for ${path}` } });
  return route.fulfill({ json: data });
});
// Block external requests as well as isolating all application API traffic.
await context.route(
  (url) => url.origin !== new URL(base).origin,
  (route) => route.abort(),
);
/** Focused synthetic capture also runs as part of the full browser regression suite. */
async function captureRcaWorkflows() {
  user.role = 'admin';
  await page.goto(`${base}/`);
  await page.locator('.app-topbar').getByRole('button', { name: 'Create', exact: true }).click();
  const createModal = page.getByRole('dialog', { name: 'Create', exact: true });
  await createModal.locator('a[href="/rcas/new"]').waitFor();
  await page.screenshot({ path: `${output}/global-create-rca.png` });
  await createModal.locator('a[href="/rcas/new"]').click();
  await page.getByLabel('Title', { exact: true }).fill('Checkout outage root cause review');
  await page
    .getByLabel('Summary', { exact: true })
    .fill('Review the service interruption and corrective work.');
  await page
    .getByLabel('Root Cause', { exact: true })
    .fill('A missing connection timeout exhausted the request pool.');
  await page
    .getByLabel('Corrective Actions', { exact: true })
    .fill('Add bounded timeouts and verify recovery checks.');
  await page.getByRole('combobox', { name: 'Related Incidents', exact: true }).click();
  await page
    .getByRole('option', { name: `INC0000001 · ${demoIncident.title}`, exact: true })
    .click();
  await page.keyboard.press('Escape');
  await page.getByRole('combobox', { name: 'Corrective Action Tasks', exact: true }).click();
  await page.getByRole('option', { name: tasks[0].title, exact: true }).click();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.waitForURL('**/rcas/fafafafafafafafafafafafa');
  await page.locator('.rca-reader h1').waitFor();
  await page.screenshot({ path: `${output}/rca-record.png` });
  await page
    .getByRole('link', {
      name: `${tasks[0].number ? `${tasks[0].number} · ` : ''}${tasks[0].title}`,
      exact: true,
    })
    .waitFor();
  await page.setViewportSize({ width: 390, height: 844 });
  const lastRcaLink = page.getByRole('link', {
    name: `${tasks[0].number ? `${tasks[0].number} · ` : ''}${tasks[0].title}`,
    exact: true,
  });
  await lastRcaLink.scrollIntoViewIfNeeded();
  const rcaBottom = await lastRcaLink.boundingBox();
  assert.ok(
    rcaBottom.y >= 0 && rcaBottom.y + rcaBottom.height <= 844,
    'RCA records remain scrollable on mobile',
  );
  await page.setViewportSize({ width: 1440, height: 960 });
  await page.goto(`${base}/rcas`);
  await page.getByRole('link', { name: 'RCA0000001', exact: true }).waitFor();
  await page.getByRole('link', { name: 'Create', exact: true }).waitFor();
  await page.screenshot({ path: `${output}/rca-list.png` });
  await page.getByRole('link', { name: 'Create', exact: true }).click();
  await page.waitForURL('**/rcas/new?*');
  await page.getByLabel('Title', { exact: true }).waitFor();
  await page.goto(`${base}/rcas/fields`);
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('button', { name: 'Add Custom Field', exact: true }).click();
  await page.getByLabel('Label', { exact: true }).fill('Detection gap');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.getByText('Form saved.', { exact: true }).waitFor();
  await page.screenshot({ path: `${output}/rca-form-builder.png` });
  await page.goto(`${base}/rcas/new`);
  await page.getByLabel('Detection gap', { exact: true }).fill('Missing timeout alert');
  // Restore the fixture so the remaining captures use the default form.
  rcaFields = RCA_FIELDS;
  await page.goto(`${base}/alert-grouping`);
  const groupingWindow = page.getByLabel('Alert grouping window (seconds)', { exact: true });
  await groupingWindow.waitFor();
  assert.equal(await groupingWindow.inputValue(), '30');
  await groupingWindow.fill('0');
  await page
    .getByRole('heading', { name: 'Alert Grouping', exact: true })
    .locator('..')
    .getByRole('button', { name: 'Save', exact: true })
    .click();
  await page.getByText('Alert grouping saved.', { exact: true }).waitFor();
  assert.equal(workspaceConfig.alertGroupingSeconds, 0);
  await groupingWindow.fill('30');
  await page.screenshot({ path: `${output}/alert-grouping-settings.png` });
}

async function captureNavigation() {
  user.role = 'admin';
  const originalBases = structuredClone(demoBases);
  for (let index = 0; index < 60; index++)
    demoBases.push({
      id: (index + 500).toString(16).padStart(24, 'f'),
      title: `Navigation base ${index}`,
      description: 'Knowledge navigation fixture.',
    });
  knowledgeFailPage = 2;
  await page.goto(`${base}/knowledge`);
  await page.getByRole('link', { name: /^Navigation base 0/ }).waitFor();
  await page.locator('.list-outlet').evaluate((el) => {
    el.scrollTop = el.scrollHeight;
  });
  await page.getByRole('button', { name: 'Retry', exact: true }).waitFor();
  assert.equal(await page.locator('.list-outlet a.panel').count(), 25);
  await page.getByRole('button', { name: 'Retry', exact: true }).click();
  await page.waitForFunction(() => document.querySelectorAll('.list-outlet a.panel').length >= 50);
  await page.locator('.list-outlet').evaluate((el) => {
    el.scrollTop = el.scrollHeight;
  });
  await page.getByRole('link', { name: /^Navigation base 59/ }).waitFor();
  assert.ok(knowledgePages.includes(3));
  await page.getByLabel('Search Knowledge Bases', { exact: true }).fill('Navigation base 59');
  await page.waitForFunction(() => document.querySelectorAll('.list-outlet a.panel').length === 1);
  demoBases.splice(0, demoBases.length, ...originalBases);
  if (!demoArticles.length) await captureRecordExports();
  const article = demoArticles[0],
    originalArticle = structuredClone(article);
  article.knowledgeBaseId = demoBases[0].id;
  article.knowledgeBaseTitle = demoBases[0].title;
  await page.goto(`${base}/knowledge/${article.id}`);
  const crumbs = page.getByRole('navigation', { name: 'Breadcrumb', exact: true });
  await crumbs.getByRole('link', { name: demoBases[0].title, exact: true }).waitFor();
  assert.equal(
    await crumbs.getByRole('link', { name: 'Knowledge Bases', exact: true }).getAttribute('href'),
    '/knowledge',
  );
  assert.equal(
    await crumbs.getByRole('link', { name: demoBases[0].title, exact: true }).getAttribute('href'),
    `/knowledge/bases/${demoBases[0].id}`,
  );
  article.knowledgeBaseId = null;
  article.knowledgeBaseTitle = null;
  await page.reload();
  await crumbs.getByRole('link', { name: 'All Articles', exact: true }).waitFor();
  Object.assign(article, originalArticle);
  await page.goto(`${base}/records/activity/abababababababababababac?recordId=${demoIncident.id}`);
  await page
    .getByRole('navigation', { name: 'Breadcrumb' })
    .getByRole('link', { name: 'Activity', exact: true })
    .click();
  await page.getByRole('tab', { name: /^Activity/, selected: true }).waitFor();
  await page.setViewportSize({ width: 1440, height: 720 });
  await page.goto(`${base}/help?topic=configuration`);
  const nav = page.getByRole('navigation', { name: 'Help topics' });
  await nav.waitFor();
  const root = page.locator('.page-scroll-area');
  const initialNav = await nav.boundingBox();
  const initialSearch = await page
    .getByRole('searchbox', { name: 'Search documentation', exact: true })
    .boundingBox();
  assert.ok(
    Math.abs(initialNav.y - initialSearch.y) <= 2,
    'Help categories align with the top of search',
  );
  await page.screenshot({ path: `${output}/help-navigation.png` });
  const before = await root.evaluate((el) => el.scrollTop);
  await nav.hover();
  await page.mouse.wheel(0, 400);
  await page.waitForFunction(() => document.querySelector('.help-topic-nav').scrollTop > 0);
  assert.equal(await root.evaluate((el) => el.scrollTop), before);
  await root.evaluate((el) => {
    el.scrollTop += 400;
  });
  await nav.getByRole('link', { name: 'Common questions', exact: true }).scrollIntoViewIfNeeded();
  const bounds = await nav.boundingBox();
  assert.ok(bounds.y >= 0 && bounds.y + bounds.height <= 720);
  const searchBox = page.getByRole('searchbox', { name: 'Search documentation', exact: true });
  const searchBounds = await searchBox.boundingBox(),
    rootBounds = await root.boundingBox();
  assert.ok(
    searchBounds.y >= rootBounds.y &&
      searchBounds.y + searchBounds.height <= rootBounds.y + rootBounds.height,
  );
  assert.ok(
    searchBounds.y - rootBounds.y <= 8,
    'Sticky search meets the top of the guide scroll area',
  );
  const articleBounds = await page.locator('.page-scroll-area article').boundingBox();
  assert.ok(Math.abs(searchBounds.x - articleBounds.x) < 2, 'Help search aligns with the guide');
  await nav.getByRole('link', { name: 'Common questions', exact: true }).click();
  await page.waitForURL('**/help?topic=questions');
  await page.waitForFunction(() => document.querySelector('.page-scroll-area').scrollTop === 0);
  await page.setViewportSize({ width: 390, height: 720 });
  await page.goto(`${base}/help?topic=configuration`);
  await page.locator('.page-scroll-area article').waitFor();
  await root.evaluate((el) => {
    el.scrollTop = el.scrollHeight;
  });
  const mobileScroll = await root.evaluate((el) => ({
    top: el.scrollTop,
    height: el.clientHeight,
    total: el.scrollHeight,
    width: el.clientWidth,
    fullWidth: el.scrollWidth,
  }));
  assert.ok(
    mobileScroll.top + mobileScroll.height >= mobileScroll.total - 2,
    'Help bottom controls reachable on mobile',
  );
  assert.ok(
    mobileScroll.fullWidth <= mobileScroll.width + 1,
    'Help has no mobile horizontal overflow',
  );
  await page.setViewportSize({ width: 1440, height: 960 });
}

async function captureOverview() {
  user.role = 'admin';
  await page.goto(`${base}/`);
  await page.getByRole('heading', { name: 'My Assignments', exact: true }).waitFor();
  assert.equal(await page.getByRole('heading', { name: 'Your Work', exact: true }).count(), 0);
  assert.equal(
    await page
      .getByText('Start with your active assignments, then review work shared with your team.', {
        exact: true,
      })
      .count(),
    0,
  );
  assert.equal(
    await page.locator('[aria-label="Assignment overview"] .assignment-report').count(),
    4,
  );
  const attention = page.locator('[aria-labelledby="overview-attention-title"]');
  assert.equal(await attention.locator('[data-score-tone]').count(), 4);
  assert.ok(
    await attention.evaluate(
      (node) =>
        node.getBoundingClientRect().top <
        document.querySelector('[aria-labelledby="quick-start-heading"]').getBoundingClientRect()
          .top,
    ),
  );
  await attention.getByRole('link', { name: 'View Alerts' }).waitFor();
  await page.screenshot({ path: `${output}/dashboard-overview.png` });
  await page.screenshot({ path: `${output}/readme-dashboard-dark.png` });
  await page.setViewportSize({ width: 390, height: 844 });
  const last = page.locator('[aria-label="Assignment overview"] .assignment-report').last();
  await last.scrollIntoViewIfNeeded();
  const bounds = await last.boundingBox();
  assert.ok(
    bounds.x >= 0 && bounds.x + bounds.width <= 390 && bounds.y + bounds.height <= 844,
    'Assignment panels remain within the mobile viewport and scroll into view',
  );
  const bottom = page.getByRole('link', { name: 'Service Status', exact: true }).last();
  await bottom.scrollIntoViewIfNeeded();
  assert.ok(await bottom.isVisible(), 'Bottom shortcuts are reachable on mobile');
  await page.setViewportSize({ width: 1440, height: 960 });
  await bottom.scrollIntoViewIfNeeded();
  assert.ok(await bottom.isVisible(), 'Bottom shortcuts are reachable on desktop');
}

async function captureCollaboration() {
  user.role = 'admin';
  await page.goto(`${base}/incidents/${demoIncident.id}`);
  await page.getByRole('tab', { name: 'Comments and work notes', exact: true }).click();
  assert.equal(
    await page
      .locator('.app-topbar')
      .getByText('Detect, Respond, Resolve', { exact: true })
      .count(),
    0,
  );
  const info = page.getByRole('button', { name: 'Collapse record information', exact: true });
  assert.equal(
    await page
      .locator('.record-sticky-header')
      .getByRole('button', { name: 'Collapse record information', exact: true })
      .count(),
    1,
  );
  await info.click();
  await page.waitForFunction(
    () => document.querySelector('.record-sidebar').getBoundingClientRect().width === 0,
  );
  await page.getByRole('button', { name: 'Expand record information', exact: true }).click();
  await page.getByRole('button', { name: 'Close details', exact: true }).click();
  await page.getByRole('button', { name: 'Expand record information', exact: true }).click();
  await page.getByRole('button', { name: 'Edit watchers', exact: true }).click();
  await page.getByRole('combobox', { name: 'Watcher users', exact: true }).click();
  await page.getByRole('option', { name: 'Morgan Lee', exact: true }).click();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  const composer = page.getByRole('textbox', { name: 'Comment', exact: true });
  await composer.fill('@Morgan');
  await page.getByRole('button', { name: 'Morgan Lee', exact: true }).click();
  assert.equal(await composer.inputValue(), '@Morgan Lee ');
  await composer.fill('@Morgan Lee please review the latest checks.');
  await page.getByRole('button', { name: /^Notifications/ }).click();
  await page.getByRole('heading', { name: 'Notifications', exact: true }).waitFor();
  await page.screenshot({ path: `${output}/incident-mentions-notifications.png` });
  await page.getByRole('button', { name: 'Close notifications', exact: true }).click();
  await page.getByRole('button', { name: 'Post comment', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('.discussion-composer')?.value === '');
  for (const viewport of [
    { width: 1440, height: 960 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    if (viewport.width < 1200) {
      await page.getByRole('button', { name: 'Expand record information', exact: true }).click();
      const panel = page.getByRole('dialog', { name: 'Details', exact: true });
      await panel.waitFor();
      await panel.getByRole('button', { name: 'Close details', exact: true }).click();
      assert.equal(await panel.count(), 0);
      await page.getByRole('button', { name: 'Expand record information', exact: true }).click();
      await page.mouse.click(2, 100);
      await page.waitForFunction(() => !document.querySelector('dialog.record-info-modal'));
      await page.getByRole('button', { name: 'Expand record information', exact: true }).click();
      await page.keyboard.press('Escape');
      await page.waitForFunction(() => !document.querySelector('dialog.record-info-modal'));
    }
    const bottom = page.getByRole('heading', { name: 'Conversation', exact: false });
    await bottom.scrollIntoViewIfNeeded();
    const bounds = await bottom.boundingBox();
    assert.ok(
      bounds.y >= 0 && bounds.y + bounds.height <= viewport.height,
      'Incident content scrolls to conversation',
    );
    const radius = await page
      .locator('#main')
      .evaluate((el) => parseFloat(getComputedStyle(el).borderBottomLeftRadius));
    if (viewport.width < 768) assert.equal(radius, 0);
    else assert.ok(radius >= 12);
    assert.ok(
      await page.locator('.app-topbar').evaluate((el) => el.getBoundingClientRect().height <= 48),
    );
  }
  await page.setViewportSize({ width: 1440, height: 960 });
  await page.goto(`${base}/tasks`);
  const card = page.locator('[data-task-id]').first();
  await card.locator('dl').click();
  await page.getByRole('dialog').waitFor();
  await page.getByRole('dialog').getByRole('button', { name: 'Close', exact: true }).click();
  await card.getByRole('combobox', { name: /^Move .* to$/ }).click();
  await page.keyboard.press('Escape');
  const reorder = page.locator('[data-task-id] button[title="Move Down"]:enabled').first();
  if (await reorder.count()) await reorder.click();
  assert.equal(
    await page.getByRole('dialog').count(),
    0,
    'Ordering action does not open task preview',
  );
  await page
    .locator('.desktop-sidebar')
    .getByRole('link', { name: 'Dashboard', exact: true })
    .click();
  await page.waitForURL(`${base}/`);
  await page.waitForFunction(
    () =>
      Math.abs(document.querySelector('#main').getBoundingClientRect().right - (innerWidth - 8)) <
      1,
  );
  const perimeter = await page.locator('#main').evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      borders: [
        style.borderTopWidth,
        style.borderRightWidth,
        style.borderBottomWidth,
        style.borderLeftWidth,
      ],
      corners: [
        style.borderTopLeftRadius,
        style.borderTopRightRadius,
        style.borderBottomRightRadius,
        style.borderBottomLeftRadius,
      ],
      overflow: style.overflow,
    };
  });
  assert.deepEqual(perimeter.borders, ['1px', '1px', '1px', '1px']);
  assert.deepEqual(perimeter.corners, ['16px', '16px', '16px', '16px']);
  assert.equal(perimeter.overflow, 'hidden');
  const frame = await page.evaluate(() => {
    const color = (selector) => getComputedStyle(document.querySelector(selector)).backgroundColor;
    return [color('[data-app-shell]'), color('.app-topbar'), color('.desktop-sidebar')];
  });
  assert.equal(frame[0], frame[1]);
  assert.equal(frame[1], frame[2]);
  assert.equal(
    await page.locator('.desktop-sidebar').evaluate((el) => getComputedStyle(el).borderRightWidth),
    '0px',
  );
  assert.equal(
    await page
      .locator('.desktop-sidebar .sidebar-profile')
      .evaluate((el) => getComputedStyle(el).borderTopWidth),
    '0px',
  );
  assert.equal(
    await page.locator('.record-sidebar:visible').count(),
    0,
    'Dashboard does not reserve record information space',
  );
  await page.goto(`${base}/incidents/fields`);
  await page.getByRole('button', { name: 'Close field settings', exact: true }).click();
  await page.getByRole('button', { name: 'Expand record information', exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('.record-body button[aria-pressed]').first().click();
  const settingsPanel = page.getByRole('dialog', { name: 'Field settings', exact: true });
  await settingsPanel.waitFor();
  await settingsPanel.getByRole('button', { name: 'Close field settings', exact: true }).click();
  await page.setViewportSize({ width: 1440, height: 960 });
  await page.goto(`${base}/settings?section=demo-data`);
  await page.getByRole('heading', { name: 'Demo Data', exact: true }).scrollIntoViewIfNeeded();
  await page.getByText('New batches include 50 linked RCAs', { exact: false }).waitFor();
  await page.screenshot({ path: `${output}/demo-data-rcas.png` });
}

async function captureMonitorIntervals() {
  const originalMonitor = structuredClone(monitors[0]);
  monitors[0].url = 'https://monitor.example.com/health';
  monitors[0].authentication = { mode: 'none' };
  monitors[0].authenticationConfigured = false;
  user.role = 'admin';
  const original = structuredClone(monitors[0]);
  await page.goto(`${base}/monitors/${monitors[0].id}`);
  await page.getByRole('button', { name: 'Edit Record', exact: true }).click();
  const input = page.getByRole('spinbutton', { name: 'Check every', exact: false });
  await input.waitFor();
  await page.getByRole('combobox', { name: 'Interval unit', exact: true }).click();
  await page.getByRole('option', { name: 'Hours', exact: true }).click();
  assert.equal(monitorIntervalMinutes(await input.inputValue(), 'hours'), original.intervalMinutes);
  await input.fill('1.5');
  await input.scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${output}/monitor-interval-units.png` });
  const before = monitorIntervalSaves.length;
  await input.fill('25');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page
    .getByText('Use 1 minute to 24 hours in whole-minute increments, such as 1.5 hours.', {
      exact: true,
    })
    .waitFor();
  assert.equal(monitorIntervalSaves.length, before);
  await input.fill('0.01');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  assert.equal(monitorIntervalSaves.length, before);
  await input.fill('1.5');
  await page.getByRole('combobox', { name: 'Interval unit', exact: true }).click();
  await page.getByRole('option', { name: 'Minutes', exact: true }).click();
  assert.equal(await input.inputValue(), '90');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.getByRole('button', { name: 'Edit Record', exact: true }).waitFor();
  assert.equal(monitorIntervalSaves.at(-1), 90);
  Object.assign(monitors[0], originalMonitor);
}

async function captureRecordExports() {
  user.role = 'admin';
  if (!demoRcas.length) await captureRcaWorkflows();
  const rca = demoRcas[0];
  rca.summary = 'Review the checkout interruption, recovery and prevention measures.';
  rca.impact = 'Checkout requests were delayed during the interruption.';
  rca.rootCause = 'A missing connection timeout exhausted the request pool.';
  rca.contributingFactors = 'The timeout alert did not cover the dependency path.';
  rca.correctiveActions = 'Add bounded timeouts and recovery checks.';
  rca.lessonsLearned = 'Exercise dependency failure scenarios before release.';
  await page.goto(`${base}/rcas/${rca.id}`);
  await page.locator('.knowledge-reader h1').waitFor();
  await page.screenshot({ path: `${output}/rca-record.png` });
  await page.getByRole('button', { name: 'Record actions', exact: true }).click();
  await page.getByRole('button', { name: 'Export PDF', exact: true }).waitFor();
  await page.screenshot({ path: `${output}/record-export-actions.png` });
  await page.keyboard.press('Escape');
  async function download(type, name) {
    await page.getByRole('button', { name: 'Record actions', exact: true }).click();
    const pending = page.waitForEvent('download');
    await page.getByRole('button', { name: `Export ${type.toUpperCase()}`, exact: true }).click();
    const file = await pending;
    const path = `${output}/${name}.${type}`;
    await file.saveAs(path);
    const content = await readFile(path);
    if (type === 'pdf') {
      assert.equal(content.subarray(0, 5).toString(), '%PDF-');
      assert.ok(content.length > 2000);
      assert.ok(content.toString('latin1').includes('%%EOF'));
    } else assert.ok(content.toString().includes('"Field","Value"'));
    return content;
  }
  const rcaCsv = await download('csv', 'rca-export');
  assert.ok(rcaCsv.toString().includes('connection timeout'));
  await download('pdf', 'rca-export');
  if (!demoArticles.length)
    demoArticles.push({
      id: 'eeeeeeeeeeeeeeeeeeeeeeee',
      title: 'Checkout recovery guide',
      summary: 'Verify service health after recovery.',
      articleType: 'runbook',
      status: 'published',
      createdBy: user.displayName,
      updatedAt: '2026-10-10T17:05:06Z',
      contentDocument: {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: 'Review dependency health and document the outcome.' }],
          },
        ],
      },
      steps: [
        {
          title: 'Verify recovery',
          instructions: 'Confirm successful checks before closing the incident.',
        },
      ],
      fields: [],
      custom: {},
    });
  await page.goto(`${base}/knowledge/${demoArticles[0].id}`);
  await page.locator('.knowledge-reader h1').waitFor();
  await download('csv', 'knowledge-export');
  await download('pdf', 'knowledge-export');
  await page.goto(`${base}/records/audit/${demoAuditRows[0].id}`);
  await page.getByRole('button', { name: 'Record actions', exact: true }).waitFor();
  await download('csv', 'audit-export');
  await download('pdf', 'audit-export');
  await page.goto(`${base}/monitors/${monitors[0].id}/events/cdcdcdcdcdcdcdcdcdcdcdcd`);
  await page.getByRole('button', { name: 'Record actions', exact: true }).waitFor();
  const eventCsv = await download('csv', 'event-export');
  assert.ok(eventCsv.toString().includes('503'));
  await page.goto(`${base}/rcas/${rca.id}`);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('.rca-reader section').last().scrollIntoViewIfNeeded();
  const bounds = await page.locator('.rca-reader section').last().boundingBox();
  assert.ok(bounds.y + bounds.height <= 844, 'RCA article remains scrollable on mobile');
  await page.setViewportSize({ width: 1440, height: 960 });
}

async function captureIncidentSource() {
  user.role = 'admin';
  await page.goto(`${base}/incidents/${demoIncident.id}`);
  await page.getByText('Source: Monitor', { exact: true }).waitFor();
  await page.getByText('Triggered by', { exact: true }).waitFor();
  await page.getByRole('link', { name: `Monitor: ${monitors[0].name}`, exact: true }).waitFor();
  await page.getByRole('link', { name: 'Event: EVT0000001', exact: true }).waitFor();
  await page.screenshot({ path: `${output}/incident-source.png` });
  await page.goto(`${base}/incidents`);
  await page.getByRole('columnheader', { name: 'Source', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Filters', exact: true }).click();
  await page.getByRole('combobox', { name: 'Source', exact: true }).click();
  await page.getByRole('option', { name: 'Monitor', exact: true }).click();
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await page.getByRole('cell', { name: 'Monitor', exact: true }).waitFor();
  assert.ok(incidentListSources.includes('monitor'), 'Source filter reaches the API');
  await page.screenshot({ path: `${output}/incident-source-list.png` });
}

async function captureLongReferences() {
  user.role = 'admin';
  const originalService = services[0].name;
  const originalTitle = demoIncident.title;
  const longLabel =
    'Customer checkout production service with an exceptionally long reference label across multiple regions';
  services[0].name = longLabel;
  demoIncident.title = longLabel;
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${base}/tasks/new`);
  await page.getByRole('combobox', { name: 'Service', exact: true }).click();
  await page.getByRole('option', { name: longLabel, exact: true }).click();
  await page.keyboard.press('Escape');
  const control = page.getByRole('combobox', { name: 'Service', exact: true }).locator('..');
  await control.scrollIntoViewIfNeeded();
  assert.ok(
    await control.evaluate((element) => element.scrollWidth <= element.clientWidth + 1),
    'Long single references stay inside the field',
  );
  const icon = control.getByRole('link');
  await icon.waitFor();
  const bounds = await control.boundingBox(),
    iconBounds = await icon.boundingBox();
  assert.ok(
    iconBounds.x >= bounds.x && iconBounds.x + iconBounds.width <= bounds.x + bounds.width,
    'Record icon remains within reference field',
  );
  await page
    .getByRole('combobox', { name: 'Service', exact: true })
    .evaluate((input) => input.blur());
  await page.screenshot({ path: `${output}/reference-truncation.png` });
  await page.goto(`${base}/rcas/new`);
  await page.getByRole('combobox', { name: 'Related Incidents', exact: true }).click();
  await page.getByRole('option', { name: `INC0000001 · ${longLabel}`, exact: true }).click();
  await page.keyboard.press('Escape');
  const multiple = page
    .getByRole('combobox', { name: 'Related Incidents', exact: true })
    .locator('..');
  await multiple.scrollIntoViewIfNeeded();
  assert.ok(
    await multiple.evaluate((element) => element.scrollWidth <= element.clientWidth + 1),
    'Long multi references stay inside the field',
  );
  await multiple.getByRole('link').waitFor();
  services[0].name = originalService;
  demoIncident.title = originalTitle;
  await page.setViewportSize({ width: 1440, height: 960 });
}

async function captureReadmeRecords() {
  await page.setViewportSize({ width: 1440, height: 960 });
  await page.goto(`${base}/profile`);
  await page.getByRole('radio', { name: 'Ocean', exact: true }).check();
  if (await page.evaluate(() => document.documentElement.dataset.theme !== 'dark'))
    await page.getByRole('button', { name: 'Dark mode', exact: true }).click();
  await page.waitForFunction(() => document.documentElement.dataset.theme === 'dark');
  user.uiPreferences = { ...user.uiPreferences, rightCollapsed: true };
  if (!demoRcas.length)
    demoRcas.push({
      id: 'fafafafafafafafafafafafa',
      number: 'RCA0000001',
      title: 'Checkout interruption review',
      status: 'completed',
      revision: 0,
      summary: 'Review the interruption, recovery and prevention work.',
      impact: 'Checkout requests were delayed during the interruption.',
      rootCause: 'A missing connection timeout exhausted the request pool.',
      contributingFactors: 'Timeout alerts did not cover the dependency path.',
      correctiveActions: 'Add bounded timeouts and recovery checks.',
      lessonsLearned: 'Exercise dependency failures before release.',
      incidentIds: [demoIncident.id],
      taskIds: [tasks[0].id],
      fields: RCA_FIELDS,
      custom: {},
    });
  demoIncident.title = 'Checkout availability restored';
  demoIncident.description =
    'Checkout requests failed after a dependency connection pool was exhausted. The team restored service and is tracking prevention work in the linked RCA.';
  demoIncident.resolutionNotes =
    'Restored the connection pool and confirmed healthy monitor checks.';
  demoRcas[0].timeline =
    '09:12 — Monitor detected failed requests.\n09:16 — Responders isolated the connection pool.\n09:24 — Recovery checks confirmed service restoration.';
  await page.evaluate(() => sessionStorage.removeItem('servicetrident-record-tabs'));
  await page.goto(`${base}/dashboard`);
  const collapse = page.getByRole('button', { name: 'Collapse navigation', exact: true });
  if (await collapse.count()) await collapse.click();
  await page.waitForFunction(
    () => document.querySelector('.desktop-sidebar').getBoundingClientRect().width === 64,
  );
  await page.goto(`${base}/incidents/${demoIncident.id}`);
  await page.getByRole('button', { name: 'Edit Record', exact: true }).waitFor();
  await page.screenshot({ path: `${output}/readme-incident-dark.png` });
  await page.goto(`${base}/rcas/${demoRcas[0].id}`);
  await page.locator('.rca-reader [data-record-field=title] dd').waitFor();
  await page.getByRole('button', { name: 'Edit Record', exact: true }).waitFor();
  await page.screenshot({ path: `${output}/readme-rca-dark.png` });
  await page.getByRole('button', { name: 'Expand Navigation', exact: true }).click();
  await page.goto(`${base}/services/${services[0].id}`);
  await page.getByRole('button', { name: 'Edit Record', exact: true }).waitFor();
  const navigationSizing = await page
    .locator('.desktop-sidebar .sidenav-link')
    .first()
    .evaluate((link) => {
      const icon = link.querySelector('.sidenav-link-icon').getBoundingClientRect();
      return {
        width: icon.width,
        height: icon.height,
        row: link.getBoundingClientRect().height,
        background: getComputedStyle(link).backgroundColor,
      };
    });
  const profileAlignment = await page.evaluate(() => {
    const icon = document
      .querySelector('.desktop-sidebar .sidenav-link-icon')
      .getBoundingClientRect();
    const avatar = document
      .querySelector('.desktop-sidebar .profile-avatar')
      .getBoundingClientRect();
    return Math.abs(icon.left + icon.width / 2 - avatar.left - avatar.width / 2);
  });
  assert.ok(profileAlignment < 1, 'Profile aligns with navigation icons');
  const brandAlignment = await page.evaluate(() => {
    const rail = document.querySelector('.desktop-sidebar');
    const icon = rail.querySelector('.sidenav-link-icon').getBoundingClientRect();
    const logo = rail.querySelector('[data-brand-mark]').getBoundingClientRect();
    const toggle = rail
      .querySelector('button[aria-label="Collapse navigation"]')
      .getBoundingClientRect();
    return {
      delta: Math.abs(icon.left + icon.width / 2 - logo.left - logo.width / 2),
      edge: Math.abs(rail.getBoundingClientRect().right - toggle.right),
    };
  });
  assert.ok(brandAlignment.delta < 1, 'Expanded logo aligns with navigation icons');
  assert.ok(brandAlignment.edge < 1, 'Collapse toggle reaches the content-side edge');
  assert.equal(
    await page
      .getByRole('button', { name: 'Collapse navigation', exact: true })
      .evaluate((node) => node.getBoundingClientRect().height),
    36,
  );

  assert.equal(navigationSizing.width, 32);
  assert.equal(navigationSizing.height, 32);
  assert.equal(navigationSizing.row, 36);
  assert.equal(navigationSizing.background, 'rgba(0, 0, 0, 0)');
  const activeLink = page.locator('.desktop-sidebar .sidenav-link.active');
  assert.notEqual(
    await activeLink.evaluate((link) => getComputedStyle(link).backgroundColor),
    'rgba(0, 0, 0, 0)',
  );
  assert.equal(
    await activeLink
      .locator('.sidenav-link-icon')
      .evaluate((icon) => getComputedStyle(icon).backgroundColor),
    'rgba(0, 0, 0, 0)',
  );
  const firstLink = page.locator('.desktop-sidebar .sidenav-link').first();
  await firstLink.hover();
  await page.waitForFunction(
    () =>
      getComputedStyle(document.querySelector('.desktop-sidebar .sidenav-link:hover'))
        .backgroundColor !== 'rgba(0, 0, 0, 0)',
  );
  assert.notEqual(
    await firstLink.evaluate((link) => getComputedStyle(link).backgroundColor),
    'rgba(0, 0, 0, 0)',
  );
  await page.mouse.move(800, 100);

  await page.screenshot({ path: `${output}/readme-service-dark.png` });
}

async function captureMobileNavigation() {
  user.role = 'admin';
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${base}/dashboard`);
  const header = page.getByRole('banner', { name: 'Mobile navigation' });
  const search = header.getByRole('button', { name: 'Search Workspace', exact: true });
  await search.waitFor();
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    const boxes = await Promise.all([
      search.boundingBox(),
      header.getByRole('button', { name: 'Create', exact: true }).boundingBox(),
      header.getByRole('button', { name: /^Notifications/ }).boundingBox(),
      header.locator('summary').boundingBox(),
    ]);
    const contentBounds = await page.locator('#main').boundingBox();
    assert.equal(contentBounds.x, 0);
    assert.equal(contentBounds.width, width);
    assert.equal(
      await page.locator('#main').evaluate((node) => getComputedStyle(node).borderRadius),
      '0px',
    );
    boxes.forEach((box, index) => {
      assert.ok(box.x >= 0 && box.x + box.width <= width);
      assert.ok(Math.abs(box.y + box.height / 2 - boxes[0].y - boxes[0].height / 2) < 1);
      if (index) assert.ok(box.x >= boxes[index - 1].x + boxes[index - 1].width);
    });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await search.click();
  await page.getByRole('dialog', { name: 'Search Workspace', exact: true }).waitFor();
  await page.keyboard.press('Escape');
  await header.getByRole('button', { name: 'Create', exact: true }).click();
  await page.getByRole('dialog', { name: 'Create', exact: true }).waitFor();
  await page.keyboard.press('Escape');
  await header.getByRole('button', { name: /^Notifications/ }).click();
  const panel = page.getByRole('region', { name: 'Notifications', exact: true });
  await panel.waitFor();
  const bounds = await panel.boundingBox();
  assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= 390);
  await page.screenshot({ path: `${output}/mobile-navigation-actions.png` });
  await page.getByRole('button', { name: 'Close notifications', exact: true }).click();
  await header.locator('summary').click();
  await header.getByRole('link', { name: 'Profile', exact: true }).waitFor();
  await page.screenshot({ path: `${output}/mobile-profile-menu.png` });
  await page.keyboard.press('Escape');
  await page.setViewportSize({ width: 1440, height: 960 });
  await page
    .getByRole('banner', { name: 'Application toolbar' })
    .getByRole('button', { name: 'Search Workspace', exact: true })
    .waitFor();
}

async function captureChatWorkspace() {
  if (!demoArticles.length) await captureRecordExports();
  user.role = 'admin';
  aiDemoEnabled = true;
  aiChatEnabled = false;
  await page.setViewportSize({ width: 1440, height: 960 });
  await page.goto(`${base}/dashboard`);
  await page.getByRole('button', { name: 'Open AI Chat', exact: true }).click();
  const panel = page.locator('#ai-chat-panel');
  for (const example of AI_DEMO_EXAMPLES) {
    await panel.getByRole('button', { name: example.label, exact: true }).click();
    await panel.locator('.ai-chat-progress').waitFor();
    await panel.locator('.ai-chat-transcript').evaluate((node) => {
      node.scrollTop = 0;
    });
    await panel.locator('.ai-chat-progress').waitFor({ state: 'hidden' });
    assert.equal(
      await panel.locator('.ai-chat-transcript').evaluate((node) => node.scrollTop),
      0,
      'Answers preserve the reading position',
    );
  }
  await panel.getByRole('button', { name: 'New Conversation', exact: true }).click();
  assert.equal(await panel.locator('article').count(), 0);
  await panel.getByRole('button', { name: 'Conversation History', exact: true }).click();
  await panel.getByRole('button', { name: 'Full View', exact: true }).click();
  await page.evaluate(async () => {
    const animations = [
      ...document.querySelector('.desktop-sidebar').getAnimations(),
      ...document.querySelector('[data-app-shell]').getAnimations(),
    ];
    await Promise.all(animations.map((animation) => animation.finished.catch(() => {})));
  });
  await page.screenshot({ path: `${output}/ai-chat-history.png` });
  await panel.locator('.ai-conversation-entry').first().click();
  assert.equal(await panel.locator('article').count(), 12);
  assert.equal(
    await panel.getByRole('button', { name: 'Simulate Action', exact: true }).count(),
    0,
  );
  await panel
    .getByText('Previous action proposal. Ask again to review a fresh action.', { exact: true })
    .waitFor();
  for (const viewport of [
    { width: 1440, height: 960 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    const bounds = await panel.boundingBox(),
      main = await page.locator('#main').boundingBox();
    assert.ok(Math.abs(bounds.width - main.width) < 3 && Math.abs(bounds.height - main.height) < 3);
    assert.equal(await page.locator('.record-sticky-header').evaluate((node) => node.inert), true);
    await panel.locator('.ai-chat-transcript').evaluate((node) => {
      node.scrollTop = node.scrollHeight;
    });
    assert.ok(await panel.locator('.ai-chat-transcript').evaluate((node) => node.scrollTop > 0));
  }
  await page.setViewportSize({ width: 1440, height: 960 });
  await panel.locator('.ai-chat-transcript').evaluate((node) => {
    node.scrollTop = 0;
  });
  await page.evaluate(async () => {
    const animations = [
      ...document.querySelector('.desktop-sidebar').getAnimations(),
      ...document.querySelector('[data-app-shell]').getAnimations(),
    ];
    await Promise.all(animations.map((animation) => animation.finished.catch(() => {})));
  });
  await page.screenshot({ path: `${output}/ai-chat-full-view.png` });
  await panel.getByRole('button', { name: 'Exit Full View', exact: true }).click();
  assert.equal(await page.locator('.record-sticky-header').evaluate((node) => node.inert), false);
  await page.screenshot({ path: `${output}/ai-chat-conversation.png` });
  await page.reload();
  await page.getByRole('button', { name: 'Open AI Chat', exact: true }).click();
  await panel.getByRole('button', { name: 'Conversation History', exact: true }).click();
  assert.equal(
    await panel.locator('.ai-conversation-entry').count(),
    0,
    'History is cleared on reload',
  );
}

async function captureMonitorHistoryColumns() {
  user.role = 'admin';
  await page.goto(`${base}/monitors/${monitors[0].id}`);
  const heading = page.getByRole('columnheader', { name: 'Check Number', exact: true });
  await heading.waitFor();
  for (const viewport of [
    { width: 1440, height: 960 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    await heading.scrollIntoViewIfNeeded();
    const sizes = await heading.evaluate((node) => {
      const range = document.createRange();
      range.selectNodeContents(node);
      const text = range.getBoundingClientRect(),
        cell = node.getBoundingClientRect(),
        next = node.nextElementSibling.getBoundingClientRect();
      return {
        textLeft: text.left,
        textRight: text.right,
        cellLeft: cell.left,
        cellRight: cell.right,
        nextLeft: next.left,
        width: cell.width,
      };
    });
    assert.ok(
      sizes.width >= 140 &&
        sizes.textLeft >= sizes.cellLeft &&
        sizes.textRight <= sizes.cellRight &&
        sizes.textRight <= sizes.nextLeft,
      'Check Number heading has enough width without overlapping Checked At',
    );
  }
  await page.setViewportSize({ width: 1440, height: 960 });
  await heading.scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${output}/monitor-check-history.png` });
  await page.screenshot({ path: `${output}/monitor-check-now.png` });
}

async function captureNotificationHistory() {
  notificationCount = 61;
  notificationsRead = false;
  user.role = 'admin';
  await page.setViewportSize({ width: 1440, height: 960 });
  await page.goto(`${base}/dashboard`);
  await page.getByRole('button', { name: /^Notifications/ }).click();
  const dropdown = page.getByRole('region', { name: 'Notifications', exact: true });
  await dropdown.getByRole('tab', { name: 'Read', exact: true }).click();
  await page.waitForFunction(
    () => document.querySelectorAll('#notification-panel .notification-entry').length === 20,
  );
  assert.equal(await dropdown.locator('.notification-entry').count(), 20);
  await dropdown.getByRole('tab', { name: 'Unread', exact: true }).click();
  assert.equal(await dropdown.locator('.notification-entry').count(), 41);
  await page.screenshot({ path: `${output}/notifications-dropdown.png` });
  await dropdown.getByRole('link', { name: 'View All Notifications', exact: true }).click();
  await page.waitForURL(`${base}/notifications`);
  await page.getByRole('heading', { name: 'Notifications', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Load More', exact: true }).waitFor();
  assert.equal(await page.locator('.notification-history .notification-entry').count(), 50);
  await page.getByRole('button', { name: 'Load More', exact: true }).click();
  await page.waitForFunction(
    () => document.querySelectorAll('.notification-history .notification-entry').length === 61,
  );
  await page.screenshot({ path: `${output}/notifications-page.png` });
  await page.getByRole('tab', { name: 'Unread', exact: true }).click();
  await page.getByRole('button', { name: 'Mark all as read', exact: true }).click();
  await page.getByText('No notifications in this view.', { exact: true }).waitFor();
  await page.getByRole('tab', { name: 'Read', exact: true }).click();
  await page.getByRole('button', { name: 'Load More', exact: true }).click();
  await page.waitForFunction(
    () => document.querySelectorAll('.notification-history .notification-entry').length === 61,
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('.notification-history .notification-entry').last().scrollIntoViewIfNeeded();
  const last = await page.locator('.notification-history .notification-entry').last().boundingBox();
  assert.ok(last.y + last.height <= 844, 'Notification history remains scrollable on mobile');
  await page.locator('.page-scroll-area').evaluate((node) => {
    node.scrollTop = 0;
  });
  while (await page.getByRole('button', { name: 'Dismiss notification', exact: true }).count())
    await page.getByRole('button', { name: 'Dismiss notification', exact: true }).first().click();
  await page.screenshot({ path: `${output}/notifications-mobile.png` });
  await page.locator('.notification-history .notification-entry').first().click();
  await page.waitForURL(`${base}/incidents/${demoIncident.id}`);
  notificationCount = 1;
  notificationsRead = false;
  await page.setViewportSize({ width: 1440, height: 960 });
}

async function captureEventManagement() {
  user.role = 'admin';
  demoEventAlert.status = 'open';
  await page.setViewportSize({ width: 1440, height: 960 });
  await page.goto(`${base}/alerts`);
  await page.getByRole('columnheader', { name: 'State', exact: true }).waitFor();
  await page.getByRole('link', { name: 'ALT0000001', exact: true }).waitFor();
  await page.screenshot({ path: `${output}/events-alerts.png` });
  await page.getByRole('link', { name: 'ALT0000001', exact: true }).click();
  await page.waitForURL(`${base}/alerts/${demoEventAlert.id}`);
  await page.getByRole('button', { name: 'Record actions', exact: true }).click();
  await page.getByRole('button', { name: 'Acknowledge', exact: true }).click();
  assert.equal(demoEventAlert.status, 'open', 'Triage waits for explicit confirmation');
  await page
    .getByRole('dialog', { name: 'Change Alert State', exact: true })
    .getByRole('button', { name: 'Confirm', exact: true })
    .click();
  await page.waitForFunction(() =>
    document.querySelector('[aria-label="Record number"]')?.textContent.includes('ALT0000001'),
  );
  assert.equal(demoEventAlert.status, 'acknowledged');
  await page.screenshot({ path: `${output}/event-alert.png` });
  await page.getByRole('link', { name: 'Create Incident', exact: true }).click();
  await page.getByLabel('Title *', { exact: true }).waitFor();
  assert.equal(
    await page.getByLabel('Title *', { exact: true }).inputValue(),
    demoEventAlert.title,
  );
  await page.goto(`${base}/events/${demoExternalEvent.id}`);
  await page.getByRole('heading', { name: demoExternalEvent.title, exact: true }).waitFor();
  assert.equal(await page.getByRole('heading', { name: 'HTTP Status', exact: true }).count(), 0);
  await page.screenshot({ path: `${output}/external-event.png` });
  await page
    .getByRole('navigation', { name: 'Breadcrumb' })
    .getByRole('link', { name: 'Events', exact: true })
    .click();
  await page.waitForURL(`${base}/events`);
  await page.getByRole('columnheader', { name: 'HTTP Status', exact: true }).waitFor();
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 720 });
    await page.goto(`${base}/alerts/${demoEventAlert.id}`);
    await page.getByRole('heading', { name: demoEventAlert.title, exact: true }).waitFor();
    const scroll = page.locator('.record-scroll-area');
    await scroll.evaluate((el) => {
      el.scrollTop = el.scrollHeight;
    });
    const box = await scroll.evaluate((el) => ({
      top: el.scrollTop,
      height: el.clientHeight,
      total: el.scrollHeight,
    }));
    assert.ok(box.top + box.height >= box.total - 2, 'Alert bottom remains reachable');
  }
  await page.setViewportSize({ width: 1440, height: 960 });
  demoEventAlert.status = 'open';
}

async function captureSettingsAndKeywords() {
  user.role = 'admin';
  await page.setViewportSize({ width: 1440, height: 960 });
  await page.goto(`${base}/settings`);
  await page.getByRole('navigation', { name: 'Settings categories' }).waitFor();
  assert.equal(await page.getByRole('heading', { name: 'Demo Data', exact: true }).count(), 0);
  await page.screenshot({ path: `${output}/settings-navigation.png` });
  await page.getByRole('button', { name: 'Demo Data', exact: true }).click();
  await page.getByRole('heading', { name: 'Demo Data', exact: true }).waitFor();
  await page.reload();
  await page.getByRole('heading', { name: 'Demo Data', exact: true }).waitFor();
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 720 });
    const scroll = page.locator('.page-scroll-area, .record-scroll-area');
    await scroll.evaluate((el) => (el.scrollTop = el.scrollHeight));
    assert.ok(await scroll.evaluate((el) => el.scrollTop + el.clientHeight >= el.scrollHeight - 2));
  }
  await page.setViewportSize({ width: 1440, height: 960 });
  await page.goto(`${base}/monitors/new`);
  await page.getByRole('textbox', { name: 'Keyword', exact: true }).fill('healthy');
  await page.getByRole('combobox', { name: 'Trigger when', exact: true }).click();
  await page.getByRole('option', { name: 'Keyword is missing', exact: true }).click();
  await page.getByRole('textbox', { name: 'Keyword', exact: true }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${output}/monitor-keyword.png` });
  await page.addInitScript(() => {
    window.publicThemeFrames = [];
    window.publicBackgroundFrames = [];
    const observe = () => {
      if (location.pathname.startsWith('/status/public/')) {
        const color = getComputedStyle(document.documentElement).backgroundColor;
        if (window.publicBackgroundFrames.at(-1) !== color)
          window.publicBackgroundFrames.push(color);
      }
      if (
        location.pathname.startsWith('/status/public/') &&
        getComputedStyle(document.documentElement).visibility !== 'hidden'
      ) {
        const theme = document.documentElement.dataset.theme;
        if (window.publicThemeFrames.at(-1) !== theme) window.publicThemeFrames.push(theme);
      }
      requestAnimationFrame(observe);
    };
    requestAnimationFrame(observe);
  });
  for (const appearance of ['dark', 'light']) {
    statusAppearance = appearance;
    await page.goto(`${base}/status/public/${'9'.repeat(48)}`);
    await page.getByRole('button', { name: 'Toggle status page appearance' }).waitFor();
    assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), appearance);
    await page.getByRole('button', { name: 'Toggle status page appearance' }).click();
    await page.reload();
    await page.getByRole('button', { name: 'Toggle status page appearance' }).waitFor();
    assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), appearance);
    assert.equal(await page.evaluate(() => document.documentElement.style.visibility), '');
    await page.evaluate(
      () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
    );
    assert.deepEqual(
      await page.evaluate(() => window.publicThemeFrames),
      [appearance],
      'No frame paints the wrong public appearance on reload',
    );
    assert.deepEqual(
      await page.evaluate(() => window.publicBackgroundFrames),
      [appearance === 'dark' ? 'rgb(0, 0, 0)' : 'rgb(255, 255, 255)'],
      'The canvas uses the saved appearance from the first frame',
    );
  }
  statusAppearance = 'light';
}

async function verifyFormHeadingRows() {
  for (const role of ['admin', 'responder']) {
    user.role = role;
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 720 });
      for (const route of ['/incidents/new', '/tasks/new', '/knowledge/new']) {
        await page.goto(`${base}${route}`);
        await page.locator('.form-page form').first().waitFor();
        assert.equal(
          await page.locator('.form-page > div.flex.items-center.justify-between').count(),
          0,
          `${role} ${route}: no empty heading row`,
        );
        if (role === 'admin')
          await page.getByRole('button', { name: 'Form actions', exact: true }).waitFor();
        const scroll = page.locator('.record-scroll-area, .page-scroll-area');
        await scroll.evaluate((el) => {
          el.scrollTop = el.scrollHeight;
        });
        const metrics = await scroll.evaluate((el) => ({
          top: el.scrollTop,
          height: el.clientHeight,
          total: el.scrollHeight,
        }));
        assert.ok(
          metrics.top + metrics.height >= metrics.total - 2,
          'Bottom of form remains reachable',
        );
      }
    }
  }
  user.role = 'admin';
}

try {
  if (process.env.HELP_CAPTURE_FOCUS === 'status-timezone') {
    await page.goto(`${base}/status`);
    await page.getByRole('heading', { name: 'Service Status', exact: true }).waitFor();
    assert.equal(await page.getByText(/Partial day|History timezone:/).count(), 0);
    assert.equal(await page.getByText(/\(America\/New_York\)/).count(), 0);
    await page.screenshot({ path: `${output}/readme-status-dark.png` });
    await page.setViewportSize({ width: 390, height: 640 });
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.getByText(/Updated /).scrollIntoViewIfNeeded();
    assert.deepEqual(faults, []);
    await browser.close();
    process.exit(0);
  }
  if (process.env.HELP_CAPTURE_FOCUS === 'automation-headers') {
    user.role = 'admin';
    for (const [path, title] of [
      ['event-rules', 'Event Rules'],
      ['escalation-policies', 'Escalation Policies'],
      ['maintenance-windows', 'Maintenance Windows'],
    ]) {
      await page.goto(`${base}/${path}`);
      await page
        .locator('.record-header-actions')
        .getByRole('button', { name: 'Create', exact: true })
        .click();
      assert.equal(
        await page.getByRole('heading', { name: title, exact: true }).count(),
        1,
        'Breadcrumb owns the only page title',
      );
      await page
        .locator('.record-header-actions')
        .getByRole('button', { name: 'Save', exact: true })
        .waitFor();
      await page.getByRole('textbox', { name: 'Name', exact: true }).fill('Unsaved configuration');
      await page
        .locator('.record-header-actions')
        .getByRole('button', { name: 'Cancel', exact: true })
        .click();
      await page
        .getByRole('dialog', { name: 'Discard Unsaved Changes?', exact: true })
        .getByRole('button', { name: 'Discard Changes', exact: true })
        .click();
      await page
        .locator('.record-header-actions')
        .getByRole('button', { name: 'Create', exact: true })
        .waitFor();
    }
    await page.goto(`${base}/probe-agents`);
    await page
      .locator('.record-header-actions')
      .getByRole('button', { name: 'Create', exact: true })
      .waitFor();
    await page.screenshot({ path: `${output}/probe-agents.png` });
    assert.deepEqual(faults, []);
    console.log('Verified one title, header-only actions, and dirty Cancel on automation forms.');
    await browser.close();
    process.exit(0);
  }
  if (process.env.HELP_CAPTURE_FOCUS === 'alert-grouping') {
    user.role = 'admin';
    await page.goto(`${base}/alert-grouping`);
    const input = page.getByLabel('Alert grouping window (seconds)', { exact: true });
    await input.waitFor();
    await input.fill('301');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    assert.equal(workspaceConfig.alertGroupingSeconds, 30);
    await input.fill('0');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await page.getByText('Alert grouping saved.', { exact: true }).waitFor();
    assert.equal(workspaceConfig.alertGroupingSeconds, 0);
    await page.reload();
    assert.equal(await input.inputValue(), '0');
    await page.screenshot({ path: `${output}/alert-grouping-settings.png` });
    assert.deepEqual(faults, []);
    console.log('Verified Alert Grouping renders, validates, saves, and reloads.');
    await browser.close();
    process.exit(0);
  }
  if (process.env.HELP_CAPTURE_FOCUS === 'readonly-pencils') {
    user.role = 'admin';
    user.uiPreferences = { ...user.uiPreferences, rightCollapsed: true };
    await page.setViewportSize({ width: 390, height: 720 });
    await page.goto(`${base}/tasks/${tasks[0].id}`);
    const field = page.locator('[data-record-field="title"]').first();
    const pencil = page.getByRole('button', { name: 'Edit Title', exact: true });
    await pencil.scrollIntoViewIfNeeded();
    const valueBox = await field.locator('dd').boundingBox(),
      pencilBox = await pencil.boundingBox();
    assert.ok(
      pencilBox.x >= valueBox.x && pencilBox.x + pencilBox.width <= valueBox.x + valueBox.width,
    );
    assert.ok(
      pencilBox.y >= valueBox.y && pencilBox.y + pencilBox.height <= valueBox.y + valueBox.height,
    );
    await page.screenshot({ path: `${output}/task-field-readonly.png` });
    await pencil.press('Enter');
    await page.getByRole('textbox', { name: /^Title/ }).waitFor();
    await page.waitForFunction(
      () => document.activeElement?.closest('[data-record-field]')?.dataset.recordField === 'title',
    );
    assert.equal(await page.locator('.record-field-pencil').count(), 0);
    await page.getByRole('textbox', { name: /^Description/ }).waitFor();
    await page.screenshot({ path: `${output}/task-field-editing.png` });
    const titleInput = page.getByRole('textbox', { name: /^Title/ });
    const savedTitle = await titleInput.inputValue();
    await titleInput.fill('Unsaved task title');
    await page.getByRole('button', { name: 'Cancel', exact: true }).first().click();
    const discard = page.getByRole('dialog', { name: 'Discard Unsaved Changes?', exact: true });
    await discard.getByRole('button', { name: 'Keep Editing', exact: true }).click();
    assert.equal(await titleInput.inputValue(), 'Unsaved task title');
    await page.getByRole('button', { name: 'Cancel', exact: true }).first().click();
    await discard.getByRole('button', { name: 'Discard Changes', exact: true }).click();
    await page.getByRole('button', { name: 'Edit Title', exact: true }).click();
    assert.equal(await titleInput.inputValue(), savedTitle);

    await page.getByRole('button', { name: 'Cancel', exact: true }).first().click();
    await field.locator('dd').dblclick();
    await page.getByRole('textbox', { name: /^Title/ }).waitFor();
    await page.getByRole('button', { name: 'Cancel', exact: true }).first().click();
    await page.setViewportSize({ width: 1440, height: 960 });
    await page.goto(`${base}/services/${services[0].id}`);
    await nameInput.dblclick({ force: true });
    await page.waitForFunction(
      () => !document.querySelector('input[name="name"]')?.matches(':disabled'),
    );
    assert.equal(await page.locator('.record-field-pencil').count(), 0);
    await page.getByRole('button', { name: 'Cancel', exact: true }).first().click();
    await page.getByRole('button', { name: 'Edit Name', exact: true }).waitFor();
    await page.screenshot({ path: `${output}/service-field-readonly.png` });
    user.role = 'viewer';
    await page.goto(`${base}/tasks/${tasks[0].id}`);
    await field.locator('dd').waitFor();
    assert.equal(await page.locator('.record-field-pencil').count(), 0);
    await field.locator('dd').dblclick();
    assert.equal(await page.getByRole('button', { name: 'Save', exact: true }).count(), 0);
    assert.deepEqual(faults, []);
    console.log(
      'Verified read-only pencils, mobile inset, whole-record edit/focus, keyboard/double-click, and viewer restrictions.',
    );
    await browser.close();
    process.exit(0);
  }
  if (process.env.HELP_CAPTURE_FOCUS === 'immutable-record-fields') {
    user.role = 'admin';
    user.uiPreferences = { ...user.uiPreferences, rightCollapsed: true };
    await page.goto(`${base}/alerts/${demoEventAlert.id}`);
    const summary = page.getByRole('region', { name: 'Alert Details', exact: true });
    await summary.waitFor();
    for (const label of ['Title', 'Description']) await summary.locator('dt').getByText(label, { exact: true }).waitFor();
    const source = page.getByRole('region', { name: 'Source and Status', exact: true });
    for (const label of ['Source', 'Source Type', 'Status', 'Severity', 'Service', 'Latest Event']) await source.locator('dt').getByText(label, { exact: true }).waitFor();
    await source.locator(`a[href="/events/${demoExternalEvent.id}"]`).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Edit Record', exact: true }).count(), 0);
    await page.screenshot({ path: `${output}/event-alert.png` });
    await page.goto(`${base}/events/${demoExternalEvent.id}`);
    await page.getByRole('region', { name: 'Source and Correlation', exact: true }).waitFor();
    await page.locator(`a[href="/alerts/${demoEventAlert.id}"]`).waitFor();
    await page.screenshot({ path: `${output}/external-event.png` });
    await page.setViewportSize({ width: 390, height: 720 });
    await page.getByRole('tablist', { name: 'Related information', exact: true }).scrollIntoViewIfNeeded();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await page.goto(`${base}/records/audit/${demoAuditRows[0].id}`);
    await page.getByRole('region', { name: 'Audit Entry Details', exact: true }).waitFor();
    assert.ok(await page.locator('dt').count() > 0);
    assert.deepEqual(faults, []);
    console.log('Verified labeled alert/event/log fields, linked records, immutable controls and mobile scrolling.');
    await browser.close();
    process.exit(0);
  }
  if (process.env.HELP_CAPTURE_FOCUS === 'knowledge-base-edit') {
    demoArticles.push({ id: 'bbbbbbbbbbbbbbbbbbbbbbbc', number: 'KB0000001', title: 'Customer portal recovery', articleType: 'article', status: 'published', createdBy: 'Alex Demo', updatedAt: '2026-10-17T12:00:00Z', knowledgeBaseId: demoBases[0].id, summary: 'Verify service health and restore customer access.' });
    user.role = 'admin';
    user.uiPreferences = { ...user.uiPreferences, rightCollapsed: true };
    await page.goto(`${base}/knowledge/bases/${demoBases[0].id}`);
    const articles = page.getByRole('region', { name: 'Articles', exact: true });
    const name = page.getByRole('textbox', { name: 'Name', exact: true });
    await name.waitFor();
    for (let cycle = 0; cycle < 3; cycle++) {
      assert.equal(await articles.count(), 1, 'One article section before editing');
      await name.dblclick({ force: true });
      await page.getByRole('button', { name: 'Save', exact: true }).waitFor();
      assert.equal(await articles.count(), 1, 'One article section while editing');
      await page.getByRole('button', { name: 'Cancel', exact: true }).click();
      await page.getByRole('button', { name: 'Edit Record', exact: true }).waitFor();
      assert.equal(await articles.count(), 1, 'One article section after Cancel');
    }
    await page.getByRole('button', { name: 'Edit Record', exact: true }).click();
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await page.getByRole('button', { name: 'Edit Record', exact: true }).waitFor();
    assert.equal(await articles.count(), 1, 'One article section after Save');
    await page.screenshot({ path: `${output}/knowledge-base-articles.png` });
    await page.setViewportSize({ width: 390, height: 720 });
    await name.dblclick({ force: true });
    await page.getByRole('button', { name: 'Save', exact: true }).waitFor();
    assert.equal(await articles.count(), 1);
    await articles.scrollIntoViewIfNeeded();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    assert.deepEqual(faults, []);
    console.log('Verified a single article panel across repeated double-click Edit, Cancel, Save and mobile transitions.');
    await browser.close();
    process.exit(0);
  }
  if (process.env.HELP_CAPTURE_FOCUS === 'pin-details') {
    user.role = 'admin';
    tasks[0].number = 'TASK0000001';
    tasks[0].serviceName = 'Customer Portal';
    await page.goto(`${base}/tasks/${tasks[0].id}`);
    await page.getByRole('button', { name: 'Record actions', exact: true }).click();
    await page.getByRole('button', { name: 'Pin Record', exact: true }).click();
    const modal = page.getByRole('dialog', { name: 'Pin Record', exact: true });
    await modal.getByText('Task', { exact: true }).waitFor();
    await modal.getByRole('button', { name: 'Pin', exact: true }).click();
    await page.goto(`${base}/pinned`);
    await page.getByRole('heading', { name: 'Pinned', exact: true }).waitFor();
    await page.getByRole('link', { name: tasks[0].title, exact: true }).waitFor();
    await page.getByText('Task', { exact: true }).waitFor();
    await page.getByText('TASK0000001', { exact: false }).waitFor();
    await page.getByText('Service: Customer Portal', { exact: true }).waitFor();
    const beforeRename = structuredClone(pinnedRecords.items);
    await page.getByRole('button', { name: 'Edit Group Name: General', exact: true }).click();
    await page.getByRole('textbox', { name: 'Group Name', exact: true }).fill('   ');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    assert.equal(await page.getByRole('textbox', { name: 'Group Name', exact: true }).getAttribute('aria-invalid'), 'true');
    await page.getByRole('textbox', { name: 'Group Name', exact: true }).fill('Operations');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await page.getByRole('heading', { name: 'Operations', exact: true }).waitFor();
    assert.deepEqual(pinnedRecords.items, beforeRename);
    await page.reload();
    await page.getByRole('button', { name: 'Edit Group Name: Operations', exact: true }).click();
    await page.getByRole('textbox', { name: 'Group Name', exact: true }).fill('Discarded name');
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    await page.getByRole('heading', { name: 'Operations', exact: true }).waitFor();
    assert.equal(pinnedRecords.groups[0].name, 'Operations');
    await page.screenshot({ path: `${output}/pinned-records.png` });
    await page.setViewportSize({ width: 390, height: 720 });
    await page.getByRole('link', { name: tasks[0].title, exact: true }).scrollIntoViewIfNeeded();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    assert.deepEqual(faults, []);
    pinnedRecords.groups.push(...Array.from({ length: 12 }, (_, index) => ({
      id: `extra-${index}`, name: `Additional group ${index + 1}`,
    })));
    for (const viewport of [{ width: 1440, height: 700 }, { width: 390, height: 640 }]) {
      await page.setViewportSize(viewport);
      await page.reload();
      const bottom = page.getByRole('button', { name: 'Edit Group Name: Additional group 12', exact: true });
      await bottom.scrollIntoViewIfNeeded();
      await bottom.click();
      await page.getByRole('textbox', { name: 'Group Name', exact: true }).fill('Unsaved');
      await page.getByRole('button', { name: 'Cancel', exact: true }).click();
      assert.equal(await bottom.isVisible(), true);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    }
    console.log('Verified pin group rename, validation, persistence, Cancel, and desktop/mobile scrolling.');
    await browser.close();
    process.exit(0);
  }
  if (process.env.HELP_CAPTURE_FOCUS === 'standalone-tasks') {
    user.role = 'admin';
    user.uiPreferences = { ...user.uiPreferences, leftCollapsed: false };
    await page.goto(`${base}/tasks`);
    await page.getByRole('link', { name: 'List View', exact: true }).waitFor();
    assert.equal(await page.getByRole('combobox', { name: 'Project', exact: true }).count(), 0);
    const search = page.locator('.list-search-input').first();
    await search.waitFor();
    assert.equal(await search.locator('svg').count(), 1);
    await page.screenshot({ path: `${output}/readme-tasks-dark.png` });
    await page.getByRole('link', { name: 'List View', exact: true }).click();
    await page.getByRole('searchbox', { name: 'Search list', exact: true }).waitFor();
    const ascending = page.waitForRequest((req) => req.url().includes('/api/tasks?') && new URL(req.url()).searchParams.get('sortBy') === 'number' && new URL(req.url()).searchParams.get('order') === 'asc');
    await page.getByRole('button', { name: 'Record Number', exact: true }).click();
    await ascending;
    const descending = page.waitForRequest((req) => req.url().includes('/api/tasks?') && new URL(req.url()).searchParams.get('sortBy') === 'number' && new URL(req.url()).searchParams.get('order') === 'desc');
    await page.getByRole('button', { name: 'Record Number', exact: true }).click();
    await descending;
    await page.screenshot({ path: `${output}/tasks-list.png` });
    await page.goto(`${base}/tasks?view=archived`);
    await page.getByRole('button', { name: 'Archived Tasks actions', exact: true }).click();
    await page.getByRole('link', { name: 'Active Tasks', exact: true }).waitFor();
    await page.keyboard.press('Escape');
    assert.equal(await page.getByText('Only archived tasks are shown.', { exact: false }).count(), 0);
    await page.screenshot({ path: `${output}/task-archived.png` });
    await page.goto(`${base}/tasks/new`);
    await page.getByRole('textbox', { name: /^Title/ }).waitFor();
    assert.equal(await page.getByRole('combobox', { name: 'Project', exact: true }).count(), 0);
    await page.goto(`${base}/projects`);
    await page.waitForURL(`${base}/tasks`);
    await page.setViewportSize({ width: 390, height: 720 });
    await page.goto(`${base}/tasks?view=list`);
    await page.getByRole('searchbox', { name: 'Search list', exact: true }).waitFor();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    assert.deepEqual(faults, []);
    console.log('Verified standalone Tasks, project-free forms, legacy redirect and inset search icons on desktop/mobile.');
    await browser.close();
    process.exit(0);
  }
  if (process.env.HELP_CAPTURE_FOCUS === 'record-layouts') {
    user.role = 'admin';
    user.uiPreferences = { ...user.uiPreferences, rightCollapsed: true };
    await page.setViewportSize({ width: 1440, height: 960 });
    await page.goto(`${base}/tasks/fields`);
    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    await page.getByRole('button', { name: 'Add Section', exact: true }).click();
    await page.getByRole('textbox', { name: 'Section 1 name', exact: true }).fill('Assignment');
    await page.getByRole('combobox', { name: 'Columns', exact: true }).last().click();
    await page.getByRole('option', { name: 'Single Column', exact: true }).click();
    await page
      .getByRole('button', { name: /^Title.*System Field/ })
      .first()
      .click();
    await page.getByRole('combobox', { name: 'Section', exact: true }).click();
    await page.getByRole('option', { name: 'Assignment', exact: true }).click();
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await page.getByText('Form saved.', { exact: true }).waitFor();
    assert.equal(formLayouts.tasks.sections[0].label, 'Assignment');
    assert.equal(formLayouts.tasks.sections[0].showName, true);
    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    await page.getByRole('checkbox', { name: 'Show section name', exact: true }).uncheck();
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await page.getByText('Form saved.', { exact: true }).waitFor();
    assert.equal(formLayouts.tasks.sections[0].showName, false);
    await page.getByRole('button', { name: 'Close field settings', exact: true }).click();
    await page.screenshot({ path: `${output}/form-builder-sections.png` });
    await page.goto(`${base}/tasks/${tasks[0].id}`);
    const field = page.locator('[data-record-field="title"]').first();
    await field.waitFor();
    assert.equal(await page.locator('[data-form-section] h3').count(), 0);
    const sections = await page
      .locator('[data-form-section]')
      .evaluateAll((nodes) => nodes.map((node) => node.dataset.formSection));
    await page.setViewportSize({ width: 390, height: 720 });
    const pencil = page.getByRole('button', { name: 'Edit Title', exact: true });
    await pencil.scrollIntoViewIfNeeded();
    const valueBox = await field.locator('dd').boundingBox();
    const pencilBox = await pencil.boundingBox();
    assert.ok(
      pencilBox.x >= valueBox.x && pencilBox.x + pencilBox.width <= valueBox.x + valueBox.width,
      'Pencil stays inside the read-only value',
    );
    assert.ok(
      pencilBox.y >= valueBox.y && pencilBox.y + pencilBox.height <= valueBox.y + valueBox.height,
      'Pencil is vertically within the field',
    );
    await page.screenshot({ path: `${output}/task-field-readonly.png` });
    await pencil.click();
    await page.getByRole('textbox', { name: /^Title/ }).waitFor();
    await page.waitForFunction(
      () => document.activeElement?.closest('[data-record-field]')?.dataset.recordField === 'title',
    );
    assert.equal(
      await page.locator('.record-field-pencil').count(),
      0,
      'Edit mode has no pencil affordances',
    );
    assert.deepEqual(
      await page
        .locator('[data-form-section]')
        .evaluateAll((nodes) => nodes.map((node) => node.dataset.formSection)),
      sections,
    );
    await page.screenshot({ path: `${output}/task-field-editing.png` });
    await page.getByRole('button', { name: 'Cancel', exact: true }).first().click();
    await field.locator('dd').dblclick();
    await page.getByRole('textbox', { name: /^Title/ }).waitFor();
    await page.getByRole('button', { name: 'Cancel', exact: true }).first().click();
    await page.setViewportSize({ width: 1440, height: 960 });
    await page.goto(`${base}/services/${services[0].id}`);
    const nameInput = page.getByRole('textbox', { name: /^Name/ }).first();
    await nameInput.waitFor();
    assert.equal(await nameInput.isDisabled(), true);
    await nameInput.dblclick({ force: true });
    await page.waitForFunction(
      () => !document.querySelector('input[name="name"]')?.matches(':disabled'),
    );
    assert.equal(await page.locator('.record-field-pencil').count(), 0);
    await page.screenshot({ path: `${output}/service-field-editing.png` });
    user.role = 'viewer';
    await page.goto(`${base}/tasks/${tasks[0].id}`);
    await page.locator('[data-record-field="title"] dd').dblclick();
    assert.equal(await page.getByRole('button', { name: 'Save', exact: true }).count(), 0);
    assert.equal(
      await page.locator('.record-field-pencil').count(),
      0,
      'Viewers cannot edit fields',
    );
    assert.deepEqual(faults, []);
    console.log(
      'Verified section configuration, matching layouts, double-click editing, permission checks and mobile pencil spacing.',
    );
    await browser.close();
    process.exit(0);
  }
  if (process.env.HELP_CAPTURE_FOCUS === 'event-navigation') {
    user.role = 'admin';
    await page.goto(`${base}/events`);
    const link = page.getByRole('link', { name: /^EVT0000001$/, exact: true });
    await link.click();
    const nav = page.locator('.desktop-sidebar nav');
    assert.equal(
      await nav.getByRole('link', { name: 'Events', exact: true }).getAttribute('aria-current'),
      'page',
    );
    assert.equal(
      await nav.getByRole('link', { name: 'Monitors', exact: true }).getAttribute('aria-current'),
      null,
    );
    const crumbs = page.getByRole('navigation', { name: 'Breadcrumb', exact: true });
    await crumbs.getByRole('link', { name: /^Monitor:/ }).waitFor();
    assert.equal(await crumbs.getByRole('link', { name: 'Events', exact: true }).getAttribute('href'), '/events');
    await page.reload();
    await crumbs.getByRole('link', { name: /^Monitor:/ }).waitFor();
    await nav.getByRole('link', { name: 'Events', exact: true }).waitFor();
    assert.equal(
      await nav.getByRole('link', { name: 'Events', exact: true }).getAttribute('aria-current'),
      'page',
    );
    const eventId = new URL(page.url()).pathname.split('/').at(-1);
    await page.goto(`${base}/events/${eventId}`);
    await crumbs.getByRole('link', { name: /^Monitor:/ }).waitFor();
    assert.equal(await crumbs.getByRole('link', { name: 'Events', exact: true }).getAttribute('href'), '/events');
    await page.screenshot({ path: `${output}/monitor-event-breadcrumbs.png` });
    await page.goto(`${base}/events/${demoExternalEvent.id}`);
    await page.getByRole('region', { name: 'Source and Correlation', exact: true }).waitFor();
    assert.equal(await crumbs.getByRole('link', { name: /^Monitor:/ }).count(), 0);
    assert.deepEqual(faults, []);
    console.log(
      'Verified monitor breadcrumbs on both event routes and Events navigation on record open and reload.',
    );
    await browser.close();
    process.exit(0);
  }
  if (process.env.HELP_CAPTURE_FOCUS === 'navigation-groups') {
    user.role = 'admin';
    user.uiPreferences = { ...user.uiPreferences, leftCollapsed: false };
    await page.setViewportSize({ width: 1440, height: 960 });
    await page.goto(`${base}/help?topic=getting-started`);
    const nav = page.locator('.desktop-sidebar nav[aria-label="Main navigation"]');
    await nav.getByRole('button', { name: 'Automation & Connections', exact: true }).waitFor();
    const expected = [
      'Dashboard',
      'Incidents',
      'Services',
      'Tasks',
      'Pinned',
      'Alerts',
      'Events',
      'Monitors',
      'On Call',
      'Knowledge',
      'RCAs',
      'Operational Reporting',
      'Status Page',
      'Event Rules',
      'Escalation Policies',
      'Maintenance Windows',
      'Alert Grouping',
      'Integrations',
      'Probe Agents',
    ];
    assert.deepEqual(await nav.getByRole('link').allTextContents(), expected);
    for (const heading of await nav.locator('.sidenav-group-heading').all()) {
      assert.equal(
        await heading.locator('span').evaluate((node) => getComputedStyle(node).whiteSpace),
        'nowrap',
      );
    }
    const monitor = nav.getByRole('button', { name: 'Monitor & Respond', exact: true });
    await monitor.focus();
    await page.keyboard.press('Enter');
    assert.equal(await monitor.getAttribute('aria-expanded'), 'false');
    assert.equal(await nav.getByRole('link', { name: 'Monitors', exact: true }).count(), 0);
    await page.reload();
    await monitor.waitFor();
    assert.equal(await monitor.getAttribute('aria-expanded'), 'false');
    await page.goto(`${base}/monitors`);
    await page.waitForFunction(
      () =>
        document
          .querySelector('[aria-controls="sidenav-monitor"]')
          ?.getAttribute('aria-expanded') === 'true',
    );
    const last = nav.getByRole('link', { name: 'Probe Agents', exact: true });
    await last.scrollIntoViewIfNeeded();
    assert.ok((await last.boundingBox()).y < 960, 'Last sidebar link reachable');
    await nav.evaluate((el) => (el.scrollTop = 0));
    await page.screenshot({ path: `${output}/navigation-groups.png` });
    await page.getByRole('button', { name: 'Collapse navigation', exact: true }).click();
    const main = expected.slice(0, 5);
    assert.deepEqual(await nav.getByRole('link').allTextContents(), main);
    await nav.getByRole('button', { name: 'More', exact: true }).click();
    const menu = page.locator('.action-menu:popover-open');
    assert.deepEqual(await menu.getByRole('link').allTextContents(), expected.slice(5));
    await page.keyboard.press('Escape');
    await page.setViewportSize({ width: 390, height: 720 });
    await page.getByRole('button', { name: 'Open navigation', exact: true }).click();
    const mobile = page.getByRole('dialog', { name: 'Navigation', exact: true });
    assert.deepEqual(
      await mobile.getByRole('navigation').getByRole('link').allTextContents(),
      main,
    );
    await mobile.getByRole('button', { name: 'More', exact: true }).click();
    assert.deepEqual(
      await page.locator('.action-menu:popover-open').getByRole('link').allTextContents(),
      expected.slice(5),
    );
    await page.screenshot({ path: `${output}/navigation-groups-mobile.png` });
    await page
      .locator('.action-menu:popover-open')
      .getByRole('link', { name: 'Integrations', exact: true })
      .click();
    await page.waitForURL(`${base}/integrations`);
    assert.equal(await mobile.isVisible(), false);
    await page.setViewportSize({ width: 1440, height: 720 });
    user.uiPreferences = { ...user.uiPreferences, leftCollapsed: false, colorScheme: 'white' };
    for (const role of ['responder', 'viewer', 'user', 'admin']) {
      user.role = role;
      await page.goto(`${base}/help`);
      const expand = page.getByRole('button', { name: 'Expand Navigation', exact: true });
      await nav.getByRole('link', { name: role === 'user' ? 'My incidents' : 'Dashboard', exact: true }).waitFor();
      if (await expand.count()) await expand.click({ timeout: 1500 }).catch(() => {});
      await nav
        .getByRole('link', { name: role === 'user' ? 'My incidents' : 'Dashboard', exact: true })
        .waitFor();
      assert.equal(
        await nav.getByRole('button', { name: 'Automation & Connections', exact: true }).count(),
        role === 'admin' ? 1 : 0,
      );
      if (role === 'user')
        assert.deepEqual(await nav.getByRole('link').allTextContents(), ['My incidents', 'Pinned']);
    }
    await nav
      .getByRole('button', { name: 'Automation & Connections', exact: true })
      .scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${output}/navigation-groups-light.png` });
    assert.deepEqual(faults, []);
    console.log(
      'Verified group toggles, persistence, active expansion, single-line headers, shared order and mobile More.',
    );
    await browser.close();
    process.exit(0);
  }
  if (process.env.HELP_CAPTURE_FOCUS === 'help-topics') {
    await page.setViewportSize({ width: 1440, height: 960 });
    await page.goto(`${base}/help?topic=getting-started`);
    await page.getByRole('heading', { name: 'Getting Started', exact: true }).waitFor();
    for (const topic of helpTopics) {
      await page
        .getByRole('navigation', { name: 'Help topics' })
        .locator(`a[href="/help?topic=${topic.id}"]`)
        .click();
      await page
        .getByRole('article')
        .getByRole('heading', { name: topic.title, exact: true })
        .waitFor();
      const adjacent = page.getByRole('navigation', { name: 'Adjacent guides' });
      assert.equal(await adjacent.getByRole('link').count(), 2);
    }
    await page.goto(`${base}/help`);
    await page.getByRole('heading', { name: 'Browse Documentation', exact: true }).waitFor();
    await page.getByRole('searchbox', { name: 'Search documentation' }).fill('escalation');
    await page.getByRole('heading', { name: 'Search Results', exact: true }).waitFor();
    await page.goto(`${base}/help?topic=configuration`);
    await page
      .getByRole('article')
      .getByRole('heading', {
        name: helpTopics.find((topic) => topic.id === 'configuration').title,
        exact: true,
      })
      .waitFor();
    await page.screenshot({ path: `${output}/help-navigation.png` });
    await page.setViewportSize({ width: 390, height: 720 });
    await page.goto(`${base}/help?topic=getting-started`);
    await page.getByRole('heading', { name: 'Getting Started', exact: true }).waitFor();
    const scroll = page.locator('.page-scroll-area');
    await scroll.evaluate((el) => (el.scrollTop = el.scrollHeight));
    assert.ok(
      await scroll.evaluate((el) => el.scrollTop + el.clientHeight >= el.scrollHeight - 2),
      'Help bottom remains reachable',
    );
    assert.deepEqual(faults, []);
    console.log(
      'Verified every Help topic, adjacent links, overview, search and mobile scrolling.',
    );
    await browser.close();
    process.exit(0);
  }
  if (process.env.HELP_CAPTURE_FOCUS === 'quick-setup') {
    user.role = 'admin';
    await page.setViewportSize({ width: 1440, height: 960 });
    await page.goto(`${base}/`);
    await page.getByRole('link', { name: 'Quick Setup', exact: true }).click();
    await page.getByRole('textbox', { name: 'Service Name', exact: true }).fill('Customer API');
    await page.getByRole('button', { name: 'Create Service', exact: true }).click();
    await page
      .getByRole('textbox', { name: 'Endpoint URL', exact: true })
      .fill('https://example.com/health');
    await page.getByRole('button', { name: 'Create Monitor', exact: true }).click();
    await page.getByRole('heading', { name: 'Notifications (optional)', exact: true }).waitFor();
    await page.screenshot({ path: `${output}/quick-setup.png` });
    await page.getByRole('button', { name: 'Skip', exact: true }).click();
    await page.getByRole('heading', { name: 'On Call (optional)', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Skip', exact: true }).click();
    await page.getByText('Your service and monitor are saved.', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Create', exact: true }).click();
    await page
      .getByRole('dialog', { name: 'Create', exact: true })
      .getByRole('link', { name: /Quick Setup/ })
      .click();
    await page.getByRole('textbox', { name: 'Service Name', exact: true }).waitFor();
    await page.setViewportSize({ width: 390, height: 720 });
    await page
      .getByRole('button', { name: 'Create Service', exact: true })
      .scrollIntoViewIfNeeded();
    assert.deepEqual(faults, []);
    console.log('Verified Quick Setup dashboard/global entry points and optional steps.');
    await browser.close();
    process.exit(0);
  }
  if (process.env.HELP_CAPTURE_FOCUS === 'sidebar-drawer') {
    user.role = 'admin';
    await page.setViewportSize({ width: 1440, height: 960 });
    await page.goto(`${base}/settings`);
    const expand = page.getByRole('button', { name: 'Expand Navigation', exact: true });
    if (await expand.count()) await expand.click();
    const nav = page.locator('.desktop-sidebar nav');
    await nav.getByRole('link', { name: 'Alert Grouping', exact: true }).click();
    await page.getByLabel('Alert grouping window (seconds)', { exact: true }).waitFor();
    await page.screenshot({ path: `${output}/alert-grouping-settings.png` });
    await nav.getByRole('link', { name: 'Integrations', exact: true }).click();
    await page.waitForURL(`${base}/integrations`);
    await page.getByRole('button', { name: 'Collapse navigation', exact: true }).click();
    await page
      .locator('.desktop-sidebar')
      .getByRole('button', { name: 'More', exact: true })
      .click();
    await page
      .locator('.desktop-sidebar')
      .getByRole('link', { name: 'Alert Grouping', exact: true })
      .click();
    await page.waitForURL(`${base}/alert-grouping`);
    await page.goto(`${base}/settings`);
    const settings = page.getByRole('navigation', { name: 'Settings categories' });
    assert.equal(
      await settings.getByRole('button', { name: 'Integrations', exact: true }).count(),
      0,
    );
    assert.equal(
      await settings.getByRole('button', { name: 'Alert Grouping', exact: true }).count(),
      0,
    );
    await page.screenshot({ path: `${output}/settings-navigation.png` });
    await page.setViewportSize({ width: 390, height: 720 });
    await page.getByRole('button', { name: 'Open navigation', exact: true }).click();
    const mobile = page.getByRole('dialog', { name: 'Navigation', exact: true });
    await mobile.getByRole('link', { name: 'Integrations', exact: true }).scrollIntoViewIfNeeded();
    await mobile.getByRole('link', { name: 'Integrations', exact: true }).click();
    await page.waitForURL(`${base}/integrations`);
    assert.deepEqual(faults, []);
    console.log(
      'Verified drawer toggle and main navigation destinations across desktop, collapsed and mobile views.',
    );
    await browser.close();
    process.exit(0);
  }
  if (process.env.HELP_CAPTURE_FOCUS === 'event-related-bottom') {
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 844 });
      await page.goto(`${base}/events`);
      await page.getByRole('link', { name: 'EVT0000001', exact: true }).click();
      await page.getByRole('tab', { name: /^Incidents/ }).waitFor();
      const related = page.locator('.record-scroll-area .related-lists');
      assert.equal(
        await related.evaluate((el) => el.nextElementSibling),
        null,
        'Monitor relationships follow all diagnostics',
      );
      await related.scrollIntoViewIfNeeded();
      await page.getByRole('tab', { name: /^Alerts/ }).click();
      await page.getByRole('tabpanel', { name: /^Alerts/ }).waitFor();
      await page.getByRole('tab', { name: /^Incidents/ }).click();
      await page.screenshot({ path: `${output}/monitor-event-related-${width}.png` });
      await page.goto(`${base}/events/${demoExternalEvent.id}`);
      await page.getByRole('tab', { name: /^Incidents/ }).waitFor();
      assert.equal(
        await related.evaluate((el) => el.nextElementSibling),
        null,
        'External relationships remain below the payload',
      );
    }
    assert.deepEqual(faults, []);
    await browser.close();
    process.exit();
  }
  if (process.env.HELP_CAPTURE_FOCUS === 'event-filters') {
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 844 });
      await page.goto(`${base}/events`);
      await page.getByRole('button', { name: 'Filters', exact: true }).click();
      const panel = page.getByRole('dialog', { name: 'Filter', exact: true });
      await panel.waitFor();
      const from = await panel.getByLabel('From', { exact: true }).boundingBox();
      const to = await panel.getByLabel('To', { exact: true }).boundingBox();
      assert.ok(Math.abs(from.y - to.y) < 2, 'Dates stay on the same row');
      await panel.getByRole('combobox', { name: 'Filter Column' }).click();
      await page.getByRole('option', { name: 'External ID', exact: true }).click();
      const contains = panel.getByRole('textbox', { name: 'Column Contains' });
      await contains.fill('release-42');
      assert.ok((await contains.boundingBox()).width > 280, 'Column condition spans the panel');
      assert.equal(await panel.getByRole('searchbox').count(), 0);
      assert.equal(await panel.evaluate((el) => el.scrollWidth > el.clientWidth + 1), false);
      await panel.evaluate((el) => (el.scrollTop = el.scrollHeight));
      await panel.getByRole('button', { name: 'Done', exact: true }).waitFor();
      await panel.evaluate((el) => (el.scrollTop = 0));
      await page.screenshot({ path: `${output}/events-filter-${width}.png` });
      await panel.getByRole('button', { name: 'Done', exact: true }).click();
      await page.reload();
      await page.getByRole('button', { name: 'Filters', exact: true }).click();
      assert.equal(
        await panel.getByRole('textbox', { name: 'Column Contains' }).inputValue(),
        'release-42',
      );
      await panel.getByRole('textbox', { name: 'Column Contains' }).fill('');
    }
    await browser.close();
    process.exit();
  }
  if (process.env.HELP_CAPTURE_FOCUS === 'settings-keyword') {
    await captureSettingsAndKeywords();
    assert.deepEqual(faults, []);
    console.log('Verified Settings navigation, keyword controls, and public appearance reload.');
    process.exitCode = 0;
    await browser.close();
    process.exit();
  }
  if (process.env.HELP_CAPTURE_FOCUS === 'event-management') {
    await captureEventManagement();
    assert.deepEqual(faults, []);
    console.log(
      'Verified event/alert navigation, confirmed triage, incident prefill and desktop/mobile scrolling.',
    );
    await browser.close();
    process.exit(0);
  }
  if (process.env.HELP_CAPTURE_FOCUS === 'tab-frame') {
    await page.goto(`${base}/tasks/${tasks[0].id}`);
    await page
      .getByRole('link', { name: 'Demo Customer Portal (opens in an app record tab)', exact: true })
      .click();
    const tabs = page.getByRole('tablist', { name: 'Record tabs', exact: true });
    await tabs.waitFor();
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 960 });
      for (const theme of ['light', 'dark']) {
        await page.evaluate((theme) => {
          document.documentElement.dataset.theme = theme;
        }, theme);
        for (const index of [0, 1]) {
          await tabs.getByRole('tab').nth(index).click();
          const tab = await page
            .locator('.record-navigation-tab[data-active="true"]')
            .boundingBox();
          const main = await page.locator('#main').boundingBox();
          assert.ok(
            Math.abs(tab.y + tab.height - main.y) <= 1,
            'Active tab joins content without a gap',
          );
          const corners = await page
            .locator('#main')
            .evaluate((el) => [
              getComputedStyle(el).borderTopLeftRadius,
              getComputedStyle(el).borderTopRightRadius,
            ]);
          assert.deepEqual(corners, ['0px', '0px']);
        }
      }
    }
    await page.setViewportSize({ width: 1440, height: 960 });
    await tabs.getByRole('tab').first().click();
    await page.screenshot({ path: `${output}/record-tabs.png` });
    assert.deepEqual(faults, []);
    console.log(
      'Verified seamless tab/content joins for first and later tabs in light/dark desktop/mobile views.',
    );
    await browser.close();
    process.exit(0);
  }
  if (process.env.HELP_CAPTURE_FOCUS === 'form-heading') {
    await verifyFormHeadingRows();
    assert.deepEqual(faults, []);
    console.log(
      'Verified no empty form heading rows, retained admin actions and desktop/mobile scrolling.',
    );
    await browser.close();
    process.exit(0);
  }
  if (process.env.HELP_CAPTURE_FOCUS === 'notifications') {
    await captureNotificationHistory();
    assert.deepEqual(faults, []);
    console.log(
      'Verified notification tabs, full history pagination, read state, links and mobile scrolling.',
    );
    await browser.close();
    process.exit(0);
  }
  if (process.env.HELP_CAPTURE_FOCUS === 'monitor-history') {
    await captureMonitorHistoryColumns();
    assert.deepEqual(faults, []);
    console.log('Verified readable monitor check headings at desktop/mobile widths.');
    await browser.close();
    process.exit(0);
  }
  if (process.env.HELP_CAPTURE_FOCUS === 'chat-workspace') {
    await captureChatWorkspace();
    assert.deepEqual(faults, []);
    console.log(
      'Verified chat history, read-only past proposals, stable reply scrolling and responsive full view.',
    );
    await browser.close();
    process.exit(0);
  }
  if (process.env.HELP_CAPTURE_FOCUS === 'mobile-nav') {
    await captureMobileNavigation();
    assert.deepEqual(faults, []);
    console.log('Verified mobile action ordering, menus, viewport bounds and desktop restoration.');
    await browser.close();
    process.exit(0);
  }
  if (process.env.HELP_CAPTURE_FOCUS === 'readme') {
    await captureReadmeRecords();
    await captureOverview();
    await page.goto(`${base}/tasks`);
    await page.getByRole('link', { name: 'List View', exact: true }).waitFor();
    await page.screenshot({ path: `${output}/readme-tasks-dark.png` });
    if (!demoArticles.length)
      demoArticles.push({
        id: 'eeeeeeeeeeeeeeeeeeeeeeee',
        number: 'KB0000001',
        title: 'Checkout recovery guide',
        summary: 'Restore availability and verify recovery.',
        articleType: 'runbook',
        status: 'published',
        revision: 0,
        createdBy: 'Alex Demo',
        updatedAt: '2026-10-10T17:05:06Z',
        content: 'Review dependency health and document recovery.',
        steps: [
          {
            title: 'Check dependency health',
            instructions: 'Review service status and recent monitor results.',
          },
          {
            title: 'Restore service',
            instructions: 'Apply the documented recovery steps and verify availability.',
          },
          {
            title: 'Record the outcome',
            instructions: 'Document recovery checks and follow-up work.',
          },
        ],
        fields: workBuiltinFields('knowledge'),
        custom: {},
      });
    await page.goto(`${base}/knowledge/${demoArticles[0].id}`);
    await page.getByRole('heading', { name: 'Step-by-Step Process', exact: true }).waitFor();
    await page.screenshot({ path: `${output}/readme-runbook-dark.png` });
    await page.goto(`${base}/status`);
    await page.getByRole('heading', { name: 'Service Status', exact: true }).waitFor();
    await page.screenshot({ path: `${output}/readme-status-dark.png` });
    assert.deepEqual(faults, []);
    console.log('Captured record previews with expanded and collapsed navigation.');
    await browser.close();
    process.exit(0);
  }
  if (process.env.HELP_CAPTURE_FOCUS === 'navigation') {
    await captureNavigation();
    assert.deepEqual(faults, []);
    console.log(
      'Verified infinite loading/retry/search, article/history breadcrumbs and independent Help navigation.',
    );
    await browser.close();
    process.exit(0);
  }
  if (process.env.HELP_CAPTURE_FOCUS === 'overview') {
    await captureOverview();
    assert.deepEqual(faults, []);
    console.log('Verified updated assignment panels, removed heading and mobile scrolling.');
    await browser.close();
    process.exit(0);
  }
  if (process.env.HELP_CAPTURE_FOCUS === 'collaboration') {
    await captureCollaboration();
    assert.deepEqual(faults, []);
    console.log(
      'Verified mentions, watchers, notification panel, task-card actions and mobile scrolling.',
    );
    await browser.close();
    process.exit(0);
  }
  if (process.env.HELP_CAPTURE_FOCUS === 'intervals') {
    await captureMonitorIntervals();
    assert.deepEqual(faults, []);
    console.log('Verified interval conversion, invalid saves and canonical minute payloads.');
    await browser.close();
    process.exit(0);
  }
  if (process.env.HELP_CAPTURE_FOCUS === 'exports') {
    await captureRecordExports();
    assert.deepEqual(faults, []);
    console.log(
      'Verified article-style RCAs, record CSV/PDF downloads, audit/event exports and mobile scrolling.',
    );
    await browser.close();
    process.exit(0);
  }
  if (process.env.HELP_CAPTURE_FOCUS === 'incident-source') {
    await captureIncidentSource();
    assert.deepEqual(faults, []);
    console.log('Verified incident source badge, origin links and server filter.');
    await browser.close();
    process.exit(0);
  }
  if (process.env.HELP_CAPTURE_FOCUS === 'references') {
    await captureLongReferences();
    assert.deepEqual(faults, []);
    console.log('Verified long single and multiple reference labels and visible icons on mobile.');
    await browser.close();
    process.exit(0);
  }
  if (process.env.HELP_CAPTURE_FOCUS === 'rcas') {
    await captureRcaWorkflows();
    assert.deepEqual(faults, []);
    console.log(
      'Verified global and list Create actions, linked RCA records, mobile scrolling, and alert grouping settings.',
    );
    await browser.close();
    process.exit(0);
  }

  await page.goto(`${base}/profile`);
  await page.getByRole('radio', { name: 'Default', exact: true }).waitFor();
  assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), 'dark');
  assert.equal(
    await page.evaluate(() => getComputedStyle(document.body).backgroundColor),
    'rgb(0, 0, 0)',
  );
  await page
    .getByRole('heading', { name: 'Theme', exact: true })
    .evaluate((element) => element.scrollIntoView({ block: 'start', behavior: 'instant' }));
  await page.screenshot({ path: `${output}/theme-black.png` });
  await page.getByRole('radio', { name: 'Light', exact: true }).check();
  await page.waitForFunction(
    () =>
      document.documentElement.dataset.theme === 'light' &&
      getComputedStyle(document.body).backgroundColor === 'rgb(255, 255, 255)',
  );
  await page.screenshot({ path: `${output}/theme-white.png` });
  await page.goto(`${base}/services`);
  await page.getByRole('link', { name: services[0].name, exact: true }).waitFor();
  const headerCenters = await page.locator('.desktop-sidebar').evaluate((rail) => {
    const targets = [
      rail.querySelector('a[aria-label="ServiceTrident dashboard"] [data-brand-mark]'),
      rail.querySelector('button[aria-label="Collapse navigation"] svg'),
    ];
    return targets.map((target) => {
      const rect = target.getBoundingClientRect();
      return rect.y + rect.height / 2;
    });
  });
  assert.ok(Math.max(...headerCenters) - Math.min(...headerCenters) < 1);
  assert.ok(
    await page.evaluate(
      () =>
        Math.abs(
          document.querySelector('.desktop-sidebar nav a').getBoundingClientRect().top -
            document.querySelector('#main').getBoundingClientRect().top,
        ) < 1,
    ),
    'Main navigation starts level with the content frame',
  );

  const expandedOrder = await page
    .locator('.desktop-sidebar nav[aria-label="Main navigation"] a')
    .evaluateAll((links) => links.map((link) => link.getAttribute('href')));
  await page.getByRole('button', { name: 'Collapse navigation', exact: true }).click();
  await page.waitForFunction(() => {
    const rail = document.querySelector('.desktop-sidebar');
    return Math.abs(rail.getBoundingClientRect().width - 64) < 1;
  });
  assert.deepEqual(
    await page
      .locator('.desktop-sidebar nav[aria-label="Main navigation"] a')
      .evaluateAll((links) => links.map((link) => link.getAttribute('href'))),
    expandedOrder,
  );
  await page
    .locator('.desktop-sidebar')
    .getByRole('link', { name: 'Services', exact: true })
    .waitFor();
  const moreShape = await page
    .locator('.desktop-sidebar button[aria-label="More"] svg path')
    .evaluate((path) => {
      const bounds = path.getBBox();
      return bounds.width > bounds.height;
    });
  assert.equal(moreShape, true, 'Sidenav More uses a horizontal ellipsis');
  await page.locator('.desktop-sidebar').getByRole('button', { name: 'More', exact: true }).click();
  await page
    .locator('.desktop-sidebar nav .action-menu')
    .getByRole('link', { name: 'Knowledge', exact: true })
    .waitFor();
  assert.deepEqual(
    await page
      .locator('.desktop-sidebar nav[aria-label="Main navigation"] a')
      .evaluateAll((links) =>
        links
          .filter((link) => link.getBoundingClientRect().height > 0)
          .map((link) => link.getAttribute('href')),
      ),
    expandedOrder,
  );
  await page.screenshot({ path: `${output}/sidenav-more.png` });
  await page.locator('.desktop-sidebar nav .action-menu').press('Escape');
  const compactCenters = await page.locator('.desktop-sidebar').evaluate((rail) => {
    const targets = [
      rail.querySelector('[data-brand-mark]'),
      rail.querySelector('button[aria-label="Expand Navigation"]'),
    ];
    return targets.map((target) => {
      const rect = target.getBoundingClientRect();
      return rect.x + rect.width / 2;
    });
  });
  assert.ok(Math.max(...compactCenters) - Math.min(...compactCenters) < 1);
  await page.getByRole('button', { name: 'Expand Navigation', exact: true }).click();
  await page.waitForFunction(
    () =>
      Math.abs(document.querySelector('.desktop-sidebar').getBoundingClientRect().width - 288) < 1,
  );
  assert.equal(
    await page
      .locator('.app-topbar')
      .getByRole('button', { name: 'Search Workspace', exact: true })
      .count(),
    1,
  );
  assert.equal(
    await page
      .locator('.desktop-sidebar')
      .getByRole('button', { name: 'Search Workspace', exact: true })
      .count(),
    0,
  );
  const footerHeight = await page
    .locator('.table-pagination')
    .evaluate((el) => el.getBoundingClientRect().height);
  assert.ok(footerHeight >= 44 && footerHeight < 64, 'List pagination uses a compact footer');
  const paging = await page.locator('.table-pagination').evaluate((el) => ({
    left: el.getBoundingClientRect().left,
    buttons: el.querySelector('button[aria-label="Go to First Page"]').getBoundingClientRect().left,
  }));
  assert.ok(
    paging.buttons - paging.left < 24,
    'Pagination actions stay at the left, clear of chat',
  );

  await page.screenshot({ path: `${output}/services.png` });
  const standardPadding = await page
    .locator('.data-table tbody td')
    .first()
    .evaluate((cell) => parseFloat(getComputedStyle(cell).paddingTop));
  await page.getByRole('button', { name: 'Services actions', exact: true }).click();
  await page.getByRole('switch', { name: 'Compact Rows', exact: true }).check();
  await page.waitForFunction(
    () => document.querySelector('.data-table')?.dataset.compact === 'true',
  );
  assert.equal(user.uiPreferences.compactTables, true);
  assert.ok(
    (await page
      .locator('.data-table tbody td')
      .first()
      .evaluate((cell) => parseFloat(getComputedStyle(cell).paddingTop))) < standardPadding,
  );
  await page.keyboard.press('Escape');
  await page.reload();
  await page.getByRole('link', { name: services[0].name, exact: true }).waitFor();
  assert.equal(await page.locator('.data-table').getAttribute('data-compact'), 'true');
  await page.getByRole('button', { name: 'Services actions', exact: true }).click();
  await page.screenshot({ path: `${output}/table-compact-toggle.png` });
  await page.getByRole('switch', { name: 'Compact Rows', exact: true }).uncheck();
  await page.waitForFunction(
    () => document.querySelector('.data-table')?.dataset.compact === 'false',
  );
  await page.keyboard.press('Escape');
  const filtersButton = page.getByRole('button', { name: 'Filters', exact: true });
  await filtersButton.click();
  const filtersDialog = page.getByRole('dialog', { name: 'Filter', exact: true });
  await filtersDialog.waitFor();
  assert.equal(await page.locator('dialog:modal').count(), 0);
  assert.ok((await filtersDialog.boundingBox()).width <= 416);
  assert.equal(await filtersDialog.getByRole('searchbox').count(), 0);
  const outsideSearch = page.getByRole('searchbox', { name: 'Search list', exact: true });
  await filtersDialog.getByRole('combobox', { name: 'Filter Column' }).click();
  await page.getByRole('option', { name: 'Service', exact: true }).click();
  await filtersDialog.getByRole('textbox', { name: 'Column Contains' }).fill('Customer Portal');
  await page.screenshot({ path: `${output}/table-filters-modal.png` });
  await filtersDialog.getByRole('button', { name: 'Done', exact: true }).click();
  await page
    .getByRole('link', { name: services[1].name, exact: true })
    .waitFor({ state: 'hidden' });
  assert.equal(await outsideSearch.inputValue(), '');
  await page.reload();
  await filtersButton.click();
  assert.equal(
    await filtersDialog.getByRole('textbox', { name: 'Column Contains' }).inputValue(),
    'Customer Portal',
  );
  await filtersDialog.getByRole('textbox', { name: 'Column Contains' }).fill('');
  await page.keyboard.press('Escape');
  await page.getByRole('link', { name: services[1].name, exact: true }).waitFor();
  await page.goto(`${base}/monitors`);
  assert.equal(
    await page.getByRole('dialog').count(),
    0,
    'Filter dialogs do not reopen on another route',
  );
  await page.getByRole('link', { name: monitors[0].name, exact: true }).waitFor();
  await page.screenshot({ path: `${output}/monitoring.png` });
  await page.goto(`${base}/monitors/${monitors[0].id}`);
  await page.getByRole('button', { name: 'Check Now', exact: true }).waitFor();
  await page.screenshot({ path: `${output}/monitor-check-now.png` });
  await page.getByRole('button', { name: 'Check Now', exact: true }).click();
  await page.getByText('Check requested.', { exact: false }).waitFor();
  assert.equal(
    await page.getByRole('button', { name: 'Check Now', exact: true }).isDisabled(),
    true,
  );
  monitors[0].manualCheckPending = false;
  await page.getByRole('button', { name: 'Edit Record', exact: true }).click();
  await page.getByRole('heading', { name: 'Authentication', exact: true }).waitFor();
  assert.equal(await page.locator('input[name="authentication.clientSecret"]').inputValue(), '');
  await page.getByRole('heading', { name: 'Authentication', exact: true }).scrollIntoViewIfNeeded();
  await page
    .locator('input[name="authentication.clientSecret"]')
    .evaluate((element) => element.scrollIntoView({ block: 'center', behavior: 'instant' }));
  await page.screenshot({ path: `${output}/monitor-authentication.png` });
  for (const viewport of [
    { width: 1440, height: 960 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    const control = page.locator('[name="authentication.authMethod"]');
    await control.evaluate((element) =>
      element.scrollIntoView({ block: 'center', behavior: 'instant' }),
    );
    const bounds = await control.boundingBox();
    assert.ok(
      bounds.y >= 0 && bounds.y + bounds.height <= viewport.height,
      'Authentication fields remain reachable',
    );
  }
  await page.setViewportSize({ width: 1440, height: 960 });
  await page.goto(`${base}/services/new`);
  await page.reload();
  assert.equal(
    await page.locator('input[name="name"]').evaluate((el) => el === document.activeElement),
    true,
  );
  await page.locator('input[name="name"]').fill('Demo Customer Portal');
  await page
    .locator('textarea[name="description"]')
    .fill('Example service used only in documentation.');
  await page.locator('input[name="name"]').blur();
  await page.screenshot({ path: `${output}/getting-started.png` });
  await page.goto(`${base}/tasks`);
  await page.getByRole('link', { name: 'Document portal recovery', exact: true }).waitFor();
  for (const name of ['List View', 'Archived Tasks']) {
    const link = page.getByRole('link', { name, exact: true });
    assert.equal((await link.textContent()).trim(), '');
    assert.equal(await link.locator('svg').count(), 1);
  }
  for (const button of await page.locator('.task-icon-action').all()) {
    assert.equal((await button.textContent()).trim(), '');
    assert.equal(await button.locator('svg').count(), 1);
    assert.ok(await button.getAttribute('aria-label'));
    assert.equal(
      await button.evaluate((element) => getComputedStyle(element).backgroundColor),
      'rgba(0, 0, 0, 0)',
    );
    assert.equal(
      await button.evaluate((element) => getComputedStyle(element).borderTopWidth),
      '0px',
    );
    assert.equal(await button.evaluate((element) => element.getBoundingClientRect().height), 24);
  }
  assert.ok(
    await page.locator('.task-lane > header').evaluateAll((headers) =>
      headers.every((header) => {
        const heading = header.querySelector('h2').getBoundingClientRect();
        return [...header.querySelectorAll('button')].every((button) => {
          const box = button.getBoundingClientRect();
          return Math.abs((box.top + box.bottom) / 2 - (heading.top + heading.bottom) / 2) < 1;
        });
      }),
    ),
    'Lane controls remain on the title row',
  );
  assert.equal(await page.getByText('Previous demo follow-up', { exact: true }).count(), 0);
  assert.ok(
    await page
      .locator('.task-lane')
      .first()
      .evaluate((el) => el.getBoundingClientRect().width >= 319),
  );
  await page.getByRole('button', { name: 'Tasks actions', exact: true }).click();
  assert.equal(
    await page.getByRole('link', { name: 'Form Builder', exact: true }).getAttribute('href'),
    '/tasks/fields',
  );
  await page.keyboard.press('Escape');
  await page.screenshot({ path: `${output}/tasks-board.png` });
  const taskTrigger = page.getByRole('link', { name: 'Confirm rollback checklist', exact: true });
  await taskTrigger.click();
  const taskDialog = page.getByRole('dialog', { name: 'Confirm rollback checklist', exact: true });
  await taskDialog
    .getByRole('heading', { name: 'Confirm rollback checklist', exact: true })
    .first()
    .waitFor();
  assert.ok(page.url().endsWith('/tasks'), 'Task preview keeps the board route');
  await taskDialog.getByRole('link', { name: 'Open Record', exact: true }).waitFor();
  await page.screenshot({ path: `${output}/task-board-modal.png` });
  await taskDialog.getByRole('button', { name: 'Edit', exact: true }).click();
  assert.equal(
    await taskDialog
      .locator('footer')
      .evaluate((footer) => getComputedStyle(footer).borderTopWidth),
    '0px',
  );
  assert.equal(
    await taskDialog
      .locator('footer > div > div')
      .evaluate((actions) => getComputedStyle(actions).borderTopWidth),
    '0px',
  );
  const modalDescription = taskDialog.getByLabel(/^Description/);
  await modalDescription.fill('Updated from the Kanban task modal.');
  await page.screenshot({ path: `${output}/task-board-modal-edit.png` });
  await taskDialog.getByRole('button', { name: 'Save', exact: true }).click();
  await taskDialog.getByText('Updated from the Kanban task modal.', { exact: true }).waitFor();
  assert.ok(page.url().endsWith('/tasks'), 'Saving a task stays on the board');
  await taskDialog.getByRole('button', { name: 'Edit', exact: true }).click();
  await taskDialog.getByLabel(/^Description/).fill('Unsaved modal edit');
  await page.keyboard.press('Escape');
  const discardTask = page.getByRole('dialog', { name: 'Discard Task Changes?', exact: true });
  await discardTask.getByRole('button', { name: 'Keep Editing', exact: true }).click();
  assert.equal(await taskDialog.getByLabel(/^Description/).inputValue(), 'Unsaved modal edit');
  await taskDialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await discardTask.getByRole('button', { name: 'Discard Changes', exact: true }).click();
  await taskDialog.getByText('Updated from the Kanban task modal.', { exact: true }).waitFor();

  await page.setViewportSize({ width: 390, height: 844 });
  const lastTaskField = taskDialog.locator('dd').last();
  await lastTaskField.scrollIntoViewIfNeeded();
  const taskBottom = await lastTaskField.boundingBox();
  assert.ok(
    taskBottom.y >= 0 && taskBottom.y + taskBottom.height <= 844,
    'Task modal scrolls to the final field on mobile',
  );
  await taskDialog.getByRole('button', { name: 'Close', exact: true }).waitFor();
  await page.setViewportSize({ width: 1440, height: 960 });

  await page.keyboard.press('Escape');
  assert.equal(await taskDialog.count(), 0);
  assert.ok(
    await taskTrigger.evaluate((element) => element === document.activeElement),
    'Closing restores focus to the task title',
  );

  await page
    .getByRole('button', { name: 'Move Confirm rollback checklist up in To do', exact: true })
    .click();
  await page.waitForFunction(
    () =>
      document.querySelector('.task-lane-cards .task-card a')?.textContent ===
      'Confirm rollback checklist',
  );
  await page.reload();
  await page.getByRole('link', { name: 'Confirm rollback checklist', exact: true }).waitFor();
  assert.equal(
    await page.locator('.task-lane-cards .task-card a').first().textContent(),
    'Confirm rollback checklist',
  );
  const firstCard = page
    .getByRole('link', { name: 'Confirm rollback checklist', exact: true })
    .locator('..');
  const secondCard = page
    .getByRole('link', { name: 'Document portal recovery', exact: true })
    .locator('..');
  await firstCard.dragTo(secondCard, { targetPosition: { x: 30, y: 220 } });
  await page.waitForFunction(
    () =>
      document.querySelector('.task-lane-cards .task-card a')?.textContent ===
      'Document portal recovery',
  );
  await page
    .getByRole('link', { name: 'Document portal recovery', exact: true })
    .locator('..')
    .dragTo(page.getByRole('region', { name: 'In progress tasks' }));
  await page
    .getByRole('region', { name: 'In progress tasks' })
    .getByRole('link', { name: 'Document portal recovery', exact: true })
    .waitFor();
  assert.equal(mutations.at(-1).statusOption, 'in_progress');
  // Select is the keyboard/touch alternative to drag-and-drop.
  await page
    .getByRole('combobox', { name: 'Move Document portal recovery to', exact: true })
    .focus();
  await page.keyboard.press('Enter');
  await page.waitForFunction(
    () =>
      document
        .querySelector('[aria-label="Move Document portal recovery to"]')
        ?.getAttribute('aria-expanded') === 'true',
  );
  await page.keyboard.press('End');
  await page.waitForFunction(() =>
    Array.from(document.querySelectorAll('[role="option"]')).some(
      (option) =>
        option.textContent.trim() === 'Done' && option.getAttribute('data-active') === 'true',
    ),
  );
  await page.keyboard.press('Enter');
  await page
    .getByRole('region', { name: 'Done tasks' })
    .getByRole('link', { name: 'Document portal recovery', exact: true })
    .waitFor();
  failMove = true;
  await page
    .getByRole('combobox', { name: 'Move Document portal recovery to', exact: true })
    .click();
  await page.getByRole('option', { name: 'Blocked', exact: true }).click();
  await page.getByRole('alert').filter({ hasText: 'This record changed.' }).first().waitFor();
  assert.equal(tasks[0].status, 'done');
  await page.getByRole('link', { name: 'Archived Tasks', exact: true }).click();
  await page.getByRole('link', { name: 'Previous demo follow-up', exact: true }).waitFor();
  assert.equal(
    await page.getByRole('link', { name: 'Document portal recovery', exact: true }).count(),
    0,
  );
  user.role = 'viewer';
  await page.goto(`${base}/tasks`);
  await page.getByRole('link', { name: 'Document portal recovery', exact: true }).waitFor();
  assert.equal(await page.locator('[draggable="true"]').count(), 0);
  assert.equal(await page.getByRole('combobox', { name: /^Move .* to$/ }).count(), 0);
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(
    await page.locator('.task-board').evaluate((element) => getComputedStyle(element).overflowX),
    'auto',
  );
  assert.ok(
    await page
      .locator('.task-board')
      .evaluate((element) => element.scrollWidth > element.clientWidth),
  );
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.setViewportSize({ width: 1440, height: 960 });
  await page.evaluate(() => sessionStorage.removeItem('servicetrident-record-tabs'));
  await page.goto(`${base}/tasks/${tasks[0].id}`);
  assert.equal(
    await page
      .getByRole('navigation', { name: 'Main navigation' })
      .getByRole('link', { name: 'Settings', exact: true })
      .count(),
    0,
  );
  await page.locator('.sidebar-profile summary:visible').click();
  await page.getByRole('link', { name: 'Profile', exact: true }).waitFor();
  await page.getByRole('link', { name: 'Settings', exact: true }).waitFor();
  await page.locator('.sidebar-profile summary:visible').click();
  assert.equal(await page.getByRole('navigation', { name: 'Open record tabs' }).count(), 0);
  const serviceLink = page.getByRole('link', {
    name: 'Demo Customer Portal (opens in an app record tab)',
    exact: true,
  });
  await serviceLink.waitFor();
  assert.equal(await serviceLink.getAttribute('href'), `/services/${services[0].id}`);
  assert.equal(await serviceLink.getAttribute('target'), null);
  assert.equal(
    await page
      .getByRole('link', { name: 'Alex Demo (opens in an app record tab)', exact: true })
      .getAttribute('href'),
    '/workspace/aaaaaaaaaaaaaaaaaaaaaaaa',
  );
  assert.equal(
    await page
      .getByRole('link', { name: 'Demo Operations (opens in an app record tab)', exact: true })
      .getAttribute('href'),
    '/groups/bbbbbbbbbbbbbbbbbbbbbbbb',
  );
  await page.screenshot({ path: `${output}/record-references.png` });
  user.role = 'admin';
  await page.reload();
  await page.getByRole('button', { name: 'Edit Record', exact: true }).click();
  const assignSelf = page.getByRole('button', { name: 'Assign to Me', exact: true });
  assert.equal(await assignSelf.isDisabled(), true, 'Selected group excludes the signed-in user');
  await page
    .getByRole('combobox', { name: 'Assignment group', exact: true })
    .locator('..')
    .getByRole('button', { name: /^Clear / })
    .click();
  await assignSelf.click();
  assert.equal(
    await page.getByRole('combobox', { name: 'Assigned to', exact: true }).inputValue(),
    user.displayName,
  );
  assert.equal(await assignSelf.isDisabled(), true, 'Already assigned to the signed-in user');
  await page.screenshot({ path: `${output}/assign-to-me.png` });
  const draftTitle = page.getByLabel('Title *', { exact: true });
  await draftTitle.fill('Demo unsaved tab draft');
  await draftTitle.blur();
  assert.equal(
    await draftTitle.inputValue(),
    'Demo unsaved tab draft',
    'Field updates retain their typed value',
  );
  await page
    .getByRole('link', { name: 'Open Demo Customer Portal in a record tab', exact: true })
    .click();
  await page.waitForURL(`${base}/services/${services[0].id}`);
  assert.equal(context.pages().length, 1);
  const recordTabs = page.getByRole('tablist', { name: 'Record tabs', exact: true });
  assert.equal(await recordTabs.getByRole('tab').count(), 2);
  const tabPosition = await recordTabs.boundingBox();
  const headerPosition = await page.locator('.record-sticky-header').boundingBox();
  assert.ok(
    tabPosition.y + tabPosition.height <= headerPosition.y,
    'Record tabs sit above the header',
  );
  await recordTabs.getByRole('tab').first().click();
  await page.waitForURL(`${base}/tasks/${tasks[0].id}`);
  assert.equal(
    await page.getByLabel('Title *', { exact: true }).inputValue(),
    'Demo unsaved tab draft',
  );
  await recordTabs.getByRole('tab').first().focus();
  await recordTabs.getByRole('tab').first().press('ArrowRight');
  await page.waitForURL(`${base}/services/${services[0].id}`);
  await recordTabs.getByRole('tab').last().filter({ hasText: services[0].name }).waitFor();
  assert.equal(
    await recordTabs.getByRole('tab').last().getAttribute('title'),
    `Service: ${services[0].name}`,
  );
  await recordTabs.getByRole('tab').last().press('Home');
  await page.waitForURL(`${base}/tasks/${tasks[0].id}`);
  assert.equal(await recordTabs.getByText(/From /).count(), 0);
  assert.equal(
    await page
      .locator('.record-navigation-scroll')
      .evaluate((element) => getComputedStyle(element).scrollbarWidth),
    'none',
  );
  assert.equal(
    await page
      .locator('.record-navigation-label')
      .first()
      .evaluate((element) => getComputedStyle(element).whiteSpace),
    'nowrap',
  );
  await page.waitForFunction(() => {
    const bar = document.querySelector('.record-navigation-bar')?.getBoundingClientRect();
    const rail = [...document.querySelectorAll('.record-sidebar')]
      .find((element) => element.getBoundingClientRect().height > 0)
      ?.getBoundingClientRect();
    const topbar = document.querySelector('.app-topbar')?.getBoundingClientRect();
    return (
      bar &&
      rail &&
      topbar &&
      bar.top >= topbar.top &&
      bar.bottom <= topbar.bottom &&
      rail.top >= topbar.bottom - 1
    );
  });
  assert.equal(
    await page
      .locator('.record-sticky-header')
      .evaluate((element) => getComputedStyle(element).borderTopWidth),
    '0px',
  );
  assert.equal(
    await page
      .locator('.record-sidebar-header:visible')
      .evaluate((element) => getComputedStyle(element).borderTopWidth),
    '0px',
  );
  await page.screenshot({ path: `${output}/record-tabs.png` });
  await page.evaluate(() => {
    const root = document.documentElement;
    const original = { css: root.style.cssText, theme: root.dataset.theme };
    const canvas = document.createElement('canvas'),
      ctx = canvas.getContext('2d');
    const luminance = (color) => {
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, 1, 1);
      const values = [...ctx.getImageData(0, 0, 1, 1).data].slice(0, 3).map((v) => {
        const c = v / 255;
        return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
      });
      return values[0] * 0.2126 + values[1] * 0.7152 + values[2] * 0.0722;
    };
    for (const hue of [215, 145, 180, 235, 285, 340, 35, 210, 20, 0]) {
      for (const [shade, lightness] of [
        [50, 97],
        [100, 94],
        [200, 88],
        [700, 28],
        [900, 15],
        [950, 9],
      ])
        root.style.setProperty(`--color-blue-${shade}`, `hsl(${hue} 62% ${lightness}%)`);
      for (const theme of ['light', 'dark']) {
        root.dataset.theme = theme;
        root.style.colorScheme = theme;
        const active = getComputedStyle(
          document.querySelector('.record-navigation-tab[data-active="true"]'),
        );
        const levels = [luminance(active.color), luminance(active.backgroundColor)].sort(
          (a, b) => b - a,
        );
        if ((levels[0] + 0.05) / (levels[1] + 0.05) < 4.5)
          throw new Error(
            `Tab text contrast failed: ${hue}, ${theme}, ${active.color}, ${active.backgroundColor}, ${(levels[0] + 0.05) / (levels[1] + 0.05)}`,
          );
      }
    }
    const sidebar = document.querySelector('.record-sidebar:not([hidden])');
    if (sidebar) {
      root.style.setProperty('--app-background-light', '#f0f5f2');
      root.style.setProperty('--app-background-dark', '#10251d');
      root.dataset.theme = 'light';
      if (getComputedStyle(sidebar).backgroundColor !== 'rgb(240, 245, 242)')
        throw new Error('Light sidebar theme did not update');
      root.dataset.theme = 'dark';
      if (getComputedStyle(sidebar).backgroundColor !== 'rgb(16, 37, 29)')
        throw new Error('Dark sidebar theme did not update');
    }
    root.style.cssText = original.css;
    root.dataset.theme = original.theme;
  });
  const requestStart = recordRequests.length;
  await page.reload();
  await page.getByRole('button', { name: 'Edit Record', exact: true }).waitFor();
  assert.equal(
    await page.getByRole('tablist', { name: 'Record tabs', exact: true }).getByRole('tab').count(),
    2,
  );
  assert.ok(
    !recordRequests.slice(requestStart).includes('/status'),
    'Restored inactive records are not fetched',
  );
  const serviceLoaded = page.waitForResponse(
    (response) => new URL(response.url()).pathname === '/api/status',
  );
  await page
    .getByRole('tablist', { name: 'Record tabs', exact: true })
    .getByRole('tab')
    .last()
    .click();
  await serviceLoaded;
  await page.waitForURL(`${base}/services/${services[0].id}`);
  await page.getByRole('button', { name: 'Edit Record', exact: true }).waitFor();
  assert.ok(recordRequests.slice(requestStart).includes('/status'));
  await page
    .getByRole('tablist', { name: 'Record tabs', exact: true })
    .getByRole('tab')
    .first()
    .click();
  await page.getByRole('button', { name: 'Edit Record', exact: true }).click();
  await page.getByLabel('Title *', { exact: true }).fill('Demo unsaved tab draft');
  await page
    .getByRole('button', { name: /^Close .* tab$/ })
    .first()
    .click();
  await page
    .getByRole('dialog', { name: 'Close Record Tab?', exact: true })
    .getByRole('button', { name: 'Cancel', exact: true })
    .click();

  await page
    .getByRole('tablist', { name: 'Record tabs', exact: true })
    .getByRole('tab')
    .last()
    .click();
  await page
    .getByRole('navigation', { name: 'Open record tabs' })
    .getByRole('button', { name: 'Close All Tabs', exact: true })
    .click();
  await page
    .getByRole('dialog', { name: 'Close All Record Tabs?', exact: true })
    .getByRole('button', { name: 'Cancel', exact: true })
    .click();
  assert.equal(
    await page.getByRole('tablist', { name: 'Record tabs', exact: true }).getByRole('tab').count(),
    2,
  );
  await page
    .getByRole('tablist', { name: 'Record tabs', exact: true })
    .getByRole('tab')
    .first()
    .click();
  await page.waitForURL(`${base}/tasks/${tasks[0].id}`);
  await page
    .getByRole('navigation', { name: 'Open record tabs' })
    .getByRole('button', { name: 'Close All Tabs', exact: true })
    .click();
  assert.equal(
    await page.getByRole('dialog', { name: 'Close All Record Tabs?', exact: true }).count(),
    0,
  );
  assert.equal(
    await page.getByLabel('Title *', { exact: true }).inputValue(),
    'Demo unsaved tab draft',
  );
  assert.equal(await page.getByRole('navigation', { name: 'Open record tabs' }).count(), 0);
  await page.goto(`${base}/help?topic=incidents`);
  await page.getByRole('img', { name: /^Task modal editor/ }).scrollIntoViewIfNeeded();
  await page.waitForFunction(() => {
    const image = document.querySelector('img[src="/help/task-board-modal-edit.png"]');
    return image?.complete && image.naturalWidth > 0;
  });
  user.role = 'admin';
  let releaseAuth;
  authWait = new Promise((resolve) => {
    releaseAuth = resolve;
  });
  const started = new Promise((resolve) => {
    authStarted = resolve;
  });
  await page.goto(`${base}/tasks/fields`);
  await started;
  assert.equal(
    await page.getByText('Workspace admin access is required.', { exact: true }).count(),
    0,
  );
  releaseAuth();
  authWait = null;
  authStarted = null;
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('button', { name: /^Status \*/ }).click();
  await page.getByLabel('Label', { exact: true }).fill('Demo Workflow');
  await page
    .getByLabel('Help Text', { exact: true })
    .fill('Choose the current stage of this demo task.');
  await page.getByLabel('Quick add options (one per line)', { exact: true }).fill('Demo Review');
  await page.getByRole('button', { name: 'Add options', exact: true }).click();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.getByText('Form saved.', { exact: true }).waitFor();
  assert.equal(builderFields.find((field) => field.id === 'status').label, 'Demo Workflow');
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  assert.equal(
    await page.getByLabel('Label', { exact: true }).inputValue(),
    'Demo Workflow',
    'Edit retains the latest saved system label',
  );
  assert.equal(
    await page.getByRole('switch', { name: 'Archived', exact: true }).count(),
    0,
    'System fields cannot be archived',
  );
  await page.getByRole('switch', { name: 'Required', exact: true }).uncheck();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.getByText('Form saved.', { exact: true }).waitFor();
  assert.equal(builderFields.find((field) => field.id === 'status').required, false);
  assert.equal(
    builderFields.find((field) => field.id === 'status').helpText,
    'Choose the current stage of this demo task.',
  );
  assert.ok(
    builderFields
      .find((field) => field.id === 'status')
      .choices.some((choice) => choice.label === 'Demo Review'),
  );
  await page.evaluate(() => {
    const rail = document.querySelector('.record-sidebar-content');
    if (rail) rail.scrollTop = 0;
  });
  await page.screenshot({ path: `${output}/configuration.png` });
  await page.goto(`${base}/tasks`);
  await page.getByRole('region', { name: 'Demo Review task cards', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Move Demo Review lane left', exact: true }).click();
  await page.waitForFunction(
    () => document.querySelectorAll('.task-lane h2')[3]?.textContent === 'Demo Review',
  );
  user.role = 'viewer';
  await page.reload();
  await page.getByRole('region', { name: 'Demo Review task cards', exact: true }).waitFor();
  assert.equal(await page.getByRole('button', { name: /^Move .* lane (left|right)$/ }).count(), 0);
  assert.equal(await page.locator('.task-lane h2').nth(3).textContent(), 'Demo Review');
  user.role = 'admin';
  await page.reload();
  await page.getByRole('button', { name: 'Move Demo Review lane left', exact: true }).waitFor();
  await page.screenshot({ path: `${output}/tasks-board.png` });

  assert.deepEqual(faults, []);

  console.log('Checking continuous card loading');
  for (let index = 0; index < 30; index++)
    tasks.push({
      ...tasks[1],
      id: `99999999999999999999${String(index).padStart(4, '0')}`,
      title: `Demo continuous task ${index}`,
      status: 'todo',
      statusOption: 'todo',
      boardRank: undefined,
    });
  await page.reload();
  const continuous = page.getByRole('region', { name: 'To do task cards', exact: true });
  await continuous.locator('.task-card').first().waitFor();
  await page.locator('.task-board-page').evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  await page.getByRole('link', { name: 'Demo continuous task 29', exact: true }).waitFor();
  assert.equal(await page.getByRole('button', { name: /^(Next|Previous).*tasks$/ }).count(), 0);
  await page.locator('.task-board-page').evaluate((element) => {
    element.scrollTop = 0;
  });
  await continuous
    .locator('.task-card')
    .first()
    .evaluate((element) => {
      window.boardDragTransfer = new DataTransfer();
      element.dispatchEvent(
        new DragEvent('dragstart', { bubbles: true, dataTransfer: window.boardDragTransfer }),
      );
    });
  await page.waitForTimeout(60);
  const edgeDrag = async (direction) =>
    page.locator('.task-board').evaluate((element, direction) => {
      const root = element.closest('.task-board-page'),
        bounds = root.getBoundingClientRect();
      const left = Math.max(0, bounds.left),
        right = Math.min(innerWidth, bounds.right),
        top = Math.max(0, bounds.top),
        bottom = Math.min(innerHeight, bounds.bottom);
      element.dispatchEvent(
        new DragEvent('dragover', {
          bubbles: true,
          dataTransfer: window.boardDragTransfer,
          clientX:
            direction === 'left'
              ? left + 2
              : direction === 'right'
                ? right - 2
                : (left + right) / 2,
          clientY:
            direction === 'up' ? top + 2 : direction === 'down' ? bottom - 2 : (top + bottom) / 2,
        }),
      );
    }, direction);
  await edgeDrag('right');
  await page.waitForFunction(() => document.querySelector('.task-board').scrollLeft > 50);
  const rightScroll = await page.locator('.task-board').evaluate((element) => element.scrollLeft);
  await edgeDrag('left');
  await page.waitForFunction(
    (previous) => document.querySelector('.task-board').scrollLeft < previous - 30,
    rightScroll,
  );
  await edgeDrag('down');
  await page.waitForFunction(() => document.querySelector('.task-board-page').scrollTop > 50);
  const downScroll = await page
    .locator('.task-board-page')
    .evaluate((element) => element.scrollTop);
  await edgeDrag('up');
  await page.waitForFunction(
    (previous) => document.querySelector('.task-board-page').scrollTop < previous - 30,
    downScroll,
  );
  await page.evaluate(() =>
    document.dispatchEvent(
      new DragEvent('dragend', { bubbles: true, dataTransfer: window.boardDragTransfer }),
    ),
  );
  const stoppedScroll = await page
    .locator('.task-board-page')
    .evaluate((element) => element.scrollTop);
  await page.waitForTimeout(150);
  assert.equal(
    await page.locator('.task-board-page').evaluate((element) => element.scrollTop),
    stoppedScroll,
    'Drag cancellation stops auto-scrolling',
  );
  await page.evaluate(() => {
    delete window.boardDragTransfer;
  });
  tasks.splice(tasks.length - 30, 30);
  console.log('Checking knowledge bases');
  await page.goto(`${base}/knowledge`);
  await page.getByRole('link', { name: /^Demo Operations Runbooks/ }).waitFor();
  assert.equal(await page.getByRole('table').count(), 0);
  assert.equal(
    await page.getByRole('button', { name: 'Load More Knowledge Bases', exact: true }).count(),
    0,
  );
  await page.getByLabel('Search Knowledge Bases', { exact: true }).fill('missing');
  await page.getByText('No knowledge bases match your search.', { exact: true }).waitFor();
  await page.getByLabel('Search Knowledge Bases', { exact: true }).fill('recovery');
  await page.getByRole('link', { name: /^Demo Operations Runbooks/ }).waitFor();
  await page.getByLabel('Search Knowledge Bases', { exact: true }).fill('');
  await page.getByRole('link', { name: /^Demo Operations Runbooks/ }).waitFor();
  for (let index = 0; index < 25; index++)
    demoBases.push({
      id: (index + 1).toString(16).padStart(24, 'e'),
      title: `Synthetic scrolling base ${index}`,
      description: 'Verify growing card lists remain reachable.',
    });
  await page.reload();
  await page.getByRole('link', { name: /^Synthetic scrolling base 0/ }).waitFor();
  await page.locator('.list-outlet').evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  await page.getByRole('link', { name: /^Synthetic scrolling base 24/ }).waitFor();
  for (const viewport of [
    { width: 1440, height: 960 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    const scroller = page.locator('.list-outlet');
    await scroller.evaluate((element) => {
      element.scrollTop = element.scrollHeight;
    });
    assert.ok(
      await scroller.evaluate((element) => element.scrollTop > 0),
      'Growing knowledge bases scroll vertically',
    );
    const lastBase = await page
      .getByRole('link', { name: /^Synthetic scrolling base 24/ })
      .boundingBox();
    assert.ok(
      lastBase.y >= 0 && lastBase.y + lastBase.height <= viewport.height,
      'Last knowledge base is reachable',
    );
  }
  demoBases.splice(demoBases.length - 25, 25);
  await page.setViewportSize({ width: 1440, height: 960 });
  await page.reload();
  await page.getByRole('link', { name: /^Demo Operations Runbooks/ }).waitFor();
  await page.screenshot({ path: `${output}/knowledge-bases.png` });
  await page.getByRole('link', { name: 'Create', exact: true }).click();
  await page.getByLabel('Name', { exact: true }).fill('Demo Recovery Guides');
  const baseDescription = page.getByLabel('Description', { exact: true });
  const compactDescriptionHeight = await baseDescription.evaluate(
    (element) => element.getBoundingClientRect().height,
  );
  await baseDescription.fill(
    Array.from({ length: 12 }, (_, index) => `Synthetic documentation line ${index + 1}`).join(
      '\n',
    ),
  );
  assert.ok(
    (await baseDescription.evaluate((element) => element.getBoundingClientRect().height)) >
      compactDescriptionHeight,
    'Knowledge base textareas grow with pasted text',
  );
  await baseDescription.fill('Short demo description.');
  assert.equal(
    await baseDescription.evaluate((element) => element.getBoundingClientRect().height),
    compactDescriptionHeight,
    'Textareas shrink after content is removed',
  );
  await page
    .getByLabel('Description', { exact: true })
    .fill('Synthetic recovery procedures for documentation.');
  await page.getByRole('button', { name: 'Create Knowledge Base', exact: true }).click();
  await page.getByRole('heading', { name: 'Demo Recovery Guides', exact: true }).waitFor();
  assert.equal(
    await page
      .getByRole('region', { name: 'Articles', exact: true })
      .getByRole('link', { name: 'Create Article', exact: true })
      .count(),
    0,
  );
  await page
    .locator('.record-sticky-header')
    .getByRole('link', { name: 'Create Article', exact: true })
    .click();
  await page.getByRole('combobox', { name: /^Knowledge Base/ }).waitFor();
  await page.getByLabel('Title *', { exact: true }).fill('Demo portal recovery guide');
  const createAction = page
    .locator('.record-sticky-header')
    .getByRole('button', { name: 'Create Article', exact: true });
  await createAction.waitFor();
  assert.ok(
    await createAction.getAttribute('form'),
    'Header submit action retains its form association',
  );
  const createPosition = await createAction.boundingBox();
  await page.locator('.record-scroll-area:not([hidden])').evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  assert.ok(
    Math.abs((await createAction.boundingBox()).y - createPosition.y) < 1,
    'Create action remains visible while scrolling',
  );
  await page.locator('.record-scroll-area:not([hidden])').evaluate((element) => {
    element.scrollTop = 0;
  });
  await page.screenshot({ path: `${output}/knowledge-article.png` });
  const type = page.getByRole('combobox', { name: 'Type *', exact: true });
  await type.click();
  await page.getByRole('option', { name: 'Runbook', exact: true }).click();
  await page.getByRole('button', { name: 'Add Step', exact: true }).click();
  await page.getByLabel('Step Title', { exact: true }).first().fill('Review service health');
  await page
    .getByLabel('Instructions', { exact: true })
    .first()
    .fill(
      'Open the service status page and confirm the affected service. Record the observed health before proceeding.',
    );
  await page.getByRole('button', { name: 'Add Step', exact: true }).click();
  await page.getByLabel('Step Title', { exact: true }).nth(1).fill('Verify recovery');
  await page
    .getByLabel('Instructions', { exact: true })
    .nth(1)
    .fill(
      'Confirm that recent checks are successful, then document the recovery and any follow-up tasks.',
    );
  await page.getByRole('button', { name: 'Create Article', exact: true }).click();
  await page.getByRole('heading', { name: 'Step-by-Step Process', exact: true }).waitFor();
  await page.getByText(/Loading article/).waitFor({ state: 'hidden' });
  const publishArticle = page.getByRole('button', { name: 'Publish', exact: true });
  await publishArticle.waitFor();
  await page.screenshot({ path: `${output}/knowledge-runbook.png` });
  await publishArticle.click();
  await publishArticle.waitFor({ state: 'hidden' });
  assert.equal(demoArticles[0].status, 'published');
  await page.getByRole('button', { name: 'Unpublish', exact: true }).click();
  let articleConfirmation = page.getByRole('dialog', { name: 'Unpublish Article?', exact: true });
  await articleConfirmation.getByRole('button', { name: 'Cancel', exact: true }).click();
  assert.equal(demoArticles[0].status, 'published');
  await page.getByRole('button', { name: 'Unpublish', exact: true }).click();
  articleConfirmation = page.getByRole('dialog', { name: 'Unpublish Article?', exact: true });
  await articleConfirmation.getByRole('button', { name: 'Unpublish Article', exact: true }).click();
  await page.getByRole('button', { name: 'Publish', exact: true }).waitFor();
  assert.equal(demoArticles[0].status, 'draft');
  await page.getByRole('button', { name: 'Record actions', exact: true }).click();
  await page.getByRole('button', { name: 'Archive Article', exact: true }).click();
  articleConfirmation = page.getByRole('dialog', { name: 'Archive Article?', exact: true });
  await articleConfirmation.getByRole('button', { name: 'Cancel', exact: true }).click();
  assert.equal(demoArticles[0].status, 'draft');
  await page.getByRole('button', { name: 'Record actions', exact: true }).click();
  await page.getByRole('button', { name: 'Archive Article', exact: true }).click();
  await page
    .getByRole('dialog', { name: 'Archive Article?', exact: true })
    .getByRole('button', { name: 'Archive Article', exact: true })
    .click();
  await page.waitForResponse(
    (response) =>
      response.url().endsWith(`/api/knowledge/${demoArticles[0].id}`) &&
      response.request().method() === 'GET',
  );
  assert.equal(demoArticles[0].status, 'archived');
  demoArticles.push({
    ...demoArticles[0],
    id: 'bbbbbbbbbbbbbbbbbbbbbbbd',
    number: 'KB0000002',
    statusLabel: 'Draft',
    status: 'draft',
    statusOption: 'draft',
    knowledgeBaseId: demoBases[0].id,
    knowledgeBaseTitle: demoBases[0].title,
  });
  await page.goto(`${base}/knowledge/articles`);
  await page.getByRole('columnheader', { name: 'Knowledge Base', exact: true }).waitFor();
  await page.locator(`td a[href="/knowledge/bases/${demoBases[0].id}"]`).waitFor();
  await page.screenshot({ path: `${output}/all-articles-list.png` });
  demoArticles.pop();

  await page.locator('.app-topbar').getByRole('button', { name: 'Create', exact: true }).click();
  await page.waitForURL('**/knowledge/new');
  await page.getByRole('button', { name: 'Create Article', exact: true }).waitFor();
  assert.equal(
    await page.getByRole('heading', { name: 'Create Knowledge Base', exact: true }).count(),
    0,
  );
  await page.goto(`${base}/knowledge/bases/dddddddddddddddddddddddd`);
  assert.equal(await page.getByRole('table').count(), 0);
  await page.getByRole('region', { name: 'Articles', exact: true }).waitFor();
  await page.getByLabel('Search Articles', { exact: true }).fill('not-found');
  const searched = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return url.pathname === '/api/knowledge' && url.searchParams.get('search') === 'Demo';
  });
  await page.getByLabel('Search Articles', { exact: true }).fill('Demo');
  await searched;
  await page.getByRole('combobox', { name: 'Status', exact: true }).click();
  await page.getByRole('option', { name: 'Archived', exact: true }).click();
  await page.getByText(`Author: ${user.displayName}`, { exact: true }).waitFor();
  await page.screenshot({ path: `${output}/knowledge-base-articles.png` });
  await page.getByRole('button', { name: 'Record actions', exact: true }).click();
  await page.getByRole('button', { name: 'Delete Knowledge Base', exact: true }).click();
  const deletion = page.getByRole('dialog', { name: 'Delete Knowledge Base', exact: true });
  assert.equal(
    await deletion
      .getByRole('button', { name: 'Cancel', exact: true })
      .evaluate((element) => element === document.activeElement),
    true,
  );
  const contentAction = deletion.getByRole('combobox', { name: 'Content Action', exact: true });
  await deletion.getByRole('combobox', { name: 'Destination Knowledge Base', exact: true }).click();
  const destinationOptions = page.getByRole('listbox', {
    name: 'Destination Knowledge Base',
    exact: true,
  });
  const otherBase = demoBases.find((base) => base.id !== 'dddddddddddddddddddddddd');
  await destinationOptions.getByRole('option', { name: otherBase.title, exact: true }).waitFor();
  assert.equal(
    await destinationOptions
      .getByRole('option', { name: 'Demo Recovery Guides', exact: true })
      .count(),
    0,
  );
  await page.screenshot({ path: `${output}/knowledge-base-move.png` });
  await destinationOptions.getByRole('option', { name: otherBase.title, exact: true }).click();
  assert.equal(
    await deletion
      .getByRole('button', { name: 'Move Articles and Delete Base', exact: true })
      .isEnabled(),
    true,
  );
  await contentAction.click();
  await page
    .getByRole('option', { name: 'Delete articles with this knowledge base', exact: true })
    .click();
  await deletion
    .getByText('All articles and their attachments will be permanently deleted.', { exact: false })
    .waitFor();
  await page.screenshot({ path: `${output}/knowledge-base-delete.png` });
  await deletion.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.goto(`${base}/incidents/${demoIncident.id}`);
  await page.getByRole('tab', { name: 'Comments and work notes', exact: true }).click();
  const conversationFilter = page.getByRole('combobox', {
    name: 'Conversation filter',
    exact: true,
  });
  const tableToggle = page.getByRole('button', { name: 'Table view', exact: true });
  await tableToggle.waitFor();
  assert.equal((await tableToggle.textContent()).trim(), '');
  const conversationSizes = await Promise.all(
    [conversationFilter, tableToggle].map((control) =>
      control.evaluate((element) => element.getBoundingClientRect().height),
    ),
  );
  assert.equal(conversationSizes[0], conversationSizes[1]);
  assert.equal(await page.getByText('Show', { exact: true }).count(), 0);
  assert.equal(
    await page
      .getByRole('tab', { name: 'Comments and work notes', exact: true })
      .locator('span[aria-hidden="true"]')
      .count(),
    0,
    'Empty related lists omit the count badge',
  );
  demoComments = ['comment', 'work_note'].map((kind, index) => ({
    id: String(index + 1).padStart(24, 'b'),
    kind,
    author: 'Alex Demo',
    authorId: user.id,
    body:
      kind === 'comment'
        ? 'We are investigating the service impact.'
        : 'Review the recent deployment before the handoff.',
    createdAt: '2026-10-10T17:05:06Z',
  }));
  await page.reload();
  await page.getByRole('tab', { name: 'Comments and work notes', exact: true }).click();
  const authorLinks = page.locator(`article header a[href="/workspace/${user.id}"]`);
  await authorLinks.first().waitFor();
  assert.equal(await authorLinks.count(), 2);
  await authorLinks.last().scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${output}/incident-comment-authors.png` });
  await page
    .getByRole('tab', { name: 'Monitor Events', exact: true })
    .locator('span[aria-hidden="true"]')
    .getByText('1', { exact: true })
    .waitFor();
  await page.getByRole('tab', { name: 'Monitor Events', exact: true }).click();
  await page.getByRole('cell', { name: 'Demo Portal Health', exact: true }).waitFor();
  const monitorEventPanel = page.getByRole('tabpanel', { name: 'Monitor Events', exact: true });
  assert.equal(
    (await monitorEventPanel
      .locator('a[href="/monitors/333333333333333333333333/events/cdcdcdcdcdcdcdcdcdcdcdcd"]')
      .count()) > 0,
    true,
  );
  await page
    .getByRole('cell', { name: 'Demo Portal Health', exact: true })
    .scrollIntoViewIfNeeded();
  assert.equal(
    await page
      .getByRole('tab', { name: 'Monitor Events', exact: true })
      .locator('span')
      .textContent(),
    '1',
  );
  await page.screenshot({ path: `${output}/incident-monitor-events.png` });
  await page.getByRole('button', { name: 'Reopen', exact: true }).click();
  const reopen = page.getByRole('dialog', { name: 'Reopen Incident', exact: true });
  assert.equal(
    await reopen
      .getByRole('button', { name: 'Cancel', exact: true })
      .evaluate((element) => element === document.activeElement),
    true,
  );
  assert.equal(incidentWrites, 0);
  await reopen.getByRole('button', { name: 'Cancel', exact: true }).click();
  assert.equal(incidentWrites, 0);
  await page.getByRole('button', { name: 'Reopen', exact: true }).click();
  await reopen.getByRole('button', { name: 'Reopen', exact: true }).click();
  await page.getByRole('button', { name: 'Resolve', exact: true }).waitFor();
  assert.equal(incidentWrites, 1);
  await page.getByRole('button', { name: 'Resolve', exact: true }).click();
  await page.getByLabel('Resolution notes', { exact: true }).waitFor();
  assert.equal(
    await page.getByLabel('Resolution notes', { exact: true }).getAttribute('required'),
    null,
  );
  assert.equal(await page.getByRole('button', { name: 'Save', exact: true }).count(), 0);
  const resolveDialog = page.getByRole('dialog', { name: 'Resolve Incident', exact: true });
  await resolveDialog.waitFor();
  assert.equal(incidentWrites, 1);
  await page.screenshot({ path: `${output}/incident-resolve.png` });
  assert.equal(
    await resolveDialog
      .getByRole('button', { name: 'Cancel', exact: true })
      .evaluate((element) => element === document.activeElement),
    true,
  );
  await resolveDialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  assert.equal(incidentWrites, 1);
  await page.getByRole('button', { name: 'Resolve', exact: true }).click();
  await resolveDialog.getByRole('button', { name: 'Resolve Incident', exact: true }).click();
  await page.getByRole('button', { name: 'Reopen', exact: true }).waitFor();
  assert.equal(incidentWrites, 2);

  await page.goto(`${base}/integrations`);
  for (const name of ['Configured Apps', 'Logs', 'Configured Apps', 'App Catalog', 'Logs']) {
    await page.getByRole('tab', { name, exact: true }).click();
    const header = page.locator('.record-sticky-header');
    assert.equal(
      await header.getByRole('button', { name: 'Configure Columns', exact: true }).count(),
      name === 'App Catalog' ? 0 : 1,
    );
  }
  await page.getByRole('cell', { name: 'Example ServiceNow', exact: true }).waitFor();
  assert.equal(
    await page.getByRole('table').locator('time').first().textContent(),
    dateTime(demoDeliveryRows[0].createdAt, user.timeZone, user.uiPreferences),
  );
  await page.goto(`${base}/integrations/${demoServiceNow.id}`);
  await page.getByText(demoServiceNow.instanceUrl, { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Edit Record', exact: true }).click();
  assert.equal(
    await page.getByLabel('Instance Root URL', { exact: true }).inputValue(),
    demoServiceNow.instanceUrl,
  );
  assert.equal(
    await page.getByLabel('Instance Root URL', { exact: true }).getAttribute('type'),
    'url',
  );
  await page.getByRole('button', { name: 'Test Saved Connection', exact: true }).click();
  await page
    .getByRole('alert')
    .filter({ hasText: 'ServiceNow returned HTTP 401' })
    .first()
    .waitFor();
  await page.screenshot({ path: `${output}/servicenow-oauth.png` });
  await page.goto(`${base}/settings/service-accounts`);
  await page.getByRole('button', { name: 'Add Service Account', exact: true }).click();
  const accountForm = page.getByRole('form', { name: 'Add Service Account', exact: true });
  await accountForm.getByRole('button', { name: 'Create Service Account', exact: true }).click();
  await accountForm.getByRole('button', { name: 'Name is required.', exact: true }).waitFor();
  await accountForm.getByLabel('Name', { exact: true }).fill('Demo Automation');
  await accountForm.getByRole('checkbox', { name: 'Create incidents', exact: true }).check();
  await accountForm
    .getByRole('switch', {
      name: 'Allow all workspace services and unassigned records',
      exact: true,
    })
    .check();
  await accountForm.getByRole('switch', { name: 'OAuth Client Credentials', exact: true }).check();
  assert.equal(
    await accountForm.getByRole('switch', { name: 'Enabled', exact: true }).isChecked(),
    true,
  );
  assert.equal(
    await accountForm.getByLabel('Credential Lifetime (days)', { exact: true }).inputValue(),
    '90',
  );
  await page.screenshot({ path: `${output}/service-account-settings.png` });
  await accountForm.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.getByRole('link', { name: /^Demo External Automation/ }).click();
  await page.getByRole('heading', { name: 'Demo External Automation', exact: true }).waitFor();
  await page.getByRole('heading', { name: 'OAuth Client Credentials', exact: true }).waitFor();
  await page.goto(`${base}/settings/identity-providers`);
  await page.getByRole('heading', { name: 'Demo Work Identity', exact: true }).waitFor();
  await page.screenshot({ path: `${output}/identity-provider-settings.png` });
  await page.getByRole('button', { name: 'Add Provider', exact: true }).click();
  const identityForm = page.getByRole('form', { name: 'Add Identity Provider', exact: true });
  assert.equal(
    await identityForm.getByRole('switch', { name: 'Enabled', exact: true }).isChecked(),
    true,
  );
  await identityForm.getByRole('button', { name: 'Save', exact: true }).click();
  await identityForm
    .getByRole('button', { name: 'Display Name is required.', exact: true })
    .waitFor();
  assert.equal(
    await identityForm
      .getByLabel('Display Name', { exact: true })
      .evaluate((el) => el === document.activeElement),
    true,
  );
  assert.equal(await identityForm.evaluate((form) => form.noValidate), true);
  await identityForm.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.evaluate(() => sessionStorage.removeItem('servicetrident-record-tabs'));
  await page.goto(`${base}/settings/audit`);
  await page.reload();
  for (let index = 0; index < 10; index++) {
    await page.locator(`a[href="/records/audit/${demoAuditRows[index].id}"]`).click();
    await page.getByRole('region', { name: 'Audit Entry Details', exact: true }).waitFor();
    assert.equal(await page.getByRole('link', { name: 'Back to List', exact: true }).count(), 0);
    await page
      .getByRole('navigation', { name: 'Breadcrumb' })
      .getByRole('link', { name: 'Audit Log', exact: true })
      .click();
  }
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await page.locator(`a[href="/records/audit/${demoAuditRows[10].id}"]`).click();
  await page.getByRole('region', { name: 'Audit Entry Details', exact: true }).waitFor();
  assert.ok(page.url().endsWith(`/records/audit/${demoAuditRows[10].id}`));
  assert.equal(await page.getByRole('navigation', { name: 'Open record tabs' }).count(), 1);
  assert.equal(
    await page.evaluate(
      () => JSON.parse(sessionStorage.getItem('servicetrident-record-tabs')).tabs.length,
    ),
    11,
  );
  assert.equal(await page.getByRole('link', { name: 'Back to List', exact: true }).count(), 0);
  await page
    .getByRole('navigation', { name: 'Breadcrumb' })
    .getByRole('link', { name: 'Audit Log', exact: true })
    .click();
  await page.locator(`a[href="/records/audit/${demoAuditRows[0].id}"]`).click();
  await page.getByRole('region', { name: 'Audit Entry Details', exact: true }).waitFor();
  assert.equal(
    await page.getByRole('tablist', { name: 'Record tabs', exact: true }).getByRole('tab').count(),
    11,
  );
  await page.screenshot({ path: `${output}/audit-record.png` });
  await page
    .getByRole('navigation', { name: 'Open record tabs' })
    .getByRole('button', { name: 'Close All Tabs', exact: true })
    .click();
  assert.ok(page.url().endsWith(`/records/audit/${demoAuditRows[0].id}`));
  await page.getByRole('region', { name: 'Audit Entry Details', exact: true }).waitFor();
  assert.equal(await page.getByRole('navigation', { name: 'Open record tabs' }).count(), 0);
  assert.equal(
    await page.evaluate(
      () => JSON.parse(sessionStorage.getItem('servicetrident-record-tabs')).tabs.length,
    ),
    1,
  );
  for (const route of [
    '/integrations/new',
    '/integrations/new?provider=slack',
    '/integrations/new?provider=sendgrid',
  ]) {
    await page.goto(`${base}${route}`);
    const enabled = page.getByRole('switch', { name: 'Enable delivery', exact: true });
    await enabled.waitFor();
    assert.equal(await enabled.isChecked(), true, 'New integrations default to enabled');
  }
  await page.goto(`${base}/integrations/ai`);
  const providerHeader = await page.evaluate(() => {
    const main = document.querySelector('#main').getBoundingClientRect();
    const header = document.querySelector('.record-sticky-header').getBoundingClientRect();
    return {
      top: Math.abs(header.top - main.top - 1),
      left: Math.abs(main.left - header.left),
      right: Math.abs(main.right - header.right),
    };
  });
  assert.ok(
    providerHeader.top < 1 && providerHeader.left <= 1 && providerHeader.right <= 1,
    'Provider header aligns with the bordered content surface below the top toolbar',
  );
  await page.getByLabel('Model', { exact: true }).fill('demo-model');
  await page.getByLabel('API Key', { exact: true }).fill('synthetic-browser-test-key');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.getByText('A key is saved.', { exact: false }).waitFor();
  assert.equal(await page.getByLabel('API Key', { exact: true }).inputValue(), '');
  await page.screenshot({ path: `${output}/ai-provider.png` });
  await page.goto(`${base}/profile`);
  const logoFill = () =>
    page
      .locator('.desktop-sidebar [data-brand-mark] rect')
      .evaluate((rect) => getComputedStyle(rect).fill);
  const initialLogoFill = await logoFill();
  await page.getByRole('radio', { name: 'Forest', exact: true }).check();
  await page.waitForFunction(() => document.documentElement.dataset.colorScheme === 'forest');
  assert.notEqual(
    await logoFill(),
    initialLogoFill,
    'The logo background follows the selected palette',
  );
  await page.getByRole('heading', { name: 'Theme', exact: true }).evaluate((element) => {
    const root = element.closest('.record-scroll-area');
    if (root) {
      window.scrollTo(0, 0);
      document.body.scrollTop = 0;
      root.scrollTop += element.getBoundingClientRect().top - root.getBoundingClientRect().top - 16;
    }
  });
  await page.screenshot({ path: `${output}/profile-themes.png` });
  const greetingInput = page.getByRole('textbox', { name: 'Greeting', exact: true });
  await greetingInput.fill('Ready for today, {firstName}?');
  await page
    .locator('section[aria-labelledby="greeting-settings-title"]')
    .getByRole('button', { name: 'Save', exact: true })
    .click();
  await page
    .getByRole('heading', { name: 'Dashboard Greeting', exact: true })
    .scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${output}/profile-greeting.png` });
  await page.goto(`${base}/dashboard`);
  await page.getByText('Ready for today, Alex?', { exact: true }).waitFor();
  await page.reload();
  await page.getByText('Ready for today, Alex?', { exact: true }).waitFor();
  await page.goto(`${base}/profile`);
  await page.getByRole('button', { name: 'Reset Greeting', exact: true }).click();
  const clock = page.getByRole('combobox', { name: 'Time Format', exact: true });
  await clock.click();
  await page.getByRole('option', { name: '24-Hour', exact: true }).click();
  const date = page.getByRole('combobox', { name: 'Date Format', exact: true });
  await date.click();
  await page.getByRole('option', { name: 'YYYY-MM-DD', exact: true }).click();
  await page
    .getByRole('heading', { name: 'Date and Time Format', exact: true })
    .evaluate((element) => {
      const root = element.closest('.record-scroll-area');
      if (root) {
        window.scrollTo(0, 0);
        document.body.scrollTop = 0;
        root.scrollTop +=
          element.getBoundingClientRect().top - root.getBoundingClientRect().top - 16;
      }
    });
  await page.screenshot({ path: `${output}/profile-date-ai.png` });
  await page.getByRole('switch', { name: 'Task and Incident Summaries', exact: true }).uncheck();
  await page.goto(`${base}/tasks/${tasks[0].id}`);
  assert.equal(await page.getByRole('region', { name: 'AI Summary', exact: true }).count(), 0);
  await page.goto(`${base}/profile`);
  await page.getByRole('switch', { name: 'Task and Incident Summaries', exact: true }).check();
  await page.goto(`${base}/tasks/${tasks[0].id}`);
  await page.getByRole('button', { name: 'Summarize', exact: true }).click();
  await page.getByText('Demo guidance:', { exact: false }).waitFor();
  const alignment = await page.evaluate(() => ({
    header: document.querySelector('.record-sticky-header').getBoundingClientRect().height,
    rail: document.querySelector('.record-sidebar-header').getBoundingClientRect().height,
    idInHeader: !!document.querySelector('.record-sticky-header [aria-label="Record number"]'),
  }));
  assert.ok(Math.abs(alignment.header - alignment.rail) < 1);
  const assertRecordBordersAligned = async () => {
    const difference = await page.evaluate(() => {
      const header = document.querySelector('.record-sticky-header').getBoundingClientRect();
      const rail = [...document.querySelectorAll('.record-sidebar-header')]
        .find((element) => element.getBoundingClientRect().width > 0)
        ?.getBoundingClientRect();
      return rail ? Math.abs(header.bottom - rail.bottom) : 0;
    });
    assert.ok(
      difference < 0.5,
      `Record header and information toggle bottom borders align: ${difference}px`,
    );
  };
  await assertRecordBordersAligned();

  assert.equal(alignment.idInHeader, false);
  assert.equal(await page.locator('#main .page-title').count(), 0);
  const resizer = page.getByRole('separator', { name: 'Resize record information' });
  await resizer.focus();
  await page.keyboard.press('End');
  await page.waitForFunction(
    () => document.querySelector('.record-sidebar').getBoundingClientRect().width === 560,
  );
  const grip = await resizer.boundingBox();
  await page.mouse.move(grip.x + 5, grip.y + 80);
  await page.mouse.down();
  await page.mouse.move(grip.x + 435, grip.y + 80, { steps: 10 });
  await page.mouse.up();
  await page.waitForFunction(
    () => document.querySelector('.record-sidebar').getBoundingClientRect().width === 0,
  );
  await assertRecordBordersAligned();
  await page.keyboard.press('ArrowLeft');
  await page.waitForFunction(
    () => document.querySelector('.record-sidebar').getBoundingClientRect().width === 240,
  );
  await page.keyboard.press('ArrowRight');
  await page.waitForFunction(
    () => document.querySelector('.record-sidebar').getBoundingClientRect().width === 0,
  );
  await page.keyboard.press('End');
  for (
    let attempt = 0;
    attempt < 100 &&
    (user.uiPreferences.rightPanelWidth !== 560 || user.uiPreferences.rightCollapsed);
    attempt++
  )
    await page.waitForTimeout(50);
  assert.equal(user.uiPreferences.rightPanelWidth, 560);
  await page.reload();
  await page.waitForFunction(
    () => document.querySelector('.record-sidebar')?.getBoundingClientRect().width === 560,
  );
  assert.equal(user.uiPreferences.rightPanelWidth, 560);
  await page.getByRole('button', { name: 'Record actions', exact: true }).click();
  assert.equal(
    await page.getByRole('link', { name: 'Form Builder', exact: true }).locator('svg').count(),
    1,
  );
  await page.keyboard.press('Escape');
  await page.goto(`${base}/tasks?view=list`);
  assert.equal(await page.locator('.list-table .sr-only:empty').count(), 0);
  await page.getByRole('button', { name: 'Tasks actions', exact: true }).click();
  assert.equal(
    await page.getByRole('link', { name: 'Form Builder', exact: true }).getAttribute('href'),
    '/tasks/fields',
  );
  await page.keyboard.press('Escape');
  user.uiPreferences.rightPanelWidth = 320;

  await page.goto(`${base}/knowledge/new?knowledgeBaseId=dddddddddddddddddddddddd`);
  await page
    .getByLabel('Describe the article or process', { exact: true })
    .fill('Write a demo portal recovery guide.');
  await page.getByRole('button', { name: 'Generate Draft', exact: true }).click();
  await page.getByRole('button', { name: 'Use Draft in Form', exact: true }).click();
  const applyDraft = page.getByRole('dialog', { name: 'Use AI Draft', exact: true });
  assert.equal(
    await applyDraft
      .getByRole('button', { name: 'Cancel', exact: true })
      .evaluate((element) => element === document.activeElement),
    true,
  );
  await applyDraft.getByRole('button', { name: 'Use Draft', exact: true }).click();
  assert.equal(
    await page.getByLabel('Title *', { exact: true }).inputValue(),
    'Demo portal recovery',
  );
  await page
    .getByRole('textbox', { name: 'Article content', exact: true })
    .getByText('Review service health and confirm recovery before closing the incident.', {
      exact: true,
    })
    .waitFor();
  await page.getByRole('region', { name: 'Draft with AI', exact: true }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${output}/ai-drafting.png` });
  await page.goto(`${base}/knowledge`);
  await page.getByLabel('Question', { exact: true }).fill('How do we verify portal recovery?');
  await page.getByRole('button', { name: 'Ask', exact: true }).click();
  await page.getByRole('link', { name: '[1] Demo portal recovery guide', exact: true }).waitFor();
  await page.screenshot({ path: `${output}/ai-knowledge.png` });
  await page.goto(`${base}/on-call/edededededededededededed`);
  await page
    .getByRole('navigation', { name: 'Breadcrumb' })
    .getByRole('heading', {
      name: 'Alex Demo · Demo Customer Portal',
      exact: true,
    })
    .waitFor();
  await page
    .getByRole('term')
    .filter({ hasText: /^Start$/ })
    .waitFor();
  assert.equal(
    await page
      .getByRole('tabpanel')
      .filter({ has: page.getByRole('term').filter({ hasText: /^Start$/ }) })
      .locator('time')
      .first()
      .textContent(),
    dateTime('2026-10-11T08:00:56.789Z', user.timeZone, user.uiPreferences),
  );
  await page.goto(`${base}/on-call`);
  const headerReference = page
    .locator('[data-on-call-calendar]')
    .getByRole('combobox', { name: 'Service', exact: true });
  await headerReference.waitFor();
  const calendarSpacing = await page.locator('[data-on-call-calendar]').evaluate((calendar) => {
    const reference = calendar.querySelector('.reference-control').getBoundingClientRect();
    const grid = calendar.querySelector('[data-calendar-grid]').getBoundingClientRect();
    return { left: Math.abs(reference.left - grid.left), gap: grid.top - reference.bottom };
  });
  assert.ok(calendarSpacing.left < 1 && calendarSpacing.gap >= 11 && calendarSpacing.gap <= 13);
  await page.screenshot({ path: `${output}/on-call-calendar.png` });
  await page.locator('[data-calendar-grid] button[title^="Alex Demo:"]').first().click();
  const coverageModal = page.getByRole('dialog', { name: 'Coverage', exact: true });
  await coverageModal.waitFor();
  assert.ok(page.url().endsWith('/on-call'), 'Viewing coverage stays on the calendar');
  await coverageModal
    .getByRole('term')
    .filter({ hasText: /^Start$/ })
    .waitFor();
  await page.screenshot({ path: `${output}/on-call-coverage-modal.png` });
  await coverageModal.getByRole('button', { name: 'Edit Coverage', exact: true }).click();
  const coverageEditor = page.getByRole('dialog', { name: /^Edit coverage/ });
  assert.equal(
    await coverageEditor.locator('input[type="datetime-local"]').first().inputValue(),
    '2026-10-11T08:00:56.789',
  );
  assert.equal(
    await coverageEditor.locator('input[type="datetime-local"]').first().getAttribute('step'),
    '0.001',
  );
  await page
    .getByRole('dialog', { name: /^Edit coverage/ })
    .getByRole('button', { name: 'Cancel', exact: true })
    .click();
  assert.ok(page.url().endsWith('/on-call'));

  await headerReference.click();
  const serviceOptions = page.getByRole('listbox', { name: 'Service', exact: true });
  await serviceOptions.waitFor();
  assert.equal(
    await serviceOptions.evaluate((element) =>
      element.closest('[popover]').matches(':popover-open'),
    ),
    true,
  );
  assert.equal(
    await headerReference.evaluate((element) => getComputedStyle(element).borderTopWidth),
    '0px',
  );
  assert.equal(
    await headerReference.evaluate(
      (element) => getComputedStyle(element.closest('.reference-control')).borderTopWidth,
    ),
    '1px',
  );
  await page.getByRole('option', { name: 'Demo Customer Portal', exact: true }).click();
  await page.goto(`${base}/dashboard`);
  await page.getByRole('heading', { name: 'My Assignments', exact: true }).waitFor();
  const dashboardGap = () =>
    page.evaluate(
      () =>
        document
          .querySelector('[aria-labelledby="overview-attention-title"]')
          .getBoundingClientRect().top -
        document.querySelector('.dashboard-header').getBoundingClientRect().bottom,
    );
  await page.reload();
  await page.getByRole('heading', { name: 'My Assignments', exact: true }).waitFor();
  const freshGap = await dashboardGap();
  await page.goto(`${base}/incidents/${demoIncident.id}`);
  await page.getByRole('button', { name: 'Edit Record', exact: true }).waitFor();
  await page.getByRole('link', { name: 'Dashboard', exact: true }).click();
  await page.getByRole('heading', { name: 'My Assignments', exact: true }).waitFor();
  assert.equal(
    await dashboardGap(),
    freshGap,
    'Cached record panes do not alter dashboard spacing',
  );

  for (const report of ['my-incidents', 'team-incidents', 'my-tasks', 'team-tasks']) {
    assert.ok((await page.locator(`a[href="/dashboard/reports?report=${report}"]`).count()) > 0);
  }
  assert.equal(
    await page
      .getByRole('link', { name: 'View data: Critical / High Incidents', exact: true })
      .locator('..')
      .getAttribute('data-score-tone'),
    'rose',
  );
  assert.ok((await page.locator('[data-score-tone="amber"]').count()) >= 2);
  const dashboardAlignment = await page.evaluate(() => {
    const picker = document.querySelector('[aria-label="Dashboard View"]').getBoundingClientRect();
    const refresh = document.querySelector('button[title="Refresh dashboard"]');
    const cards = document
      .querySelector('.dashboard-scroll-area [aria-labelledby="overview-attention-title"]')
      .getBoundingClientRect();
    const button = refresh.getBoundingClientRect();
    const greeting = document.querySelector('.dashboard-header p').getBoundingClientRect();
    return {
      left: Math.abs(greeting.left - cards.left),
      pickerWidth: picker.width,
      pickerRight: picker.left >= greeting.right,
      greetingAligned: Math.abs(
        (greeting.top + greeting.bottom) / 2 - (picker.top + picker.bottom) / 2,
      ),
      adjacent: button.left - picker.right,
      gap: cards.top - picker.bottom,
      aligned: Math.abs((button.top + button.bottom) / 2 - (picker.top + picker.bottom) / 2),
      headerPadding: parseFloat(
        getComputedStyle(document.querySelector('.dashboard-header')).paddingBottom,
      ),
      background: getComputedStyle(refresh).backgroundColor,
    };
  });
  assert.ok(
    dashboardAlignment.left < 2 &&
      dashboardAlignment.pickerWidth <= 200 &&
      dashboardAlignment.pickerRight &&
      dashboardAlignment.greetingAligned < 2 &&
      dashboardAlignment.adjacent >= 7 &&
      dashboardAlignment.adjacent <= 9 &&
      dashboardAlignment.aligned < 2 &&
      dashboardAlignment.headerPadding >= 15 &&
      dashboardAlignment.gap >= 31 &&
      dashboardAlignment.gap <= 33,
    `Dashboard controls align beside the greeting: ${JSON.stringify(dashboardAlignment)}`,
  );
  assert.equal(dashboardAlignment.background, 'rgba(0, 0, 0, 0)');
  assert.ok(
    await page
      .locator('#overview-attention-title')
      .evaluate(
        (el) =>
          el.getBoundingClientRect().top <
          document.querySelector('[aria-label="Assignment overview"]').getBoundingClientRect().top,
      ),
  );
  assert.equal(
    await page
      .locator('.dashboard-header')
      .evaluate((element) => getComputedStyle(element).borderBottomWidth),
    '1px',
  );
  await page.screenshot({ path: `${output}/dashboard-overview.png` });
  await page.goto(`${base}/dashboard/reports?report=urgent`);
  await page
    .getByRole('heading', { name: 'Critical / High Unresolved Incidents', exact: true })
    .waitFor();
  assert.equal(
    await page
      .getByText(
        'Records matching the dashboard report. Search and export remain within this scope.',
        { exact: true },
      )
      .count(),
    0,
  );
  const listAlignment = await page.evaluate(() => {
    const header = document.querySelector('.record-sticky-header');
    const crumb = header.querySelector('nav').getBoundingClientRect();
    const actions = header.querySelector('button').getBoundingClientRect();
    return Math.abs((crumb.top + crumb.bottom) / 2 - (actions.top + actions.bottom) / 2);
  });
  assert.ok(listAlignment < 2, 'List breadcrumbs and actions align in one row');
  statusVisibility = 'public';
  await page.goto(`${base}/status`);
  await page.getByText('Demo Customer Portal', { exact: true }).waitFor();
  await page
    .locator('.record-sticky-header')
    .getByRole('link', { name: 'Manage Status Page', exact: true })
    .waitFor();
  await page
    .locator('.record-sticky-header')
    .getByRole('link', { name: 'Open Public Status Page in a new tab', exact: true })
    .waitFor();
  await page.screenshot({ path: `${output}/status-background.png` });
  await page.goto(`${base}/status/settings`);
  const statusMode = page.getByRole('combobox', { name: 'Status Page Appearance', exact: true });
  await statusMode.click();
  await page.getByRole('option', { name: 'Dark', exact: true }).click();
  assert.equal(
    await page.getByRole('textbox', { name: 'Page Background Color Hex', exact: true }).count(),
    0,
  );
  await page.screenshot({ path: `${output}/status-settings.png` });

  await page.goto(`${base}/profile`);
  await page.getByRole('radio', { name: 'Ocean', exact: true }).check();
  await page.waitForFunction(() => document.documentElement.dataset.colorScheme === 'ocean');
  const lightLogoFill = await logoFill();
  await page.getByRole('button', { name: 'Dark mode', exact: true }).click();
  await page.waitForFunction(() => document.documentElement.dataset.theme === 'dark');
  assert.notEqual(
    await logoFill(),
    lightLogoFill,
    'The logo background follows light and dark mode',
  );
  await page.getByRole('heading', { name: 'Theme', exact: true }).evaluate((element) => {
    const root = element.closest('.record-scroll-area');
    if (root) {
      window.scrollTo(0, 0);
      document.body.scrollTop = 0;
      root.scrollTop += element.getBoundingClientRect().top - root.getBoundingClientRect().top - 16;
    }
  });
  await page.screenshot({ path: `${output}/readme-themes-dark.png` });
  await page.goto(`${base}/dashboard`);
  await page.getByRole('heading', { name: 'Useful Shortcuts', exact: true }).waitFor();
  await page.evaluate(() => {
    const section = [...document.querySelectorAll('h2')]
      .find((item) => item.textContent === 'Incident Priority')
      .closest('section');
    const header = document.querySelector('.record-sticky-header');
    window.scrollTo({
      left: 0,
      top:
        window.scrollY +
        section.getBoundingClientRect().top -
        header.getBoundingClientRect().height -
        16,
      behavior: 'instant',
    });
  });
  await page.screenshot({ path: `${output}/readme-dashboard-dark.png` });
  const privateAppearance = await page.evaluate(() => ({
    theme: document.documentElement.dataset.theme,
    palette: document.documentElement.dataset.colorScheme,
    stored: localStorage.getItem('servicetrident-theme'),
  }));
  statusAppearance = 'dark';
  await page.goto(`${base}/status`);
  await page.getByText('Demo Customer Portal', { exact: true }).waitFor();
  await page.screenshot({ path: `${output}/readme-status-dark.png` });
  statusAppearance = 'dark';
  await page.goto(`${base}/status/public/${'9'.repeat(48)}`);
  await page.getByText('Demo Customer Portal', { exact: true }).waitFor();
  assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), 'dark');
  const visitorMode = page.getByRole('button', {
    name: 'Toggle status page appearance',
    exact: true,
  });
  assert.equal((await visitorMode.textContent()).trim(), '');
  assert.ok(
    await visitorMode.evaluate(
      (button) =>
        Math.abs(
          button.querySelector('svg').getBoundingClientRect().right -
            button.closest('header').getBoundingClientRect().right,
        ) < 1,
    ),
    'Visitor theme icon is flush with the header right edge',
  );
  await visitorMode.click();
  await page.waitForFunction(() => document.documentElement.dataset.theme === 'light');
  assert.equal(
    await page.evaluate(() => localStorage.getItem('servicetrident-theme')),
    privateAppearance.stored,
  );
  await visitorMode.click();
  await page.waitForFunction(() => document.documentElement.dataset.theme === 'dark');
  assert.equal(await page.evaluate(() => document.documentElement.dataset.colorScheme), 'white');
  await page.waitForFunction(
    () => getComputedStyle(document.body).backgroundColor === 'rgb(0, 0, 0)',
  );
  await page.reload();
  await page.getByText('Demo Customer Portal', { exact: true }).waitFor();
  assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), 'dark');
  assert.equal(
    await page.evaluate(() => localStorage.getItem('servicetrident-theme')),
    privateAppearance.stored,
  );
  await page.screenshot({ path: `${output}/public-status-appearance.png` });
  statusAppearance = 'light';
  await page.goto(`${base}/status`);
  await page.getByText('Demo Customer Portal', { exact: true }).waitFor();
  assert.equal(
    await page.evaluate(() => document.documentElement.dataset.theme),
    privateAppearance.theme,
  );
  assert.equal(
    await page.evaluate(() => document.documentElement.dataset.colorScheme),
    privateAppearance.palette,
  );
  await page.goto(`${base}/profile`);
  await page.getByRole('heading', { name: 'Theme', exact: true }).waitFor();
  assert.equal(
    await page.evaluate(() => document.documentElement.dataset.theme),
    privateAppearance.theme,
  );
  assert.equal(
    await page.evaluate(() => document.documentElement.dataset.colorScheme),
    privateAppearance.palette,
  );

  await page.goto(`${base}/tasks`);
  await page.getByRole('region', { name: 'Demo Review task cards', exact: true }).waitFor();
  await page.screenshot({ path: `${output}/readme-tasks-dark.png` });
  await page.goto(`${base}/knowledge/eeeeeeeeeeeeeeeeeeeeeeee`);
  await page.getByRole('heading', { name: 'Step-by-Step Process', exact: true }).waitFor();
  await page.getByText(/Loading article/).waitFor({ state: 'hidden' });
  await page.screenshot({ path: `${output}/readme-runbook-dark.png` });

  tasks[0].serviceId = services[0].id;
  tasks[0].serviceName = services[0].name;
  // Only synthetic navigation links are persisted; inactive tabs must stay lazy.
  await page.goto(`${base}/tasks/${tasks[0].id}`);
  await page.getByRole('button', { name: 'Edit Record', exact: true }).waitFor();
  const seedFullTabs = async (taskFirst = false) => {
    await page.evaluate(
      ({ taskId, taskFirst }) => {
        const saved = JSON.parse(sessionStorage.getItem('servicetrident-record-tabs'));
        const filler = Array.from({ length: 19 }, (_, index) => ({
          to: `/tasks/${String(index + 100).padStart(24, '0')}`,
          label: `Synthetic inactive task ${index}`,
        }));
        const task = { to: `/tasks/${taskId}`, label: 'Synthetic current task' };
        saved.tabs = taskFirst ? [task, ...filler] : [...filler, task];
        sessionStorage.setItem('servicetrident-record-tabs', JSON.stringify(saved));
      },
      { taskId: tasks[0].id, taskFirst },
    );
    await page.reload();
    await page.getByRole('button', { name: 'Edit Record', exact: true }).waitFor();
  };
  await seedFullTabs();
  await page.locator(`a[href="/services/${services[0].id}"]`).first().click();
  await page.waitForURL(`${base}/services/${services[0].id}`);
  const replaced = await page.evaluate(
    () => JSON.parse(sessionStorage.getItem('servicetrident-record-tabs')).tabs,
  );
  assert.equal(replaced.length, 20);
  assert.equal(replaced[0].label, 'Synthetic inactive task 1');
  assert.equal(replaced.at(-1).to, `/services/${services[0].id}`);
  const activeTabVisible = () =>
    page.waitForFunction(() => {
      const strip = document.querySelector('.record-navigation-scroll');
      const tab = strip?.querySelector('[data-active="true"]');
      if (!tab) return false;
      const bounds = strip.getBoundingClientRect(),
        selected = tab.getBoundingClientRect();
      const record = document.querySelector('.record-scroll-area:not([hidden])');
      return (
        selected.left >= bounds.left - 1 &&
        selected.right <= bounds.right + 1 &&
        window.scrollY === 0 &&
        record?.scrollTop === 0
      );
    });
  await activeTabVisible();
  await page.reload();
  await page.getByRole('button', { name: 'Edit Record', exact: true }).waitFor();
  await activeTabVisible();

  await page.goto(`${base}/tasks/${tasks[0].id}`);
  await seedFullTabs(true);
  await page.getByRole('button', { name: 'Edit Record', exact: true }).click();
  await page.getByLabel('Title *', { exact: true }).fill('Synthetic protected draft');
  await page.getByLabel('Title *', { exact: true }).blur();
  await page.locator(`a[href="/services/${services[0].id}"]`).first().click();
  const replacementDialog = page.getByRole('dialog', {
    name: 'Replace Oldest Record Tab?',
    exact: true,
  });
  await replacementDialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  assert.equal(
    await page.getByLabel('Title *', { exact: true }).inputValue(),
    'Synthetic protected draft',
  );
  await page.locator(`a[href="/services/${services[0].id}"]`).first().click();
  await replacementDialog
    .getByRole('button', { name: 'Replace Tab and Open Record', exact: true })
    .click();
  await page.waitForURL(`${base}/services/${services[0].id}`);
  assert.equal(
    await page.evaluate(
      () => JSON.parse(sessionStorage.getItem('servicetrident-record-tabs')).tabs.length,
    ),
    20,
  );

  const archivedField = {
    id: 'synthetic_archived',
    label: 'Synthetic archived field',
    type: 'text',
    required: false,
    archived: true,
    options: [],
  };
  visibilityFields.push(archivedField);
  for (const [path, record] of [
    [`/tasks/${tasks[0].id}`, tasks[0]],
    [`/knowledge/${demoArticles[0].id}`, demoArticles[0]],
    [`/incidents/${demoIncident.id}`, demoIncident],
  ]) {
    record.fields = [...(record.fields || []), { ...archivedField, archived: false }];
    record.custom = { ...record.custom, synthetic_archived: 'Synthetic retained value' };
    await page.goto(`${base}${path}`);
    await page.getByRole('button', { name: 'Edit Record', exact: true }).waitFor();
    assert.equal(await page.getByText('Synthetic archived field', { exact: true }).count(), 0);
    assert.equal(await page.getByText('Synthetic retained value', { exact: true }).count(), 0);
    await page.getByRole('button', { name: 'Edit Record', exact: true }).click();
    assert.equal(await page.getByLabel('Synthetic archived field', { exact: true }).count(), 0);
  }
  archivedField.archived = false;
  await page.reload();
  await page.getByText('Synthetic retained value', { exact: true }).waitFor();

  await page.goto(`${base}/events?view=events`);
  await page.getByRole('columnheader', { name: 'HTTP Status', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Filters', exact: true }).click();
  await page.getByRole('combobox', { name: 'Outcome', exact: true }).click();
  await page.getByRole('option', { name: 'Failure / Firing', exact: true }).click();
  await page.getByRole('combobox', { name: 'Incident', exact: true }).click();
  await page
    .getByRole('option', { name: `INC0000001 · ${demoIncident.title}`, exact: true })
    .click();
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  assert.ok(recordRequests.some((path) => path === '/tables/events'));
  await page.getByRole('link', { name: 'Create Monitor', exact: true }).waitFor();
  await page.getByRole('columnheader', { name: 'Incident', exact: true }).waitFor();
  await page.locator(`td a[href="/incidents/${demoIncident.id}"]`).first().waitFor();
  await page.screenshot({ path: `${output}/events-list.png` });
  const eventNumber = page.getByRole('link', { name: 'EVT0000001', exact: true });
  await eventNumber.waitFor();
  const inlineNumber = await eventNumber.evaluate((link) => {
    const text = link.querySelector('span').getBoundingClientRect();
    const icon = link.querySelector('svg').getBoundingClientRect();
    return (
      icon.left >= text.right &&
      Math.abs(icon.top + icon.height / 2 - (text.top + text.height / 2)) < 2
    );
  });
  assert.ok(inlineNumber, 'Record number and reference icon stay on the same line');
  await eventNumber.click();
  await page
    .getByRole('tabpanel', { name: /^Incidents/ })
    .getByRole('link')
    .first()
    .waitFor();
  await page.locator('.record-navigation-context').getByText('Event', { exact: true }).waitFor();
  const eventPanel = page.locator('.record-sidebar');
  if (await page.getByRole('button', { name: 'Expand record information', exact: true }).count())
    await page.getByRole('button', { name: 'Expand record information', exact: true }).click();
  await eventPanel.getByRole('heading', { name: 'Event Details', exact: true }).waitFor();
  await eventPanel.locator(`a[href="/monitors/${monitors[0].id}"]`).waitFor();
  await eventPanel.locator(`a[href="/services/${services[0].id}"]`).waitFor();
  await page
    .getByRole('separator', { name: 'Resize record information', exact: true })
    .press('End');
  await page.getByRole('button', { name: 'Collapse record information', exact: true }).click();
  await page.getByRole('button', { name: 'Expand record information', exact: true }).click();
  await page.screenshot({ path: `${output}/event-triggered-incidents.png` });
  assert.equal(
    await page
      .getByRole('tabpanel', { name: /^Incidents/ })
      .getByRole('link')
      .first()
      .getAttribute('href'),
    `/incidents/${demoIncident.id}`,
  );
  for (const viewport of [
    { width: 1440, height: 960 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    const bottom = page.getByText('This event predates detailed response capture.', {
      exact: false,
    });
    await bottom.evaluate((element) =>
      element.scrollIntoView({ block: 'end', behavior: 'instant' }),
    );
    const bounds = await bottom.boundingBox();
    assert.ok(
      bounds.y >= 0 && bounds.y + bounds.height <= viewport.height,
      'Event detail remains vertically scrollable',
    );
  }
  await page.setViewportSize({ width: 1440, height: 960 });
  detailedEvent = true;
  await page.reload();
  const responseHeaders = page.getByRole('heading', { name: 'Response Headers', exact: true });
  await responseHeaders.waitFor();
  assert.equal(await responseHeaders.count(), 1, 'Response headers has one heading');
  await responseHeaders.scrollIntoViewIfNeeded();
  await page.getByRole('cell', { name: 'text/plain', exact: true }).waitFor();
  await page.screenshot({ path: `${output}/event-response-headers.png` });
  const responseEventUrl = page.url();
  await captureRcaWorkflows();
  await page.goto(responseEventUrl);

  await page
    .getByRole('navigation', { name: 'Breadcrumb' })
    .getByRole('link', { name: 'Events', exact: true })
    .click();
  await page.waitForURL(`${base}/events`);
  await page.goto(`${base}/dashboard`);
  await page.getByRole('combobox', { name: 'Dashboard View', exact: true }).click();
  await page.getByRole('option', { name: 'Events', exact: true }).click();
  await page.getByRole('heading', { name: 'Check Outcomes', exact: true }).waitFor();
  assert.equal(await page.getByRole('heading', { name: 'Events', exact: true }).count(), 0);
  await page.screenshot({ path: `${output}/dashboard-events.png` });
  for (const viewport of [
    { width: 1440, height: 960 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    await page
      .getByRole('heading', { name: 'HTTP Responses', exact: true })
      .evaluate((element) => element.scrollIntoView({ block: 'end', behavior: 'instant' }));
    const bounds = await page
      .getByRole('heading', { name: 'HTTP Responses', exact: true })
      .boundingBox();
    assert.ok(bounds.y >= 0 && bounds.y < viewport.height, 'Events dashboard remains scrollable');
  }
  user.role = 'admin';
  await page.setViewportSize({ width: 1440, height: 960 });
  await page.goto(`${base}/integrations/ai`);
  await page.getByRole('switch', { name: 'Enable Demo AI', exact: true }).check();
  await page.getByRole('switch', { name: 'Enable AI Chat', exact: true }).check();
  await page.getByRole('button', { name: 'Open AI Chat', exact: true }).click();
  assert.equal(
    await page.locator('.ai-chat-launch svg path').getAttribute('d'),
    'M6 18 18 6M6 6l12 12',
    'Floating chat control shows the close icon',
  );
  await page.getByRole('combobox', { name: 'Mode', exact: true }).click();
  await page.getByRole('option', { name: 'Demo AI', exact: true }).click();
  for (const example of AI_DEMO_EXAMPLES) {
    await page.getByRole('button', { name: example.label, exact: true }).click();
    await page.getByText('Thinking', { exact: true }).waitFor();
    await page.getByText('Retrieving Example Data', { exact: true }).waitFor();
    await page
      .locator('#ai-chat-panel')
      .getByText(example.text, { exact: false })
      .first()
      .waitFor();
  }
  await page.getByRole('button', { name: 'Simulate Action', exact: true }).click();
  await page
    .getByRole('dialog', { name: 'Confirm AI Action', exact: true })
    .getByRole('button', { name: 'Simulate Action', exact: true })
    .click();
  await page
    .getByText('Simulated: incident resolved. No record was changed.', { exact: true })
    .waitFor();
  await page
    .locator('#ai-chat-panel')
    .getByRole('link', { name: `View ${demoIncident.title}`, exact: true })
    .last()
    .click();
  await page.waitForURL(`${base}/incidents/${demoIncident.id}`);
  await page.screenshot({ path: `${output}/ai-chat-demo.png` });
  for (const viewport of [
    { width: 390, height: 844 },
    { width: 1440, height: 960 },
  ]) {
    await page.setViewportSize(viewport);
    const panel = await page.locator('#ai-chat-panel').boundingBox();
    assert.ok(
      panel.x >= 0 &&
        panel.x + panel.width <= viewport.width &&
        panel.y >= 0 &&
        panel.y + panel.height < viewport.height,
    );
    await page.locator('.ai-chat-transcript').evaluate((element) => {
      element.scrollTop = element.scrollHeight;
    });
    assert.ok(
      await page.locator('.ai-chat-transcript').evaluate((element) => element.scrollTop > 0),
      'Long conversations scroll on desktop and mobile',
    );
  }
  await page.getByRole('combobox', { name: 'Mode', exact: true }).click();
  await page.getByRole('option', { name: 'Workspace AI', exact: true }).click();
  await page.getByRole('button', { name: 'Close AI Chat', exact: true }).last().click();
  tasks[0].status = 'todo';
  tasks[0].statusOption = 'todo';
  tasks[0].statusLabel = 'To Do';
  tasks[0].revision++;
  await page.goto(`${base}/tasks/${tasks[0].id}`);
  await page.getByRole('button', { name: 'Open AI Chat', exact: true }).click();
  await page
    .locator('.record-sidebar-content')
    .getByText('To Do', { exact: true })
    .first()
    .waitFor();
  await page.getByLabel('Message', { exact: true }).fill('Mark this task done');
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  await page.getByRole('button', { name: 'Review and Apply', exact: true }).waitFor();
  await page
    .locator('#ai-chat-panel')
    .getByRole('link', { name: `View ${tasks[0].title}`, exact: true })
    .click();
  await page.waitForURL(`${base}/tasks/${tasks[0].id}`);
  await page.screenshot({ path: `${output}/ai-chat-action.png` });
  await page.getByRole('button', { name: 'Review and Apply', exact: true }).click();
  await page
    .getByRole('dialog', { name: 'Confirm AI Action', exact: true })
    .getByRole('button', { name: 'Apply Changes', exact: true })
    .click();
  await page
    .getByText('Changes saved. Open records and lists have refreshed.', { exact: true })
    .waitFor();
  await page
    .locator('.record-sidebar-content')
    .getByText('Done', { exact: true })
    .first()
    .waitFor();
  await page.getByRole('button', { name: 'Close AI Chat', exact: true }).last().click();
  assert.deepEqual(faults, []);
  await captureLongReferences();
  await captureIncidentSource();
  await captureRecordExports();
  await captureMonitorIntervals();
  await captureCollaboration();
  await captureNavigation();
  await captureReadmeRecords();
  await captureMobileNavigation();
  await captureChatWorkspace();
  await captureMonitorHistoryColumns();
  await captureNotificationHistory();
  await captureEventManagement();
  await captureSettingsAndKeywords();
  assert.deepEqual(faults, []);
  console.log(
    'Captured synthetic screenshots, including five dark-mode README images; verified task ordering and loading, knowledge base destination exclusion and runbooks, accessible labels, global lanes, AI gating and drafts, logo themes, textarea growth, incident monitor events, date formats, and navigation and record header alignment.',
  );
} catch (error) {
  await page.screenshot({ path: `${output}/failure.png` });
  console.log('Browser faults', faults);
  throw error;
} finally {
  await browser.close();
}
