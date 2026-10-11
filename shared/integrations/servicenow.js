import { integrationUrl } from './provider-url.js';

/** Tokens are acquired on demand and never returned to the UI or persisted in delivery logs. */
export async function serviceNowHeaders(secret, request) {
  const root = integrationUrl(secret.url, 'servicenow').replace(/\/$/, '');
  if ((secret.authType || 'basic') === 'basic')
    return {
      Authorization: `Basic ${Buffer.from(`${secret.username}:${secret.password}`).toString('base64')}`,
    };
  if (secret.authType !== 'oauth') throw new Error('Unsupported ServiceNow authentication.');
  const parameters = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: secret.clientId,
    client_secret: secret.clientSecret,
  });
  if (secret.scope) parameters.set('scope', secret.scope);
  let token;
  try {
    token = await request(`${root}/oauth_token.do`, 'POST', parameters);
  } catch (error) {
    throw Object.assign(
      new Error(
        `ServiceNow OAuth token request failed${Number.isInteger(error.statusCode) ? `: HTTP ${error.statusCode}` : ''}. Check client credentials and whether client credentials grants are enabled.`,
      ),
      { statusCode: error.statusCode },
    );
  }
  if (
    token.token_type?.toLowerCase() !== 'bearer' ||
    typeof token.access_token !== 'string' ||
    !token.access_token ||
    token.access_token.length > 8192 ||
    /[\s\r\n]/.test(token.access_token)
  )
    throw new Error('ServiceNow OAuth did not return a valid bearer token.');
  return { Authorization: `Bearer ${token.access_token}` };
}

/** A fixed current-user query resolves the integration account under either auth method. */
export async function serviceNowCaller(secret, request, headers) {
  const root = integrationUrl(secret.url, 'servicenow').replace(/\/$/, '');
  const query = new URLSearchParams({
    sysparm_query: 'sys_id=javascript:gs.getUserID()',
    sysparm_fields: 'sys_id',
    sysparm_limit: '1',
  });
  const response = await request(
    `${root}/api/now/table/sys_user?${query}`,
    'GET',
    undefined,
    headers,
  );
  const caller = response.result?.[0]?.sys_id;
  if (!/^[a-f\d]{32}$/i.test(caller || ''))
    throw new Error(
      'ServiceNow could not resolve the authenticated integration account. Allow reading its own User record.',
    );
  return caller;
}
