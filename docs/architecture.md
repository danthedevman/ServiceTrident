# Architecture and maintenance

ServiceTrident is one product with separate web, API, scheduling, and worker processes. Keep the separation functional; a new folder should own a clear responsibility rather than wrap a single call unnecessarily.

## Request flow

1. Express applies security headers, request limits, origin/content checks, and authentication in `api/src/app.js`.
2. Role gates protect the route groups. Feature routes scope database access to the authenticated workspace. Public status and marketing submissions have explicit, limited routes.
3. Routes validate input and delegate shared business rules or persistence to domain/repository modules.
4. Serializers allowlist client-visible fields. Do not return raw credential documents.

Register public endpoints before authentication and workspace endpoints afterward. Keep the end-user incident-portal restrictions before ordinary feature routes. Do not move a route across these boundaries during refactoring.

## Frontend conventions

`main.jsx` only mounts the app. `application.jsx` owns providers and route registration. Feature modules own their forms, tables, and detail views. Shared components own layout and accessibility.

Use `useResource` for reads and `writeApi`/`useSave` for mutations. Session changes cancel and remove private cached data. Never persist private records in local storage. Only theme/layout preferences belong in local storage. Bounded record navigation links and title/type labels may use account/role-scoped session storage; never persist payloads, credentials, or drafts. Restore inactive record tabs lazily and clear them on sign-out. Preserve drafts during polling, keep loading feedback local, and use section-local skeletons for initial loads without replacing cached content or adding page fades.

Use DataTable for all tables, including exports. A remote table supplies `remote.filtersActive` so the closed filter button can indicate an active filter. Filter UI belongs in `filters` and opens in the shared anchored `TableFilterPanel` without an overlay; navigation tabs belong in `toolbar`. Compact Rows is an account preference. Every list offers a record route; `/api/table-records/:kind/:id` reuses source authorization and safe projections for history/log details. Hiding controls must not clear filters or change exported rows.

Forms use dedicated routes except the explicit on-call quick-add dialog. Use the shared Modal and RecordWorkspace rather than inventing new navigation offsets. Use explicit render conditions and omit empty parent wrappers instead of hiding conditional sections with CSS. Use `ValidatedForm` for custom required/email rules, associated errors, and first-invalid-field focus. Built-in form fields and options retain their immutable IDs/meanings; Resolution notes alone permit an admin-controlled required flag, and incident resolve/reopen transitions require confirmation; custom additions map to canonical reporting values.

## Jobs and integrations

The scheduler dispatches due monitors independently from check workers. Claims use MongoDB server time and enforce at least one minute between starts. Fixed job IDs reduce duplicate dispatches. Check results are stored in events; in-flight checks cannot overwrite a monitor after its request configuration changes.

Background notifications and monitor checks run in workers. Shared bounded, public-address-pinned transports also support admin-triggered read-only ServiceNow connection tests and OpenID Connect discovery/token/signature verification in the API. These routes enforce authentication, workspace ownership, role checks, time/size limits, and safe errors; do not turn them into arbitrary network proxies. Monitors check public HTTP/HTTPS endpoints using HEAD or GET. Extend the shared provider catalog, shared validation, API configuration, worker adapter, UI form, and tests together when adding a provider.

Notification reconciliation writes durable delivery records. The delivery worker performs network I/O separately with retries and sanitized errors. Never store raw provider exceptions, passwords, or connection strings in event history. Demo tags always exclude a record from outbound processing.

## Module boundaries

- `shared/validation` and `shared/forms` are small, reusable rules.
- `shared/integrations/secrets.js` and persistence modules are Node-only; do not import them in browser code.
- API repositories coordinate common persistence, including optimistic-concurrency updates.
- Marketing templates contain only application-authored HTML. Runtime configuration is escaped. Contact data is rendered as text in the React inbox.

Every nontrivial exported function should have JSDoc describing its responsibility and relevant input/output or safety boundary. Prefer explicit code over generic service frameworks. Run lint, formatting, build, unit tests, and the affected integration tests after moving modules.

## Storage and table reads

`shared/persistence/database.js` selects MongoDB or PostgreSQL. The MongoDB implementation uses the native driver; PostgreSQL implements the bounded document-repository contract in separate query, cursor, codec, update, migration, and connection modules. See `docs/database-backends.md` for deployment and schema tradeoffs. Do not add persistence operators without parity tests.

Every DataTable now uses an explicit server source or an existing remote endpoint. The browser holds page/query state, not a complete dataset for filtering. `/api/tables/:kind` owns its source and column allowlists and reuses the same authorization and filters for CSV export. Growing record collections use database queries; bounded embedded configuration is filtered on the API. `/api/references/:type` returns at most 30 matches plus separately authorized selected labels. The table/reference route modules enforce their own role restrictions immediately after authentication.

## Documentation and visual verification

Deliver behavior changes with README, bundled Help, and affected deployment/maintenance documentation. Keep current defaults, exact labels, permission rules, and limitations consistent across guides. Follow the documentation process in [AGENTS.md](../AGENTS.md) and [Help screenshot capture](help-screenshots.md). Screenshots use isolated synthetic fixtures; never live records, credentials, or post-capture redaction. Rebuild affected local services and bundle updated Help images before completion.
