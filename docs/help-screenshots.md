# Help screenshots and browser verification

Capture the actual local app in an isolated browser with synthetic responses. Never seed or clean up a live workspace, capture personal records or integration credentials, or use redaction as a substitute for synthetic fixtures. All `/api/**` requests are intercepted by `scripts/capture-help-screenshots.mjs` before navigation. Unmatched API paths receive synthetic responses; external requests are blocked. Each run creates a fresh browser context and leaves real application records unchanged.

## Reproduce a capture

Start the existing local Compose project and wait for the app/API to be healthy. Preserve its current environment, database volumes, and integration key. The default Docker app address is `http://127.0.0.1:8090`.

Install Playwright in an isolated temporary directory rather than adding capture dependencies to production:

```sh
npm install --prefix /tmp/servicetrident-help-capture playwright
PLAYWRIGHT_MODULE=/tmp/servicetrident-help-capture/node_modules/playwright/index.mjs HELP_CAPTURE_URL=http://127.0.0.1:8090 node scripts/capture-help-screenshots.mjs
```

The script uses installed Google Chrome on macOS by default. Set `CHROME_PATH` to the browser executable on other systems. Set `HELP_CAPTURE_OUTPUT` to a temporary directory when checking screenshots without replacing the bundled images; otherwise files are written under `app/public/help/`.

The fixture definitions and browser assertions live in the capture script. Add bounded synthetic responses when a workflow changes; never copy live responses. Current checks cover theme/contrast changes, record tab session restoration and draft preservation, keyboard navigation, tab limits, task ordering and compact icons, on-call labels, dashboard control spacing, custom validation, ServiceNow errors, and permission-sensitive references. These checks do not prove real identity-provider or ticketing credentials work.

## Deliver a visual change

Review affected screenshots at their intended size. Update `app/src/features/help/topics.js` with accurate paths, useful alt text, and workflow captions; update README images or prose where needed. Help captions describe the controls without “Demo data only” or “Demo workspace” notices. Keep the fixture safety requirements in this guide and AGENTS.md.

Rebuild the frontend after refreshing bundled images:

```sh
docker compose up -d --build --wait --no-deps app
```

Use `api workers scheduler` as well when shared/server behavior changed. Check affected service health and the app/API through the normal local URL. Include implementation, documentation, fixture changes, and refreshed screenshots in the same delivery.

Authenticated monitor configuration is captured in `monitor-authentication.png` using a synthetic OAuth configuration. The saved Client Secret input must remain blank; fixtures and screenshots never contain authentication credentials.

`event-triggered-incidents.png` uses an isolated synthetic event and its linked incident. The browser capture verifies a positive related-list count, absence of zero badges, and the incident link on the event detail.

The task-board capture also verifies continuous edge scrolling in all four directions with synthetic drag events, and verifies cancellation stops scrolling without modifying a task.

`monitor-check-now.png` shows the Check Now control with synthetic check history. Capture verifies the accepted-request confirmation and disables a duplicate pending request. The Events screenshot includes the Incident column and synthetic incident record links; no external checks or notifications are sent during capture.

Sequential identifiers are synthetic fixtures (INC0000001, MON0000001, and other type prefixes). Capture verifies the Incident reference filter, distinct Event tab label, and the working Audit Log breadcrumb without a Back to List action.

AI chat captures use fixed synthetic settings and responses. `ai-chat-demo.png` shows the six examples and a simulated resolution; `ai-chat-action.png` shows a synthetic task update proposal. Browser assertions verify the demo Thinking/Retrieving Example Data stages, the floating X icon, simulation, confirmation, immediate viewed-record refresh, and transcript scrolling on desktop/mobile. No provider is called, no live data is read, and no real action tokens or credentials are captured. Form Builder checks relabeling, changing Required, preservation on reopening Edit, and absence of a System Field Archive control.

Demo chat link fixtures point only to synthetic demo records. Capture verifies that inline citations and result links open app record tabs in both modes. Event records use RecordWorkspace; verify the right panel can expand/collapse and resize, linked monitor/service references work, and long response content remains reachable on desktop/mobile.

On-call fixtures include a millisecond-precision start. Capture verifies that Edit Coverage preserves the exact UTC value and accepts fractional seconds, preventing false overlaps at adjoining shift boundaries.

The Overview screenshot shows Needs Attention first, using the shared full-size score cards used by other dashboard views. Check responsive wrapping and vertical scrolling when refreshing this screenshot.

`incident-comment-authors.png` uses synthetic comment and work-note authors. Verify both author names link to the synthetic user record; reference labels and icons in lists stay inline with long labels truncated. User records remain admin-only.

Events capture verifies that the Record Number link opens its event record and that the number and reference icon share one line with spacing. Refresh `events-list.png` after list-link layout changes.

`task-board-modal.png` verifies lazy task details, preserving the board route and restoring keyboard focus on Escape. Check long details on mobile remain scrollable. `event-response-headers.png` uses a synthetic response and verifies exactly one Response Headers heading.

`all-articles-list.png` shows a synthetic article with the Knowledge Base reference column and verifies the base record link.

RCA captures use synthetic same-workspace incident/task references and never create real records. `global-create-rca.png`, `rca-record.png`, and `rca-list.png` show the global Create modal, structured analysis, and numbered list. `alert-grouping-settings.png` verifies the configurable 0–300 second window (default 30). Knowledge-base capture verifies Create Article appears in the record header and is absent from the Articles section. Verify RCA list/form scrolling on desktop/mobile, and shared authorized sidenav ordering including RCAs in expanded and collapsed modes.

For a focused RCA/action-label check, run the same isolated capture command with `HELP_CAPTURE_FOCUS=rcas`; it verifies the global Create modal, list Create link, linked records, mobile scrolling, and grouping settings. The full capture continues to run these checks as well.

`task-board-modal-edit.png` verifies editing and saving inside the task dialog without navigation, plus Keep Editing/Discard Changes on unsaved close or cancel. The modal reuses ordinary task form validation and APIs; never bypass role or tenant checks in fixtures.

`rca-form-builder.png` verifies that admins can add and save a custom RCA field and that it appears in the create form. Task modal headers show the task title with one-line truncation; edit footers have no separator border.

Use `HELP_CAPTURE_FOCUS=references` for isolated mobile checks of long single and multi-value references. `reference-truncation.png` verifies labels stay within their fields and record icons remain visible.

Use `HELP_CAPTURE_FOCUS=incident-source` to check the Source badge, bounded Triggered by links, and Source filter requests. `incident-source.png` and `incident-source-list.png` document these controls using intercepted synthetic responses.

Use `HELP_CAPTURE_FOCUS=exports` to capture the article-style RCA reader and Record actions menu. The isolated run downloads synthetic RCA, knowledge article and audit CSV/PDF files, verifies PDF signatures, tests event CSV export, and checks RCA mobile scrolling. Keep generated PDFs/CSVs in the temporary output directory, not bundled Help; `record-export-actions.png` shows the controls. `rca-record.png` uses populated structured findings.

Use `HELP_CAPTURE_FOCUS=intervals` to check monitor Minutes/Hours conversion, invalid-save blocking and canonical minute payloads. `monitor-interval-units.png` shows the selector and permitted range.

For toolbar, incident mentions/watchers, notifications, task-card body clicks, the info toggle/mobile overlay, aligned corners, borderless sidenav and compact layout/scroll checks, run the capture with `HELP_CAPTURE_FOCUS=collaboration`. All collaboration reads/writes are intercepted with synthetic fixtures, including directory names, watcher groups and alerts. Copy only the generated Help PNG, never downloaded records or failure screenshots.

Use `HELP_CAPTURE_FOCUS=overview` for the dashboard’s My Assignments/My Team tiles and mobile scrolling. It refreshes `dashboard-overview.png` and `readme-dashboard-dark.png` with the same intercepted fixtures.

Record-reading screenshots close Details/Field settings before capture and restore test state afterward. Do not publish the information-overlay test image. `HELP_CAPTURE_FOCUS=navigation` verifies knowledge-base automatic pagination, retry/search reset, full article/history breadcrumb paths and the independently scrollable sticky Help categories. `help-navigation.png` illustrates the Help layout.
