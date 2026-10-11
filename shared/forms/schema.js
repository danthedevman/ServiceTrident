import { builtinChoices, fieldChoices } from './form-options.js';

import { invalid } from '../validation/fields.js';
import { text } from '../validation/fields.js';
import { identifier } from '../validation/fields.js';
import { choice } from '../validation/fields.js';
import { references } from '../validation/fields.js';

/** System Field labels and additional choices are configurable; identity and workflow stay stable. */
export const BUILTIN_FIELDS = [
  { id: 'title', label: 'Title', type: 'builtin', required: true },
  { id: 'serviceId', label: 'Service', type: 'builtin', required: true },
  { id: 'severity', label: 'Severity', type: 'builtin', required: true },
  { id: 'status', label: 'Status', type: 'builtin', required: true },
  { id: 'assignmentGroupId', label: 'Assignment group', type: 'builtin', required: false },
  { id: 'assigneeId', label: 'Assigned to', type: 'builtin', required: false },
  { id: 'openedForId', label: 'Opened for', type: 'builtin', required: false },
  { id: 'description', label: 'Description', type: 'builtin', required: false },
  { id: 'knowledgeIds', label: 'Knowledge', type: 'builtin', required: false },
  { id: 'resolutionNotes', label: 'Resolution notes', type: 'builtin', required: false },
].map((field) => ({ ...field, archived: false, options: [] }));

/** Validate incident fields; stable IDs preserve historical reporting. */
export function validateFields(
  fields,
  previous = [],
  builtins = BUILTIN_FIELDS,
  kind = 'incidents',
) {
  if (!Array.isArray(fields) || fields.length > builtins.length + 20)
    invalid('fields', 'Use at most 20 custom fields.');
  const seen = new Set();
  const result = fields.map((field) => {
    if (!field || typeof field !== 'object')
      invalid('fields', 'Each field needs a label and type.');
    const builtin = builtins.find((f) => f.id === field.id);
    const id = builtin ? builtin.id : identifier(field.id, 'field ID');
    if (seen.has(id)) invalid('fields', 'Field IDs must be unique.');
    seen.add(id);
    if (builtin) {
      const saved = previous.find((entry) => entry.id === id) ?? builtin;
      const selectable = !!builtinChoices[kind]?.[id];
      if (
        [...new Set([...Object.keys(saved), ...Object.keys(field)])].some(
          (key) =>
            key !== 'label' &&
            key !== 'helpText' &&
            !(kind === 'incidents' && id === 'resolutionNotes' && key === 'required') &&
            !(selectable && key === 'choices') &&
            JSON.stringify(field[key]) !== JSON.stringify(saved[key]),
        )
      )
        invalid('fields', 'System Field settings cannot be changed.');
      const result = { ...saved, label: text(field.label, 'label', 80) };
      // Resolution requirements are workspace policy; other system constraints stay fixed.
      if (kind === 'incidents' && id === 'resolutionNotes') {
        if (typeof field.required !== 'boolean') invalid('fields', 'Required must be a boolean.');
        result.required = field.required;
      }
      if (field.helpText !== undefined)
        result.helpText = text(field.helpText, 'helpText', 1000, false);
      if (selectable && field.choices !== undefined) {
        result.choices = validateChoices(field.choices, kind, id);
        // Existing option identities and mappings must survive relabeling and additions.
        for (const old of fieldChoices(kind, saved)) {
          const next = result.choices.find((option) => option.value === old.value);
          if (!next || next.base !== old.base || next.hidden !== (old.hidden === true))
            invalid(
              'fields',
              'Existing System Field options and workflow meanings cannot be removed or changed.',
            );
        }
      } else if (selectable && saved.choices) {
        invalid('fields', 'Existing System Field options cannot be removed.');
      }
      return result;
    }
    const type = choice(
      field.type,
      ['text', 'textarea', 'number', 'select', 'checkbox', 'date'],
      'type',
    );
    const old = previous.find((f) => f.id === id);
    if (old && old.type !== type)
      invalid('fields', 'Archive the old field and add a new field to change its type.');
    const options = type === 'select' ? field.options : [];
    if (!Array.isArray(options) || options.length > 30 || (type === 'select' && !options.length))
      invalid('fields', 'Select fields need 1–30 options.');
    const clean = options.map((v) => text(v, 'option', 80));
    if (new Set(clean).size !== clean.length) invalid('fields', 'Options must be unique.');
    return {
      id,
      label: text(field.label, 'label', 80),
      ...(field.helpText !== undefined
        ? { helpText: text(field.helpText, 'helpText', 1000, false) }
        : {}),
      type,
      required: field.required === true,
      archived: field.archived === true,
      options: clean,
      hiddenOptions: references(field.hiddenOptions ?? [], clean, 'hiddenOptions'),
    };
  });
  if (builtins.some((field) => !seen.has(field.id)))
    invalid('fields', 'System Fields cannot be removed.');
  if (previous.some((old) => !seen.has(old.id)))
    invalid('fields', 'Archive existing fields instead of removing them to preserve reports.');
  return result;
}

/** Validate custom values against the incident's saved schema, not a newer form version. */
export function validateValues(values, fields, previousValues = {}) {
  if (
    !values ||
    typeof values !== 'object' ||
    Array.isArray(values) ||
    Object.keys(values).some((key) => !fields.some((f) => f.id === key))
  )
    invalid('custom', 'Custom fields do not match this incident form.');
  const result = {};
  for (const field of fields) {
    const value = values[field.id];
    if (field.archived) {
      if (previousValues[field.id] !== undefined) result[field.id] = previousValues[field.id];
      continue;
    }
    if (value === undefined || value === null || value === '') {
      if (field.required) invalid(field.id, `${field.label} is required.`);
      continue;
    }
    if (field.type === 'checkbox') {
      if (typeof value !== 'boolean' || (field.required && !value))
        invalid(field.id, `${field.label} must be checked.`);
    } else if (field.type === 'number') {
      if (typeof value !== 'number' || !Number.isFinite(value) || Math.abs(value) > 1e12)
        invalid(
          field.id,
          `${field.label} needs a finite number between -1 trillion and 1 trillion.`,
        );
    } else {
      text(value, field.id, field.type === 'textarea' ? 2000 : 500, field.required);
      if (
        field.type === 'select' &&
        (!field.options.includes(value) || field.hiddenOptions?.includes(value)) &&
        value !== previousValues[field.id]
      )
        invalid(field.id, `Choose an option for ${field.label}.`);
      if (
        field.type === 'date' &&
        (!/^\d{4}-\d{2}-\d{2}$/.test(value) ||
          !Number.isFinite(Date.parse(value)) ||
          new Date(value).toISOString().slice(0, 10) !== value)
      )
        invalid(field.id, `Enter a valid date for ${field.label}.`);
    }
    result[field.id] = value;
  }
  return result;
}

/** Built-in options are permanent; added options map to a known workflow meaning. */
export function validateChoices(choices, kind, field) {
  const bases = builtinChoices[kind][field];
  if (!Array.isArray(choices) || choices.length > 50) invalid('fields', 'Use at most 50 choices.');
  const values = new Set(),
    labels = new Set();
  const result = choices.map((option) => {
    if (!option || typeof option !== 'object') invalid('fields', 'Enter valid choices.');
    const value = bases.includes(option.value)
      ? option.value
      : identifier(option.value, 'option ID');
    const label = text(option.label, 'option label', 80),
      base = choice(option.base, bases, 'workflow mapping');
    if (bases.includes(value) && base !== value)
      invalid('fields', 'System Field meanings cannot change.');
    if (values.has(value) || labels.has(label.toLowerCase()))
      invalid('fields', 'Choice values and labels must be unique.');
    values.add(value);
    labels.add(label.toLowerCase());
    return { value, label, base, hidden: option.hidden === true };
  });
  if (bases.some((value) => !values.has(value)))
    invalid('fields', 'System Field options cannot be deleted.');
  if (!result.some((option) => !option.hidden))
    invalid('fields', 'Keep at least one option visible.');
  if (
    kind === 'incidents' &&
    field === 'status' &&
    !result.some((option) => !option.hidden && option.base === 'open')
  )
    invalid('fields', 'Keep an Open-mapped option visible for new incidents.');
  return result;
}

/** Resolve configurable choices to canonical values before validation, reporting, or automation. */
export function resolveChoices(body, schema, kind, current = null) {
  const result = { ...body };
  for (const field of Object.keys(builtinChoices[kind])) {
    const options = fieldChoices(kind, schema.find((row) => row.id === field) || { id: field });
    const key = `${field}Option`,
      selected =
        (current &&
        body[field] !== undefined &&
        body[field] !== current[field] &&
        body[key] === current[key]
          ? body[field]
          : body[key]) ??
        body[field] ??
        current?.[key] ??
        current?.[field] ??
        (field === 'status'
          ? kind === 'incidents'
            ? 'open'
            : kind === 'tasks'
              ? 'todo'
              : 'draft'
          : field === 'articleType'
            ? 'article'
            : 'medium');
    const option = options.find((row) => row.value === selected);
    const unchanged = !!current && selected === (current[key] ?? current[field]);
    if ((!option || option.hidden) && !unchanged) invalid(field, 'Choose an available option.');
    result[field] = option?.base ?? current[field];
    result[key] = selected;
    result[`${field}Label`] = option?.label ?? current?.[`${field}Label`] ?? result[field];
  }
  return result;
}

/** Required built-ins share one rule in forms and API; resolution notes apply only to resolved incidents. */
export function mandatoryErrors(schema, values) {
  const errors = {};
  for (const field of schema) {
    if (!field.required || field.archived || field.type !== 'builtin') continue;
    if (field.id === 'resolutionNotes' && values.status !== 'resolved') continue;
    const value = values[field.id];
    if (
      value == null ||
      (typeof value === 'string' && !value.trim()) ||
      (Array.isArray(value) && !value.length)
    )
      errors[field.id] = `${field.label} is required.`;
  }
  return errors;
}

/** Reject missing configured built-ins before any mutation or attachment claim. */
export function validateMandatory(schema, values) {
  const errors = mandatoryErrors(schema, values);
  const first = Object.keys(errors)[0];
  if (first) invalid(first, errors[first]);
}
