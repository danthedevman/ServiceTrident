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

Back up MongoDB (including users, services, events, attachments, configuration, and inquiries) and the integration-key volume together. Losing the encryption key means saved integration passwords cannot be decrypted. Redis persistence holds queued work; preserve it when recovering the same deployment.

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
