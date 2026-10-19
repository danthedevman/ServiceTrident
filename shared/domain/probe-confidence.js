/** Independent agents must be fresh for the same monitor configuration. Missing evidence stays unknown. */
export function probeConfidence(monitor, now = Date.now()) {
  if (!monitor.confirmationProbeId)
    return {
      state: 'single_location',
      region: 'Primary',
      status: monitor.lastCheck?.status || 'unknown',
    };
  if (monitor.paused) return { state: 'paused', status: 'unknown', region: '' };
  const primary = monitor.lastCheck,
    sample = monitor.confirmationCheck;
  const fresh =
    sample &&
    (!sample.expiresAt || +new Date(sample.expiresAt) > now) &&
    sample.probeId === monitor.confirmationProbeId &&
    sample.targetUrl === monitor.url &&
    sample.method === (monitor.method || 'GET') &&
    sample.keywordKey === JSON.stringify(monitor.keyword || null) &&
    now - +new Date(sample.checkedAt) <= (monitor.intervalMinutes * 120 + 120) * 1000;
  if (!fresh)
    return { state: 'awaiting_confirmation', status: 'unknown', region: sample?.region || '' };
  if (!primary || primary.status !== sample.status)
    return { state: 'locations_disagree', status: 'degraded', region: sample.region };
  return { state: 'confirmed', status: primary.status, region: sample.region };
}
