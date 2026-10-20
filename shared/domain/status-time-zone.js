/** Normalize untrusted IANA zones before using them in database expressions. */
export function statusTimeZone(value = 'UTC') {
  if (typeof value !== 'string' || value.length > 100) return 'UTC';
  try {
    return new Intl.DateTimeFormat('en', { timeZone: value }).resolvedOptions().timeZone;
  } catch {
    return 'UTC';
  }
}

export function statusDay(value, timeZone = 'UTC') {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(value));
  const part = (type) => parts.find((item) => item.type === type).value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}

/** Convert calendar midnight to an instant, accounting for offset changes across DST. */
export function statusMidnight(day, timeZone) {
  const target = Date.parse(`${day}T00:00:00Z`);
  let instant = target;
  for (let attempt = 0; attempt < 4; attempt++) {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).formatToParts(new Date(instant));
    const part = (type) => parts.find((item) => item.type === type).value;
    const local = Date.parse(
      `${part('year')}-${part('month')}-${part('day')}T${part('hour')}:${part('minute')}:${part('second')}Z`,
    );
    const adjustment = target - local;
    if (!adjustment) break;
    instant += adjustment;
  }
  return new Date(instant);
}
