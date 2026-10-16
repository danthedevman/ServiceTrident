import { monitorKeyword } from '../domain/monitor-keyword.js';
import { fieldErrors } from './form-validation.js';
import ipaddr from 'ipaddr.js';
import { InputError } from './input-error.js';

export { InputError } from './input-error.js';

/** @param {string} address IP literal. @returns {boolean} Whether it is public unicast. */
export function isPublicAddress(address) {
  try {
    const parsed = ipaddr.parse(address);
    // Reject mapped, translated, multicast, reserved, local and tunneling ranges.
    return parsed.range() === 'unicast';
  } catch {
    return false;
  }
}

/** Validate and canonicalize a public HTTP(S) URL without making a network request.
 * @param {unknown} value @returns {URL}
 */
export function parseTarget(value) {
  if (typeof value !== 'string' || value.length > 2048)
    throw new InputError('Enter a URL of at most 2,048 characters.');
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new InputError('Enter a complete http:// or https:// URL.');
  }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new InputError('Use HTTP or HTTPS without credentials in the URL.');
  }
  if (url.port)
    throw new InputError('Only standard HTTP (80) and HTTPS (443) ports are supported.');
  const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (ipaddr.isValid(host)) {
    if (!isPublicAddress(host))
      throw new InputError('Private and reserved network addresses are not allowed.');
  } else if (
    !host.includes('.') ||
    /(^|\.)(localhost|local|internal|test|invalid|onion)\.?$/.test(host)
  ) {
    throw new InputError('Use a public endpoint hostname.');
  }
  url.hash = '';
  return url;
}

/** @param {unknown} method @returns {'GET' | 'HEAD'} Supported read-only request method. */
export function validateMethod(method = 'GET') {
  if (method !== 'GET' && method !== 'HEAD')
    throw new InputError('Request method must be GET or HEAD.');
  return method;
}

/** @param {unknown} body @returns {{name: string, url: string, intervalMinutes: number, method: 'GET' | 'HEAD', followRedirects: boolean}} */
export function validateMonitor(body, { requireService = false } = {}) {
  if (body?.type && body.type !== 'http')
    throw new InputError('Only HTTP/HTTPS monitors are supported.', 400, {
      type: 'Choose an HTTP/HTTPS endpoint.',
    });
  const { name, url, intervalMinutes, method, followRedirects = false } = body ?? {};
  const errors = fieldErrors(requireService ? 'monitor-create' : 'monitor', body ?? {});
  if (Object.keys(errors).length)
    throw new InputError('Check the highlighted monitor fields.', 400, errors);
  try {
    parseTarget(url);
  } catch (error) {
    if (error instanceof InputError) error.fields = { url: error.message };
    throw error;
  }
  if (typeof name !== 'string' || !name.trim() || name.trim().length > 80)
    throw new InputError('Name must be between 1 and 80 characters.');
  if (!Number.isInteger(intervalMinutes) || intervalMinutes < 1 || intervalMinutes > 1440) {
    throw new InputError('Check interval must be a whole number from 1 to 1,440 minutes.');
  }
  if (typeof followRedirects !== 'boolean')
    throw new InputError('followRedirects must be a boolean.');
  return {
    keyword: monitorKeyword(body.keyword, {
      method: method ?? 'GET',
      authenticated: body.authentication?.mode
        ? body.authentication.mode !== 'none'
        : !!body.authSecret,
    }),
    followRedirects,
    name: name.trim(),
    url: parseTarget(url).href,
    intervalMinutes,
    method: validateMethod(method),
  };
}
