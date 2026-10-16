import { validateRca, RCA_FIELDS, RCA_STATUSES } from '@servicetrident/shared/domain/rca';
import { randomBytes } from 'node:crypto';
import { ObjectId } from 'mongodb';
import { DEMO_COUNT } from '@servicetrident/shared/domain/demo-data';
import { auditStamp } from '@servicetrident/shared/domain/audit';
import { validateMonitor } from '@servicetrident/shared/validation/validation';
import { fieldErrors } from '@servicetrident/shared/validation/form-validation';
import { validateWork } from '@servicetrident/shared/domain/work';
import { validateFile } from '@servicetrident/shared/files/attachment-files';
import { textDocument, validateRichContent } from '@servicetrident/shared/files/rich-content';
import { fieldChoices, workBuiltinFields } from '@servicetrident/shared/forms/form-options';
import { BUILTIN_FIELDS, validateValues } from '@servicetrident/shared/forms/schema';
import { validateShifts } from '@servicetrident/shared/domain/on-call';

const topics = [
  'Checkout',
  'Identity',
  'Search',
  'Billing',
  'Inventory',
  'Messaging',
  'Analytics',
  'Storage',
  'Orders',
  'Customer portal',
];
const components = [
  'API',
  'Web application',
  'Background processing',
  'Partner gateway',
  'Reporting',
];
const firstNames = [
  'Maya',
  'James',
  'Sofia',
  'Noah',
  'Aisha',
  'Liam',
  'Elena',
  'Ethan',
  'Priya',
  'Daniel',
];
const lastNames = ['Chen', 'Patel', 'Morgan', 'Garcia', 'Williams'];
const scenarios = [
  {
    issue: 'Elevated response times',
    impact: 'Requests are taking longer than the service target during peak traffic.',
    task: 'Identify slow requests and review connection pool capacity',
    check: 'Compare request latency, traffic, and connection usage before and after the alert.',
    action: 'Check saturated pools and recent traffic changes before adjusting capacity.',
  },
  {
    issue: 'Intermittent authentication failures',
    impact: 'Some users cannot complete sign-in or renew their sessions.',
    task: 'Review token validation failures and signing key rotation',
    check: 'Correlate authentication errors with token expiry and identity provider availability.',
    action: 'Verify signing key propagation and session renewal before considering a rollback.',
  },
  {
    issue: 'Increased server errors after release',
    impact: 'A subset of requests fails following the latest deployment.',
    task: 'Compare failing requests with the previous release',
    check: 'Compare error rates by application version and identify the first failing deployment.',
    action:
      'Review the rollback procedure and validate compatibility before reverting the release.',
  },
  {
    issue: 'Delayed background jobs',
    impact: 'Queued updates are arriving later than expected for customers.',
    task: 'Inspect queue age and failed job retries',
    check: 'Review oldest job age, processing throughput, and recurring retry errors.',
    action: 'Resolve the failing dependency before increasing worker capacity or replaying jobs.',
  },
  {
    issue: 'Upstream dependency unavailable',
    impact: 'Requests that rely on an upstream service are failing or timing out.',
    task: 'Confirm dependency health and available fallback behavior',
    check: 'Compare dependency health checks with timeout and circuit-breaker logs.',
    action: 'Engage the dependency owner and verify documented fallback behavior.',
  },
];
/** Stable fictional identities keep related assignments readable without usable email addresses. */
function personName(index) {
  return `${firstNames[index % 10]} ${lastNames[Math.floor(index / 10) % 5]}`;
}
/** Fill required custom fields using the workspace's existing schema without editing that schema. */
function customValues(fields) {
  const result = {};
  for (const field of fields.filter(
    (field) => field.type !== 'builtin' && !field.archived && field.required,
  )) {
    const value =
      field.type === 'checkbox'
        ? true
        : field.type === 'number'
          ? 1
          : field.type === 'date'
            ? new Date().toISOString().slice(0, 10)
            : field.type === 'select'
              ? field.options.find((option) => !field.hiddenOptions?.includes(option))
              : 'Production';
    result[field.id] = value;
  }
  return validateValues(
    result,
    fields.filter((field) => field.type !== 'builtin'),
  );
}
/** Use configured visible choices and preserve canonical meanings in sample reporting. */
function choice(kind, fields, name, index) {
  const options = fieldChoices(
    kind,
    fields.find((field) => field.id === name) || { id: name },
  ).filter((option) => !option.hidden);
  if (!options.length) throw new Error(`No available ${name} choices.`);
  return options[index % options.length];
}

/** Generate an internally linked dataset. No credentials, network requests, or notifications are created. */
export function demoFixtures(workspaceId, actor, batchId, config, passwordHash, now = new Date()) {
  const list = () => Array.from({ length: DEMO_COUNT }, () => new ObjectId());
  const ids = Object.fromEntries(
    [
      'services',
      'collections',
      'monitors',
      'eventAlerts',
      'incidents',
      'tasks',
      'rcas',
      'articles',
      'knowledgeBases',
      'groups',
      'users',
      'shifts',
      'integrations',
      'attachments',
    ].map((key) => [key, list()]),
  );
  const result = {
    services: [],
    collections: [],
    groups: [],
    shifts: [],
    integrations: [],
    users: [],
    invitations: [],
    monitors: [],
    events: [],
    eventAlerts: [],
    incidents: [],
    tasks: [],
    rcas: [],
    articles: [],
    knowledgeBases: [],
    incidentComments: [],
    attachments: [],
    deliveries: [],
  };
  const schemas = {
    rcas: config.rcaFields || RCA_FIELDS,
    incidents: config.fields || BUILTIN_FIELDS,
    tasks: config.taskFields || workBuiltinFields('tasks'),
    knowledge: config.knowledgeFields || workBuiltinFields('knowledge'),
  };
  const stamp = (i) => ({
    ...auditStamp(null, actor, new Date(+now - (DEMO_COUNT - i) * 3600000)),
    demoBatchId: batchId,
  });
  for (let i = 0; i < DEMO_COUNT; i++) {
    const n = String(i + 1).padStart(2, '0'),
      topic = topics[i % topics.length],
      name = `${topic} ${components[Math.floor(i / 10)]}`,
      scenario = scenarios[i % 5],
      person = personName(i),
      serviceId = String(ids.services[i]);
    const service = {
      ...stamp(i),
      id: serviceId,
      name,
      description: `Supports ${topic.toLowerCase()} workflows through the ${components[Math.floor(i / 10)].toLowerCase()}.`,
      dependencyIds: i % 5 ? [String(ids.services[i - 1])] : [],
      ownerIds: [String(ids.users[i])],
      ownerGroupIds: [String(ids.groups[i])],
      primaryContactId: String(ids.users[i]),
    };
    const errors = fieldErrors('services', service);
    if (Object.keys(errors).length) throw new Error('Invalid demo service.');
    result.services.push(service);
    result.collections.push({
      ...stamp(i),
      id: String(ids.collections[i]),
      name: `${topic} · ${['Customer experience', 'Core platform', 'Operations', 'Partner services', 'Business insights'][Math.floor(i / 10)]}`,
      serviceIds: [serviceId],
    });
    result.groups.push({
      ...stamp(i),
      id: String(ids.groups[i]),
      name: `${name} support`,
      description: `Owns incident triage and operational readiness for ${name}.`,
      memberIds: [String(ids.users[i]), String(ids.users[(i + 1) % DEMO_COUNT])],
    });
    result.users.push({
      ...stamp(i),
      _id: ids.users[i],
      workspaceId,
      email: `${person.toLowerCase().replaceAll(' ', '.')}.${batchId}@example.invalid`,
      displayName: person,
      role: ['responder', 'user', 'viewer'][i % 3],
      disabled: true,
      passwordHash,
    });
    result.invitations.push({
      ...stamp(i),
      _id: randomBytes(32).toString('hex'),
      inviteId: String(new ObjectId()),
      workspaceId,
      email: `invite-${batchId}-${n}@example.invalid`,
      displayName: `${firstNames[(i + 3) % 10]} ${lastNames[(Math.floor(i / 10) + 2) % 5]}`,
      role: 'viewer',
      expiresAt: new Date(+now + 48 * 3600000),
    });
    const checkedAt = new Date(+now - (i % 14) * 86400000 - i * 60000),
      status = i % 5 === 0 ? 'down' : 'up';
    const input = {
      name: `${name} health check`,
      url: `https://example.com/health/${topic.toLowerCase().replaceAll(' ', '-')}/${Math.floor(i / 10) + 1}`,
      intervalMinutes: [1, 5, 15][i % 3],
      method: i % 2 ? 'GET' : 'HEAD',
      keyword: i % 2 ? { text: 'healthy', condition: 'missing', caseSensitive: false } : null,
      followRedirects: false,
      serviceId,
    };
    const monitor = {
      ...stamp(i),
      _id: ids.monitors[i],
      userId: workspaceId,
      ...validateMonitor(input, { requireService: true }),
      serviceId: ids.services[i],
      component: 'Health endpoint',
      paused: true,
      nextCheckAt: new Date(+now + 86400000),
      lastCheck: {
        checkedAt,
        status,
        statusCode: status === 'up' ? 200 : 503,
        durationMs: 50 + i * 13,
        error: status === 'up' ? null : 'HTTP 503 Service Unavailable',
      },
    };
    result.monitors.push(monitor);
    result.events.push({
      _id: new ObjectId(),
      demoBatchId: batchId,
      userId: workspaceId,
      monitorId: monitor._id,
      ...monitor.lastCheck,
      details: null,
      timing: {
        scheduledAt: checkedAt,
        startedAt: checkedAt,
        queuedAt: checkedAt,
        scheduleDelayMs: 0,
        dispatchDelayMs: 0,
        queueDelayMs: 0,
      },
    });
    const savedEvent = result.events.at(-1),
      alertId = String(ids.eventAlerts[i]);
    Object.assign(savedEvent, {
      sourceType: i % 2 ? 'external' : 'monitor',
      sourceName: i % 2 ? 'Deployment Pipeline' : monitor.name,
      title: `${name}: ${scenario.issue}`,
      description: scenario.impact,
      serviceId,
      serviceName: name,
      eventType: i % 2 ? 'alert' : 'check',
      signal: status === 'up' ? 'recovery' : 'firing',
      severity: status === 'up' ? 'info' : 'high',
      occurredAt: checkedAt,
      alertId,
    });
    if (i % 2) {
      delete savedEvent.monitorId;
      savedEvent.externalId = `release-${n}`;
      savedEvent.payload = {
        release: n,
        region: 'test-east',
        reason: status === 'down' ? 'error threshold' : 'recovered',
      };
    }
    result.eventAlerts.push({
      ...stamp(i),
      _id: ids.eventAlerts[i],
      workspaceId,
      title: savedEvent.title,
      description: scenario.impact,
      sourceType: savedEvent.sourceType,
      sourceName: savedEvent.sourceName,
      serviceId,
      serviceName: name,
      severity: savedEvent.severity,
      status: ['open', 'acknowledged', 'resolved'][i % 3],
      lastOccurredAt: checkedAt,
      latestEventId: String(savedEvent._id),
      eventOrder: `${checkedAt.toISOString()}:${savedEvent._id}`,
      revision: 0,
    });
    const incidentStatus = choice('incidents', schemas.incidents, 'status', i),
      severity = choice('incidents', schemas.incidents, 'severity', i);
    const incident = {
      ...stamp(i),
      _id: ids.incidents[i],
      workspaceId,
      serviceId,
      serviceName: name,
      title: `${name}: ${scenario.issue.toLowerCase()}`,
      description: `${scenario.impact} The response team is assessing the scope and checking recent changes to ${name}.`,
      source: 'manual',
      eventAlertId: String(ids.eventAlerts[i]),
      status: incidentStatus.base,
      statusOption: incidentStatus.value,
      statusLabel: incidentStatus.label,
      severity: severity.base,
      severityOption: severity.value,
      severityLabel: severity.label,
      assigneeId: i % 3 ? String(ids.users[i]) : null,
      openedForId: String(ids.users[i]),
      fields: schemas.incidents.filter((field) => field.type !== 'builtin'),
      custom: customValues(schemas.incidents),
      attachmentIds: [String(ids.attachments[i])],
      notifiedOpen: true,
      notifiedResolved: true,
      timeline: [
        {
          at: stamp(i).createdAt,
          by: actor.email,
          status: incidentStatus.base,
          note: 'Incident opened for service impact assessment.',
        },
      ],
    };
    result.incidents.push(incident);
    const taskStatus = choice('tasks', schemas.tasks, 'status', i % 4),
      priority = choice('tasks', schemas.tasks, 'priority', i);
    const taskInput = validateWork(
      {
        title: `${name}: ${scenario.task.toLowerCase()}`,
        description: `${scenario.check} Record findings, corrective action, and recovery evidence on the incident.`,
        serviceId,
        incidentId: String(incident._id),
        assigneeId: String(ids.users[i]),
        status: taskStatus.base,
        priority: priority.base,
        dueDate: new Date(+now + ((i % 7) - 3) * 86400000).toISOString().slice(0, 10),
      },
      'tasks',
    );
    result.tasks.push({
      ...stamp(i),
      _id: ids.tasks[i],
      workspaceId,
      ...taskInput,
      serviceName: name,
      incidentTitle: incident.title,
      assigneeName: person,
      statusOption: taskStatus.value,
      statusLabel: taskStatus.label,
      priorityOption: priority.value,
      priorityLabel: priority.label,
      fields: schemas.tasks.filter((field) => field.type !== 'builtin'),
      custom: customValues(schemas.tasks),
      attachmentIds: [],
    });
    const rca = validateRca({
      title: `${name}: ${scenario.issue.toLowerCase()} analysis`,
      status: ['draft', 'in_review', 'completed'][i % 3],
      summary: `${scenario.issue} affected ${name}. The team reviewed the response and identified preventative follow-up work.`,
      impact: scenario.impact,
      timeline: `${stamp(i).createdAt.toISOString()}: Impact identified and response started.\n${new Date(+stamp(i).createdAt + 15 * 60000).toISOString()}: Mitigation reviewed and service checks verified.`,
      rootCause: [
        'Connection pool capacity did not match peak request concurrency, causing requests to wait for available connections.',
        'Signing-key propagation lagged behind token issuance during rotation, causing intermittent validation failures.',
        'A release introduced a request-handling regression that was not covered by the deployment checks.',
        'Retry traffic exceeded worker throughput and delayed queued customer updates.',
        'A dependent service exceeded its response deadline and exhausted the caller’s retry budget.',
      ][i % 5],
      contributingFactors: `${scenario.check} Alert thresholds and rollout checks did not identify the risk early enough.`,
      correctiveActions: `${scenario.action} Add a regression check and track the linked corrective-action task to completion.`,
      lessonsLearned:
        'Keep service ownership and runbooks current, validate rollback steps, and review alert coverage after recovery.',
      incidentIds: [String(incident._id)],
      taskIds: [String(ids.tasks[i])],
    });
    result.rcas.push({
      ...stamp(i),
      _id: ids.rcas[i],
      workspaceId,
      ...rca,
      statusLabel: RCA_STATUSES[rca.status],
      fields: schemas.rcas.filter((field) => field.type !== 'builtin'),
      custom: customValues(schemas.rcas),
    });
    const articleType = i % 2 ? 'runbook' : 'article';
    const steps =
      articleType === 'runbook'
        ? [
            { title: 'Triage', instructions: scenario.check },
            { title: 'Mitigate the impact', instructions: scenario.action },
            {
              title: 'Verify recovery',
              instructions:
                'Confirm successful health checks and normal error rates across several check intervals. Record the recovery time and follow-up actions on the incident.',
            },
          ]
        : [];
    const articleStatus = choice('knowledge', schemas.knowledge, 'status', i % 2),
      rich = validateRichContent(
        textDocument(
          articleType === 'runbook'
            ? `${name}: ${scenario.issue}\nFollow the ordered steps to assess impact, mitigate the issue, and verify recovery.`
            : `${name}: ${scenario.issue}\nTriage\n${scenario.check}\nMitigation\n${scenario.action}\nRecovery\nConfirm successful health checks and normal error rates across several check intervals. Update the incident with the recovery time and follow-up actions.`,
        ),
      );
    result.knowledgeBases.push({
      ...stamp(i),
      _id: ids.knowledgeBases[i],
      workspaceId,
      title: `${name} Runbooks`,
      description: `Demo operating procedures for ${name}.`,
    });
    result.articles.push({
      ...stamp(i),
      _id: ids.articles[i],
      workspaceId,
      ...validateWork(
        {
          title: `${name}: ${scenario.issue.toLowerCase()} ${articleType === 'runbook' ? 'runbook' : 'guide'}`,
          articleType,
          steps,
          knowledgeBaseId: String(ids.knowledgeBases[i]),
          summary: `Triage, mitigation, and recovery checks for ${scenario.issue.toLowerCase()} in ${name}.`,
          content: rich.text,
          serviceId,
          status: articleStatus.base,
        },
        'knowledge',
      ),
      contentDocument: rich.document,
      knowledgeBaseTitle: `${name} Runbooks`,
      serviceName: name,
      statusOption: articleStatus.value,
      statusLabel: articleStatus.label,
      fields: schemas.knowledge.filter((field) => field.type !== 'builtin'),
      custom: customValues(schemas.knowledge),
      attachmentIds: [],
    });
    const start = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) + (i - 10) * 86400000,
    );
    result.shifts.push({
      ...stamp(i),
      id: String(ids.shifts[i]),
      userId: String(ids.users[i]),
      serviceIds: [serviceId],
      start: start.toISOString(),
      end: new Date(+start + 86400000).toISOString(),
    });
    result.integrations.push({
      ...stamp(i),
      id: String(ids.integrations[i]),
      name: `${name} operations alerts`,
      type: 'email',
      enabled: false,
      recovery: true,
      onCall: false,
      recipients: [`operations-${n}@example.invalid`],
      serviceIds: [serviceId],
      destination: 'SMTP',
      secret: null,
    });
    for (const kind of ['comment', 'work_note'])
      result.incidentComments.push({
        ...stamp(i),
        _id: new ObjectId(),
        workspaceId,
        incidentId: incident._id,
        kind,
        body:
          kind === 'comment'
            ? `We are investigating ${scenario.issue.toLowerCase()} affecting ${name}. We will share another update after confirming the scope and mitigation.`
            : `${scenario.check} ${scenario.action} Preserve relevant logs and record the timeline before making changes.`,
        authorId: String(ids.users[i]),
        author: person,
        // Six fresh in-app examples target the seeding admin; no email deliveries are queued.
        ...(i < 3 ? { createdAt: now, alertRecipientIds: [String(actor._id)] } : {}),
        recipientIds: [],
        notificationsQueued: true,
      });
    const bytes = Buffer.from(
      `Service: ${name}\nReported issue: ${scenario.issue}\nCustomer impact: ${scenario.impact}\nInvestigation: ${scenario.check}\n`,
    );
    result.attachments.push({
      _id: ids.attachments[i],
      demoBatchId: batchId,
      workspaceId,
      ownerId: String(actor._id),
      kind: 'incidents',
      recordId: String(incident._id),
      ...validateFile(`triage-notes-${n}.txt`, bytes),
      data: bytes,
      createdAt: now,
      lastLinkedAt: now,
    });
    result.deliveries.push({
      _id: `demo-${batchId}-${n}`,
      demoBatchId: batchId,
      workspaceId,
      incidentId: incident._id,
      integrationId: String(ids.integrations[i]),
      integrationName: `${name} operations alerts`,
      event: 'impacted',
      status: 'skipped',
      attempts: 0,
      createdAt: now,
      error: 'Demo delivery — no message sent.',
    });
  }
  validateShifts(
    result.shifts,
    result.users.map((row) => String(row._id)),
    result.services.map((row) => row.id),
  );
  return result;
}
