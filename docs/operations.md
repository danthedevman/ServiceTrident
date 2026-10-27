# Deployment and recovery

## Configuration

| Variable                       | Default                                | Purpose                                                                                                                  |
| ------------------------------ | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `APP_PORT`                     | `8090`                                 | Local Docker frontend port.                                                                                              |
| `APP_ORIGIN`                   | `http://127.0.0.1:8090`                | Allowed browser origin on the API and incident link origin on workers. Set both to the app address recipients can reach. |
| `COOKIE_SECURE`                | `false`                                | Set `true` behind HTTPS.                                                                                                 |
| `MONGODB_DB`                   | `servicetrident`                       | Database name; retain the current value during upgrades.                                                                 |
| `MONGO_VOLUME_NAME`            | `servicetrident-mongo-data`            | Override to reuse an existing deployment volume.                                                                         |
| `REDIS_VOLUME_NAME`            | `servicetrident-redis-data`            | Override to reuse an existing queue volume.                                                                              |
| `INTEGRATION_KEYS_VOLUME_NAME` | `servicetrident-integration-keys`      | Persistent credential-encryption key volume.                                                                             |
| `INTEGRATION_KEY_FILE`         | Docker: `/srv/secrets/integration.key` | Shared key location; use one absolute path for local API/workers.                                                        |
| `INTEGRATION_ENCRYPTION_KEY`   | automatic                              | Optional legacy/operator 64-hex override; must match the persisted key.                                                  |
| `CHECK_CONCURRENCY`            | `10`                                   | Concurrent check jobs; range 1–50.                                                                                       |
| `SCHEDULER_INTERVAL_MS`        | `1000`                                 | Dispatcher interval, 250–5,000 ms; does not reduce monitor minimum intervals.                                            |
| `MARKETING_ORIGIN`             | `http://127.0.0.1:8091`                | Exact contact-form origin.                                                                                               |
| `PUBLIC_REPOSITORY_URL`        | empty                                  | Published HTTPS repository URL.                                                                                          |
| `MARKETING_OWNER_EMAIL`        | empty                                  | Existing admin account authorized to read hosting inquiries.                                                             |

SMTP settings are managed in the UI. Existing `SMTP_*` worker environment settings remain a migration fallback, but use the UI for new integrations. A fresh API/worker pair automatically persists one shared encryption key. An invalid or mismatched key fails startup instead of silently making old credentials unreadable.

## Backups

Back up the database and its recordCounters/recordIdentities metadata (including users, services, events, attachments, configuration, and inquiries) and the integration-key volume together. Losing the encryption key means saved integration and monitor credentials cannot be decrypted. Redis persistence holds queued work; preserve it when recovering the same deployment.

Use a consistent database backup method such as `mongodump` and test restoring into an isolated deployment. Treat key backups and database dumps as secrets. Never commit them. Record the volume names and database name outside the running containers.

When renaming a deployment, keep existing volume names through the override variables above and preserve `MONGODB_DB`. Stop the old stack before starting a renamed stack on the same volumes. Do not run two MongoDB containers against one data volume. Cookie-name changes require signing in again; user records and passwords remain in MongoDB.

## Public deployment

Local Compose binds ports to loopback. Put a TLS reverse proxy in front of the appropriate service, set the exact public origins, and enable secure application cookies. Configure trusted proxies only for the actual proxy topology; never trust arbitrary forwarded headers. Do not expose MongoDB or Redis publicly. Keep dependencies patched and apply host/network access controls.

## Troubleshooting

- **Route not found after a UI change:** rebuild the API and frontend together; stale containers may not contain the endpoint.
- **Origin rejected:** use the exact configured origin or update `APP_ORIGIN`/`MARKETING_ORIGIN` and recreate the service.
- **Notification failed:** inspect Recent deliveries, verify credentials/provider permissions, and retry after fixing configuration. Do not assume an email was delivered solely because it was queued.
- **Slow check start:** inspect queue delay and schedule delay. Increase worker capacity only after checking database and network bottlenecks.
- **Partial demo batch:** use Delete demo data to remove the interrupted batch before trying again.

### Branding identifier migration

The application uses `servicetrident` for package scopes, session cookies, browser preference keys, default database names, Compose resources, and the local integration-key directory.

Before upgrading an existing deployment, preserve its database, data volumes, and integration encryption key. Explicitly set `MONGODB_DB` or `DATABASE_SCHEMA`, `INTEGRATION_KEYS_VOLUME_NAME`, `MONGO_VOLUME_NAME`, and `REDIS_VOLUME_NAME` to the existing resources, or migrate them to the new names before starting the renamed Compose project. For PostgreSQL, also preserve the connection database and user through `DATABASE_URL`, `POSTGRES_DB`, and `POSTGRES_USER`. Do not start the new defaults against empty volumes when retaining an existing installation. Preserve `INTEGRATION_KEY_FILE` or `INTEGRATION_ENCRYPTION_KEY`; changing this key makes existing integration credentials unreadable.

Rebuild and redeploy all services together so workspace package imports agree. Existing browser sessions require a fresh sign-in, and locally cached theme and layout preferences use the new keys. Renaming the repository configuration does not rename or migrate running infrastructure.

## Workspace identity providers

Admins configure OpenID Connect clients in Settings → Identity Providers. Supported presets include Auth0, Okta, Microsoft Entra ID, Google, Keycloak, OneLogin, and Ping Identity; other discovery-compatible providers use Other OpenID Connect. Register a confidential web client using authorization code flow and the exact displayed callback URI (`APP_ORIGIN/api/auth/sso/callback`). Select Client Secret Post or Client Secret Basic according to the provider. Entra requires a tenant-specific issuer. The API must reach public HTTPS discovery, token, and signing-key endpoints; private/self-signed endpoints and redirects are rejected. For a public deployment use HTTPS `APP_ORIGIN` and `COOKIE_SECURE=true`. Preserve the existing integration encryption key: identity client secrets and short-lived sign-in verifiers use it too.

Test Discovery validates metadata; verify the actual credentials by connecting an existing user from Profile with password confirmation, then signing in using the workspace link. Existing users and their current roles are required. No email auto-linking, just-in-time provisioning, group mapping, SCIM, or SAML is implemented. Password sign-in remains available for recovery. Disabling or deleting a provider blocks new sign-in attempts but does not revoke existing application sessions. Provider logout is separate from application logout. Callback state expires after ten minutes, is browser-bound and consumed once; configuration changes invalidate pending attempts. Database initialization adds indexes and TTL retention for identity-provider state on both persistence backends.

## ServiceNow authentication and caller identity

The integration accepts Basic Auth or OAuth client credentials. Register an inbound OAuth client credentials integration in ServiceNow, associate its integration account, and enable the grant for the instance. See [ServiceNow client credentials configuration](https://www.servicenow.com/docs/r/platform-security/authentication/configure-an-oauth-client-credential-grant.html). Enter the instance root, client ID, secret, and optional scope in the app. Tokens are obtained on demand from the same instance’s `/oauth_token.do`; credentials remain encrypted and tokens are never returned in configuration or logs.

Grant Incident table read/create/update permissions and allow reading the integration account’s own `sys_user` record. A fixed current-user query resolves that account under either authentication method and sets `caller_id` when creating an incident. Existing correlated incidents and recovery updates retain their caller. Test Saved Connection performs only reads, checks caller resolution, and reports HTTP 401/403 with configuration guidance. It cannot prove create/update permissions; review those permissions in ServiceNow. The saved instance root stays visible while credentials remain hidden.

## Authenticated HTTP monitoring

Admins can configure Authentication on a monitor using Basic Auth, Bearer Token, or OAuth Client Credentials. Use a least-privilege machine account and a protected API endpoint that accepts those credentials. Authenticated checks require public HTTPS on standard ports, reject redirects, and require a 2xx response; response bodies and headers are not saved. OAuth supports client_secret_basic and client_secret_post, optional Scope and Audience, and briefly reuses unexpired tokens. Browser SSO, MFA, and private_key_jwt are not supported. An Okta login page alone cannot establish application health. Saved secrets are encrypted and never returned; leave a secret blank to retain it when the target origin and account are unchanged, or choose None and Save to remove authentication. Provide new credentials when changing the target origin, Basic username, OAuth token endpoint, or Client ID. Replace expired static bearer tokens manually. OAuth tokens are held only in worker memory, reused for at most five minutes and expired 30 seconds early. Back up the shared integration encryption key with the monitor records. Authentication failures record safe HTTP status information without provider response bodies. These checks do not validate an interactive login workflow.

## Manual monitor checks

Admins can open a monitor and select Check Now to request one check through the worker queue. This also works on a paused monitor without resuming its schedule. Requests are limited to once per monitor per minute, duplicate pending requests are rejected, and the worker preserves at least one minute between check starts. A recent check, worker backlog, or an unavailable scheduler can delay the result; Check requested confirms acceptance, not success. Results appear in Check History and Events. A successful manual check reschedules the next regular check from its start; paused monitors remain excluded from service-health calculations. Demo and retired monitor types cannot run manual checks. The action uses `POST /api/monitors/:id/check` with an empty JSON object and requires an authenticated workspace admin. HTTP 202 confirms acceptance; HTTP 429 means a pending request or the per-monitor request cooldown. The dedicated scheduler dispatches the request using its configured dispatcher interval; the API does not contact the endpoint synchronously. If results do not arrive, check scheduler, worker, queue, and database health. Existing HTTPS/authentication and public-network restrictions remain enforced.

## AI Assistant Operations

Configure a provider under Settings → AI Provider: choose Provider and Model, or Custom Model for another supported API ID. Existing custom IDs are retained. Save before Test Connection; it tests the saved configuration with one small generation request. Listed models may require account access and quotas; a successful test does not verify every AI workflow. Turn on Enable AI Chat. Enable Demo AI is separate and requires an active demo-data batch; it needs no credentials. Users can turn AI Chat off in Profile. Live turns send bounded authorized text and recent chat history to the provider, use two model calls, and share the existing daily generation ceiling. AI actions use normal validators, tenant/role checks, revision checks and audits, and require explicit confirmation. Proposals expire after ten minutes; a failed or repeated confirmation requires refreshing and requesting a new proposal. Back up the database and existing integration-encryption key together. Athena history is persisted in the database, encrypted with the existing integration key; back up and restore both together. History is private per workspace/user/role, bounded to 20 conversations with 20 messages each, and deletable from Conversation History. Pending proposals and unsent drafts remain in memory and do not survive reloads. Response Style and Workspace Instructions configure Athena responses without changing permission or confirmation rules. Demo chat history is also private and is preserved when removing a demo batch.

Slack uses bold alert/monitor headings and native View Incident links. Recovery messages label the retained outage text Original Description and include Resolution Notes. Configure the same reachable APP_ORIGIN on the API and workers; localhost incident links will not work for teammates on other computers. Connection tests and synthetic UI tests do not establish successful delivery to a real provider.

## Tasks

Use Tasks in the main menu for the workspace board; List View and Archived Tasks open task tables. Tasks do not require a project.

See [Operational automation](operational-automation.md) for event routing, escalation, maintenance, retries, independent probes and reporting definitions.

Task navigation uses the main Tasks link above Pinned. Task forms do not require or expose Project. Legacy project associations remain stored; project workspace routes redirect to Tasks. Form layout sections default to showing their name; `showName: false` hides only the heading.
