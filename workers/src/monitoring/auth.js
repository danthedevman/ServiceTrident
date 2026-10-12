import { createHash } from 'node:crypto';
import { providerRequest } from '@servicetrident/shared/integrations/provider-request';
import { InputError } from '@servicetrident/shared/validation/input-error';
import { parseTarget } from '@servicetrident/shared/validation/validation';
const tokens = new Map();
export function clearMonitorTokenCache() {
  tokens.clear();
}
/** Bound per-worker token reuse; tokens never reach storage, result bodies or logs. */
export async function monitorAuthorization(
  auth,
  { request = providerRequest, now = Date.now } = {},
) {
  if (!auth || auth.mode === 'none') return null;
  if (auth.mode === 'basic')
    return `Basic ${Buffer.from(`${auth.username}:${auth.password}`).toString('base64')}`;
  if (auth.mode === 'bearer') return `Bearer ${auth.token}`;
  if (auth.mode !== 'oauth') throw new InputError('Unsupported monitor authentication.');
  const endpoint = parseTarget(auth.tokenUrl);
  if (endpoint.protocol !== 'https:' || endpoint.search)
    throw new InputError('OAuth requires a public HTTPS token endpoint.');
  const key = createHash('sha256').update(JSON.stringify(auth)).digest('hex');
  const cached = tokens.get(key);
  if (cached?.expires > now()) return `Bearer ${cached.token}`;
  const body = new URLSearchParams({ grant_type: 'client_credentials' }),
    headers = {};
  if (auth.scope) body.set('scope', auth.scope);
  if (auth.audience) body.set('audience', auth.audience);
  if (auth.authMethod === 'client_secret_basic')
    headers.Authorization = `Basic ${Buffer.from(`${encodeURIComponent(auth.clientId)}:${encodeURIComponent(auth.clientSecret)}`).toString('base64')}`;
  else {
    body.set('client_id', auth.clientId);
    body.set('client_secret', auth.clientSecret);
  }
  let result;
  try {
    result = await request(endpoint.href, 'POST', body, headers);
  } catch (error) {
    throw new InputError(
      `OAuth token request failed${Number.isInteger(error.statusCode) ? `: HTTP ${error.statusCode}` : ''}. Check client credentials and grant permissions.`,
    );
  }
  if (
    typeof result?.token_type !== 'string' ||
    result.token_type.toLowerCase() !== 'bearer' ||
    typeof result.access_token !== 'string' ||
    !result.access_token ||
    result.access_token.length > 8192 ||
    /[^\x21-\x7e]/.test(result.access_token)
  )
    throw new InputError('OAuth did not return a valid bearer access token.');
  const expires = Number(result.expires_in);
  if (Number.isFinite(expires) && expires > 30) {
    for (const [id, item] of tokens) if (item.expires <= now()) tokens.delete(id);
    if (tokens.size >= 200 && !tokens.has(key)) tokens.delete(tokens.keys().next().value);
    tokens.set(key, {
      token: result.access_token,
      expires: now() + Math.min(expires - 30, 300) * 1000,
    });
  }
  return `Bearer ${result.access_token}`;
}
