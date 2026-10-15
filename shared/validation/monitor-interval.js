/** Scheduling remains whole minutes; tolerate only insignificant floating-point conversion noise. */
export function monitorIntervalMinutes(value, unit = 'minutes') {
  if (!['minutes', 'hours'].includes(unit) || String(value ?? '').trim() === '') return NaN;
  const minutes = Number(value) * (unit === 'hours' ? 60 : 1);
  const rounded = Math.round(minutes);
  return Number.isFinite(minutes) &&
    Math.abs(minutes - rounded) < 1e-7 &&
    rounded >= 1 &&
    rounded <= 1440
    ? rounded
    : NaN;
}
export function convertMonitorInterval(value, from, to) {
  if (String(value).trim() === '' || !Number.isFinite(Number(value))) return '';
  return String(
    Number(
      ((Number(value) * (from === 'hours' ? 60 : 1)) / (to === 'hours' ? 60 : 1)).toPrecision(15),
    ),
  );
}
