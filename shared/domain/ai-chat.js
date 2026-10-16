import { InputError } from '../validation/input-error.js';

/** Fixed demo narratives never call a model; demo navigation metadata is resolved separately. */
export const AI_DEMO_EXAMPLES = [
  {
    id: 'attention',
    label: 'What needs attention?',
    prompt: 'Which incidents need attention right now?',
    text: 'Demo output: Checkout API has a critical open incident after three failed checks. Payments latency is elevated. Start with Checkout API, verify its dependency health, and notify the incident owner. These are fictional examples.',
    records: [
      {
        title: 'Checkout API unavailable',
        type: 'Incident',
        status: 'Open',
        detail: 'Critical · Checkout API',
      },
      {
        title: 'Payments latency elevated',
        type: 'Incident',
        status: 'Acknowledged',
        detail: 'High · Payments',
      },
    ],
  },
  {
    id: 'mine',
    label: 'My assigned work',
    prompt: 'Show unresolved incidents and tasks assigned to me.',
    text: 'Demo output: You have one acknowledged incident and two unfinished tasks. Investigate payment latency first, then validate the recovery checks. These are fictional assignments.',
    records: [
      {
        title: 'Investigate payment latency',
        type: 'Incident',
        status: 'Acknowledged',
        detail: 'Assigned to you',
      },
      {
        title: 'Validate recovery checks',
        type: 'Task',
        status: 'In progress',
        detail: 'Assigned to you',
      },
      {
        title: 'Update the recovery runbook',
        type: 'Task',
        status: 'To do',
        detail: 'Assigned to you',
      },
    ],
  },
  {
    id: 'explain',
    label: 'Explain a failed check',
    prompt: 'Why did the latest Checkout API monitor check fail?',
    text: 'Demo output: The check received HTTP 503 in 820 ms. That establishes that an HTTP response was received and the service reported unavailability. A dependency outage is a hypothesis; verify dependency checks and deployment history before concluding a cause.',
    records: [
      {
        title: 'Checkout API health check',
        type: 'Event',
        status: 'Down',
        detail: 'HTTP 503 · 820 ms',
      },
    ],
  },
  {
    id: 'similar',
    label: 'Find similar incidents',
    prompt: 'Have we seen checkout failures before?',
    text: 'Demo output: A previous checkout outage had similar symptoms and was resolved after correcting a connection-pool configuration. Similar symptoms do not establish the same cause. Review the earlier resolution and verify current evidence.',
    records: [
      {
        title: 'Checkout connection pool exhausted',
        type: 'Incident',
        status: 'Resolved',
        detail: 'Resolution: configuration corrected',
      },
    ],
  },
  {
    id: 'runbook',
    label: 'Find a recovery runbook',
    prompt: 'What runbook should I use for payment latency?',
    text: 'Demo output: Use Payment Latency Triage. First verify the latency trend, inspect dependency health, and confirm the current owner. Apply mitigation only after validating it for your environment.',
    records: [
      {
        title: 'Payment Latency Triage',
        type: 'Runbook',
        status: 'Published',
        detail: 'Verify latency → check dependencies → validate mitigation',
      },
    ],
  },
  {
    id: 'resolve',
    label: 'Resolve and draft a recap',
    prompt: 'Resolve the recovered checkout incident and draft a postmortem.',
    text: 'Demo output: Recovery checks are successful. Proposed action: resolve Checkout API unavailable with notes “Recovery verified by successful checks.” Review and confirm before applying. Postmortem draft: Impact—checkout requests failed. Timeline—three failures followed by recovery. Root cause—unconfirmed. Follow-up—investigate the dependency and update the runbook.',
    records: [
      {
        title: 'Checkout API unavailable',
        type: 'Incident',
        status: 'Open',
        detail: 'Proposed: Resolved · Recovery verified by successful checks',
      },
    ],
    action: true,
  },
];

const fields = {
  incidents: {
    serviceId: 'id',
    title: 160,
    description: 5000,
    resolutionNotes: 5000,
    severity: ['low', 'medium', 'high', 'critical'],
    status: ['open', 'acknowledged', 'resolved'],
    assigneeId: ['me'],
  },
  tasks: {
    serviceId: 'id',
    title: 160,
    description: 5000,
    priority: ['low', 'medium', 'high'],
    status: ['todo', 'in_progress', 'blocked', 'done'],
    assigneeId: ['me'],
  },
  knowledge: { title: 160, summary: 500, content: 12000 },
  rcas: {
    title: 160,
    status: ['draft', 'in_review', 'completed'],
    summary: 10000,
    impact: 10000,
    timeline: 10000,
    rootCause: 10000,
    contributingFactors: 10000,
    correctiveActions: 10000,
    lessonsLearned: 10000,
    incidentIds: 'ids',
    taskIds: 'ids',
  },
};
/** Models propose a narrow action vocabulary, never API paths, actors, credentials, or query operators. */
export function validateAIAction(value) {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).some((key) => !['kind', 'id', 'operation', 'changes'].includes(key))
  )
    throw new InputError('The assistant proposed an unsupported action.', 502);
  const allowed =
    typeof value.kind === 'string' && Object.hasOwn(fields, value.kind) ? fields[value.kind] : null;
  if (
    !allowed ||
    !['create', 'update'].includes(value.operation) ||
    (value.operation === 'update' && !/^[a-f\d]{24}$/i.test(value.id ?? '')) ||
    (value.operation === 'create' && value.id)
  )
    throw new InputError('The assistant proposed an unsupported record action.', 502);
  const changes = value.changes;
  if (
    !changes ||
    typeof changes !== 'object' ||
    Array.isArray(changes) ||
    !Object.keys(changes).length ||
    Object.keys(changes).length > (value.kind === 'rcas' ? 12 : 6)
  )
    throw new InputError('The assistant proposed an invalid change.', 502);
  for (const [key, entry] of Object.entries(changes)) {
    const rule = Object.hasOwn(allowed, key) ? allowed[key] : null;
    if (
      !rule ||
      (rule === 'ids'
        ? !Array.isArray(entry) ||
          entry.length > 20 ||
          new Set(entry).size !== entry.length ||
          entry.some((id) => typeof id !== 'string' || !/^[a-f\d]{24}$/i.test(id))
        : typeof entry !== 'string' ||
          (rule === 'id'
            ? !/^[a-f\d]{24}$/i.test(entry)
            : Array.isArray(rule)
              ? !rule.includes(entry)
              : entry.length > rule))
    )
      throw new InputError('The assistant proposed an unsupported field value.', 502);
  }
  if (
    value.operation === 'create' &&
    (!changes.title?.trim() || (value.kind === 'knowledge' && !changes.content?.trim()))
  )
    throw new InputError('The assistant draft is missing required content.', 502);
  if (
    value.operation === 'create' &&
    value.kind === 'incidents' &&
    changes.status &&
    changes.status !== 'open'
  )
    throw new InputError('New incidents must start open.', 502);
  return {
    kind: value.kind,
    operation: value.operation,
    ...(value.id ? { id: value.id } : {}),
    changes,
  };
}
