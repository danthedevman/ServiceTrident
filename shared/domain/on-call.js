import { invalid } from '../validation/fields.js';

import { identifier } from '../validation/fields.js';

import { references } from '../validation/fields.js';

/** Reject overlapping coverage; all-service shifts overlap every service. End times are exclusive. */
export function validateShifts(shifts, memberIds, serviceIds) {
  if (!Array.isArray(shifts) || shifts.length > 1000)
    invalid('shifts', 'Keep at most 1,000 shifts. Remove old shifts before adding more.');
  const seen = new Set();
  const result = shifts.map((s) => {
    if (!s || typeof s !== 'object') invalid('shifts', 'Enter valid shifts.');
    const id = identifier(s.id);
    if (seen.has(id)) invalid('shifts', 'Shift IDs must be unique.');
    seen.add(id);
    if (!memberIds.includes(s.userId)) invalid('userId', 'Choose an active workspace teammate.');
    const start = new Date(s.start),
      end = new Date(s.end);
    if (
      typeof s.start !== 'string' ||
      typeof s.end !== 'string' ||
      !s.start.endsWith('Z') ||
      !s.end.endsWith('Z') ||
      !Number.isFinite(+start) ||
      !Number.isFinite(+end) ||
      end <= start ||
      end - start > 366 * 86400000
    )
      invalid('start', 'Use UTC dates with an end after the start, within one year.');
    return {
      id,
      userId: s.userId,
      serviceIds: references(s.serviceIds ?? [], serviceIds, 'serviceIds'),
      start: start.toISOString(),
      end: end.toISOString(),
    };
  });
  result.sort((a, b) => a.start.localeCompare(b.start));
  for (let i = 0; i < result.length; i++)
    for (let j = i + 1; j < result.length && result[j].start < result[i].end; j++) {
      const a = result[i],
        b = result[j];
      if (
        !a.serviceIds.length ||
        !b.serviceIds.length ||
        a.serviceIds.some((id) => b.serviceIds.includes(id))
      ) {
        const start = a.start > b.start ? a.start : b.start;
        const end = a.end < b.end ? a.end : b.end;
        invalid(
          'shifts',
          `Coverage overlaps from ${start} to ${end} (UTC). ${
            !a.serviceIds.length || !b.serviceIds.length
              ? 'An All services shift covers every service, including selected services.'
              : 'Both shifts cover at least one of the same services.'
          } Edit the existing coverage on the calendar, choose different services, or start the next shift at or after the existing end.`,
        );
      }
    }
  return result;
}

/** Determine the active primary responder at an instant. */
export function onCall(shifts, serviceId, now = new Date()) {
  const instant = now.toISOString();
  return (
    shifts.find(
      (s) =>
        s.start <= instant &&
        s.end > instant &&
        (!s.serviceIds.length || s.serviceIds.includes(serviceId)),
    )?.userId ?? null
  );
}
