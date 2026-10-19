import { InputError } from '../validation/input-error.js';

export const DEMO_COUNT = 50;
export const DEMO_TYPES = Object.freeze([
  ['services', 'Services'],
  ['collections', 'Collections'],
  ['monitors', 'Monitors'],
  ['events', 'Events'],
  ['eventAlerts', 'Event alerts'],
  ['eventRules', 'Event rules'],
  ['escalationPolicies', 'Escalation policies'],
  ['maintenanceWindows', 'Maintenance windows'],
  ['probeAgents', 'Probe agents'],
  ['incidents', 'Incidents'],
  ['tasks', 'Tasks'],
  ['projects', 'Projects'],
  ['projectMilestones', 'Milestones'],
  ['projectActivity', 'Project activity'],
  ['rcas', 'Root cause analyses'],
  ['knowledge', 'Knowledge articles and runbooks'],
  ['groups', 'Groups'],
  ['users', 'Users'],
  ['coverage', 'On-call coverage'],
  ['integrations', 'Integrations'],
  ['invitations', 'Invitations'],
  ['comments', 'Incident comments'],
  ['workNotes', 'Work notes'],
  ['attachments', 'Attachments'],
  ['deliveries', 'Delivery history'],
]);

/** The count is server-owned; stale confirmations cannot delete a newer demo batch. */
export function validateDemoAction(action, body) {
  const keys = action === 'add' ? ['confirmation'] : ['confirmation', 'batchId'];
  if (
    !body ||
    typeof body !== 'object' ||
    Array.isArray(body) ||
    Object.keys(body).some((key) => !keys.includes(key))
  )
    throw new InputError('Send only the demo-data confirmation.', 400);
  if (body.confirmation !== (action === 'add' ? 'ADD DEMO DATA' : 'DELETE DEMO DATA'))
    throw new InputError('Confirm the demo-data action.', 400, {
      confirmation: 'Confirmation is required.',
    });
  if (
    action === 'delete' &&
    (typeof body.batchId !== 'string' || !/^[a-f0-9]{24}$/.test(body.batchId))
  )
    throw new InputError('Reload demo-data settings before deleting.', 400);
}
