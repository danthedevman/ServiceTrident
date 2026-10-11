/** Identify coverage by its owner and scope without exposing internal identifiers. */
export function onCallLabel(shift, members = [], services = []) {
  if (!shift) return 'On-call Coverage';
  const member = members.find((item) => item.id === shift.userId);
  const person = member?.displayName || member?.name || 'On-call Coverage';
  const labels = (shift.serviceIds || [])
    .map((id) => services.find((item) => item.id === id)?.name)
    .filter(Boolean);
  const scope = !shift.serviceIds?.length
    ? 'All Services'
    : labels.length
      ? labels.join(', ')
      : 'Selected Services';
  return `${person} · ${scope}`;
}
