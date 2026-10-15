import { text, invalid } from '../validation/fields.js';

export const USER_DETAIL_FIELDS = [
  { key: 'displayName', label: 'Name', max: 80, required: true },
  { key: 'jobTitle', label: 'Job title', max: 120 },
  { key: 'department', label: 'Department / team', max: 120 },
  { key: 'phone', label: 'On-call phone', max: 32, type: 'tel' },
  { key: 'timeZone', label: 'Time zone', max: 80, placeholder: 'America/New_York' },
  { key: 'slackId', label: 'Slack user ID', max: 32, communication: 'slack' },
  { key: 'location', label: 'Location', max: 160 },
];

/** Allowlist shared directory fields; identity, roles, and credentials are never accepted here. */
export function userDetails(input, current = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input))
    invalid('displayName', 'Send a valid profile object.');
  const result = {};
  for (const field of USER_DETAIL_FIELDS)
    result[field.key] = text(
      input[field.key] ?? current[field.key] ?? '',
      field.key,
      field.max,
      !!field.required,
    );
  if (result.slackId && !/^[UW][A-Z0-9]{8,31}$/.test(result.slackId))
    invalid('slackId', 'Enter a Slack member ID, such as U0123456789.');
  if (result.phone && !/^\+?[0-9 ()-]{7,32}$/.test(result.phone))
    invalid(
      'phone',
      'Enter a phone number with country code, digits, spaces, parentheses, or hyphens.',
    );
  if (result.timeZone) {
    try {
      new Intl.DateTimeFormat('en', { timeZone: result.timeZone });
    } catch {
      invalid('timeZone', 'Enter a valid time zone, such as America/New_York.');
    }
  }
  return result;
}

/** Return only supported directory fields, including empty values on older records. */
export function userDetailView(user) {
  return Object.fromEntries(USER_DETAIL_FIELDS.map(({ key }) => [key, user[key] ?? '']));
}
