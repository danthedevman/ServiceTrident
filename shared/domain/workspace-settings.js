/** Safe workspace preferences; deployment secrets and network trust are not browser settings. */
export const workspaceDefaults = Object.freeze({
  monitorLimit: 50,
  defaultIntervalMinutes: 5,
  defaultMethod: 'GET',
  defaultFollowRedirects: false,
  automaticIncidents: true,
  automaticRecovery: true,
  alertGroupingSeconds: 30,
});

/** Return only supported settings, including defaults for existing workspaces. */
export function workspaceSettings(value = {}) {
  return Object.fromEntries(
    Object.entries(workspaceDefaults).map(([key, fallback]) => [key, value?.[key] ?? fallback]),
  );
}

/** Shared validation reports specific errors; the API independently applies the same rules. */
export function workspaceSettingsErrors(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    return { settings: 'Enter workspace settings.' };
  const errors = {};
  for (const [key, min, max, label] of [
    ['monitorLimit', 1, 10000, 'Monitor limit'],
    ['defaultIntervalMinutes', 1, 1440, 'Default check interval'],
    ['alertGroupingSeconds', 0, 300, 'Alert grouping window'],
  ])
    if (!Number.isSafeInteger(value[key]) || value[key] < min || value[key] > max)
      errors[key] =
        `${label} must be a whole number from ${min.toLocaleString('en-US')} to ${max.toLocaleString('en-US')}.`;
  if (!['HEAD', 'GET'].includes(value.defaultMethod)) errors.defaultMethod = 'Choose HEAD or GET.';
  for (const key of ['defaultFollowRedirects', 'automaticIncidents', 'automaticRecovery'])
    if (typeof value[key] !== 'boolean') errors[key] = 'Choose whether this option is enabled.';
  for (const key of Object.keys(value))
    if (!Object.hasOwn(workspaceDefaults, key))
      errors.settings = 'Only supported workspace settings can be changed.';
  return errors;
}
