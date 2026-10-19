import { text, identifier, choice, invalid } from '../validation/fields.js';

export const AUTOMATION_KINDS = ['eventRules', 'escalationPolicies', 'maintenanceWindows'];
const shape = (value, allowed) => {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).some((key) => !allowed.includes(key))
  )
    invalid('configuration', 'Send only supported configuration fields.');
};
const flag = (value, field) => {
  if (typeof value !== 'boolean') invalid(field, 'Choose enabled or disabled.');
  return value;
};
const ids = (values, field) => {
  if (!Array.isArray(values) || values.length > 50 || new Set(values).size !== values.length)
    invalid(field, 'Choose up to 50 unique records.');
  return values.map((value) => identifier(value, field));
};
export function automationInput(kind, body) {
  const common = ['id', 'name', 'enabled'];
  const extras = {
    eventRules: ['match', 'conditions', 'actions'],
    escalationPolicies: ['serviceIds', 'steps'],
    maintenanceWindows: ['serviceIds', 'startsAt', 'endsAt', 'reason'],
  };
  if (!extras[kind]) invalid('kind', 'Choose a supported automation type.');
  shape(body, [...common, ...extras[kind]]);
  const value = {
    id: identifier(body.id),
    name: text(body.name, 'name', 80),
    enabled: flag(body.enabled ?? false, 'enabled'),
  };
  if (kind === 'eventRules') {
    value.match = choice(body.match ?? 'all', ['all', 'any'], 'match');
    if (!Array.isArray(body.conditions) || !body.conditions.length || body.conditions.length > 10)
      invalid('conditions', 'Add 1–10 conditions.');
    value.conditions = body.conditions.map((condition) => {
      shape(condition, ['field', 'operator', 'value']);
      const field = text(condition.field, 'field', 100);
      if (
        !/^(sourceType|sourceName|eventType|signal|severity|title|description|statusCode|durationMs|externalId|correlationKey|serviceId|payload\.[a-zA-Z0-9_-]+(?:\.[a-zA-Z0-9_-]+){0,3})$/.test(
          field,
        ) ||
        field.split('.').some((part) => ['__proto__', 'constructor', 'prototype'].includes(part))
      )
        invalid('field', 'Choose a supported event field.');
      const operator = choice(
        condition.operator,
        ['equals', 'contains', 'greater_than', 'less_than', 'exists'],
        'operator',
      );
      const compare = text(condition.value ?? '', 'value', 200, operator !== 'exists');
      if (['greater_than', 'less_than'].includes(operator) && !Number.isFinite(Number(compare)))
        invalid('value', 'Enter a finite number.');
      return { field, operator, value: compare };
    });
    shape(body.actions, [
      'severity',
      'serviceId',
      'assignmentGroupId',
      'suppress',
      'createIncident',
      'escalationPolicyId',
    ]);
    const actions = body.actions;
    value.actions = {
      ...(actions.severity
        ? {
            severity: choice(
              actions.severity,
              ['critical', 'high', 'medium', 'low', 'info'],
              'severity',
            ),
          }
        : {}),
      ...Object.fromEntries(
        ['serviceId', 'assignmentGroupId', 'escalationPolicyId']
          .filter((key) => actions[key])
          .map((key) => [key, identifier(actions[key], key)]),
      ),
      suppress: flag(actions.suppress ?? false, 'suppress'),
      createIncident: flag(actions.createIncident ?? false, 'createIncident'),
    };
    if (value.actions.suppress && value.actions.createIncident)
      invalid('actions', 'A suppressed rule cannot create an incident.');
  } else {
    value.serviceIds = ids(body.serviceIds ?? [], 'serviceIds');
    if (kind === 'escalationPolicies') {
      if (!Array.isArray(body.steps) || !body.steps.length || body.steps.length > 5)
        invalid('steps', 'Add 1–5 escalation steps.');
      let previous = -1;
      value.steps = body.steps.map((step) => {
        shape(step, ['afterMinutes', 'target', 'userId', 'integrationIds']);
        if (
          !Number.isInteger(step.afterMinutes) ||
          step.afterMinutes <= previous ||
          step.afterMinutes > 1440
        )
          invalid('afterMinutes', 'Use increasing delays from 0 to 1,440 minutes.');
        previous = step.afterMinutes;
        const target = choice(step.target, ['on_call', 'user'], 'target');
        const integrationIds = ids(step.integrationIds, 'integrationIds');
        if (!integrationIds.length)
          invalid('integrationIds', 'Choose at least one notification integration.');
        return {
          afterMinutes: step.afterMinutes,
          target,
          userId: target === 'user' ? identifier(step.userId, 'userId') : null,
          integrationIds,
        };
      });
      if (value.steps[0].afterMinutes !== 0)
        invalid('afterMinutes', 'The first step must start at 0 minutes.');
    } else {
      for (const field of ['startsAt', 'endsAt']) {
        const date = new Date(body[field]);
        if (
          typeof body[field] !== 'string' ||
          !/T.*(?:Z|[+-]\d\d:\d\d)$/.test(body[field]) ||
          !Number.isFinite(+date)
        )
          invalid(field, 'Enter a valid date and time with a timezone.');
        value[field] = date.toISOString();
      }
      if (
        value.endsAt <= value.startsAt ||
        +new Date(value.endsAt) - +new Date(value.startsAt) > 366 * 86400000
      )
        invalid('endsAt', 'End after the start and within one year.');
      value.reason = text(body.reason ?? '', 'reason', 500, false);
    }
  }
  return value;
}
export function eventRuleMatches(rule, event) {
  const matches = rule.conditions.map(({ field, operator, value }) => {
    let actual = event;
    for (const key of field.split('.'))
      actual =
        actual && typeof actual === 'object' && Object.hasOwn(actual, key)
          ? actual[key]
          : undefined;
    if (operator === 'exists') return actual !== undefined && actual !== null;
    if (!['string', 'number', 'boolean'].includes(typeof actual)) return false;
    if (operator === 'greater_than' || operator === 'less_than') {
      if (!String(actual).trim() || !Number.isFinite(Number(actual))) return false;
      return operator === 'greater_than'
        ? Number(actual) > Number(value)
        : Number(actual) < Number(value);
    }
    return operator === 'contains'
      ? String(actual).toLowerCase().includes(value.toLowerCase())
      : String(actual).toLowerCase() === value.toLowerCase();
  });
  return rule.match === 'any' ? matches.some(Boolean) : matches.every(Boolean);
}
/** Ordered rules merge actions; suppression always wins over incident creation. */
export function routeEvent(rules, event) {
  let result = { ...event, matchedRuleIds: [], suppressed: false, createIncident: false };
  for (const rule of rules.slice(0, 100)) {
    if (!rule.enabled || rule.demoBatchId || !eventRuleMatches(rule, event)) continue;
    const { suppress, ...actions } = rule.actions;
    result = {
      ...result,
      ...actions,
      suppressed: result.suppressed || suppress,
      matchedRuleIds: [...result.matchedRuleIds, rule.id],
    };
  }
  if (result.suppressed) result.createIncident = false;
  return result;
}
export const activeSilence = (config, serviceId, now = new Date()) =>
  (config.maintenanceWindows || []).find(
    (window) =>
      window.enabled &&
      !window.demoBatchId &&
      new Date(window.startsAt) <= now &&
      new Date(window.endsAt) > now &&
      (!window.serviceIds.length || window.serviceIds.includes(serviceId)),
  );
