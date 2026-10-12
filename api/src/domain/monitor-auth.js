import { seal, unseal } from '@servicetrident/shared/integrations/secrets';
import {
  monitorAuthErrors,
  canRetainMonitorCredentials,
} from '@servicetrident/shared/domain/monitor-auth';
import { InputError } from '@servicetrident/shared/validation/input-error';

/** Only admin writes may retain or replace credentials; clients never receive decrypted secrets. */
export function prepareMonitorAuthentication(value, current, url, followRedirects) {
  value ??= { ...(current?.authConfig || { mode: 'none' }) };
  const context = {
    url,
    followRedirects,
    current: current?.authConfig,
    previousUrl: current?.url,
    configured: !!current?.authSecret,
  };
  const errors = monitorAuthErrors(value, context);
  if (Object.keys(errors).length)
    throw new InputError('Check monitor authentication settings.', 400, errors);
  if (value.mode === 'none') return { authConfig: { mode: 'none' }, authSecret: null };
  const previous = canRetainMonitorCredentials(
    value,
    context.current,
    url,
    context.previousUrl,
    context.configured,
  )
    ? unseal(current.authSecret)
    : {};
  const secretKey = { basic: 'password', bearer: 'token', oauth: 'clientSecret' }[value.mode];
  const effective = { ...value, [secretKey]: value[secretKey] || previous[secretKey] };
  const {
    password: _password,
    token: _token,
    clientSecret: _clientSecret,
    ...authConfig
  } = effective;
  // Ciphertext remains stable when no credential/config change occurred, preserving worker version checks.
  const authSecret =
    current?.authSecret &&
    JSON.stringify(Object.entries(effective).sort()) ===
      JSON.stringify(Object.entries(previous).sort())
      ? current.authSecret
      : seal(effective);
  return { authConfig, authSecret };
}
