# Documentation is part of every change

- For every change, review README.md, bundled Help in app/src/features/help/topics.js, and the relevant architecture, setup, or operating guides. Update affected workflows, visible labels, defaults, permissions, limits, prerequisites, and troubleshooting in the same delivery; remove contradictory or obsolete claims rather than only appending new text. If a document does not need changes, verify it still matches the implementation.
- Check the actual UI and API behavior before documenting it. Keep user-facing Help actionable and use exact control names. Document policy exceptions (such as configurable Resolution notes), session/draft behavior, and the limits of connection tests. Do not claim an external provider was verified with real credentials when only synthetic tests ran.
- Refresh affected Help/README screenshots after visual changes using scripts/capture-help-screenshots.mjs and docs/help-screenshots.md. Use only the isolated synthetic fixtures; never seed, capture, or clean up a live workspace for screenshots, and never use live records or credentials even if later redacted. Keep demo-data requirements in developer capture instructions, not user-facing Help notices.
- Validate changed documentation links, labels, screenshots, and examples alongside the affected lint, tests, and browser checks. Rebuild/restart affected local services after implementation changes and again after bundled Help/screenshots change; verify health and the normal local URL before reporting completion. Preserve data volumes and encryption keys.

# Keep the app self-documenting

- Update the bundled Help guides in `app/src/features/help/topics.js` whenever user-facing behavior, workflows, permissions, or configuration changes. Update README and relevant deployment documentation when setup or operating requirements change; deliver documentation with the implementation.
- Explain current behavior, prerequisites, and actionable steps. Keep documentation consistent with the actual UI and supported capabilities. Add concise code comments for non-obvious constraints and decisions, rather than restating code.
- Add or refresh Help screenshots when a visual makes a workflow easier to follow. Capture the actual current app using an isolated browser with synthetic demo responses only. Never capture live workspace records, personal information, credentials, tokens, or integration secrets, even if later redacted. Do not seed or clean up a live workspace for screenshots.
- Store screenshots under `app/public/help/`, with descriptive filenames, useful alternative text, and captions that explain the relevant controls. Keep the reproducible capture instructions and demo fixtures with the repository; refresh affected screenshots after UI changes. Omit screenshots for topics where prose is clearer.

# Apply updates to the running app

- After making application, dependency, or configuration changes, rebuild and restart the affected local services before reporting completion so the running app reflects the changes. Do not stop at editing files or producing a build.
- For Docker Compose services, use `docker compose up -d --build --wait` with the affected service names. A restart alone does not pick up code copied into an image. Include API, workers, and scheduler when shared code affects them.
- Verify affected containers are healthy and check the application/API through its normal local URL. Report any failure that prevents the update from becoming available.
- Use the existing active Compose project and persistent volumes. Preserve databases and integration encryption keys; never run two database containers against the same data volume or delete volumes to apply an update.
- Documentation-only changes do not require restarting services.

# Secure development and secret handling

- Write secure code by default: validate and bound all untrusted input, enforce authentication, roles, and workspace ownership in the API, use parameterized database queries, and render content safely. Never rely on hidden UI controls for authorization.
- Never include API keys, passwords, access or refresh tokens, integration secrets, encryption keys, private records, or other sensitive data in source code, committed configuration, fixtures, tests, documentation, screenshots, logs, or generated artifacts. Do not hard-code secrets, including temporary development credentials.
- Read secrets from environment variables or the existing encrypted integration storage. Keep secret files out of version control, preserve existing encryption keys, and expose only explicitly allowlisted public fields in API responses and logs. Never print credentials or whole sensitive payloads while debugging.
- Use isolated synthetic data for development examples, tests, and screenshots. Do not copy production or live-workspace information into development artifacts. Review changed files and generated assets for accidental secret inclusion before completion; if a secret is discovered, stop exposing it, remove it from artifacts, and report the need to rotate it without repeating its value.
- Check security-sensitive behavior with meaningful authorization, tenant isolation, validation, and safe-rendering tests. Preserve attachment authorization and secret encryption when adding workflows.

- Do not display loading messages in the UI, including temporary permission or access warnings. Use skeleton placeholders, quiet pending states, and `aria-busy` where appropriate; preserve existing content during refresh. Show access-denied messages only after authentication and authorization have resolved. Keep meaningful errors and action confirmations visible.

# Render conditional UI explicitly

- Prefer render conditions over CSS visibility workarounds for feature flags, duplicate headings, and conditional content. When content should not appear, omit it from the rendered tree so it cannot leave margins or parent spacing behind. Use CSS for presentation and responsive layout, rather than selectors such as `:has(...)` to suppress conditional content.

- When conditional content is omitted, also omit its parent wrapper if it has no other rendered content or purpose. Apply the render condition around the whole heading/filter section, not just its child, so empty wrappers cannot create flex/grid gaps, margins, or padding. Preserve parents that contain other visible controls or required structure.

- Help articles, screenshot captions, and alternative text must describe the workflow without demo-data notices or prefixes such as “Demo data only” or “Demo workspace.” Keep synthetic-data requirements in capture fixtures and developer instructions, not user-facing Help text.

- Use shared custom form validation for every required field and email input. Disable native browser validation bubbles with noValidate; show consistent actionable messages, associate errors with controls, and focus the first invalid field. Validate on the API as well; HTML attributes alone are insufficient. Use ValidatedForm for basic control rules and retain domain-specific validation.

- Attribute automated record and activity updates to “System,” never the application brand. Preserve actual user attribution and normalize legacy branded system labels for display without rewriting history.

- Incident resolution requires explicit confirmation, including status changes in Edit. Resolution notes are optional in the default schema; admins may change their Required flag in Form Builder as the sole exception to fixed System Field required flags. Preserve saved workspace policy and enforce it in the API.
- Record tab text stays on one line with truncation and full labels on hover. The record navigation scrollbar is hidden at user request, while native horizontal scrolling and keyboard tab navigation remain available.

# Audit and external integration boundaries

- Log every API response in auditEvents, including reads, list polling, authentication, external API calls, failures, and audit-table access. Keep worker and record-changing workflows audited as well. Record only bounded metadata: verified actor/workspace, safe route template, method, record identifiers, field names, outcome, and HTTP status. Never log query strings, request or response bodies, credentials, tokens, headers, or private contents. Unverified requests must never inherit a workspace from client input; keep them outside tenant-visible history.
- Enforce service-account scopes, workspace ownership, optional service restrictions, expiry, and revocation on the server for every external endpoint. Machine credentials may only use their dedicated endpoints; never give them browser-session, administrator, read, update, or delete access implicitly. Reuse record validators and relationship checks; reject ownership/actor overrides and unknown fields. Store only digests of generated credentials and opaque access tokens, reveal credentials once without browser persistence, require secure transport, rate-limit authentication and creation, and test denied scopes, foreign references, expiry, disabled accounts, rotation, revocation, and safe audit projections on both database backends.
- The in-app Service Status page follows profile appearance and color scheme. Public status pages use only their status-page configuration and their configured Light or Dark appearance. Ignore account/local-storage/device theme choices on public routes, keep the visitor Light/Dark toggle separate from profile preferences; default to the saved status-page appearance and reset visitor changes on reload, and restore personal appearance on private routes. Shared form controls, popovers, section surfaces and button states use theme variables; preserve meaningful error and health colors.

# Verify growing-page scrolling

- As an action item for every page or layout change, verify that content taller than the viewport remains vertically scrollable on desktop and mobile. Exercise populated card lists, tables, forms, related panels, and settings with synthetic data; confirm the final record and bottom controls are reachable by wheel, touch, and keyboard. Every viewport-constrained shell must provide an explicit scroll owner. Preserve table row scrolling and fixed headers without clipping non-table pages, and check collapsed/expanded side panels and record tabs.

# Consistent navigation hierarchy

- Expanded, collapsed, and mobile side navigation must use one shared authorized link order. Collapsed mode shows the leading links directly and the trailing links in More; preserve the combined order and never omit authorized links. Keep the rail scrollable when needed and verify the main links plus More match expanded order after navigation changes.
