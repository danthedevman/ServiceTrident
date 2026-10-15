/** datetime-local omits the zone; preserve precision so editing cannot move a handoff. */
export const coverageTimeInput = (date) => new Date(date).toISOString().slice(0, -1);
