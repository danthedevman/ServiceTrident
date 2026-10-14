import { auditFields } from '@servicetrident/shared/domain/audit';

/** @param {object} monitor @returns {object} Client-safe monitor representation. */
export function serializeMonitor(monitor, { includeAuthenticationConfig = false } = {}) {
  const authentication = {
    mode: ['basic', 'bearer', 'oauth'].includes(monitor.authConfig?.mode)
      ? monitor.authConfig.mode
      : 'none',
  };
  if (includeAuthenticationConfig)
    for (const key of authentication.mode === 'basic'
      ? ['username']
      : authentication.mode === 'oauth'
        ? ['tokenUrl', 'clientId', 'scope', 'audience', 'authMethod']
        : [])
      if (typeof monitor.authConfig?.[key] === 'string')
        authentication[key] = monitor.authConfig[key];
  const { _id, name, url, intervalMinutes, paused, createdAt, nextCheckAt, lastCheck } = monitor;
  const stale =
    lastCheck &&
    Date.now() - new Date(lastCheck.checkedAt).getTime() > (intervalMinutes * 60 + 60) * 1000;
  const status = paused ? 'paused' : !lastCheck ? 'pending' : stale ? 'unknown' : lastCheck.status;
  return {
    type: monitor.type || 'http',
    unsupported: !!monitor.type && monitor.type !== 'http',
    ...auditFields(monitor),
    lastStartedAt: monitor.lastStartedAt,
    serviceId: monitor.serviceId?.toHexString() ?? null,
    component: monitor.component ?? '',
    id: _id.toHexString(),
    name,
    number: monitor.number,
    url,
    intervalMinutes,
    method: monitor.method ?? 'GET',
    followRedirects: monitor.followRedirects === true,
    authentication,
    authenticationConfigured: !!monitor.authSecret,
    paused,
    createdAt,
    nextCheckAt,
    manualCheckPending: monitor.manualCheckPending === true,
    lastManualCheckRequestedAt: monitor.lastManualCheckRequestedAt ?? null,
    lastCheck,
    status,
  };
}
