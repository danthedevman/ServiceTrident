/** Generate only application-owned incident links; never accept a destination from record data. */
export function incidentLink(incident) {
  const origin = new URL(process.env.APP_ORIGIN || 'http://127.0.0.1:8090');
  if (
    !['http:', 'https:'].includes(origin.protocol) ||
    origin.username ||
    origin.password ||
    origin.pathname !== '/' ||
    origin.search ||
    origin.hash
  )
    throw new Error('APP_ORIGIN must be an HTTP or HTTPS application origin.');
  const id = String(incident._id);
  if (!/^[a-f0-9]{24}$/.test(id)) throw new Error('Invalid incident identifier.');
  return new URL(`/incidents/${id}`, origin).href;
}

/** Format one plain-text field and indent continuation lines so they remain part of its value. */
function field(label, value, singleLineValues = false) {
  const text = String(value ?? '')
    .replace(/\r\n?/g, '\n')
    .trim();
  return `${label}: ${text ? (singleLineValues ? text.replace(/\s*\n\s*/g, ' ') : text.replaceAll('\n', '\n  ')) : 'Not provided'}`;
}

/** Build a labeled, allowlisted message shared by every notification provider. */
export function message(
  incident,
  event,
  delivery = {},
  { includeIncident = true, singleLineValues = false } = {},
) {
  const severity = String(incident.severity ?? '')
    .replaceAll('_', ' ')
    .replace(/^./, (first) => first.toUpperCase());
  const fields = [
    [
      'Event',
      { impacted: 'Impacted', recovered: 'Recovered', comment: 'New comment' }[event] ??
        'Incident update',
    ],
    ['Title', incident.title],
    ['Service', incident.serviceName],
    ['Severity', severity],
    ...(includeIncident ? [['Incident', `View Incident (${incidentLink(incident)})`]] : []),
    ['Description', incident.description],
  ];
  if (event === 'comment') {
    fields.push(['Comment author', delivery.commentAuthor], ['Comment', delivery.commentBody]);
  }
  return fields.map(([label, value]) => field(label, value, singleLineValues)).join('\n');
}
