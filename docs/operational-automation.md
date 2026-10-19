# Operational automation

Admins open Event Rules, Escalation Policies, Maintenance Windows, Probe Agents, Alert Grouping and Integrations from the main navigation. In collapsed navigation these appear in More. Workspace roles and API authorization still apply.

## Event rules

Create a disabled rule, select literal field comparisons, and choose severity, service, assignment group, suppression or incident creation. Nested external fields use `payload.<field>`. Comparisons do not execute regular expressions or scripts. Preview rule against a representative JSON event before enabling it. Preview authorization lasts ten minutes and applies only to that exact rule and administrator; editing it requires another preview.

Rules run in displayed order. Later routing values replace earlier values; suppression remains effective if any matching rule suppresses. Suppressed events and alerts remain available as evidence. Rules affect newly received events, not historical data. Scoped service accounts cannot route events outside their permitted services. Incident creation obeys required incident form fields; an event records a safe action error if those requirements cannot be met. Monitor events retain failure thresholds and independent-confirmation checks. Monitor-created incidents share the automatic service incident rather than creating a second one.

## Escalation policies

Choose services (empty means all), then one to five steps with increasing delays measured from incident creation or reopening. The first step starts at zero minutes. A step targets current on-call coverage or a specific active admin/responder and selected notification integrations using the searchable, multiple-selection Notification integrations reference picker. Service-specific policies take precedence over a global policy; the first matching enabled policy is used. Rules can select a policy explicitly. A policy's service restrictions still apply.

Acknowledging or resolving the incident stops pending escalations. Missing coverage is recorded on the incident. After worker downtime, reconciliation sends the currently due step instead of a burst of obsolete steps. In-app responder notifications accompany escalation work notes. External delivery uses the configured integration destination; email can target the selected responder. Coverage alone does not send messages without a policy and enabled destinations. Ensure delivery is working before relying on escalation.

## Maintenance and silencing

Create a window with services, start/end timestamps and a reason. Enter window times in UTC; saved timestamps use profile formatting. Empty service selection covers the workspace. Enabled windows automatically expire at their end time. Checks, events and incidents continue to collect evidence while operational notifications wait. A pending page is re-evaluated after the window ends; acknowledged or resolved incidents do not page afterward. Recovery messages occurring during silence are suppressed. Comment notifications remain available. Event-rule suppression defers operational notifications while the associated signal remains suppressed.

## Notification delivery

Integrations includes delivery history with queued, delivering, delivered, retrying, failed and suppressed states. Workers use durable outbox entries and expiring leases. Five bounded attempts use exponential backoff starting at 30 seconds. Failed entries can be retried with confirmation; manual retry permits at most three additional cycles, with a 60-second cooldown. Attempts are counted separately per cycle and in total.

Delivery is at least once. A timeout can occur after a provider accepted a message; retrying may duplicate it. A successful HTTP/SMTP response confirms provider acceptance, not that a person read a notification. Acknowledgment is a separate incident action. Integration tests use synthetic transports, not real provider credentials.

## Independent probe agents

Create an agent in Probe Agents and copy its token once into a protected environment file. Only the digest is stored. Tokens expire after 90 days; revoke a probe and create a replacement to rotate credentials. An agent has no browser-session, database or integration-secret access. Never commit or share its environment file.

Run `node workers/src/probe-agent.js` from the same application version on another host with Node 24 and dependencies installed. Supply `PROBE_APP_URL` (HTTPS application origin), `PROBE_ID`, and `PROBE_TOKEN` through that host's secret manager/environment. Plain HTTP is allowed only for loopback development. The process polls assigned jobs every five seconds and returns bounded status, HTTP status and timing. It requires outbound access to the app and public monitored endpoints, with normal DNS and TLS validation. Deploy under a process supervisor with restart and protected logs.

Select the agent on an unauthenticated HTTP/HTTPS monitor. Authenticated monitors are currently excluded so secrets are not distributed to agents. A second host/location must actually be deployed; naming a region does not verify its geography or create infrastructure. Agreeing fresh results confirm health. Disagreement degrades service health; absent or stale confirmation yields unknown. Primary raw check results remain visible, and regional evidence is recorded separately without double-counting status history. Independent probes reduce uncertainty but are not a global monitoring network or a delivery guarantee.

## Operational reporting

Choose Operational Reporting in the dashboard picker. Periods are 7, 30 or 90 days. Mean acknowledgment and resolution times use recorded durations for incidents created in that period; missing historical values are excluded and sample counts are shown. Reopened incidents measure the latest cycle from reopening. Recurring services have at least two incidents in the selected cohort. Noisy sources count retained raw events and failed observations, capped at the 30-day event retention period. Unowned alerts are currently active alerts without an assignment group, regardless of the selected period. Delivery totals group retained history by delivery state. These are operational summaries rather than contractual SLA calculations.
