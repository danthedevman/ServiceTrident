/** Essential task guides; deployment details live in repository operating guides. */
export const helpTopics = [
  {
    id: 'getting-started',
    title: 'Getting Started',
    screenshots: [
      {
        src: '/help/getting-started.png',
        alt: 'Create Service form with a name and description, health thresholds, and the start of ownership settings',
        caption: 'Create a service, then add its monitors and ownership.',
      },
      {
        src: '/help/notifications-page.png',
        alt: 'Notification history with search, Created ordering, All, Unread and Read filters, and incident links',
        caption:
          'Choose View All Notifications from the bell menu to review retained alerts and load older notifications.',
      },
      {
        src: '/help/record-tabs.png',
        alt: 'Task record with Details selected and Attachments and RCAs available above the record',
        caption: 'Use Details for the record, or select a related section above it.',
      },
      {
        src: '/help/record-tab-order.png',
        alt: 'Reorder Tabs dialog with move controls for open records',
        caption: 'Move open record tabs and save your preferred order.',
      },
      {
        src: '/help/global-create-actions.png',
        alt: 'Global Create dialog with search and Recently Used actions',
        caption: 'Search for an action or choose one from Recently Used.',
      },
      {
        src: '/help/record-delete-confirmation.png',
        alt: 'Delete Record confirmation identifying the incident and explaining what will be removed',
        caption:
          'Review the named record and consequences; Cancel keeps it, and Delete confirms removal.',
      },
    ],
    paragraphs: [
      'Start with a service your team supports. Add its owners, create a monitor, and configure a communication integration before relying on alerts. Add on-call coverage so responders know who is responsible.',
      'Dashboard, Incidents, Tasks and Services stay at the top of navigation. Expand Monitor & Respond, Knowledge & Reports or Automation & Connections to find other pages. Section choices are saved to your profile, and entering a page opens its section. On mobile and the compact rail, grouped links are in More. Use Search Workspace to find records. Table actions and new forms use Create; the page title identifies the record type. After a blocked submit, correct the highlighted fields; validation messages clear as values become valid. In Create, use Search Create Actions to find an action; Recently Used shows your last five selected actions that your current role permits. Admins can choose Component to create a reusable service component. Recent actions save to your account and also remain in All Actions. Search filters both sections; scroll All Actions to browse the full set available for your role. The profile menu contains Profile, Settings, and Help, subject to your role. In Settings, select a category to open its panels or configuration directly. Search Users or Groups, select a name to view its record, or use its actions menu for Edit or Delete. In Users, Change Photo opens profile-photo controls. Previous and Next browse additional results. Admins can use Create in the heading or a row’s confirmed Delete action; workspace owners and your own account cannot be deleted. Dashboard View switches between operational reports; select a score or chart to investigate the underlying records.',
      'Open Notifications for Unread and Read alerts, or View All Notifications for older alerts. Use Search Notifications to find alerts by incident title, number, or author. Created switches between Newest First and Oldest First across the full history; combine search with All, Unread, or Read. Mark all as read clears all alerts through the latest check time. An alert never grants access to its record; internal work-note alerts are restricted to staff.',
      'Reference links open related records in app tabs. Up to 20 tabs stay open; opening another replaces the oldest, with confirmation if it has unsaved changes. Close All Tabs keeps the current record. Tabs survive refresh within your signed-in browser session, but unsaved drafts do not. Signing out clears open tabs. Drag the top tabs to reorder them, use Alt+Shift+Left/Right on a focused tab, or choose Reorder Tabs and use the move buttons. Preferred order saves to your account; Reset Order restores opening order. Reordering keeps the active record and drafts and does not change which tab is oldest.',
      'Most records open on Details. Knowledge bases open on Articles with a separate Settings tab; articles and RCAs open for reading and show Details only after Edit. Use the section tabs near the top for related records such as Comments, Check History, Incidents, or Attachments. Returning to Details preserves unfinished edits while the record stays open; reloading loses unsaved input. Double-click an editable field or choose Edit to enter editing when your permissions allow it. Edit returns to Details, or Settings for a knowledge base. A direct relationship link can open its section instead.',
      'Admins can use Record actions → Delete Record on incidents, tasks, knowledge articles, runbooks and RCAs. Confirm the named record before deletion; Cancel keeps it. Deletion permanently removes its attachments. Deleting an incident also removes its comments and notification deliveries; its tasks remain without the incident link. Audit and history entries remain read-only. Other record types retain their own confirmed Delete controls.',
      'Use Record actions → Export CSV or Export PDF to download saved record data. Save edits first. Downloads exclude attachments, comments, work notes, and related-list datasets. Table CSV exports use the current list filters.',
    ],
  },
  {
    id: 'services',
    title: 'Services, Collections, and Dependencies',
    screenshots: [
      {
        src: '/help/services.png',
        alt: 'Services list showing Customer Portal and Payments API with their health and ownership columns',
        caption:
          'Open a service by its name to review ownership, dependencies, and related records.',
      },
      {
        src: '/help/service-components.png',
        alt: 'Service Components field with selected component references',
        caption: 'Select component records to link them to the service.',
      },
      {
        src: '/help/component-monitors.png',
        alt: 'Component Monitors tab with Create action',
        caption: 'Open a component’s Monitors tab to inspect or add its checks.',
      },
      {
        src: '/help/component-create.png',
        alt: 'New component form with Name, Description and Service picker',
        caption: 'Select Service before Create to associate the component immediately.',
      },
    ],
    paragraphs: [
      'A service represents a capability your team supports, such as My Webapp. Create one with a clear name, description, and owners. In Components, select component records such as Payment API, Login API, and Frontend. Use Create Component in the picker to create a separate record, then select it. Created components remain saved even if the service draft is discarded. Open the Components related list to view component records and their Monitors. On a new component form, optionally select Service to associate it when you choose Create; the service’s Components field can add other associations later. Collections organize related services.',
      'Add dependencies for services it relies on. Dependency failures can affect its health; avoid circular dependencies. Open a service to review its monitors, incidents, and linked knowledge.',
      'Health uses recent monitor results, dependencies, and configured health settings. Missing, paused, or stale checks can leave it Unknown. Creating a monitor alone does not establish healthy status; review its results.',
    ],
  },
  {
    id: 'monitoring',
    title: 'Monitoring Endpoints',
    screenshots: [
      {
        src: '/help/monitor-keyword.png',
        alt: 'Keyword and Trigger when controls on a monitor form',
        caption: 'Choose whether found or missing text should fail a check.',
      },
      {
        src: '/help/monitor-authentication.png',
        alt: 'Monitor Authentication section with OAuth client credentials settings and a blank saved-secret field',
        caption:
          'Choose machine authentication for a protected endpoint; saved secrets remain hidden.',
      },
      {
        src: '/help/monitor-check-history.png',
        alt: 'Monitor Check History with separate Check Number and Checked At columns',
        caption:
          'Open a Check Number to inspect the event. Scroll the table horizontally on narrow screens.',
      },
      {
        src: '/help/events-list.png',
        alt: 'Events table with monitor, service, linked incident, outcome, HTTP status, duration and error columns',
        caption: 'Filter retained events and open a check to investigate its diagnostics.',
      },
    ],
    paragraphs: [
      'Create a monitor from Monitors, Events → Create, or a service’s actions. Select a service and public HTTP/HTTPS endpoint. Private and reserved network addresses are blocked.',
      'Set Check every in Minutes or Hours, from 1 minute to 24 hours. Fractional hours must convert to whole minutes. HEAD checks headers; GET can capture a bounded response preview. Enable redirects only when the endpoint needs them.',
      'For protected endpoints, admins configure Basic Auth, Bearer Token, or OAuth Client Credentials using a least-privilege machine account. Authenticated checks require public HTTPS, reject redirects, require a 2xx response, and do not save response headers or bodies. Browser SSO and MFA are unsupported; an Okta login page does not prove application health.',
      'Saved secrets cannot be read back. Leave them blank to retain unchanged credentials; provide new credentials when changing the target origin or authentication account. Choose None and Save to remove authentication.',
      'Admins select Check Now for a queued check, even when paused. Requests are limited to once per monitor per minute; queue delays can postpone results. Acceptance is not success. Review Check History or Events; a paused monitor stays paused.',
      'Set Keyword and Trigger when to fail a check when literal text is found or missing. Matching can be case sensitive and requires an unauthenticated GET request. Only the first 16 KiB of a text response is checked; unreadable or inconclusive captures fail. Triggered checks follow the service’s existing health and incident thresholds. Leave Keyword empty to disable.',
      'Select a Service, then optionally choose its Component. Changing Service clears the component selection. Admins manage separate component records and link them through the service’s Components field. Components can be shared by services. Use workspace-unique names of 1–80 characters, up to 1,000 components per workspace and 50 references per service. Rename a component without changing monitor links; reassign monitors before removing its service reference. Remove all service and monitor references before deleting a component. Components share service ownership, health policy, and incident routing.',
      'Use Check History for a monitor’s saved results. Events combines retained checks with external signals, with service, source, severity, incident, and UTC date filters. Open a check for diagnostics and its related incident. Monitor-generated event breadcrumbs link to Events and the originating monitor. Events expire after 30 days and are removed when their monitor is deleted. Dashboard View → Events separates monitor check metrics from external event totals.',
      'Checks run from workers, not your browser. A site may work locally but reject the worker’s network or HTTP request. Checks do not execute browser sessions; changing user agents does not guarantee acceptance by bot protection. For sites you control, use a dedicated health endpoint or allowlist monitoring traffic.',
    ],
  },
  {
    id: 'events',
    title: 'Events and Alert Triage',
    paragraphs: [
      'Events combines monitor results and incoming operational signals. Open Alerts for correlated signals that need attention. Events keeps the immutable check, alert, change, and information history. Filter by service, source, severity, state, or event type.',
      'Open an alert to review Alert Details and Source and Status, follow Latest Event to its evidence, or inspect the related incidents. Responders and admins can Acknowledge, Resolve, or Reopen after confirmation. These actions change alert triage only; they do not change measured service health or resolve incidents. A newer recovery signal resolves its matching alert; a newer failure can reopen it.',
      'Monitor failures still create incidents using the existing service-health thresholds and alert-grouping rules. External events can create incidents through an enabled Event Rule. Otherwise use Create on an alert, review the prefilled form, and save to link the incident. Configured required fields still apply.',
      'Admins create a service account with Receive events and permitted services, then configure the sender to POST normalized events to /api/external/v1/events using its API key or OAuth token. Each event needs a unique External ID; alert signals also need a stable Correlation Key. See docs/external-api.md in the repository for payload examples.',
      'Use the section tabs near the top of an event, alert, or incident to see its linked records. Details shows the record itself. Counts load separately and rows load when a panel is opened. Only exact triggering checks and explicit alert links are included; shared service membership alone is not a relationship.',
      'External events may include a diagnostic payload object up to 32 KiB. Common credential fields are redacted before storage; do not send secrets or personal data. Open the event to inspect the retained payload. External ID, Correlation Key, and occurrence and receipt times are searchable table columns.',
      'Use the same Correlation Key for a failure and its recovery. Keys are isolated by workspace, service account, and service. Retrying the same External ID and payload returns the existing event; reusing it for different content is rejected. Older signals cannot replace newer alert state. Change and information events remain history without opening alerts.',
      'Raw events are retained for 30 days. Alert summaries and incident links remain after their raw evidence expires; deleting a monitor removes its events and monitor alerts. Existing history stays readable, and monitor alerts begin with new checks after upgrade. New demo batches include both monitor and external examples.',
    ],
    screenshots: [
      {
        src: '/help/events-alerts.png',
        alt: 'Events Alerts view with source, service, severity, state and latest event',
        caption: 'Use Alerts for triage and Events for the underlying evidence.',
      },
      {
        src: '/help/event-alert.png',
        alt: 'Alert record with Acknowledge, Resolve and Create actions and related events',
        caption: 'Review the evidence before changing alert state or creating an incident.',
      },
    ],
  },
  {
    id: 'incidents',
    title: 'Incidents, Tasks, and Knowledge',
    screenshots: [
      {
        src: '/help/incident-resolve.png',
        alt: 'Resolve Incident dialog with resolution notes and Cancel and Resolve Incident controls',
        caption:
          'Resolve opens this dialog directly without entering Edit. Add notes if required by your form configuration, then confirm.',
      },
      {
        src: '/help/task-board-modal-edit.png',
        alt: 'Task modal editor with task title, form fields, Cancel and Save',
        caption:
          'Edit task fields and Save without leaving the board; Cancel returns to task details.',
      },
      {
        src: '/help/pinned-records.png',
        alt: 'Pinned records grouped by name with record type, number and service context',
        caption:
          'Use Edit Group Name beside a heading to rename it; reorder links or confirm Unpin to remove a shortcut.',
      },
      {
        src: '/help/knowledge-base-articles.png',
        alt: 'Knowledge base Articles tab with its article list, search and Status filter',
        caption:
          'Search within a knowledge base and use Status to choose publication status. Select an article to read it.',
      },
      {
        src: '/help/knowledge-base-settings.png',
        alt: 'Knowledge-base Settings with manager and article viewer reference fields',
        caption:
          'Edit Settings to choose users and groups that manage the base or read its articles.',
      },
      {
        src: '/help/incident-link-articles.png',
        alt: 'Link Articles dialog with search and article checkboxes',
        caption: 'Select articles and confirm Link Articles to update the incident.',
      },
    ],
    paragraphs: [
      'Create an incident with its affected service, severity, description, and responder. Source identifies whether it came from a person, monitor, integration, automation, or AI. Automatic incidents link to their retained triggering checks under Monitor Events.',
      'On records you can edit, select a field’s pencil or double-click its value to edit the whole record. The selected field receives focus. Save applies the form’s changes; Cancel asks for confirmation when the form has unsaved changes. Choose Keep Editing to return to the draft or Discard Changes to cancel.',
      'Choose Pin Record from a record’s actions, then choose or create a group. Pinned below Tasks contains your personal record links, with record type, saved record number and service or parent context where available. These descriptions are snapshots from when you pinned the record. Select Edit Group Name beside a group heading, enter a Group Name (up to 80 characters), then Save; Cancel discards the name draft. Renaming preserves its records and order. Move items up or down within a group; Unpin asks for confirmation and does not delete the record. Pins do not grant record access.',
      'Use Assign to Me in an incident or task form, then Save. If an assignment group is selected, you must belong to it. Tasks track investigation and follow-up work.',
      'In an incident’s Knowledge tab, choose Link Articles, use Search Articles, and select records. Link Articles confirms the selection; Cancel discards it. In a create or edit form, the selection remains a draft until Create or Save. Responders and admins can link up to 50 accessible articles. Existing unavailable links are preserved; access to an incident does not grant access to its articles.',
      'In Conversation, use comments for information everyone with incident access may read. Work notes are restricted to responders and admins. Type @ and select a person to mention them. Edit watchers adds users or groups to notifications without granting record access. Public-comment emails require SMTP; work notes do not send email.',
      'Select Resolve to open its confirmation dialog directly. Resolution notes are optional by default; admins may make them required in Form Builder. Confirm Resolve Incident to apply the change. Reopening also requires confirmation. For monitor-created incidents, review the automatic-lifecycle notice before resolving an ongoing outage manually.',
      'On the task board, select a card to read or Edit it in a modal. Save keeps you on the board; Open Record opens the full form and attachments. Admins and responders can drag cards or use Move To and ordering controls. Changes are shared with the workspace. Only admins reorder lanes. Use List View or Archived Tasks for table views. Select Record Number or Check Number in a table header to sort ascending or descending across the full list. Use Active Tasks to return from the archived list. Archived task records retain their status; edit it to restore a task.',
      'Open Knowledge and select a knowledge base. Articles opens first; search or filter its articles. Open Settings and choose Edit to change the name, description, Managers — Users, Managers — Groups, Article Viewers — Users, or Article Viewers — Groups. Create in a base’s header associates a new article with it. All Articles → Create makes an article with an optional base. Choose Runbook for ordered recovery steps. Articles and RCAs open as readable documents with their record number and status in the header; Details appears only in edit mode. Choose Edit or double-click a field to open the form; Cancel returns to the reading view without saving.',
      'Administrators always manage and view all bases. With empty manager lists, responders can manage the base; selecting managers restricts management to them and administrators. Empty viewer lists allow workspace access; selecting viewers restricts the base and its articles to those users or groups, managers, and administrators. Group membership changes take effect on the next request. End users retain incident portal access only. Admins and responders with base management access can Publish saved articles and runbooks. Unpublish returns them to Draft after confirmation; Record actions → Archive Article hides them from active lists while retaining content. Save draft edits before these actions. Deleting a knowledge base requires choosing whether to move its articles to a different base or permanently delete them and their attachments.',
      'Attachments support files up to 5 MB, with up to 20 per record including embedded article images. New-form uploads attach when the record is created; abandoned uploads are eligible for cleanup after 24 hours. Files are access-controlled but not malware-scanned, so treat downloads as untrusted.',
    ],
  },
  {
    id: 'rcas',
    title: 'Root Cause Analyses and Alert Grouping',
    screenshots: [
      {
        src: '/help/rca-record.png',
        alt: 'Root cause analysis with structured findings and linked incidents and corrective-action tasks',
        caption:
          'Read the RCA like a knowledge article: summary, findings and linked corrective-action records, with exports in Record actions.',
      },
      {
        src: '/help/alert-grouping-settings.png',
        alt: 'Alert Grouping settings with a window in seconds and Save',
        caption:
          'Choose a 0–300 second initial alert window. The default is 30; 0 sends immediately.',
      },
    ],
    paragraphs: [
      'Use a root cause analysis (RCA) to explain why an incident happened and prevent recurrence. Admins and responders choose Create in RCAs, Create → RCA, or an incident/task’s RCAs related list. Viewers can read; end users cannot access internal RCAs.',
      'Capture the impact, timeline, root cause, contributing factors, corrective actions, and lessons learned. Link the affected incidents and follow-up tasks. Draft and In Review allow unfinished analysis; Completed requires Summary, Root Cause, and Corrective Actions. Completion does not execute actions or publish a status update.',
      'Admins customize RCA fields through Form Builder. Record actions offers CSV/PDF exports and Archive RCA. To restore an archived RCA, filter the list by Archived, then Edit its status.',
      'Admins set Alert Grouping → Alert grouping window (seconds) from 0–300; the default is 30. Automatic incidents appear immediately, while their initial notification waits to collect failing checks for the same service and its dependencies. Use 0 to send immediately. Separate services and manual incidents remain separate; changes apply to new automatic incidents.',
      'Monitor Events preserves checks gathered during that initial window, subject to 30-day event retention. Later checks do not replace the group. Recovery updates the incident immediately, including short outages.',
    ],
  },
  {
    id: 'people',
    title: 'People, Access, and On-call Coverage',
    screenshots: [
      {
        src: '/help/settings-categories.png',
        alt: 'Settings with group panels, search, Create, and per-row actions menus',
        caption:
          'Choose Groups in Settings, then open a group or use its actions menu to manage it.',
      },
      {
        src: '/help/on-call-coverage-modal.png',
        alt: 'Coverage dialog showing teammate, services, start and end with Close and Edit Coverage controls',
        caption:
          'Select coverage on the calendar to view details. Admins can select Edit Coverage to update the shift without leaving the calendar.',
      },
    ],
    paragraphs: [
      'Admins manage users and configuration. Responders manage operational records. Viewers can read permitted information. Users can create incidents and view those opened by or for them. Available controls follow your effective role.',
      'Admins create users with a name, email, role, and initial password; share passwords privately. Resetting another user’s password requires the admin’s password and signs that user out. Change your own password in Profile. Groups organize membership and ownership.',
      'Use Upload Photo in Profile or a user record to select a PNG, JPEG or WebP image up to 5 MB. Photos are cropped to a square and resized to 256 × 256 pixels; the saved PNG must fit within 100 KB. Uploads save immediately, independently of record edits. Remove Photo requires confirmation and restores initials. You can change your own photo; admins can change workspace teammates’ photos. Demo-user photos cannot be changed.',
      'Use On-call to create coverage or select a calendar date. Choose the teammate, services, and UTC start/end times; rotation settings create multiple shifts. Select existing coverage to review or edit it. Filter by service to inspect coverage.',
      'Coverage cannot overlap for the same service; All services overlaps service-specific shifts. Start a shift at the previous shift’s end to avoid a conflict. Schedule editing uses UTC even when record timestamps use your profile timezone.',
      'Open Profile for timezone, date/time formats, theme, accessibility, and AI preferences. Dashboard Greeting accepts {firstName}. Personal appearance applies within the app; public status pages have separate settings. Fields explicitly labeled UTC stay in UTC. Adding a phone number does not enable SMS or voice delivery.',
      'An enabled Slack integration reveals Slack channel on groups and Slack user ID on users. Group email stores a mailbox or distribution list. These directory values alone do not send messages; delivery destinations remain controlled by integration configuration.',
    ],
  },
  {
    id: 'operational-automation',
    title: 'Routing, Escalation, and Maintenance',
    screenshots: [
      {
        src: '/help/operational-dashboard.png',
        alt: 'Operational Reporting dashboard with Reporting period and grouped metrics',
        caption:
          'Choose a reporting period and use the sample counts and Metric Definitions to interpret the results.',
      },
    ],
    paragraphs: [
      'Admins open Event Rules, Escalation Policies, Maintenance Windows, Probe Agents, Alert Grouping and Integrations in the main navigation; use More when collapsed. Settings retains workspace administration.',
      'In Event Rules, create a rule, choose field comparisons and actions, and use Preview rule with a sample event before enabling it. Editing the rule requires another preview. Rules apply to new events; later matching routing values replace earlier values, while suppression stays effective. Required incident fields still apply.',
      'Escalation Policies select services, current on-call coverage or a responder, delays, and destinations using the Notification integrations reference picker. The first step starts immediately. Acknowledge or resolve the incident to stop pending escalation. Check coverage and delivery history before relying on a policy.',
      'Maintenance Windows keep collecting checks and events while operational notifications wait. Choose services and UTC start/end times; windows expire automatically. Unresolved, unacknowledged pages are re-evaluated afterward. Comment notifications remain available.',
      'In Integrations, review delivery state and errors. Failed deliveries allow a confirmed retry, limited to three additional cycles with a cooldown. Each cycle allows five attempts. A provider timeout can cause duplicate delivery; delivered does not mean read.',
      'Probe Agents run checks on another host. Create an agent, securely copy its token once and deploy the agent before selecting it on an unauthenticated monitor. Matching fresh checks confirm health; disagreement shows degraded and missing confirmation stays unknown. A region label does not deploy an agent.',
      'On Dashboard, set Dashboard View to Operational Reporting for acknowledgment and resolution averages, recurring services, noisy sources, unowned alerts and delivery states. Review Metric Definitions and sample counts; event metrics use retained history up to 30 days.',
      'Overview starts with priority counts; select a count to open its matching report, or View Alerts to review active alerts. My Assignments shows work assigned to you; My Team shows work assigned to your groups and can include your own assignments. Quick Start provides setup links. Admins can select Quick Setup there or in the global Create modal to walk through service and monitor creation. Notifications and On Call are optional; use Skip to continue. Each saved step creates a record immediately; leaving retains saved records and discards unfinished input.',
    ],
  },
  {
    id: 'role-preview',
    title: 'Impersonation and Role Preview',
    paragraphs: [
      'Admins choose Impersonation in the profile menu to preview Responder, Viewer, or User permissions. Select Return to Admin in the Viewing as banner to restore admin access.',
      'This previews a role using your own account. Permitted actions change real records and may send notifications. Use a separate test workspace when exploring changes. Audit history retains your identity and effective role.',
    ],
  },
  {
    id: 'service-accounts',
    title: 'Service Accounts and External API',
    screenshots: [
      {
        src: '/help/service-account-settings.png',
        alt: 'service account form with explicit creation scopes, service restrictions, authentication methods, and credential lifetime',
        caption:
          'Grant only the scopes and service access the external source needs. Choose API Key, OAuth Client Credentials, or both; credentials are shown once after creation.',
      },
    ],
    paragraphs: [
      'Admins choose Settings → Service Accounts → Create. Select only the Allowed Scopes and Permitted Services the external source needs. Choose API Key, OAuth Client Credentials, or both, and a credential lifetime.',
      'Copy credentials when shown and store them in the external system’s secret manager. They cannot be retrieved later. Use HTTPS and the dedicated external creation endpoints; credentials do not grant record reads, updates, deletes, uploads, browser sign-in, or admin access.',
      'External records must satisfy workspace required-field policies and relationship permissions. Published knowledge needs its separate publish scope. Creation is not automatically deduplicated; investigate uncertain requests before retrying. Receive events grants normalized event intake only, with the same permitted-service restrictions. Event retries use External ID deduplication.',
      'Rotate or revoke compromised credentials, or disable the account. Rotation replaces the old credential immediately. OAuth credential or account-setting changes invalidate issued tokens. An operation already authorized may finish.',
      'Use Settings → Audit Log to review safe request metadata. A 401 indicates invalid credentials; 403 indicates denied scope or service access. See the repository’s docs/external-api.md for endpoints, token requests, payloads, and deployment requirements.',
    ],
  },
  {
    id: 'integrations',
    title: 'Configure Integrations and Notifications',
    screenshots: [
      {
        src: '/help/athena-settings.png',
        alt: 'Athena configuration under Settings with Response Style and Workspace Instructions',
        caption: 'Choose how Athena responds, then select Save Athena Settings.',
      },
      {
        src: '/help/servicenow-oauth.png',
        alt: 'ServiceNow integration with a visible saved instance URL, OAuth client settings, and a connection test error',
        caption:
          'Select an authentication method and save the settings, then use Test Saved Connection to check authentication and access without creating an incident.',
      },
      {
        src: '/help/ai-chat-action.png',
        alt: 'AI Chat showing a cited task and proposed status change awaiting confirmation',
        caption:
          'Review the target and exact changes before Apply Changes saves through normal record validation.',
      },
    ],
    paragraphs: [
      'Admins open Integrations, choose a provider, configure its credentials and destination, and Save. Check service scope, recovery notifications, and on-call routing where applicable. Enable delivery defaults to on for new integrations. Configure SMTP with an authorized sender before expecting email.',
      'Review Integrations → Logs when delivery fails. Check credentials, enabled delivery, and service scope. Workers and Redis must be running. Test controls check only their stated connection capabilities; verify actual delivery before relying on an integration.',
      'For ServiceNow, enter Instance Root URL and choose Basic Auth or OAuth client credentials. The account needs Incident API access and read access to its own User record; it becomes Caller on created incidents. Save, then use Test Saved Connection. This checks authentication and read access without creating an incident. For 401 check authentication; for 403 review permissions and REST API policies.',
      'Slack alerts include View Incident and, for monitor-triggered incidents, relevant HTTP/error diagnostics. Open the incident for full investigation. If links point to the wrong host, ask your deployment administrator to check the configured application origin.',
      'For live AI, admins configure OpenAI or Claude under Settings → AI Provider. Choose Provider, then Model; use Custom Model for another supported API identifier. Saved custom identifiers remain unchanged. Switching Provider clears the model and requires that provider’s key. Save before Test Connection; the test uses saved settings and checks a small generation request, not every AI workflow. Model access depends on the provider account. Provider charges and quotas apply. Profile → AI Features controls your enabled features. Incident-portal users have no AI access.',
      'AI Chat can search accessible records and propose incident, task, article-draft, or RCA changes. Every write requires Review and Apply, then Apply Changes. Permissions, required fields, relationships, and revisions are checked again. Published articles, deletion, publishing, credentials, and administrative actions are outside its tools. Actions can trigger normal notifications.',
      'Review AI sources and proposed changes. Answers may be incorrect or miss relevant records. Authorized record text, prompts, and bounded recent context are sent to the provider; attachments, credentials, and internal work-note conversations are excluded. Context is limited to 20 recent messages and eight accessible references, so restate older details when needed.',
      'Athena is the in-app AI assistant. Ask questions, discuss a problem, or request authorized record searches and proposed changes. Ask where to find a feature to get links to pages or creation forms allowed for your role. These links open the destination without saving a record. Athena can propose supported incident, task, article-draft and RCA changes; review and confirm before anything is saved. Admins configure Response Style and Workspace Instructions under Settings → AI Provider, then select Save Athena Settings. Instructions guide responses but cannot override permissions or confirmation requirements. Do not enter credentials or secrets in instructions or messages.',
      'Use New Conversation to start again, Conversation History for up to 20 recent conversations, and Full View for more reading space. History saves privately to your account and survives reloads and sign-ins. Each conversation retains its 20 latest messages. History is separate for each workspace and role; conversations referencing records you can no longer access are unavailable. Use Delete in Conversation History to remove a conversation. Only successful replies are saved. Unsent messages and pending confirmations are not saved; historical proposals cannot be applied, so ask for a fresh one. Proposals expire after ten minutes. Successful actions refresh record views while preserving unsaved form drafts.',
      'Use Summarize on saved incidents/tasks, Generate Draft in article/runbook forms, or open a knowledge base and use Ask Knowledge for answers from its published articles. Review generated drafts before Use Draft in Form, then Save yourself. AI shares per-user and workspace limits; if a request is rejected, wait or ask an admin to review usage.',
      'Enable Demo AI with an active demo dataset to try six predefined examples without a provider. Replies and actions are simulated; they do not change records or contact a provider. Demo AI can be enabled independently of live AI.',
    ],
  },
  {
    id: 'status-page',
    title: 'Status Pages and Subscriptions',
    screenshots: [
      {
        src: '/help/status-settings.png',
        alt: 'status settings with a new service message enabled and Light or Dark Appearance below the other settings',
        caption: 'Configure public visibility, messages, subscriptions, and appearance, then Save.',
      },
      {
        src: '/help/status-components.png',
        alt: 'Service status with Components expanded and individual history bars',
        caption: 'Expand Components to inspect the checks and history for each part of a service.',
      },
    ],
    paragraphs: [
      'Admins open Service Status → Settings to choose Private workspace access or Public visibility and share the public link. Public pages omit internal monitor targets and responses. Expand Components beneath a service to see each component’s status and history. Components with no usable assigned checks remain Unknown. Component names are visible wherever the service is published.',
      'History uses your profile timezone in the app and your browser timezone on public pages. The current day’s percentage covers checks collected so far. Local-day history uses retained checks (up to 30 days); older UTC summaries remain available only in UTC.',
      'Add a banner or service message to explain impact; messages do not override measured health. New service messages have Display message enabled, so enter their text before Save or disable display to keep them hidden.',
      'The in-app page follows your profile appearance. Public pages start with the Light or Dark Appearance saved in Status Page Settings. Visitors can toggle it for the current visit; reload restores the saved appearance without changing profile preferences.',
      'To offer email subscriptions, enable subscriptions, choose an enabled SMTP integration, and configure the public HTTPS origin. Visitors choose Subscribe to updates and confirm email within 24 hours. RSS can be enabled independently. Hiding subscriptions stops new signups, email updates, and RSS access; unsubscribe links still work.',
      'Subscribers receive public health and published-message changes, not internal work notes or unchanged checks. Workers must be running. Switching to Private cannot recall delivered messages or cached feeds. See docs/deployment.md in the repository for custom-domain setup.',
    ],
  },
  {
    id: 'configuration',
    title: 'Forms, Tables, and Administration',
    screenshots: [
      {
        src: '/help/settings-navigation.png',
        alt: 'Settings categories beside the selected settings panel',
        caption: 'Choose a category to open its settings.',
      },
      {
        src: '/help/form-builder-sections.png',
        alt: 'Task Form Builder with a named section, column settings and Show section name control',
        caption: 'Group fields into sections and choose whether their names appear on records.',
      },
      {
        src: '/help/identity-provider-settings.png',
        alt: 'Identity Providers settings with callback URL, workspace sign-in link, and an enabled Auth0 configuration',
        caption:
          'Register the Callback URL with the identity provider, configure the client, then connect your account in Profile before using the Workspace Sign-in Link.',
      },
    ],
    paragraphs: [
      'Admins open Form Builder from supported record or list secondary actions, then select Edit. Adjust labels, Help Text, Required, field order, and custom fields. Save applies the configuration; Cancel discards the draft.',
      'In Sections and Columns, use Add Section to group fields, choose Single Column or Split Columns, and move sections with Move Up or Move Down. Select each field’s Section in its settings; field arrows set the order within a section. Show section name is enabled by default; clear it to hide the heading while keeping the section and its column layout. Read and edit views use the same saved layout. Double-click an editable field in a read-only record to enter Edit mode; your role must allow updates.',
      'All System Fields, including Resolution notes, support Required and label changes. System Fields cannot be archived, and their stored types and existing workflow meanings stay protected. Additional system select options need a canonical workflow meaning. Use Archived Fields to restore custom fields; their saved values are retained while hidden.',
      'Use Search list above the table for text search. Use Filters for Filter Column, Column Contains, dates, and other field conditions; changes apply immediately. Filters are saved for your account and list across refresh until reset. Closing the panel keeps filters active. Sort with column headers. Filtering, sorting, and pagination run on the server. The ellipsis menu’s Compact Rows switch saves your spacing preference across tables.',
      'Use Settings → Audit Log to investigate who performed an action and its outcome. It includes API activity and failures with safe metadata, excluding credentials and private request contents. Automated updates appear as System.',
      'For provider sign-in, admins configure Settings → Identity Providers with an OpenID Connect issuer, client credentials, and the exact Callback URL registered at the provider. Test Discovery checks public metadata, not credentials. Users first sign in with a password and connect their identity under Profile → Identity Provider Connections, then use the Workspace Sign-in Link.',
      'Provider sign-in retains the existing role. Automatic provisioning, group mapping, SAML/SCIM, and provider-only enforcement are unsupported. Disabling a provider prevents new sign-ins but does not end existing sessions or password access. App sign-out does not sign out of the provider.',
      'Open Settings and choose a category from the vertical navigation. Admin categories include Identity Providers, Service Accounts, Audit Log, and Demo Data. Open Alert Grouping and Integrations directly from the main navigation (More when collapsed).',
      'In Settings → Demo Data, choose Industry, then Add Demo Data. Presets include Media, Retail, Audio Providers, Finance, Healthcare, Solo User, and SaaS App. Solo User creates 10 examples per supported type; other presets create 50, with three managed components per service. Demo monitors select a component in their service. Batches include linked records, runbooks, RCAs, and in-app notifications. Demo users cannot sign in, monitors stay paused, and no external messages are sent. Only one batch is allowed. To change industry or receive newer examples, use Delete demo data and add a new batch; cleanup preserves unrelated records. Demo AI is enabled separately.',
    ],
  },
  {
    id: 'hosting',
    title: 'Self-hosting and Maintenance',
    paragraphs: [
      'Follow the repository README for installation. Use docs/deployment.md for HTTPS and public domains, docs/database-backends.md for database configuration, and docs/operations.md for upgrades, backups, and recovery.',
      'Before upgrading, back up the database and integration-encryption key. Preserve persistent volumes and rebuild changed services. Switching database providers does not migrate existing data.',
      'If checks or notifications stall, verify API, worker, scheduler, Redis, and database health. A configured interval is a target; slow endpoints and queue backlogs can delay checks. Consult docs/scaling.md for capacity planning. Keep secrets and private records out of shared troubleshooting logs.',
    ],
  },
];

export const helpQuestions = [
  [
    'Why is a service Unknown?',
    'Check that its monitors are running, assigned to the correct service, and have recent results. Paused checks, missing results, stale checks, or unknown dependencies can keep the service unknown.',
  ],
  [
    'Why are checks later than the interval?',
    'The interval is a target rather than a guarantee. Inspect event timing, worker health, queue backlog, endpoint latency, and Redis/database connectivity.',
  ],
  [
    'Why is a field or action unavailable?',
    'Your effective role may not allow it, the record may be read-only, or required configuration may be missing. Admins using role preview should return to their admin role before changing configuration.',
  ],
  [
    'Why do I see an origin error when saving?',
    'Open the app at its configured origin. Check APP_ORIGIN for the private app and Public origin in status settings for public subscription links. Restart the API after deployment environment changes.',
  ],
  [
    'Why have I not received a subscription email?',
    'Check spam, confirm that email subscriptions and their SMTP integration are enabled, and verify worker health. Repeated signup requests do not repeatedly send confirmation emails during the 24-hour confirmation period.',
  ],
  [
    'Does a crashed frontend stop checks?',
    'Checks run in workers, independently of the browser. If worker, Redis, or database infrastructure stops, checks can be delayed until it recovers. Keep persistence and backups configured.',
  ],
];
