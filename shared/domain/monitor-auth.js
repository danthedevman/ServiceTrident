import { parseTarget } from '../validation/validation.js';

export const MONITOR_AUTH_FIELDS = {
  none: [],
  basic: ['username', 'password'],
  bearer: ['token'],
  oauth: ['tokenUrl', 'clientId', 'clientSecret', 'scope', 'audience', 'authMethod'],
};
export function canRetainMonitorCredentials(value, current, url, previousUrl, configured) {
  if (!configured || value?.mode !== current?.mode) return false;
  try {
    if (new URL(url).origin !== new URL(previousUrl).origin) return false;
  } catch {
    return false;
  }
  if (value.mode === 'basic') return value.username === current.username;
  if (value.mode === 'oauth')
    return value.tokenUrl === current.tokenUrl && value.clientId === current.clientId;
  return true;
}
/** Shared actionable errors; secret values never enter validation messages. */
export function monitorAuthErrors(
  value,
  { url, followRedirects = false, current, previousUrl, configured = false } = {},
) {
  const errors = {},
    fail = (key, message) => {
      errors[`authentication.${key}`] = message;
    };
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    !Object.hasOwn(MONITOR_AUTH_FIELDS, value.mode)
  )
    return { 'authentication.mode': 'Choose a supported authentication method.' };
  const keys = MONITOR_AUTH_FIELDS[value.mode];
  if (Object.keys(value).some((key) => key !== 'mode' && !keys.includes(key)))
    fail('mode', 'Use only fields for the selected authentication method.');
  for (const key of keys)
    if (
      value[key] !== undefined &&
      (typeof value[key] !== 'string' ||
        Array.from(value[key]).some(
          (char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127,
        ))
    )
      fail(key, 'Enter text without control characters.');
  if (Object.keys(errors).length || value.mode === 'none') return errors;
  try {
    if (
      [...parseTarget(url).searchParams.keys()].some((key) =>
        /^(access_token|token|api[-_]?key|authorization|password|secret|client[-_]?secret)$/i.test(
          key,
        ),
      )
    )
      errors.url = 'Put credentials in Authentication fields, not URL parameters.';
    if (parseTarget(url).protocol !== 'https:')
      errors.url = 'Authenticated monitors require HTTPS.';
  } catch {
    errors.url = 'Choose a public HTTPS endpoint.';
  }
  if (followRedirects)
    errors.followRedirects =
      'Authenticated monitors cannot follow redirects. Use the final HTTPS endpoint.';
  const retain = canRetainMonitorCredentials(value, current, url, previousUrl, configured);
  const text = (key, label, max, required) => {
    if (required && !value[key]) fail(key, `${label} is required.`);
    else if ((value[key]?.length || 0) > max)
      fail(key, `${label} must be ${max} characters or fewer.`);
  };
  if (value.mode === 'basic') {
    text('username', 'Username', 200, true);
    text('password', 'Password', 1000, !retain);
    if (value.username?.includes(':')) fail('username', 'Username cannot contain a colon.');
  }
  if (value.mode === 'bearer') {
    text('token', 'Bearer token', 8192, !retain);
    if (value.token && /[^\x21-\x7e]/.test(value.token))
      fail('token', 'Enter a bearer token without spaces.');
  }
  if (value.mode === 'oauth') {
    text('clientId', 'Client ID', 200, true);
    text('clientSecret', 'Client secret', 1000, !retain);
    text('scope', 'Scope', 2000, false);
    text('audience', 'Audience', 2048, false);
    if (!['client_secret_basic', 'client_secret_post'].includes(value.authMethod))
      fail('authMethod', 'Choose a supported client authentication method.');
    try {
      const endpoint = parseTarget(value.tokenUrl);
      if (endpoint.protocol !== 'https:' || endpoint.search) throw new Error();
    } catch {
      fail('tokenUrl', 'Use a public HTTPS token endpoint without query parameters.');
    }
  }
  return errors;
}
