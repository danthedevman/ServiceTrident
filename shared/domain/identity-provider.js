import { InputError, parseTarget } from '../validation/validation.js';

export { IDENTITY_PROVIDERS } from './identity-provider-options.js';
import { IDENTITY_PROVIDERS } from './identity-provider-options.js';

export function identityUrl(value) {
  const original = new URL(value);
  const url = parseTarget(value);
  if (url.protocol !== 'https:' || url.search || original.hash)
    throw new InputError('Use a public HTTPS issuer or endpoint without query parameters.');
  return url.href;
}

/** Allowlist configuration; secrets never belong in a serialized provider. */
export function identityProvider(input, current) {
  if (!input || typeof input !== 'object' || Array.isArray(input))
    throw new InputError('Enter provider settings.');
  const fields = {};
  for (const [key, max] of [
    ['name', 80],
    ['clientId', 512],
  ]) {
    if (
      typeof input[key] !== 'string' ||
      !input[key].trim() ||
      input[key].length > max ||
      Array.from(input[key]).some((c) => c.charCodeAt(0) < 32)
    )
      fields[key] =
        `Enter ${key === 'name' ? 'a name' : 'a client ID'} of at most ${max} characters.`;
  }
  if (!IDENTITY_PROVIDERS.some((p) => p.id === input.provider))
    fields.provider = 'Choose a supported provider.';
  if (typeof input.enabled !== 'boolean')
    fields.enabled = 'Choose whether the provider is enabled.';
  if (!['client_secret_post', 'client_secret_basic'].includes(input.authMethod))
    fields.authMethod = 'Choose a supported client authentication method.';
  let issuer;
  try {
    // Preserve the exact issuer identifier, including a trailing slash, for OIDC claim checks.
    identityUrl(input.issuer);
    issuer = input.issuer;
    if (new URL(issuer).hash) throw new Error();
  } catch {
    fields.issuer =
      'Enter the exact public HTTPS issuer from your provider, without a query or fragment.';
  }
  if (
    typeof input.clientSecret !== 'string' ||
    input.clientSecret.length > 4096 ||
    (!input.clientSecret && !current?.secret)
  )
    fields.clientSecret = 'Enter a client secret; leave blank only to keep an existing secret.';
  if (Object.keys(fields).length)
    throw new InputError('Check the highlighted provider fields.', 400, fields);
  return {
    name: input.name.trim(),
    provider: input.provider,
    issuer,
    clientId: input.clientId.trim(),
    enabled: input.enabled,
    authMethod: input.authMethod,
  };
}

export function providerView(item) {
  return {
    id: String(item._id),
    name: item.name,
    provider: item.provider,
    issuer: item.issuer,
    clientId: item.clientId,
    enabled: item.enabled,
    authMethod: item.authMethod,
    revision: item.revision,
    hasSecret: !!item.secret,
  };
}
