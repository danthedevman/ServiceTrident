import { probeConfidence } from './probe-confidence.js';
import { invalid } from '../validation/fields.js';

/** Validate optional service health controls; defaults preserve immediate outage detection. */
export function healthPolicy(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input))
    invalid('healthPolicy', 'Choose valid service health settings.');
  const {
    manualDown = false,
    manualDegraded = false,
    responseTimeMs = 0,
    failuresBeforeDown = 1,
  } = input;
  if (typeof manualDown !== 'boolean') invalid('manualDown', 'Choose whether the service is down.');
  if (typeof manualDegraded !== 'boolean')
    invalid('manualDegraded', 'Choose whether the service is degraded.');
  if (!Number.isInteger(responseTimeMs) || responseTimeMs < 0 || responseTimeMs > 120000)
    invalid(
      'responseTimeMs',
      'Use 0 to disable, or a response time from 1 to 120000 milliseconds.',
    );
  if (!Number.isInteger(failuresBeforeDown) || failuresBeforeDown < 1 || failuresBeforeDown > 10)
    invalid('failuresBeforeDown', 'Choose 1–10 consecutive failures.');
  return { manualDown, manualDegraded, responseTimeMs, failuresBeforeDown };
}

/** Outages take priority over degradation; missing observations never imply recovery. */
export function rollupHealth(values) {
  if (values.includes('down')) return 'down';
  if (values.includes('degraded')) return 'degraded';
  return values.length && values.every((value) => value === 'up') ? 'up' : 'unknown';
}

/** Evaluate fresh monitor observations against their service's thresholds. */
export function monitorHealth(monitor, policy = {}, now = Date.now()) {
  const check = monitor.lastCheck;
  if (
    monitor.paused ||
    !check ||
    now - +new Date(check.checkedAt) > (monitor.intervalMinutes * 60 + 60) * 1000
  )
    return 'unknown';
  if (monitor.confirmationProbeId) {
    const confidence = probeConfidence(monitor, now);
    if (confidence.status === 'unknown' || confidence.status === 'degraded')
      return confidence.status;
  }
  if (check.status === 'down')
    return (check.consecutiveFailures ?? 1) >= (policy.failuresBeforeDown ?? 1)
      ? 'down'
      : 'degraded';
  if (
    check.status === 'up' &&
    policy.responseTimeMs > 0 &&
    check.durationMs >= policy.responseTimeMs
  )
    return 'degraded';
  return check.status === 'up' ? 'up' : 'unknown';
}

/** Roll up service and dependency health using the same rules for API and workers. */
export function serviceHealth(services, monitors, now = Date.now()) {
  const states = new Map();
  const visit = (id, seen = new Set()) => {
    if (states.has(id)) return states.get(id);
    if (seen.has(id)) return 'unknown';
    const service = services.find((s) => s.id === id);
    if (!service) return 'unknown';
    const next = new Set([...seen, id]);
    const values = monitors
      .filter((m) => String(m.serviceId) === id)
      .map((monitor) => monitorHealth(monitor, service.healthPolicy, now));
    values.push(...(service.dependencyIds ?? []).map((dependency) => visit(dependency, next)));
    if (service.healthPolicy?.manualDown) values.push('down');
    if (service.healthPolicy?.manualDegraded) values.push('degraded');
    const status = rollupHealth(values);
    states.set(id, status);
    return status;
  };
  for (const service of services) visit(service.id);
  return states;
}
