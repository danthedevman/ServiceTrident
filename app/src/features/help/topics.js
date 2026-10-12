/** Product documentation stays local, versioned with the application, and contains no workspace data. */
export const helpTopics = [
  {
    id: 'getting-started',
    title: 'Getting Started',
    screenshots: [
      {
        src: '/help/getting-started.png',
        alt: 'Create Service form with a name and description, health thresholds, and the start of ownership settings',
        caption:
          'Create a service with a clear name and description, then choose its owners and dependencies.',
      },
      {
        src: '/help/record-references.png',
        alt: 'Read-only task with links to its service, assignment group, and assignee',
        caption:
          'Reference labels remain clickable in read-only records and open the related record in an app record tab.',
      },
    ],
    paragraphs: [
      'Detect, Respond, Resolve describes the workflow: monitor services to detect issues, coordinate incident response, and resolve incidents with recorded outcomes.',
      'The logo, workspace search, and navigation toggle are centered in the navigation header. Select Search Workspace to find records, or Collapse navigation to switch to the compact rail, which keeps leading links in order and shows trailing links in More, with scrolling when needed. In the compact rail, hover or focus the logo to reveal Expand Navigation.',
      'Start by creating a service for something your team owns, such as a customer portal or payments API. Add owners and a primary contact, then create a monitor from the service’s action menu.',
      'Create user profiles, assign appropriate roles, and configure a communication integration before relying on notifications. Add an on-call schedule so responders know who owns coverage.',
      'Use the global Create button for new records, including Knowledge Articles. Admins also have a Create User option. Open a saved record and select Edit to change it. Save applies changes; Cancel leaves edit mode without saving your draft. Related information appears in tabs below the record. Related-list counts appear only when at least one record exists; empty lists show no count. Totals are unfiltered and refresh at most once a minute and after record writes.',
      'Multiline text fields grow as you type, paste, or change their width. They scroll internally after reaching 320 pixels so long text stays manageable.',
      'Populated reference fields remain links when viewing a read-only record. Select the reference label or its info link to open the related record in an app record tab. Up to 20 record tabs can be open. Opening another record replaces the oldest opened tab; opening an existing record selects its tab. If the oldest tab has unsaved changes, confirm replacement or cancel to keep it. Close All Tabs keeps the current record and its draft open. Closing an edited tab, or other edited tabs through Close All Tabs, asks for confirmation before closing, and forms remain mounted when switching. The tab strip appears only on record pages when more than one record is open. Open tab links survive refreshes for the signed-in browser session; restored records load only when selected. Unsaved drafts reset on refresh. Sign-out clears the tabs. Your existing access permissions still apply.',
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
    ],
    paragraphs: [
      'A service represents a capability your team supports. Collections organize related services. You can select or create a collection from the service form, and associate users or groups as owners.',
      'Dependencies describe services that another service relies on. A failing dependency can affect the parent service’s health. Avoid circular dependencies.',
      'Service health comes from recent monitor results and dependencies. A failing check makes the service down; missing, paused, or stale checks can make it unknown. Creating a monitor alone does not establish healthy status—wait for a successful check.',
    ],
  },
  {
    id: 'monitoring',
    title: 'Monitoring Endpoints',
    screenshots: [
      {
        src: '/help/events-list.png',
        alt: 'Events table with monitor, service, outcome, HTTP status, duration and error columns',
        caption:
          'Use Filters for service, monitor, outcome, search and UTC date ranges. Open a row for its saved response.',
      },
      {
        src: '/help/dashboard-events.png',
        alt: 'Events dashboard with check totals, successful check percentage, average duration and outcome and HTTP charts',
        caption:
          'Choose Events in Dashboard View and optionally select a service to review retained monitor checks.',
      },
      {
        src: '/help/monitor-authentication.png',
        alt: 'Monitor Authentication section with OAuth client credentials settings and a blank saved-secret field',
        caption:
          'Choose an Authentication Method and configure a machine account for the protected HTTPS endpoint.',
      },
      {
        src: '/help/event-triggered-incidents.png',
        alt: 'Event record showing a Triggered Incidents section with an incident title link and status',
        caption: 'Open the linked incident from the event that triggered it.',
      },
      {
        src: '/help/monitoring.png',
        alt: 'Monitors list with HTTP endpoints, health states, associated services, and check intervals',
      },
    ],
    paragraphs: [
      'Create a monitor from a service’s secondary action menu or its Monitors related list. A service and a public HTTP or HTTPS endpoint are required. Check intervals range from 1 minute to 1,440 minutes.',
      'HEAD checks response headers without requesting a full response body. Unauthenticated GET also stores a bounded text preview. Choose GET if the endpoint does not support HEAD or you need response details for troubleshooting.',
      'Admins can configure Authentication on a monitor using Basic Auth, Bearer Token, or OAuth Client Credentials. Use a least-privilege machine account and a protected API endpoint that accepts those credentials. Authenticated checks require public HTTPS on standard ports, reject redirects, and require a 2xx response; response bodies and headers are not saved. OAuth supports client_secret_basic and client_secret_post, optional Scope and Audience, and briefly reuses unexpired tokens. Browser SSO, MFA, and private_key_jwt are not supported. An Okta login page alone cannot establish application health. Saved secrets are encrypted and never returned; leave a secret blank to retain it when the target origin and account are unchanged, or choose None and Save to remove authentication. Provide new credentials when changing the target origin, Basic username, OAuth token endpoint, or Client ID. Replace expired static bearer tokens manually.',
      'Redirect following is off by default. Enable it when checking an HTTP-to-HTTPS upgrade, canonical hostname, or moved endpoint. Each redirect destination must pass network validation; enabling redirects does not allow private network checks.',
      'Events in the side navigation lists retained checks across the workspace. Admins can select Create Monitor; a selected service filter is carried into the new monitor form. Search, date ranges (UTC), sorting, CSV export, and Service, Monitor, and Outcome filters run on the server. Open a row to view its saved response; the Events breadcrumb returns to the full list. Admins, responders, and viewers have access; end users do not. Choose Events in Dashboard View for check totals, success rate, average recorded duration, and outcome/HTTP charts. Service filtering applies to its metrics and report links. Both views cover the last 30 days; deleted monitors remove their events. Historical check success does not imply current service health.',
      'Events that helped trigger an automatic incident show a Triggered Incidents section with incident titles, current statuses, and links that open in record tabs. The association uses the exact saved monitor/check-time pair, including dependency checks, rather than nearby failures. Events without a recorded association omit the section. Up to 100 linked incidents are shown, newest first; older incidents without saved trigger references cannot be associated retrospectively.',
      'Open a monitor to review check events, filter the table, and open an event for response and timing details. A configured interval is a scheduling target: worker backlog, slow endpoints, and infrastructure interruptions can delay execution.',
      'Only HTTP/HTTPS checks are supported. Database connection checks and arbitrary TCP/network scanning are not supported.',
    ],
  },
  {
    id: 'incidents',
    title: 'Incidents, Tasks, and Knowledge',
    screenshots: [
      {
        src: '/help/assign-to-me.png',
        alt: 'Task edit form with Assign to Me beside Assigned to and the current user selected',
        caption:
          'Choose Assign to Me to select your account, then save the record. A selected assignment group must include you.',
      },
      {
        src: '/help/tasks-board.png',
        alt: 'Tasks Kanban board with a custom Review lane, admin lane ordering controls, and per-card Move To controls',
        caption:
          'Drag a task into another lane, or use Move To to save its status. Archived Tasks opens a separate list.',
      },
      {
        src: '/help/knowledge-base-articles.png',
        alt: 'Knowledge base article list showing Title, Author, Last Updated, search, and publication status filters',
        caption:
          'Search within a knowledge base and use Status to choose publication status. Select an article panel to read it.',
      },
      {
        src: '/help/knowledge-bases.png',
        alt: 'knowledge base cards with a simple search field and Create Knowledge Base control',
        caption: 'Search by base name or description, then open a card to view its articles.',
      },
      {
        src: '/help/knowledge-article.png',
        alt: 'article creation form associated with Recovery Guides knowledge base',
        caption:
          'The optional Knowledge Base reference organizes articles; leave it empty for an unassigned article.',
      },
      {
        src: '/help/knowledge-runbook.png',
        alt: 'runbook reading page with numbered recovery steps',
        caption: 'Runbooks display saved instructions as a readable process document.',
      },
      {
        src: '/help/knowledge-base-delete.png',
        alt: 'knowledge base deletion dialog with content action and Cancel control',
        caption:
          'Choose whether to move articles to another base or permanently delete them and their attachments.',
      },
      {
        src: '/help/knowledge-base-move.png',
        alt: 'knowledge base deletion dialog with a destination picker that excludes the base being deleted',
        caption:
          'Choose a different knowledge base to retain its articles, then confirm Move Articles and Delete Base.',
      },
      {
        src: '/help/incident-resolve.png',
        alt: 'Resolve Incident dialog with resolution notes and Cancel and Resolve Incident controls',
        caption:
          'Resolve opens this dialog directly without entering Edit. Add notes if required by your form configuration, then confirm.',
      },
      {
        src: '/help/incident-monitor-events.png',
        alt: 'incident Monitor Events tab showing the triggering portal health check, HTTP 503, duration, and error',
        caption:
          'Open Monitor Events to review checks recorded when the incident opened; select the check time or Open Record to inspect its saved response.',
      },
    ],
    paragraphs: [
      'Global search results open the matching record page where available. Admins can open a user’s record directly from search; service, collection, and group results also link to their detail pages.',
      'Use the Search Tasks or Search Knowledge Bases placeholder to find records; both search controls remain labeled for assistive technology.',
      'Automatic incidents include a Monitor Events related tab for admins, responders, and viewers. It lists the qualifying service and dependency checks recorded when the incident first opened, with monitor, service, check time, status, HTTP status, duration, and error. Open a row to inspect its saved response. Search, date filters, column sorting, and CSV export use the same related checks. Later checks and recovery do not replace the original trigger references. Up to 1,000 check references are recorded per incident; events expire after 30 days and are removed when their monitor is deleted. Older incidents explain when trigger references were not recorded. End-user incident portals do not expose monitor events.',
      'Knowledge opens cards for knowledge bases. Create a base to organize articles, or use All Articles or global Create to create an article or runbook without a base. The Knowledge Base reference is optional. Admins can delete a base from its record action menu and choose to move its articles to another base or delete the articles and their attachments. The destination picker excludes the base being deleted. Choose another existing destination or create a new base from the destination reference. Confirm the selected consequence before deleting.',
      'Knowledge records default to Article. Choose Runbook for a step-by-step process, add titled steps with instructions, and reorder them with Move Up or Move Down. An introduction is optional for a runbook. Saved articles display as reading pages; runbooks display numbered steps.',
      'Create an incident with a clear title, affected service, severity, and description. Assign the responder and, when appropriate, the person the incident was opened for. Use tasks to track investigation and follow-up work.',
      'Tasks opens as a Kanban board with a lane for every active status, including custom statuses. Only admins can reorder lanes by dragging their headers or using their left/right controls. Lane order is saved globally for the workspace and applies to everyone. Lane move and refresh controls are compact icons on one row beside the title and count; hover for labels. Admins and responders can drag a task between lanes to save its status immediately, or use the card’s Move To control with a keyboard or touch screen. Drag above or below another card to save its position within the lane; Compact up-arrow and down-arrow icons, without button backgrounds or borders, move a card within its lane and provide the keyboard and touch alternative; hover to see their action labels. Ordering is shared with the workspace and survives reloads. Viewers can open cards but cannot move them. A failed save keeps the saved status and shows an error; a concurrent edit refreshes the record before retrying.',
      'Lanes are at least 320 pixels wide; scroll horizontally when the board exceeds the available width. Lanes fill the available page height and grow with their cards. Cards continue down each lane and load automatically as you scroll. While dragging, the source fades, eligible lanes have dashed outlines, and blue insertion bars and drop hints show the proposed position. Use Refresh to reload a lane. The list icon opens List View with active tasks as a table. Archived tasks never appear on the board: use the archive-box icon to open Archived Tasks. Both icons have hover titles and accessible labels. Archive or restore a task from its record’s Edit form.',
      'Comments are shared with people who can read the incident and can notify its participants through configured email delivery. Work notes are visible only to responders and admins. Do not put internal information in a shared comment.',
      'In an incident or task create/edit form, admins and responders can choose Assign to Me beside Assigned to to select their own account. Save the record to apply the assignment. If an assignment group is selected, you must belong to it; otherwise choose a group you belong to or clear the group first. In Conversation, filter All messages, Comments, or Work notes with the compact dropdown; the adjacent table icon switches to table view, and the conversation icon returns to messages. Choose Resolve to open the confirmation dialog directly from the read-only record. Review or enter resolution notes, then confirm Resolve Incident; Cancel leaves the record unchanged. Notes are optional in the default form; admins can change Required for Resolution notes in Form Builder. Existing saved workspace requirements remain in effect until an admin changes them. Required notes are enforced before confirmation and by the API. Reopen asks for confirmation, with Cancel focused initially; saving an active status from a resolved incident’s Edit form also requires confirmation. Monitor-created incidents also have automatic lifecycle behavior; read the record’s notice before resolving an ongoing outage manually.',
      'Open Knowledge to view knowledge-base cards. Scroll the knowledge-base cards to reach additional bases or Load More Knowledge Bases; the page remains scrollable on desktop and mobile. Use Search Knowledge Bases to find a base by name or description, then select its card to open its articles. Each article has a panel with its title, author, and last updated time. Use Search Articles to search within that base, or Status to choose a publication status. Author shows the recorded creator, or Not recorded when unavailable; timestamps use your profile preferences. Admins and responders first choose Create (+), enter the base name and description, then open it and choose Create to add an associated article. The article’s Knowledge Base reference can be changed to another base in the workspace. Viewers can read bases and articles. All Articles includes older unassigned articles, which can be assigned a base when edited. Link relevant articles to incidents and services. Images embedded in article content stay separate from the visible attachment list. On a saved unpublished article or runbook, admins and responders can choose Publish to use the configured Published status without opening Edit. Published records instead show Unpublish, which asks for confirmation before returning the article to Draft. Record actions → Archive Article also requires confirmation, retains content/history, and removes the article from active lists. Viewers cannot change publication or archive state. Save any draft edits before using these actions. In All Articles, Create opens the article form; Knowledge Bases has its separate base-creation action.',
      'Choose attachments or drag files into the upload box. Files must use a supported extension and be no larger than 5 MB, with up to 20 attachments per record including embedded images. Uploads on a new form are staged privately. Create sends their file IDs so the API can link them to the new record. Cancel abandons the draft and aborts an active upload; completed unattached files become eligible for worker cleanup after 24 hours.',
    ],
  },
  {
    id: 'people',
    title: 'People, Access, and On-call Coverage',
    screenshots: [
      {
        src: '/help/on-call-coverage-modal.png',
        alt: 'Coverage dialog showing teammate, services, start and end with Close and Edit Coverage controls',
        caption:
          'Select coverage on the calendar to view details. Admins can select Edit Coverage to update the shift without leaving the calendar.',
      },
      {
        src: '/help/on-call-calendar.png',
        alt: 'on-call calendar with All services filter at the upper left and month controls on the right',
        caption:
          'Search for a service at the top left of the calendar; clear the selection to show all services. Month controls stay beside the filter.',
      },
      {
        src: '/help/theme-black.png',
        alt: 'Default theme with a black background and neutral gray surfaces',
        caption:
          'Default is the default primary theme. Select Light for a white background and light-gray surfaces.',
      },
      {
        src: '/help/theme-white.png',
        alt: 'Light theme with a white background and light-gray surfaces',
        caption: 'Select Light to apply its light appearance; Default applies its dark appearance.',
      },
      {
        src: '/help/profile-themes.png',
        alt: 'profile with twelve color scheme cards and accessibility controls',
        caption: 'Select a color scheme, then adjust contrast, motion, and text size.',
      },
      {
        src: '/help/profile-greeting.png',
        alt: 'profile with a custom dashboard greeting and first-name preview',
        caption: 'Customize your greeting using {firstName}, then select Save.',
      },
      {
        src: '/help/profile-date-ai.png',
        alt: 'profile with date and time format selectors and enabled AI feature switches',
        caption:
          'Choose timestamp formats and control the AI features available through the workspace provider.',
      },
    ],
    paragraphs: [
      'Admins manage configuration and membership. Responders manage operational work such as incidents, tasks, and knowledge. Users can create incidents and view incidents opened by or for them. Viewers can read permitted workspace information but cannot edit it.',
      'An admin creates a profile from Users with a name, email, role, and initial password. Share the password privately. Admins can reset another user’s password from their record after confirming their own password; this signs the user out. The owner changes their own password in Profile settings. Groups let you organize multiple members for ownership and coordination.',
      'Use the All services reference field at the top left of the On-call calendar to filter coverage by service. Global coverage remains included, and clearing the field shows all services. Month controls sit beside the field, close to the calendar. Create coverage from On-call or select a calendar date to prefill it. Choose the teammate, service scope, and UTC start/end times. Rotation settings create multiple shifts. Coverage record breadcrumbs and tabs identify the teammate and service scope, rather than a timestamp. Record start and end values follow your timezone and date format; schedule editing remains explicitly UTC. Confirm before removing a shift.',
      'Set your name, phone, and time zone in Profile settings. Personal timestamps use your saved time zone, including daylight-saving changes. Schedule editors, date filters, and status-history day buckets explicitly labeled UTC remain UTC. Audit displays follow your account timezone and date format. Adding a phone number does not enable SMS or voice delivery.',
      'Open the profile menu at the bottom of the navigation and choose Profile for personal preferences, or Settings for workspace configuration. Available settings depend on your role. Under Profile, Dashboard Greeting lets you change your welcome message. Include {firstName} wherever your first name should appear, preview it, then choose Save. Reset Greeting restores Welcome, {firstName}. The message is plain text, limited to 120 characters, and saved with your account across sessions.',
      'Profile settings includes twelve Theme color schemes. Default uses a pure black background and neutral gray surfaces; Light has a white background and light-gray surfaces. These primary choices appear first and apply their matching dark or light appearance. Existing saved choices are respected. Theme settings also includes light or dark appearance, higher contrast, reduced motion, and text size. The app logo background follows your selected color scheme and light or dark appearance. Date and Time settings offers browser defaults, 12-hour or 24-hour clocks, and alternative date formats. Integration logs, audit activity, monitor checks, and record metadata use your selected timezone and date/time formats. Shared fields, form sections, filter dropdowns, popovers, and button states follow the selected palette and appearance. These account preferences apply to private app pages; public status pages use their status settings and their configured Light or Dark appearance. Explicitly UTC schedules, filters, and exports retain their documented formats.',
    ],
  },
  {
    id: 'role-preview',
    title: 'Impersonation and Role Preview',
    paragraphs: [
      'Admins open their profile menu and use Impersonation to preview Responder, Viewer, or User permissions. Select the role you want to check; the app returns to the dashboard and applies that role’s API permissions.',
      'This previews a role, not another person. Your signed-in identity and workspace remain unchanged. Permitted actions are real and use your account: creating, editing, deleting, or publishing affects actual records and can send configured notifications. Use a separate test workspace when exploring changes.',
      'The Viewing as banner identifies the effective role. Select Return to Admin to restore administrator access. Role changes clear private cached data and update other tabs using the same browser session. Audit entries retain your account identity, actual role, and effective role.',
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
      'Admins open Settings → Service Accounts → Add Service Account. Enter a name, choose at least one Allowed Scope, and select Permitted Services. Allow all workspace services and unassigned records explicitly grants broader service access. New accounts default to Enabled, API Key authentication, and a 90-day credential lifetime; no scopes or services are selected automatically.',
      'Choose API Key, OAuth Client Credentials, or both. Credential Lifetime supports 1–365 days. After creating the account, use Copy API Key or Copy OAuth Client Secret and store the value in your external integration’s secret manager. Copy the OAuth Client ID as well. Dismiss Credentials removes the one-time values from view; saved secrets cannot be retrieved. Browser clipboard access requires a secure context.',
      'External clients use HTTPS and POST JSON to /api/external/v1/incidents, /api/external/v1/tasks, or /api/external/v1/knowledge, with Authorization: Bearer followed by their API key or OAuth access token. Each route needs its matching create scope. Published knowledge also needs knowledge:publish. These credentials grant no record reads, edits, deletes, uploads, browser sign-in, or administrator access.',
      'For OAuth, configure the external client with /api/oauth/token, the generated client ID/secret, and the client_credentials grant. Send an application/x-www-form-urlencoded token request using HTTP Basic or form-body client authentication. Request a subset of the allowed scopes if appropriate. Access tokens last at most one hour, never beyond the client secret’s expiry; obtain a fresh token after expiration. This machine flow is separate from Identity Providers used for human sign-in.',
      'Every record follows workspace Form Builder validation and reference rules. Provide IDs from this workspace and use an allowed service. Linked tasks inherit their incident’s service. Incidents start Open, tasks start To Do, and knowledge starts Draft unless publication is explicitly authorized. External incidents default to no Opened for user, and the creator is recorded as Service account: [name]. Creation is not automatically deduplicated; check the app before retrying an uncertain request.',
      'Open a service account record to change scopes or service restrictions, disable it, generate or rotate credentials, revoke them with confirmation, or delete the account with confirmation. Rotating replaces the old credential immediately. OAuth rotation/revocation or any account settings change also invalidates issued OAuth tokens. Disabling/deleting rejects future requests; an already-authorized operation may finish. Never share credentials in URLs, tickets, screenshots, or source code.',
      'Settings → Audit Log records safe API metadata, including machine access, OAuth issuance, denials, human requests, and list polling. Entries do not contain credentials, request bodies, or private contents. Calls without a verified workspace remain deployment-level entries, outside tenant-visible history. Invalid credentials return 401, scope/service restrictions return 403, and validation errors identify fields to correct. Deployment details and payload fields are documented in docs/external-api.md in the repository.',
    ],
  },
  {
    id: 'integrations',
    title: 'Configure Integrations and Notifications',
    screenshots: [
      {
        src: '/help/servicenow-oauth.png',
        alt: 'ServiceNow integration with a visible saved instance URL, OAuth client settings, and a connection test error',
        caption:
          'Select an authentication method and save the settings, then use Test Saved Connection to check authentication and access without creating an incident.',
      },
      {
        src: '/help/ai-provider.png',
        alt: 'AI provider settings with a model identifier, empty API key field, and connection controls',
        caption: 'Admins configure a provider and model. Saved keys are never displayed.',
      },
      {
        src: '/help/ai-drafting.png',
        alt: 'AI article draft with a reviewable preview and Use Draft in Form control',
        caption:
          'Generate and review a draft, confirm replacement of the form content, then save the record yourself.',
      },
      {
        src: '/help/ai-knowledge.png',
        alt: 'knowledge answer with a numbered source link to a knowledge article',
        caption: 'Ask a question and open the cited source articles to verify the answer.',
      },
    ],
    paragraphs: [
      'Admins open Integrations → AI Provider, select OpenAI or Claude, enter an API model identifier and provider API key, and Save. Use Test Connection after saving to check credentials and model access. One provider is configured per workspace; removing it requires confirmation and hides all AI features. Provider charges and account quotas apply.',
      'With a provider configured, summaries, article/runbook drafting, and knowledge answers are enabled by default. Each workspace user with operational access can disable individual features under Profile → AI Features; disabled features are hidden and the API rejects their requests. Incident-portal users do not have AI access. Viewers can use summaries and knowledge answers; drafting requires responder or admin access.',
      'Select Summarize on a saved task or incident. In an article or runbook form, describe the desired document and choose Generate Draft. Review the preview, then confirm Use Draft in Form to replace title, summary, content, and steps. This creates an unsaved draft; normal validation and Save/Create still apply. AI never automatically changes a record.',
      'Ask Knowledge searches up to five matching published articles in the workspace or current base and returns an answer with source links. Draft and archived articles are excluded. Matching uses keywords, so try other wording if relevant articles are missed. Answers can be incorrect or incomplete; verify them against the linked sources.',
      'Requests send selected record text, your prompt, or matching published article excerpts to the configured provider. Attachments, credentials, and internal work-note conversations are not included. Keys are encrypted on the server and are never returned to the browser. Generation is limited to 10 requests per user per minute and 1,000 requests per workspace per UTC day, including failed provider calls. Prompts and generated output are not saved by this app unless you save a draft as record content.',
      'Admins can configure SMTP email (including SendGrid and Amazon SES presets), Slack, Microsoft Teams, Discord, PagerDuty, ServiceNow, Jira Cloud, GitHub Issues, and generic HTTPS webhooks under Integrations. Browse the catalog by category. Choose the provider, enter its configuration, and select service scopes, recovery notifications, and on-call routing where applicable. Enable delivery is on by default for new integrations; turn it off before saving to keep delivery disabled. Editing an existing integration preserves its saved delivery setting.',
      'Email requires an authorized sender and a configured SMTP server. Supported SMTP ports are 465 for implicit TLS and 587 for STARTTLS. Use the credentials and sender verification required by your provider. An email address in a user profile alone is not enough to send mail.',
      'Slack and Teams require an appropriate provider webhook. ServiceNow keeps the saved Instance Root URL visible. Choose Basic Auth or OAuth client credentials. For OAuth, configure an inbound client credentials integration in ServiceNow and enter its Client ID, Client Secret, and optional scope. The integration account needs Incident API permissions and read access to its own User record; created incidents use that authenticated account as Caller. Save changes, then use Test Saved Connection to check authentication, caller lookup, and read access without creating an incident. HTTP 401 means authentication was rejected; check the credentials and enabled authentication method. HTTP 403 requires reviewing table permissions and REST API access policies. Keep credentials out of incident descriptions, comments, and screenshots.',
      'Slack notifications stack fields vertically in separate full-width sections with Key: Value text, including Incident: View Incident as a clickable link. Multiline descriptions and errors are kept on a single value line. For automatic monitor incidents, they include up to five relevant checks from the service or its dependencies: HTTP status and reason, check and response-reading errors, method, duration, and check time. Checks are saved when the notification is queued so retries retain the original diagnostics. Response bodies, headers, and endpoint URLs stay in the authenticated app. Configure APP_ORIGIN on the workers to the address recipients use to open the app.',
      'Review Integrations → Logs when messages do not arrive. Check whether the integration is enabled, its service scope matches, and the SMTP/webhook credentials are valid. Workers and Redis must be running to process queued delivery.',
    ],
  },
  {
    id: 'status-page',
    title: 'Status Pages and Subscriptions',
    screenshots: [
      {
        src: '/help/public-status-appearance.png',
        alt: 'public service status page using its configured dark appearance',
        caption:
          'Public status pages start with the saved Light or Dark Appearance. The icon at the right edge switches the visitor’s mode; the in-app page follows profile preferences.',
      },
      {
        src: '/help/status-settings.png',
        alt: 'status settings with a new service message enabled and Light or Dark Appearance below the other settings',
        caption:
          'New service messages start with Display message on. Enter the message before saving. Choose Light or Dark in Appearance below the other settings, then choose Save.',
      },
    ],
    paragraphs: [
      'In Status Page Settings, Add a Service Message starts with Display message enabled. Enter the required message text, choose its level, and save to publish it. Turn Display message off before saving to retain a hidden message. Existing messages keep their saved display setting. Appearance is below visibility, subscriptions, icon, global banner, and service messages; choose Light or Dark and then Save.',
      'Open Service Status and select the settings gear. Choose Private for workspace access or Public to share the generated public link. The public page has no application sidebar and omits monitor targets and response bodies.',
      'The in-app status page includes the Service Status heading and shows Settings and the public launch control in its top header. Public launch appears for admins when public visibility is enabled. The in-app Service Status page follows your profile appearance and color scheme. Admins choose the public page’s initial Light or Dark mode under Appearance in Status Page Settings. Custom background colors are no longer used. Service health and its colored history blocks sit flush with the page, without an outer card background or border. Public status pages use this saved mode and their configured icon/messages, ignoring personal, browser, and device themes; public visitors can switch Light/Dark using the sun/moon icon flush with the right edge of the logo header for the current visit. This does not update profile preferences and resets to the saved status-page appearance on reload. Your personal appearance applies throughout private app routes.',
      'Publish a global banner or service-specific message to explain impact. Choose its criticality and enable it when ready. Messages add context; they do not override measured service health. You can upload or remove a branding icon.',
      'Show or hide subscriptions with one control. Hiding subscriptions stops new signups, email updates, and RSS access. Email and RSS can be configured independently when shown. Unsubscribe links continue to work.',
      'For email subscriptions, select an enabled SMTP integration and configure the public HTTPS origin used for links. Visitors select Subscribe to updates in the public page header, then choose email or RSS. Email requires confirmation within 24 hours and includes an unsubscribe link.',
      'Subscribers receive public service-health and published-message changes, not internal work notes or every unchanged check. RSS provides up to 50 updates from the last 30 days. Workers must run for updates to be published. Switching to Private cannot recall already delivered messages or cached feeds.',
      'To use a custom domain, configure DNS, HTTPS, and a reverse proxy, then set the public origin in status settings. The repository README includes a proxy example; DNS alone cannot map a hostname to the public page’s URL path.',
    ],
  },
  {
    id: 'configuration',
    title: 'Forms, Tables, and Administration',
    screenshots: [
      {
        src: '/help/identity-provider-settings.png',
        alt: 'Identity Providers settings with callback URL, workspace sign-in link, and an enabled Auth0 configuration',
        caption:
          'Register the Callback URL with the identity provider, configure the client, then connect your account in Profile before using the Workspace Sign-in Link.',
      },
      {
        src: '/help/record-tabs.png',
        alt: 'record tabs retaining an unsaved task form while a related service is open',
        caption:
          'Reference links open app record tabs. Switch tabs to return to your draft; up to twenty record tabs can be open, with the oldest replaced when opening another.',
      },
      {
        src: '/help/audit-record.png',
        alt: 'read-only Audit Entry record showing actor, action, outcome, and submitted field names',
        caption:
          'The list Open Record control opens a read-only detail view with the same permissions and safe fields as the list.',
      },
      {
        src: '/help/table-compact-toggle.png',
        alt: 'Services table menu with the Compact Rows switch',
        caption:
          'Toggle Compact Rows in the ellipsis menu to save your preferred spacing across tables.',
      },
      {
        src: '/help/table-filters-modal.png',
        alt: 'Services table with search controls in a small Filter panel beside the Filters button',
        caption: 'Filters apply immediately; the table stays visible while you change filters.',
      },
      {
        src: '/help/configuration.png',
        alt: 'Task Form Builder with the System Field status label changed to Workflow and an additional Review option',
        caption:
          'Select Edit, choose a System Field, update its label or add select options, then Save the form configuration.',
      },
      {
        src: '/help/dashboard-overview.png',
        alt: 'Overview dashboard with a view dropdown and cross-domain scorecards and report links',
        caption:
          'Use Dashboard View to choose Overview or a domain dashboard. Bar and pie charts show incident severity, task status, service health, and knowledge article status; use their links to inspect records.',
      },
    ],
    paragraphs: [
      'Breadcrumbs provide the page title across forms and lists; duplicate headings and their empty wrappers are omitted so they leave no extra spacing. Record IDs and status appear in the form body, while the header contains record actions aligned with the information-panel toggle. Secondary controls precede the primary action in both visual and keyboard order. On desktop, drag the left edge of the right record information panel to resize it from 240 to 560 pixels. Drag to 160 pixels or below to snap into the 64-pixel collapsed rail. The panel background, borders, fields, and resize focus indicator follow your selected theme immediately. The geometric trident logo uses three upward points and one unified stem for coordinated service response; its background follows the app palette. Your account remembers the expanded width; the toggle restores it. Focus the resize edge and use Left/Right arrows, Home to collapse, or End for maximum width. On smaller screens the panel stays stacked. Create forms focus their first editable field once it appears. After successful creation, the completed create tab is replaced by the saved record tab; a first editable field is focused there when present. Record forms begin close to the top header and record identity row, while field groups retain their spacing. Fields use subtle theme-aware borders to distinguish controls from their background. Reference fields and dropdowns have a single outline; their option lists can open beyond header and scroll-container boundaries.',
      'Admins open Settings → Identity Providers to configure up to ten Auth0, Okta, Microsoft Entra ID, Google, Keycloak, OneLogin, Ping Identity, or other OpenID Connect providers. Register a confidential web application with authorization code flow, and copy the exact Callback URL into its allowed redirect URIs. Enter the exact issuer URL, client ID, client secret, and client authentication method. New providers default to enabled. Secrets are encrypted and cannot be read back; leave a saved secret blank to retain it. Test Discovery checks public HTTPS metadata, not the client credentials. Use a tenant-specific Entra issuer rather than common or organizations.',
      'Users sign in with their password, then open Profile → Identity Provider Connections, confirm their current password, and select Connect. Authenticate with the intended identity at the provider. The account is linked by issuer and subject, never by matching email. Admins share the Workspace Sign-in Link from Settings; users can also paste that link under Workspace Sign-in on the login page. Provider sign-in grants the existing workspace role. There is no automatic provisioning, group mapping, SCIM, SAML, or enforcement of provider-only sign-in. Disabling a provider stops new sign-ins; deleting it removes its connections. Existing sessions and password sign-in remain available. Disconnect your own connection in Profile. App sign-out ends the app session, not the provider session.',
      'Admins access Form Builder, marked with a sliders icon, from the secondary actions menu on supported incident, task, and knowledge records, create forms, and list views. The task board also includes it in Tasks actions. Select Edit to change configuration. System Fields can be reordered and their labels updated; select System Fields also accept additional options and updated option labels. Resolution notes on incidents are the exception: admins can toggle Required. Other System Field required flags, field types, and visibility remain fixed. Cancel discards the draft; Save applies it.',
      'Select any System Field or custom field and enter Help Text to explain its purpose or expected value. Help text is plain text, limited to 1,000 characters, and displays beside the corresponding form control with an accessible association. Save the form configuration to make it available to users.',
      'Overview starts with Your Work: My Assignments and My Team show active incident and task totals with critical/high or overdue counts. Select a row to open its report. Team work includes all your assignment groups and may overlap personal assignments. Needs Attention highlights urgent incidents, unassigned incidents, overdue tasks, and services down. Select an Incident Priority bar or Service Health segment to open a matching report. Useful Shortcuts opens Knowledge, On-call Coverage, or Service Status. Unknown service health stays distinct from operational status.',
      'Dashboard opens Overview with personal and team assignments, actionable attention counts, incident and service charts, and useful shortcuts. The dashboard greets you by your first name, with a compact Dashboard View picker and Refresh aligned to its right. The sticky header has a theme-aware bottom border and keeps padding below these controls while scrolling, with consistent spacing after returning from a record or refreshing. Use the Dashboard View picker to switch to Incidents, Tasks, or Service Health, and the adjacent refresh icon to update the data. Your selection is saved with your account preferences. Lists and forms align breadcrumbs and compact main action buttons in one header row; new and existing record forms keep their actions visible above the scrolling content, with headers spanning the available width and starting flush with the side menu, without outer top or side gaps; report breadcrumbs show the selected report name.',
      'When adding a System Field select option, choose its canonical workflow meaning. Existing option values, workflow meanings, and visibility stay fixed so saved records and reports remain consistent. Custom-field select options can be added, ordered, hidden, or removed. Existing saved configuration is preserved, and saved custom field types cannot change.',
      'Use the Filters icon to open a small table search and filter panel beside the button, without an overlay. The table stays visible and interactive as results update. Changes apply immediately; Done, Close, or Escape closes the panel while keeping filters active. The Active indicator shows when filters affect the table. Reopen Filters to change or reset them; each table’s filter panel starts closed. Search matches all table columns; sort using column headers. Tables search and paginate on the server. CSV export follows filters; selecting rows exposes actions for that selection above the table.',
      'Open a table’s ellipsis menu and turn on the Compact Rows switch to reduce row and header padding. The switch shows whether compact spacing is enabled. This account preference applies to list and related tables and is restored when you sign in again; Turn it off to return to standard spacing.',
      'Archived custom fields are hidden in record forms and read-only views, including knowledge articles. Stored values remain available if the field is restored. Forms show custom required-field and email errors consistently, focus the first invalid field, and keep values available for correction. Every list row has an Open Record control. Activity, discussion, audit entries, integration delivery logs, attachments, response headers, invitations, and hosting inquiries open read-only detail pages with the same access rules as their lists. Sensitive fields remain excluded. Settings includes Audit Log for every API response, including reads, list polling, authentication, external API access, and failures. Verified workspace events appear here; requests without a verified workspace remain deployment-level entries. Audit metadata never includes request bodies, credentials, tokens, or query strings. Automated updates identify their actor as System. Deletion requires confirmation. Review the affected record and consequences before confirming, especially bulk deletion or bulk cleanup.',
      'Settings → Add demo data creates 50 records per supported type. Knowledge includes 25 articles and 25 runbooks with ordered triage, mitigation, and recovery steps. Demo users cannot sign in, monitors stay paused, and integrations never send notifications. Only one batch is allowed. An existing batch is unchanged by an upgrade; remove its demo records using Settings → Delete demo data, then add a new batch to include runbooks. Batch cleanup preserves other workspace records.',
      'Some infrastructure controls still require deployment configuration, including database connections, network access, and worker capacity. Consult the README for environment variables and monitor limits; not every infrastructure setting has a UI control.',
    ],
  },
  {
    id: 'hosting',
    title: 'Self-hosting and Maintenance',
    paragraphs: [
      'Follow the repository README to create your environment configuration, then run docker compose up -d --build from the project root. The app normally opens at http://127.0.0.1:8090. Use the exact configured origin to avoid write-origin errors.',
      'The application uses a React frontend, Express API, scheduled workers, Redis, and a configured persistence backend. MongoDB and PostgreSQL are supported. Changing a database connection is not a migration of existing data.',
      'Use docker compose ps to check service health and docker compose logs --tail=100 api workers scheduler to investigate startup or scheduling problems. Do not share logs containing credentials or private record data.',
      'Back up your database and integration encryption-key storage before upgrades. Rebuild changed services with docker compose up -d --build. Do not remove persistent volumes unless you intend to erase their data.',
      'For external access, use HTTPS, restrict infrastructure ports, and configure the public application origin. Size workers for check frequency and endpoint latency, and watch queue delays and database growth. More monitors at shorter intervals produce more events.',
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
