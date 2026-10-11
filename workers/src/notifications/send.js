import {
  serviceNowHeaders,
  serviceNowCaller,
} from '@servicetrident/shared/integrations/servicenow';
import { sendTicket } from './tickets.js';
import { sendEmail } from './email.js';
import { integrationUrl } from '@servicetrident/shared/integrations/provider-url';
import { unseal } from '@servicetrident/shared/integrations/secrets';

import { providerRequest } from './http.js';

import { incidentLink, message } from './message.js';
import { slackMessage } from './slack.js';

/** Deliver a notification; credentials remain encrypted until this boundary. */
export async function sendNotification(
  integration,
  incident,
  delivery,
  recipient,
  request = providerRequest,
) {
  const secret = integration.secret ? unseal(integration.secret) : {},
    body = message(incident, delivery.event, delivery);
  if (integration.type === 'email')
    return sendEmail(integration, {
      to: integration.onCall && recipient ? [recipient] : integration.recipients,
      subject: `[ServiceTrident] ${delivery.event}: ${incident.serviceName.replace(/[\r\n]/g, ' ')}`,
      text: body,
      id: delivery._id,
    });
  integrationUrl(secret.url, integration.type);
  if (integration.type === 'discord')
    return request(`${secret.url}?wait=true`, 'POST', {
      content: body.slice(0, 2000),
      allowed_mentions: { parse: [] },
    });
  if (integration.type === 'pagerduty') {
    const result = await request(secret.url, 'POST', {
      routing_key: secret.token,
      dedup_key: `servicetrident:${incident.workspaceId}:${incident._id}`,
      links: [{ href: incidentLink(incident), text: 'View Incident' }],
      event_action: delivery.event === 'recovered' ? 'resolve' : 'trigger',
      ...(delivery.event === 'recovered'
        ? {}
        : {
            payload: {
              summary: incident.title.slice(0, 1024),
              source: incident.serviceName || 'ServiceTrident',
              severity:
                { critical: 'critical', high: 'error', medium: 'warning', low: 'info' }[
                  incident.severity
                ] || 'warning',
              custom_details: { Description: body },
            },
          }),
    });
    if (result.status !== 'success') throw new Error('PagerDuty did not accept the event.');
    return { externalId: result.dedup_key };
  }
  if (integration.type === 'webhook')
    return request(
      secret.url,
      'POST',
      {
        deliveryId: String(delivery._id),
        event: delivery.event,
        fields: [
          { label: 'Title', value: incident.title },
          { label: 'Service', value: incident.serviceName },
          { label: 'Severity', value: incident.severity },
          { label: 'Incident', value: incidentLink(incident) },
          { label: 'Description', value: incident.description || '' },
        ],
        message: body,
      },
      secret.token ? { Authorization: `Bearer ${secret.token}` } : {},
    );
  if (['github', 'jira'].includes(integration.type))
    return sendTicket(integration.type, secret, incident, delivery, body, request);
  if (integration.type === 'slack')
    return request(secret.url, 'POST', slackMessage(incident, delivery));
  if (integration.type === 'teams')
    return request(secret.url, 'POST', {
      type: 'message',
      attachments: [
        {
          contentType: 'application/vnd.microsoft.card.adaptive',
          content: {
            type: 'AdaptiveCard',
            version: '1.2',
            actions: [
              { type: 'Action.OpenUrl', title: 'View Incident', url: incidentLink(incident) },
            ],
            body: [{ type: 'TextBlock', text: body, wrap: true }],
          },
        },
      ],
    });
  if (integration.type !== 'servicenow') throw new Error('Unsupported integration provider.');
  const root = secret.url.replace(/\/$/, ''),
    correlation = `servicetrident:${incident._id}`;
  const headers = await serviceNowHeaders(secret, request);
  const existing = await request(
    `${root}/api/now/table/incident?sysparm_query=${encodeURIComponent(`correlation_id=${correlation}`)}&sysparm_fields=sys_id,number&sysparm_limit=1`,
    'GET',
    undefined,
    headers,
  );
  const record = existing.result?.[0];
  if (record?.sys_id && !/^[a-f0-9]{32}$/.test(record.sys_id))
    throw new Error('ServiceNow returned an invalid incident identifier.');
  if (delivery.event === 'recovered') {
    if (!record) throw new Error('Waiting for the related ServiceNow incident to be created.');
    await request(
      `${root}/api/now/table/incident/${record.sys_id}`,
      'PATCH',
      { work_notes: body },
      headers,
    );
    return { externalId: record.number };
  }
  if (record) return { externalId: record.number };
  const caller = await serviceNowCaller(secret, request, headers);
  const created = await request(
    `${root}/api/now/table/incident`,
    'POST',
    {
      caller_id: caller,
      short_description: incident.title,
      description: body,
      correlation_id: correlation,
      impact: incident.severity === 'critical' ? '1' : '2',
      urgency: incident.severity === 'critical' ? '1' : '2',
    },
    headers,
  );
  if (!created.result?.sys_id) throw new Error('ServiceNow did not confirm incident creation.');
  return { externalId: created.result.number };
}
