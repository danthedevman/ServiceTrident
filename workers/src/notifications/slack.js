import { incidentLink, message } from './message.js';

/** Use plain text for all untrusted content; only our validated incident URL uses Slack markup. */
export function slackMessage(incident, delivery) {
  const url = incidentLink(incident);
  const summary = message(incident, delivery.event, delivery, {
    includeIncident: false,
    singleLineValues: true,
  }).slice(0, 2900);
  // Response and record text cannot inject extra unlabeled lines or impersonate another field.
  const field = (label, value) =>
    `${label}: ${
      String(value ?? '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 500) || 'Not provided'
    }`;
  const diagnostics =
    incident.source === 'monitor'
      ? (delivery.monitorChecks ?? [])
          .slice(0, 5)
          .map((check) =>
            [
              field('Monitor', check.name),
              field('Service', check.service),
              field('HTTP status', check.statusCode ?? 'No HTTP response'),
              ...(check.statusMessage ? [field('HTTP reason', check.statusMessage)] : []),
              field('Method', check.method),
              field('Checked at', check.checkedAt),
              ...(Number.isFinite(check.durationMs)
                ? [field('Duration', `${check.durationMs} ms`)]
                : []),
              ...(check.error ? [field('Error', check.error)] : []),
              ...(check.responseError ? [field('Response error', check.responseError)] : []),
            ]
              .join('\n')
              .slice(0, 2900),
          )
      : [];
  const escape = (value) =>
    value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
  // Separate full-width sections keep fields vertically stacked in Slack clients.
  // Reserve one of Slack's 50 message blocks for the incident link.
  const lines = [summary, ...diagnostics]
    .flatMap((text) => text.split('\n'))
    .filter(Boolean)
    .slice(0, 47);
  return {
    text: `${escape([summary, ...diagnostics].join('\n\n'))}\nIncident: ${url}`,
    mrkdwn: false,
    unfurl_links: false,
    unfurl_media: false,
    blocks: [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: `${{ impacted: 'Impacted', recovered: 'Recovered', comment: 'New Comment' }[delivery.event] ?? 'Incident Update'}: ${String(
            incident.title || incident.serviceName || 'Incident',
          )
            .replace(/\s+/g, ' ')
            .slice(0, 120)}`.slice(0, 150),
          emoji: false,
        },
      },
      ...lines
        .flatMap((text) => [
          ...(text.startsWith('Monitor:')
            ? [
                {
                  type: 'header',
                  text: { type: 'plain_text', text: text.slice(0, 150), emoji: false },
                },
              ]
            : []),
          { type: 'section', text: { type: 'plain_text', text, emoji: false } },
        ])
        .slice(0, 48),
      {
        type: 'section',
        text: { type: 'mrkdwn', text: `Incident: <${escape(url)}|View Incident>`, verbatim: true },
      },
    ],
  };
}
