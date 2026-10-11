/** Format an instant in an IANA zone, falling back to the browser when no preference is saved.
 * @param {string | Date | null} value
 * @param {string} [timeZone]
 * @returns {string}
 */
export function dateTime(value, timeZone = '', preferences = {}) {
  if (!value) return 'Not checked yet';
  const date = new Date(value);
  if (Number.isNaN(+date)) return 'Unavailable';
  const options = {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    timeZoneName: 'short',
  };
  if (preferences.timeFormat === '12' || preferences.timeFormat === '24')
    options.hour12 = preferences.timeFormat === '12';
  if (preferences.dateFormat === 'long') options.month = 'long';
  try {
    const zone = timeZone ? { timeZone } : {};
    if (['iso', 'dmy', 'mdy'].includes(preferences.dateFormat)) {
      const parts = Object.fromEntries(
        new Intl.DateTimeFormat('en-US', {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          ...zone,
        })
          .formatToParts(date)
          .map((part) => [part.type, part.value]),
      );
      const dateText =
        preferences.dateFormat === 'iso'
          ? `${parts.year}-${parts.month}-${parts.day}`
          : preferences.dateFormat === 'dmy'
            ? `${parts.day}/${parts.month}/${parts.year}`
            : `${parts.month}/${parts.day}/${parts.year}`;
      const time = new Intl.DateTimeFormat(undefined, {
        hour: options.hour,
        minute: options.minute,
        second: options.second,
        timeZoneName: options.timeZoneName,
        ...(options.hour12 === undefined ? {} : { hour12: options.hour12 }),
        ...zone,
      }).format(date);
      return `${dateText} · ${time}`;
    }
    return new Intl.DateTimeFormat(undefined, { ...options, ...zone }).format(date);
  } catch {
    if (timeZone) return dateTime(value, '', preferences);
    return new Intl.DateTimeFormat(undefined, options).format(date);
  }
}

/** Timestamp fields represent instants; date-only scheduling values retain their calendar date. */
export const isTimestampField = (key) => /(?:At|Until)$/.test(key) || ['at', 'start', 'end'].includes(key);
