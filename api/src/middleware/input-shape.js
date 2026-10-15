/* eslint-disable no-control-regex -- Explicitly reject unsafe control bytes at input boundaries. */
import { InputError } from '@servicetrident/shared/validation/input-error';

const forbidden = new Set(['__proto__', 'prototype', 'constructor']);
/** Reject ambiguous query values and dangerous object shapes before any route consumes them.
 * Field validators still decide types, lengths, permissions and allowable domain values.
 */
export function validateInputShape(req, res, next) {
  for (const [key, value] of Object.entries(req.query || {})) {
    if (
      forbidden.has(key) ||
      key.length > 100 ||
      typeof value !== 'string' ||
      value.length > 16384 ||
      /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)
    )
      throw new InputError('Use one bounded text value for each query parameter.');
  }
  if (req.body === undefined) {
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && req.is?.('application/json'))
      req.body = {};
    else return next();
  }
  if (Buffer.isBuffer(req.body)) return next();
  if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body))
    throw new InputError('Send a JSON object.');
  const pending = [{ value: req.body, depth: 0, password: false }];
  let visited = 0;
  while (pending.length) {
    const { value, depth, password } = pending.pop();
    if (++visited > 50000 || depth > 48) throw new InputError('Request structure is too complex.');
    if (
      typeof value === 'string' &&
      !password &&
      /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)
    )
      throw new InputError('Text contains unsupported control characters.');
    if (!value || typeof value !== 'object') continue;
    for (const [key, child] of Object.entries(value)) {
      if (forbidden.has(key) || /[\u0000-\u001f\u007f]/.test(key))
        throw new InputError('Request contains an unsupported field name.');
      pending.push({
        value: child,
        depth: depth + 1,
        password: ['password', 'currentPassword', 'newPassword'].includes(key),
      });
    }
  }
  next();
}
