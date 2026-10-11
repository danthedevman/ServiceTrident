import { invalid, text, identifier } from '../validation/fields.js';
import { InputError } from '../validation/input-error.js';

export const SERVICE_ACCOUNT_SCOPES = [
  { value: 'incidents:create', label: 'Create incidents' },
  { value: 'tasks:create', label: 'Create tasks' },
  { value: 'knowledge:create', label: 'Create knowledge articles and runbooks' },
  { value: 'knowledge:publish', label: 'Publish new knowledge' },
];

export function scopeList(value) {
  if (!Array.isArray(value) || !value.length || value.length > 4 || new Set(value).size !== value.length || value.some((scope) => !SERVICE_ACCOUNT_SCOPES.some((item) => item.value === scope)))
    invalid('scopes', 'Choose at least one supported scope without duplicates.');
  if (value.includes('knowledge:publish') && !value.includes('knowledge:create'))
    invalid('scopes', 'Publishing also requires Create knowledge articles and runbooks.');
  return [...value];
}

export function credentialDays(value) {
  if (!Number.isInteger(value) || value < 1 || value > 365)
    invalid('expiresInDays', 'Choose a credential lifetime between 1 and 365 days.');
  return value;
}

export function serviceAccountInput(body, creating = false) {
  const allowed = ['name', 'description', 'enabled', 'scopes', 'serviceIds', ...(creating ? ['apiKeyEnabled', 'oauthEnabled', 'expiresInDays'] : ['revision'])];
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some((key) => !allowed.includes(key)))
    throw new InputError('Send only editable service account fields.');
  if (typeof body.enabled !== 'boolean') invalid('enabled', 'Choose whether this account is enabled.');
  const serviceIds = body.serviceIds;
  if (serviceIds !== null && (!Array.isArray(serviceIds) || !serviceIds.length || serviceIds.length > 50 || new Set(serviceIds).size !== serviceIds.length))
    invalid('serviceIds', 'Select permitted services, or explicitly allow all workspace services.');
  if (serviceIds) serviceIds.forEach((value) => identifier(value, 'serviceIds'));
  if (creating) {
    if (typeof body.apiKeyEnabled !== 'boolean' || typeof body.oauthEnabled !== 'boolean' || (!body.apiKeyEnabled && !body.oauthEnabled))
      invalid('apiKeyEnabled', 'Choose API key, OAuth, or both authentication methods.');
    credentialDays(body.expiresInDays);
  }
  return { name: text(body.name, 'name', 100), description: text(body.description ?? '', 'description', 1000, false), enabled: body.enabled, scopes: scopeList(body.scopes), serviceIds };
}

/** Explicit projection: credential hashes, token versions and tenant IDs never leave the API. */
export function serviceAccountView(item) {
  return {
    id: String(item._id), name: item.name, description: item.description,
    enabled: item.enabled, scopes: item.scopes, serviceIds: item.serviceIds,
    revision: item.revision, createdAt: item.createdAt, updatedAt: item.updatedAt,
    createdBy: item.createdBy, createdById: item.createdById,
    updatedBy: item.updatedBy, updatedById: item.updatedById,
    apiKeyConfigured: !!item.apiKeyHash, apiKeyExpiresAt: item.apiKeyExpiresAt ?? null,
    oauthConfigured: !!item.clientSecretHash, oauthExpiresAt: item.oauthExpiresAt ?? null,
    clientId: item.clientSecretHash ? `stc_${item._id}` : '',
  };
}
