# Service accounts and the external API

Workspace administrators configure **Settings → Service Accounts**. These are machine identities, separate from users and sign-in identity providers. They cannot sign in to the app, join groups, or inherit human roles. External credentials authenticate only the endpoints below; browser-session APIs continue to require a human session.

## Create and restrict an account

1. Select **Add Service Account**, enter its name/description, and select the required scopes. No scope is selected automatically.
2. Select **Permitted Services**, or explicitly enable **Allow all workspace services and unassigned records**. Restricted accounts must create records for an allowed service. Tasks linked to an incident inherit that incident’s service and must satisfy the same restriction. Every relationship is also checked against the account’s workspace.
3. Enable **API Key**, **OAuth Client Credentials**, or both. Credentials default to 90 days; supported lifetimes are 1–365 days.
4. Create the account and copy its one-time credentials to your integration’s secret manager. Dismiss the credentials panel afterwards. The API persists only SHA-256 digests of cryptographically random 256-bit credentials. The browser keeps the one-time response only in component memory, never local/session storage or the query cache.
5. Open the account record to edit access, disable it, generate a credential, rotate a credential, revoke it, or confirm deletion. Credential operations require the current record revision. Rotation immediately replaces the previous credential. OAuth rotation/revocation invalidates its issued access tokens. Changing account settings also invalidates existing OAuth tokens; API keys immediately use current permissions. Disabling or deleting the account rejects subsequent requests. An already-authorized request may finish while an administrator changes access.

Scopes are `incidents:create`, `tasks:create`, `knowledge:create`, and `knowledge:publish`. Publishing requires both knowledge scopes. API keys use the account’s current scopes. OAuth tokens can request a subset; requests enforce the intersection of the issued scopes and current account scopes. There are no read, update, delete, file-upload, or management scopes.

## Secure transport and request format

Use HTTPS for credentials and record requests. The API checks the incoming secure-transport flag. Set `TRUST_PROXY=1` only when the API is reachable exclusively through a trusted proxy that overwrites forwarded headers; never expose that trusted API port to untrusted callers. The proxy terminating TLS must set `X-Forwarded-Proto: https`. The bundled app’s HTTP nginx proxy sets this header to its own HTTP scheme, so an external TLS proxy should route `/api/` directly to the private API upstream when using these machine endpoints. Expose only the TLS edge, keep API/database services on private Docker networks, and use `COOKIE_SECURE=true` for human sessions. Direct requests from loopback clients to a loopback-configured development API may use HTTP; this exception is not a LAN or public-network bypass.

Send credentials only in the Authorization header, except supported form-encoded OAuth client authentication. Query-string credentials are rejected, as are session cookies on machine routes. Do not put credentials in URLs, screenshots, tickets, request logs, source control, or example payloads. Disable request-header/body logging at your edge proxy and integration client. Proxy logs should use safe route templates or omit URL/query values. The application audit log never copies headers, query strings, request/response bodies, credentials, or tokens.

The global API limit is 180 requests/minute per client IP. The token endpoint also limits 30 requests/minute per IP; authenticated external requests limit 60/minute per service account. Limits are per API process, so horizontally scaled deployments should additionally enforce aggregate limits at the edge. JSON payloads are bounded to 256 KiB. OAuth form bodies are bounded to 8 KiB. A rate-limited client should respect Retry-After and back off.

## API keys

Set `Authorization: Bearer <API_KEY>` on one of the creation requests below. Keys expire at their configured time. Saved keys cannot be recovered; generate/rotate a credential if it is lost. Keep the secret in an environment variable or secret manager, not a literal in scripts.

## OAuth client credentials

POST `/api/oauth/token` with `Content-Type: application/x-www-form-urlencoded`. Use `grant_type=client_credentials` and optionally a space-separated `scope`. Authenticate with HTTP Basic using the generated OAuth Client ID/Client Secret, or send `client_id` and `client_secret` in the form body. Do not combine both authentication methods. This is a machine flow, separate from workspace OIDC sign-in; authorization-code, password, and refresh-token grants are not supported here.

A successful response contains `access_token`, `token_type: "Bearer"`, `expires_in` (at most 3600 seconds and no longer than the client secret’s remaining lifetime), and `scope`. Responses use `Cache-Control: no-store`. Access tokens are opaque random values stored only as digests. Request a fresh token after expiry. Use `Authorization: Bearer <ACCESS_TOKEN>` for creation. Changing settings, rotating/revoking OAuth, disabling/deleting the account, or disabling its workspace owner invalidates access.

OAuth failures return standard error identifiers such as `invalid_client`, `invalid_scope`, `unsupported_grant_type`, and `invalid_request`. Unsupported content formats are rejected. Invalid client credentials use 401; invalid scopes use 400.

## Create records

Only these exact POST routes are available:

| Endpoint | Required scope | Supported fields |
| --- | --- | --- |
| `/api/external/v1/incidents` | `incidents:create` | title, description, serviceId, severity/severityOption, assignmentGroupId, assigneeId, openedForId, custom |
| `/api/external/v1/tasks` | `tasks:create` | title, description, serviceId, incidentId, priority/priorityOption, assignmentGroupId, assigneeId, dueDate, custom |
| `/api/external/v1/knowledge` | `knowledge:create`; additionally `knowledge:publish` for Published | title, summary, content, serviceId, knowledgeBaseId, articleType/articleTypeOption, steps, status/statusOption, custom |

Use JSON objects. Ownership, actor fields, IDs, revisions, attachments, and unknown fields are rejected. The workspace, actor, source, timestamps, and revision are server-owned. Incidents start Open, tasks start To Do, and articles start Draft unless explicitly published with permission. Knowledge cannot be created as Archived. `openedForId` defaults to null for external incidents; supplied users, assignees/groups, services, incident links, and knowledge bases must belong to the workspace. An assignee must be active and belong to a selected assignment group. The account is attributed as **Service account: [name]**; incident source is Integration.

Existing Form Builder required fields, custom values, status mappings, maximum lengths, content validation, and relationship rules apply. Administrators obtain reference IDs and custom-field configuration from the app using their human account, then configure the external client. Machine clients cannot enumerate workspace records or form schemas. `custom` uses configured field IDs, not display labels. `dueDate` uses YYYY-MM-DD. Runbooks use `articleType: "runbook"` and 1–30 ordered `steps`, each containing bounded plain-text `title` and `instructions`. Article content is plain text through this API; rich documents, embedded images and uploads are not accepted.

For an incident, the body is shaped like `{ "title": "Payment checks failing", "serviceId": "<workspace service ID>", "severity": "high", "description": "Investigate recent checks." }`. Replace the placeholder with a real permitted service ID; never place credentials in the body. Workspace policy may require additional fields.

Successful creation returns 201 and the created record (`incident` for incidents; `item` for tasks/knowledge). Save its ID in your source system. Invalid input returns 400 with a safe error and field messages when available. Missing/invalid/expired/revoked credentials return 401. Missing scope or service access returns 403. Unsupported machine methods/paths return 404. These APIs do not deduplicate repeated create requests; avoid automatic retries after a timeout without checking the app. An audit failure can return 503 after the business write completed, so refresh/check before retrying.

## Auditing and operations

Every API response is audited, including token issuance, external requests, denials, human reads/polling, and audit-table access. Entries record safe route templates, HTTP method/status, verified actor/workspace, record identifiers, outcome, and allowlisted submitted field names. Invalid credentials without a verified workspace remain deployment-level entries, not tenant-visible history. See [Audit history](audit-log.md) for retention, export, tenant isolation, and the nontransactional logging limitation.

MongoDB and PostgreSQL share the same authorization and persistence behavior. PostgreSQL migration 6 adds serviceAccounts/serviceAccessTokens tables; token expiration is enforced on every request and expired token records are cleaned up automatically. No new integration encryption key is needed because inbound credentials are one-way digests. Preserve existing databases and integration encryption keys when deploying.
