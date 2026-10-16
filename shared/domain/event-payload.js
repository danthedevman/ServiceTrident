import { InputError } from '../validation/input-error.js';

/** Keep bounded diagnostic data, without persisting common credential fields. */
export function eventPayload(value) {
  if (value === undefined) return null;
  let nodes = 0;
  const visit = (input, depth = 0) => {
    if (++nodes > 1000 || depth > 6) throw new InputError('Event payload is too complex.');
    if (input === null || typeof input === 'boolean') return input;
    if (typeof input === 'number' && Number.isFinite(input)) return input;
    if (typeof input === 'string') {
      if (input.length > 8192)
        throw new InputError('Payload strings must not exceed 8,192 characters.');
      return input
        .replace(/\bBearer\s+\S+/gi, 'Bearer [redacted]')
        .replace(/(https?:\/\/)[^/\s@]+@/gi, '$1[redacted]@')
        .replace(
          /([?&](?:token|api[_-]?key|secret|password|access_token)=)[^&#\s]*/gi,
          '$1[redacted]',
        );
    }
    if (Array.isArray(input)) {
      if (input.length > 100) throw new InputError('Payload arrays must not exceed 100 items.');
      return input.map((item) => visit(item, depth + 1));
    }
    if (typeof input !== 'object') throw new InputError('Use a JSON object for payload.');
    const entries = Object.entries(input);
    if (entries.length > 100) throw new InputError('Payload objects must not exceed 100 fields.');
    return Object.fromEntries(
      entries.map(([key, item]) => {
        if (key.length > 100 || ['__proto__', 'constructor', 'prototype'].includes(key))
          throw new InputError('Payload contains an unsupported field name.');
        return [
          key,
          /authorization|cookie|password|passwd|token|secret|api[-_]?key|private[-_]?key|credential|session/i.test(
            key,
          )
            ? '[redacted]'
            : visit(item, depth + 1),
        ];
      }),
    );
  };
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new InputError('Use a JSON object for payload.');
  if (Buffer.byteLength(JSON.stringify(value), 'utf8') > 32768)
    throw new InputError('Event payload must not exceed 32 KiB.');
  return visit(value);
}
