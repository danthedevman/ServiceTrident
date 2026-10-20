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

Keep bundled Help focused on essential tasks rather than a screenshot inventory. Select only images that clarify an action or decision; retain other synthetic captures for verification. Avoid styling commentary in captions. Help categories align with the search field on desktop, and both remain available while scrolling.

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

The Overview screenshot shows compact Needs Attention reports first, followed by Quick Start and assignment panels. Check responsive wrapping and vertical scrolling when refreshing this screenshot.

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

README record previews can be refreshed with `HELP_CAPTURE_FOCUS=readme`. Capture incident and RCA records with collapsed navigation and a service with expanded navigation; keep Details closed. Review the reading area and record labels at 1440×960.

Navigation captures verify compact link rows and a 32px highlight around each 20px icon, with larger invisible touch targets. Check theme-aware full-link highlights in expanded/mobile navigation and icon highlights when collapsed without changing link order.

Expanded navigation captures check that the logo and link icons share a center line and the collapse control reaches the content-side edge of the rail.

On mobile, verify Search Workspace, Create, and Notifications share the top navigation row immediately before Profile; record tabs occupy a separate row only when present. Open each control and confirm menus stay inside the viewport.

`HELP_CAPTURE_FOCUS=chat-workspace` checks session history, removal of archived action tokens, disabled past proposals, scroll preservation during replies, and full-view bounds and scrollability on desktop/mobile. Refresh `ai-chat-history.png`, `ai-chat-full-view.png`, and `ai-chat-conversation.png`; wait for navigation resize animations before screenshots.

Monitor detail check history has an explicitly sized Check Number column; verify the heading and adjacent Checked At heading do not overlap at desktop and mobile widths, with horizontal scrolling available.

Notification captures cover Unread/Read dropdown tabs, View All Notifications, page filters, bounded pagination, and mark-as-read behavior. Mobile content is edge-to-edge with square corners; verify desktop corners and spacing remain intact. Help captures check that search stays aligned and sticky, and category navigation resets the guide scroll position.

The collapsed rail exposes Services directly along with Dashboard, Incidents, Events, Monitors, and Tasks. Verify the remaining links retain expanded order in More and its icon is a horizontal ellipsis. Capture `sidenav-more.png` with the dropdown open.

Use `HELP_CAPTURE_FOCUS=form-heading` to verify incident, task, and article create pages omit empty heading rows when their actions move into the shell toolbar. Check admin/responder access and bottom-of-form scrolling at desktop and mobile widths.

Use `HELP_CAPTURE_FOCUS=tab-frame` to verify active tabs meet the content edge without a gap, for first/later tabs in light/dark desktop/mobile views.

Use `HELP_CAPTURE_FOCUS=event-management` for independent Alerts/Events lists, correlated alert records, explicit state confirmation, incident-form prefill, external event details, and desktop/mobile scrolling. New screenshots use synthetic source names and event identifiers; no intake call reaches a live workspace.

Use `HELP_CAPTURE_FOCUS=event-filters` for Events filter grid alignment, full-width column conditions, saved filters on reload, and mobile scrolling; `HELP_CAPTURE_FOCUS=settings-keyword` covers vertical Settings, keyword controls, and saved public appearance on reload. New captures are `settings-navigation.png` and `monitor-keyword.png`.

`HELP_CAPTURE_FOCUS=event-related-bottom` verifies monitor events opened from Events keep Incidents and Alerts after all diagnostics, including mobile scrolling. The public appearance check records canvas colors on animation frames, including the hidden-content bootstrap, to catch a neutral background flash.

Use `HELP_CAPTURE_FOCUS=sidebar-drawer` to check authorized navigation destinations in expanded, collapsed and mobile views. Use `HELP_CAPTURE_FOCUS=standalone-tasks` for task board/list navigation and archived lists. Refresh readme-tasks-dark.png and task-archived.png after changes.

`HELP_CAPTURE_FOCUS=quick-setup` verifies dashboard and global Create entry points, service/monitor form steps and optional notification/on-call skipping. Quick Setup saves each completed record immediately and keeps unfinished input in memory only.

`HELP_CAPTURE_FOCUS=help-topics` visits every bundled topic, adjacent navigation, search results and mobile scrolling. Run it when adding a Help topic; optional card metadata must never prevent rendering a guide.

`HELP_CAPTURE_FOCUS=navigation-groups` verifies the five primary links, disclosure keyboard operation, saved choices, active-route expansion, single-line headings, sidebar scrolling and identical authorized order in desktop, compact More and mobile More. Capture navigation-groups.png and navigation-groups-mobile.png using only isolated fixtures.

Record field pencils appear inside read-only values for authorized editors. `HELP_CAPTURE_FOCUS=record-layouts` checks mobile placement, whole-form editing and focus, no pencils in Edit, double-click editing, and viewer restrictions.

Use `HELP_CAPTURE_FOCUS=pin-details` for personal pin descriptions, group-name editing (validation, Save, Cancel and persistence), and desktop/mobile scrolling. `HELP_CAPTURE_FOCUS=alert-grouping` verifies bounded grouping-window validation. `HELP_CAPTURE_FOCUS=readonly-pencils` checks field affordances without changing Form Builder configuration.

Use `HELP_CAPTURE_FOCUS=standalone-tasks` to verify main Tasks board/list navigation, project-free forms and list search icons. `record-layouts` verifies Show section name defaults on, can be disabled, and preserves the same fields in read/edit mode. `navigation-groups` verifies Tasks immediately above Pinned across desktop, compact and mobile navigation.

Use `HELP_CAPTURE_FOCUS=knowledge-base-edit` to verify one Articles section across repeated double-click Edit, Cancel, and Save transitions, plus mobile scrolling. Refresh knowledge-base-articles.png with Details closed using only the isolated fixtures.

Use `HELP_CAPTURE_FOCUS=immutable-record-fields` for labeled alert/event/log sections, record references and desktop/mobile scrolling. Refresh event-alert.png and external-event.png after changing these views; keep record Details closed in published captures.

The `event-navigation` check covers nested monitor-check URLs and direct Events record URLs, monitor-name breadcrumbs, external-source breadcrumbs, and Events active navigation.

Use `HELP_CAPTURE_FOCUS=status-timezone` to refresh `readme-status-dark.png` and verify date-only history labels and mobile access to the bottom of the status page with isolated synthetic responses.
