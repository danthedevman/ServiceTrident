/* eslint-disable no-control-regex -- Explicitly reject unsafe control bytes at input boundaries. */
import { InputError } from './input-error.js';

/** Return one field error in the same format as existing forms. */
export function invalid(field, message) {
  throw new InputError(message, 400, { [field]: message });
}

/** Validate a bounded text field without coercing objects into strings. */
export function text(value, field, max = 200, required = true) {
  const label =
    field === 'displayName'
      ? 'Name'
      : field
          .replace(/([a-z])([A-Z])/g, '$1 $2')
          .replaceAll('_', ' ')
          .replace(/^./, (first) => first.toUpperCase());
  if (required && (value == null || (typeof value === 'string' && !value.trim())))
    invalid(field, `${label} is required.`);
  if (typeof value !== 'string') invalid(field, `${label} must be text.`);
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value))
    invalid(field, `${label} contains unsupported control characters.`);
  if (value.trim().length > max) invalid(field, `${label} must be ${max} characters or fewer.`);
  return value.trim();
}

/** Validate a stable identifier used for embedded records. */
export function identifier(value, field = 'id') {
  if (typeof value !== 'string' || !/^[a-f0-9]{24}$/.test(value))
    invalid(field, `Choose a valid ${field}.`);
  return value;
}

/** Validate a choice without accepting MongoDB query objects. */
export function choice(value, values, field) {
  if (!values.includes(value)) invalid(field, `Choose ${values.join(', ')} for ${field}.`);
  return value;
}

/** Check references against a workspace-owned set. */
export function references(values, allowed, field) {
  if (
    !Array.isArray(values) ||
    values.length > 50 ||
    new Set(values).size !== values.length ||
    values.some((v) => typeof v !== 'string' || !allowed.includes(v))
  )
    invalid(field, `Choose available ${field} and remove duplicates.`);
  return values;
}
