import { InputError } from '../validation/input-error.js';

/** Literal matching avoids user-controlled regular expressions and unbounded execution. */
export function monitorKeyword(value, { method = 'GET', authenticated = false } = {}) {
  if (value == null) return null;
  if (
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).some((key) => !['text', 'condition', 'caseSensitive'].includes(key)) ||
    typeof value.text !== 'string' ||
    !value.text.trim() ||
    value.text.length > 200 ||
    [...value.text].some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127) ||
    !['contains', 'missing'].includes(value.condition) ||
    typeof value.caseSensitive !== 'boolean' ||
    method !== 'GET' ||
    authenticated
  )
    throw new InputError(
      'Use a keyword of 1–200 characters with an unauthenticated GET check.',
      400,
      { keywordText: 'Enter a keyword and use GET without authentication.' },
    );
  return {
    text: value.text.trim(),
    condition: value.condition,
    caseSensitive: value.caseSensitive,
  };
}

/** A missing match in a truncated preview is inconclusive, never a successful check. */
export function evaluateKeyword(rule, body) {
  if (!rule) return null;
  if (!body || body.omitted || body.error)
    return {
      triggered: true,
      matched: null,
      error: 'Keyword check could not read a text response body.',
    };
  const text = rule.caseSensitive ? body.text : body.text.toLowerCase();
  const keyword = rule.caseSensitive ? rule.text : rule.text.toLowerCase();
  const matched = text.includes(keyword);
  if (!matched && body.truncated)
    return {
      triggered: true,
      matched: null,
      error: 'Keyword check is inconclusive: response exceeds the 16 KiB text limit.',
    };
  const triggered = rule.condition === 'contains' ? matched : !matched;
  return {
    triggered,
    matched,
    error: triggered ? 'Configured keyword condition triggered.' : null,
  };
}
