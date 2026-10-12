# ServiceTrident

**Detect, Respond, Resolve**

ServiceTrident is a free, open source application for service monitoring and incident response. It brings services, health checks, incidents, tasks, knowledge, and on-call coverage into one place that developers and small teams can run themselves.

> **Status: Alpha** — ServiceTrident is under active development and intended for evaluation, development environments, and small-team pilots. Expect changing features and occasional bugs. Back up your data before upgrading, and do not rely on it as your only system for critical monitoring or incident response.

## Find what you need

- [Capabilities](#what-you-can-do) and [app workflows](#working-in-the-app)
- [Docker setup](#start-with-docker) and [database choices](#choose-your-database)
- [Notifications and integrations](#connect-tools-without-adding-unnecessary-cost), [AI providers](#ai-providers), and [external API access](#external-integrations-and-service-accounts)
- [Status pages](#status-pages) and [subscriptions](#email-and-rss-subscriptions)
- [Scaling](#scaling-the-application), [deployment](#deploying-beyond-your-laptop), and [Render setup](#deploy-to-render)
- [Local development](#local-development) and [contributing](#contributing)

## Why I built this

After years of working with enterprise platforms, I wanted to take the parts that help teams do their work and make them available in a smaller, more approachable tool. Knowing what a service depends on, who owns it, what is broken, and what happened last time should be within reach of a team without a large platform budget.

I built ServiceTrident to bring that experience together in something useful that I could share for free. My goal is to give developers and small teams a place to manage their services and respond to problems without requiring a dedicated platform team just to get started. You can host it yourself, inspect the code, and adapt it to the way you work.

### Built with help from ChatGPT

ChatGPT, including Codex, has been a substantial part of building this application. I used it to turn requirements into working features, discuss architecture, write and refactor code, troubleshoot problems, create tests, and develop documentation. This is an AI-assisted project, and I want to be open about that.

The motivation, product direction, and workflow decisions come from my experience with enterprise platforms. ChatGPT helped me move from those ideas to an implementation much faster. That help does not make the code automatically correct or secure: review, testing, and feedback still matter. This repository includes automated checks, and I welcome clear bug reports and improvements.

ChatGPT was used during development. Running ServiceTrident does not require a ChatGPT subscription or an OpenAI API key.

## App preview

These current screenshots use the **default Ocean theme in dark mode** and contain **synthetic demo data only**. They are captured in an isolated browser that intercepts every API request and blocks external requests; no live workspace is read or modified. [Reproduce the captures](app/public/help/README.md).

### Overview dashboard

![Default Ocean theme in dark mode: Overview dashboard with demo bar and pie charts across incident severity, tasks, and service health](app/public/help/readme-dashboard-dark.png)

### Tasks board

![Dark-mode demo task board with custom status lanes and shared ordering controls](app/public/help/readme-tasks-dark.png)

### Status page

![Default Ocean theme in dark mode: demo status page with service health history and header management controls](app/public/help/readme-status-dark.png)

### Knowledge runbook

![Dark-mode demo runbook with numbered recovery steps](app/public/help/readme-runbook-dark.png)

### Profile themes

![Dark-mode demo profile with twelve color schemes and accessibility settings](app/public/help/readme-themes-dark.png)

## What you can do

| Area                | Capabilities                                                                                                                                                                                                                                              |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Services            | Define ownership, primary contacts, dependencies, and collections; view related incidents, knowledge, and checks.                                                                                                                                         |
| Monitoring          | Check HTTP/HTTPS endpoints with HEAD or GET, choose intervals from 1 minute to 24 hours, inspect response events, and follow redirects when explicitly enabled.                                                                                           |
| Incident response   | Track severity and state, assign work, link knowledge, add public-facing comments or internal work notes, and resolve or reopen incidents.                                                                                                                |
| Tasks and knowledge | Use the default task Kanban with custom status lanes, shared card ordering, admin-only global lane ordering, and a separate archive list. Organize rich-text articles and step-based runbooks in optional knowledge bases; embed images and attach files. |
| On-call and people  | Manage teammates, groups, contact details, roles, and scheduled coverage.                                                                                                                                                                                 |
| Status pages        | Share service health privately or through a public page, with history, branding, and global or service-specific announcements.                                                                                                                            |
| Reporting           | Use incident and task dashboards, server-side table search and filtering, CSV exports, and an admin audit log.                                                                                                                                            |
| Customization       | Configure form fields and choices, required fields, themes, and saved navigation preferences.                                                                                                                                                             |

Admins manage configuration and membership. Responders work on incidents, tasks, and articles. Viewers have read-only workspace access. Users can create incidents and see incidents opened by or for them.

## Working in the app

### Dashboard and personal preferences

Open the profile menu at the bottom of the navigation for **Profile**, **Settings**, and **Help**. Settings is no longer a main navigation link; available configuration actions still depend on your role.

Dashboard spacing stays consistent when returning from record tabs or refreshing. Overview starts with **Your Work**, separating personal and team assignments with active totals and priority or overdue counts. **Needs Attention** provides actionable links for urgent incidents, unassigned work, overdue tasks, and services down. Incident Priority and Service Health charts open matching reports. **Useful Shortcuts** links to knowledge, on-call coverage, and service status. Team assignments include your current assignment groups and may overlap personal work.

A compact **Dashboard View** picker and refresh icon sit to the right of your first-name greeting, with padding and a bottom border beneath the sticky controls. Change the greeting in **Profile → Dashboard Greeting**, using `{firstName}` where needed. Default is the default neutral theme; Light uses a white background and light-gray surfaces. Both appear first under Profile → Theme; selecting them also sets the matching dark or light appearance. Existing saved preferences remain respected. Profile also controls color scheme, light/dark appearance, contrast, text size, timezone, and date/time formats. Logs, audit activity, monitor checks, coverage record dates, and metadata use these date preferences; explicitly UTC schedule editors, date filters, exports, and status-history day buckets retain their documented formats. The geometric trident mark uses three upward points and a unified stem to represent coordinated service response; the logo and right record panel follow the selected theme.

### Records, tabs, and tables

Reference links and **Open Record** controls open app record tabs, including activity and delivery-log details. Chrome-style tabs span the record area above both panes and show the record title and type without identifier suffixes or “From” text. Newly opened and restored active tabs scroll into view immediately, and record content starts at the top beneath the tab strip. Text stays on one line; full labels appear on hover. Horizontal scrolling and arrow-key navigation work with the scrollbar hidden. A matching top border across the record header and right panel separates visible tabs from record content. Tabs sit above the record header and appear only on record routes with more than one record open. Up to 20 record tabs can be open. Opening another record replaces the oldest opened tab; opening an existing record selects its tab. If the oldest tab has unsaved changes, confirm replacement or cancel to keep it. Close All Tabs keeps the current record and its draft open.

Tab links and bounded labels survive refresh for the signed-in browser session; restored records fetch data only when selected. Switching tabs preserves mounted drafts, while refresh discards unsaved edits. Sign-out clears the session’s tabs. These tabs never change record permissions. New forms focus their first editable field. Drag the right record panel’s left edge to resize it, or use its keyboard controls; it snaps closed below the threshold and remembers your account preference.

**Filters** opens a small anchored panel with full-width search and no overlay, leaving the table visible. Search, filters, sorting, paging, and CSV export run on the server. The ellipsis menu’s **Compact Rows** toggle saves reduced padding as an account preference. Columns remain configurable. Forms use consistent custom required/email errors and grow multiline fields as you type. Form Builder is available from supported list and record secondary actions. Archived custom fields are hidden from record forms and read-only views, including knowledge articles; stored values are retained for restoration. Fields, form sections, dropdowns, filter panels, and button states follow your selected theme. Automated activity is attributed to **System**.

### Incident response

In incident and task create/edit forms, **Assign to Me** beside the assignee field selects your logged-in account. Save to apply it. Admins and responders can use this action; a selected assignment group must include you.

Resolving an incident requires confirmation. Resolve opens a confirmation dialog directly from the read-only record, without entering Edit. Resolution notes are optional in the default form; admins can toggle **Required** for that system field in **Form Builder**. Existing saved requirements remain until changed. Reopening also requires confirmation. Conversation uses a compact message filter and icon-only table/conversation view controls.

### Task boards

Task cards use small bare reorder icons. Lane titles, counts, reorder arrows, and refresh icons share one row; lanes support shared drag ordering and keyboard alternatives. List and archive navigation use icons.

### Knowledge articles and runbooks

Inside a knowledge base, articles appear as clickable panels showing title, author, and last updated. Search Articles searches the base’s articles on the server; Status provides publication status, including archived articles. Author uses the recorded creator, or Not recorded when historical attribution is unavailable. Dates follow your profile preferences.

Knowledge-base cards scroll vertically as the list grows, with **Load More Knowledge Bases** below the cards when more results are available.

Knowledge-base deletion cannot move articles into the base being deleted. Admins and responders can **Publish** a saved unpublished article or runbook without entering Edit, using the configured Published status. Save draft edits first.

Published articles show **Unpublish** with confirmation; it returns them to Draft and retains content. **Record actions → Archive Article** also requires confirmation and keeps content/history while removing the article from active lists. In All Articles, Create opens the article form; Knowledge Bases retains its separate base-creation action.

### Sample records

**Settings → Add demo data** creates 50 records per supported type. Knowledge includes 25 articles and 25 runbooks with triage, mitigation, and recovery steps. Demo users cannot sign in, demo monitors stay paused, and demo integrations do not send notifications. Only one demo batch can exist at a time. An existing batch is not altered by an upgrade: remove that demo batch and add a new one to include runbooks. Cleanup uses batch markers and preserves unrelated records.

### Identity providers

Workspace admins can configure Auth0, Okta, Microsoft Entra ID, Google, Keycloak, OneLogin, Ping Identity, and custom OpenID Connect sign-in under Settings → Identity Providers. Existing users connect their identity in Profile with password confirmation before using the workspace sign-in link. See [identity-provider operating requirements](docs/operations.md#workspace-identity-providers).

### Role preview

Admins can use **Impersonation** in the profile menu to preview another role’s permissions. This keeps the signed-in identity and workspace; permitted actions are real, affect records, and may send configured notifications. **Return to Admin** restores admin access. Audit entries retain the actual and effective roles. The bundled **Impersonation and Role Preview** Help article explains the workflow.

### People and on-call coverage

Select a coverage item on the calendar to view its teammate, services, start, and end in a modal. Admins can choose Edit Coverage to update or remove it without leaving the calendar.

On-call coverage uses a service selector above the calendar. Coverage record titles identify the teammate and service scope, with dates displayed using your profile preferences.

Admins can create users with a name, email, role, initial password, and contact details. Share initial passwords privately; users can change them in Profile settings. To reset another user’s password, open their record and select **Reset password** from the actions menu. Confirm your current admin password and enter the new password twice. Resetting signs the user out of existing sessions. Workspace owners change their own password in Profile settings.

### Monitor Events

**Events** lists monitor-generated checks across the workspace, newest first. Admins, responders, and viewers can search, sort, export, and filter by service, monitor, outcome, or UTC date range. Open a row to view its saved response details; the Events breadcrumb returns to the main list. Lists and metrics cover retained checks from the last 30 days; deleted monitors remove their events. Response bodies and headers are excluded from list and metric responses. End users cannot access monitor events.

Choose **Events** in Dashboard View for check totals, success rate, average duration of recorded timings, and outcome/HTTP response charts. Filter by service; report links carry that service filter. These are historical checks, not current service health. Related-list tab badges show unfiltered totals from one lightweight summary request per active record. Counts refresh at most once a minute and after record writes; inactive record tabs do not poll or load related lists. Collapsed and expanded navigation use the same links and order, with scrolling when needed. Navigation prioritizes Dashboard, Incidents, Events, Tasks, and On Call, followed by Services, Knowledge, and Status Page.

### Degraded service health

Edit a service’s **Health thresholds** to flag it as Degraded or Down manually, set a response-time threshold in milliseconds (0 disables it), or choose 1–10 consecutive failed checks before Down. Each monitor is evaluated separately. A successful response at or above the response-time threshold is Degraded; failed responses below the failure-count threshold are Degraded, and reaching the threshold is Down. A successful check resets the failure count, as does a gap longer than the monitor interval plus one minute. Defaults preserve the previous behavior: no manual flag, no response-time threshold, and Down after one failed check.

Down takes precedence over Degraded, including dependency failures. Degradation propagates to dependent services and collections. Clear a manual flag yourself when the issue is resolved; it does not expire. Stale or paused checks remain Unknown unless another signal establishes degradation or an outage. Monitor events and past daily history continue to show actual HTTP success/failure. Today’s date box reflects current Degraded or Down health, with hover text showing current status alongside the day’s check-success percentage; past dates are not rewritten.

Automatic incidents record up to 1,000 qualifying monitor check references when they first open, including dependency monitors. Admins, responders, and viewers can review these in the **Monitor Events** related tab, search or export the list, and open saved response details. Later checks do not replace the original references. Older incidents without saved references say so. The usual 30-day event retention and monitor deletion apply; end-user portals do not expose monitor events.

When automatic incidents are enabled, degradation creates a medium-severity incident if no automatic incident is active for that service. Outages create high-severity incidents. Recovery resolves the automatic incident only when the service is fully Operational. Existing incident severity remains available for responders to manage. Public email and RSS updates include Degraded transitions when subscriptions are enabled.

### Audit history

Every API response is audited with safe metadata, including record changes, reads, polling, authentication, external API activity, failures, and audit-table access. Admins can review and export verified workspace activity. Requests without a verified workspace remain outside tenant-visible history. Entries preserve actual and effective roles without copying credentials, query strings, headers, or request/response contents. Audit records do not expire automatically. See [Audit history](docs/audit-log.md) for coverage and logging limitations.

## Start with Docker

### Install the prerequisites

For the default Docker setup, install Git and Docker with Compose:

| Tool                             | Installation guide                                                                                                                                         | What you need it for                                                                       |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Git                              | [Install Git for your operating system](https://git-scm.com/install/)                                                                                      | Clone the repository and download future updates.                                          |
| Docker Desktop                   | [Get Docker for macOS, Windows, or Linux](https://docs.docker.com/get-started/get-docker/)                                                                 | Run the application containers locally. Docker Desktop includes Docker Engine and Compose. |
| Docker Engine and Compose plugin | [Install Docker Engine on Linux](https://docs.docker.com/engine/install/) and [install the Compose plugin](https://docs.docker.com/compose/install/linux/) | An alternative to Docker Desktop for a Linux server.                                       |

Choose Docker Desktop or Docker Engine with the Compose plugin; you do not need both. Follow the linked guide for your operating system's requirements, then start Docker Desktop or the Docker Engine service before continuing.

Open a terminal and check that the tools are available and Docker is running:

```sh
git --version
docker --version
docker compose version
docker info
```

If `docker compose` is unavailable, follow the [Compose installation guide](https://docs.docker.com/compose/install/). If `docker info` cannot connect, start Docker and check the installation guide for your platform.

You do not need to install Node.js, npm, MongoDB, or Redis separately for this setup; the containers supply them. The first build needs internet access to download images and packages. Keep port **8090** available for the application.

### Download and start ServiceTrident

Clone the repository and enter its directory:

```sh
git clone https://github.com/danthedevman/ServiceTrident.git ServiceTrident
cd ServiceTrident
cp .env.example .env
docker compose up -d --build --wait
```

These commands work in macOS/Linux shells and Windows PowerShell. In Windows Command Prompt, use `copy .env.example .env` instead of `cp .env.example .env`.

Wait for the build and startup to finish, then open **<http://127.0.0.1:8090>** and create an account. The API health endpoint is <http://127.0.0.1:8090/api/health>.

The default setup runs the frontend, Express API, check workers, scheduler, MongoDB, and Redis as separate containers. Data and the integration-encryption key are kept in persistent volumes.

For an existing installation, keep your current `.env` and volume settings. Do not copy the example over working credentials or database settings.

```sh
# Inspect running services and recent logs
docker compose ps
docker compose logs --tail=100 api workers scheduler

# Rebuild and apply application changes
docker compose up -d --build --wait app api workers scheduler

# Stop the stack while keeping its data
docker compose down
```

**Do not use `docker compose down -v` unless you intend to delete stored data.** A production frontend is compiled into its image, so source changes need a rebuild. Use development mode below for hot reload.

### A useful first setup

1. Create a service for an application or API your team owns.
2. Add a monitor to its health endpoint. Use HEAD if the endpoint supports it and you only need its HTTP status; use GET when response content is useful for investigation.
3. Create user profiles from Users, assign service owners, and add dependencies where a failure can affect another service.
4. Connect one notification channel and confirm delivery before relying on it.
5. Add a short runbook and an on-call schedule so an alert has an owner and a next step.

To explore first, use **Settings → Add demo data**; see [Sample records](#sample-records) for the generated content, safety defaults, and cleanup behavior.

## Choose your database

MongoDB is the default application database. PostgreSQL is also supported through the shared persistence layer. Redis is required for background jobs with either database.

- Use `compose.postgres.yaml` with `DATABASE_PROVIDER=postgres` and `DATABASE_URL` for bundled PostgreSQL.
- Use `compose.external-db.yaml` for an existing MongoDB or PostgreSQL server.
- Changing the provider does not migrate existing data. MySQL and other SQL engines are not currently supported.

See [database setup, TLS, backups, and compatibility](docs/database-backends.md) for the complete commands. Attachments and status-page icons are stored in the configured database, so include them in storage planning and backups.

## Connect tools without adding unnecessary cost

My recommendation is to start with the communication tools your team already uses. Connect a useful destination first, then add another integration when there is a clear need. ServiceTrident has no software subscription fee, but hosting, email delivery, domains, backups, and third-party accounts may cost money.

| Connection      | What to configure in Integrations                                                                                                                       | When I would use it                                                                                                                   |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Email / SMTP    | A public SMTP hostname, port 465 or 587, sender, credentials, and fallback recipients. Enable comment notifications on one email integration if needed. | A straightforward starting point for a small team. Reuse an approved SMTP provider rather than running a mail server just for alerts. |
| Slack           | An official incoming webhook URL for your chosen channel.                                                                                               | When the team already coordinates in Slack. A dedicated incident channel can keep response updates out of general conversation.       |
| Microsoft Teams | A supported Workflow webhook that accepts requests from ServiceTrident and posts to a channel.                                                          | When the team already uses Microsoft 365. Give the workflow a co-owner so it does not depend on one person's account.                 |
| ServiceNow      | Your saved instance root URL and an integration account, using Basic Auth or OAuth client credentials with Incident API permissions.                    | When an existing organization needs incidents in ServiceNow as well.                                                                  |

The **App Catalog** groups adapters into Email, Chat, On-call, Ticketing, and Webhooks. Pick a category and select **Configure**. SendGrid and Amazon SES are SMTP setup presets; they appear as Email (SMTP) in configured records and support the same email features.

| Additional adapter | Setup and behavior                                                                                                                                                                                                                                                                                                                                                               |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Discord            | Use a channel webhook. Messages suppress mentions and are limited to 2,000 characters.                                                                                                                                                                                                                                                                                           |
| PagerDuty          | Use an Events API v2 routing key. Impact triggers an alert and recovery resolves the matching alert. See [PagerDuty Events API](https://docs.pagerduty.com/developer/send-alert-event).                                                                                                                                                                                          |
| Jira Cloud         | Supply the instance root URL, account email, API token, project key and issue type ID. The account needs browse, create and comment permissions. The issue type must allow creation without additional required fields. Recovery adds a comment, not a workflow transition. See [Jira issue API](https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-issues/). |
| GitHub Issues      | Use `https://api.github.com/repos/OWNER/REPO` and a fine-grained access token with Issues read/write permission for that repository. Recovery adds a comment and leaves issue closure to your team. See [GitHub issue API](https://docs.github.com/en/rest/issues/issues).                                                                                                       |
| Generic Webhook    | Use a public HTTPS endpoint and optional bearer token. The JSON body includes `deliveryId`, `event`, a `fields` array of `{ label, value }` entries (including Description), and a labeled text `message`. Deduplicate requests using `deliveryId`.                                                                                                                              |

Jira and GitHub deliveries reuse stored ticket identifiers and search for correlation markers before creating a ticket. Delivery remains at least once: a crash after creation but before saving the identifier, combined with provider search indexing delays, can cause duplicate tickets or comments. Credentials are encrypted; webhook destinations are checked for public addresses at delivery, redirects are rejected, and provider responses have size and time limits. Check **Logs** for failures. These are outbound adapters, not two-way record synchronization.

For **SendGrid**, use `smtp.sendgrid.net`, port `587`, the literal username `apikey`, and a SendGrid API key as the password. Set up your sender identity and sending permissions with the provider. See [SendGrid's SMTP instructions](https://www.twilio.com/docs/sendgrid/for-developers/sending-email/integrating-with-the-smtp-api).

If you already operate in AWS, **Amazon SES** is worth comparing for usage-based email delivery. It connects through the generic SMTP integration using a regional endpoint and SES SMTP credentials, which are different from AWS access keys. Check [SES setup requirements](https://docs.aws.amazon.com/ses/latest/dg/send-email-smtp.html) and [current pricing](https://aws.amazon.com/ses/pricing/) against your expected volume before choosing it.

For channel setup, follow the official [Slack incoming webhook guide](https://docs.slack.dev/messaging/sending-messages-using-incoming-webhooks/) or [Teams workflow guidance](https://learn.microsoft.com/en-us/microsoftteams/platform/webhooks-and-connectors/how-to/add-incoming-webhook). Provider plans, quotas, and tenant permissions can change; a supported integration does not mean the provider is free or automatically enabled for your account.

### Notification messages and delivery

Messages use labeled fields, including **Description**, across email, Slack, Teams, and ServiceNow. ServiceNow uses a correlation ID to find an existing incident and adds recovery work notes; it does not automatically close the external incident. Email can notify end users about incident comments. Internal work notes are not included in those notifications.

Slack messages put each field in a separate full-width section, stacked vertically as **Key: Value**, including **Incident: View Incident** as a clickable link instead of a raw ID. Multiline descriptions and errors stay on a single value line; HTTP status and HTTP reason appear on separate lines. Automatic monitor incidents include up to five relevant service/dependency checks with HTTP status and reason, check errors, response-reading errors, method, duration, and check time. Notification retries retain the queued diagnostics; raw response bodies, headers, and endpoint URLs are not sent. Set `APP_ORIGIN` on workers to the app origin reachable by recipients.

New integrations default to enabled; saved integrations retain their setting. ServiceNow keeps its **Instance Root URL** visible, supports **Basic Auth** and **OAuth client credentials**, and uses the authenticated integration account as the Caller on new incidents. **Test Saved Connection** performs reads without creating an incident and reports safe HTTP 401/403 guidance. The account needs Incident table permissions and access to its own User record; see [ServiceNow setup](docs/operations.md#servicenow-authentication-and-caller-identity).

Integration credentials are encrypted with a persistent key generated for the API and workers. Blank secret inputs retain existing credentials. Back up that key with the database. Review **Logs** for failures: a queued job is not proof that a provider accepted a message. Retries can occasionally deliver a duplicate if a process stops after provider acceptance.

### AI providers

Optional AI features let a workspace connect its own OpenAI or Claude API account. Admins configure the provider, model identifier, and API key under **Integrations → AI Provider**. Keys use the existing encrypted integration storage. Summaries, article/runbook drafting, and knowledge answers become available when a provider is configured and are enabled by default; users can disable each feature in **Profile → AI Features**. Provider charges apply. Only selected record text, prompts, and matching published knowledge excerpts are sent; generated drafts require review and a normal record save. Generation is limited to 10 requests per user per minute and 1,000 per workspace per UTC day. Back up the integration-encryption key along with the database.

### External integrations and service accounts

Admins open **Settings → Service Accounts** to give external sources scoped record-creation access. Select Create incidents, Create tasks, or Create knowledge; publishing new knowledge requires the separate knowledge:publish scope. Restrict the account to selected services, or explicitly permit all workspace services and unassigned records. Choose API Key, OAuth Client Credentials, or both. Credentials default to 90 days and must expire within 1–365 days. Copy their one-time values into a secret manager. Saved credentials cannot be retrieved. Account records provide generation, rotation, revocation, disabling, and confirmed deletion.

The dedicated POST endpoints are `/api/external/v1/incidents`, `/api/external/v1/tasks`, and `/api/external/v1/knowledge`. OAuth clients obtain opaque bearer tokens from `/api/oauth/token` using the client_credentials grant; tokens last at most one hour. Machine credentials cannot use browser-session APIs, and these endpoints do not grant record reads, updates, deletes, uploads, or administrative access. Use HTTPS through a trusted proxy; direct loopback development requests may use HTTP. See [External API](docs/external-api.md) and [Audit history](docs/audit-log.md) for payloads, security boundaries, and logging behavior.

### Keep the running costs predictable

- Start with one always-on host and the bundled database and Redis when that suits your availability needs. A sleeping application or worker cannot provide continuous monitoring.
- Use a longer interval for lower-priority services. Five-minute checks produce one fifth as many events as one-minute checks.
- Prefer a small health endpoint. HEAD avoids response-body capture when supported; GET provides more diagnostic detail but can use more bandwidth and storage.
- Add only the notification destinations someone will act on. Multiple providers introduce more accounts, credentials, and delivery failures to maintain.
- Budget for persistent storage and tested backups before increasing the number of checks. Managed services can reduce maintenance work, but compare their total cost with the time you spend operating them.

## Scaling the application

There is no single monitor count that every host can handle. The number of monitors, check intervals, endpoint response times, response sizes, database performance, and other workspace activity all matter. The examples here are planning estimates, not published load-test results or a capacity guarantee.

### Estimate the workload

```text
Checks per second = active monitors / interval in seconds
Approximate busy check slots = checks per second × average check duration in seconds
```

For example, 500 monitors checked every minute generate about **8.3 checks per second**, **720,000 events per day**, and **21.6 million events over 30 days** before expiration catches up. At an average of 2 seconds per check, that is about 17 busy check slots before allowing for bursts, database work, and slower requests. If many endpoints time out, the required capacity increases substantially.

Detailed events expire after 30 days. Daily summaries retain 400 days of status history; they do not preserve full response details. Attachments and audit activity also consume space, and audit records do not have automatic expiration. Monitor actual database growth instead of sizing only for the application containers.

### Add worker capacity gradually

Each worker process defaults to `CHECK_CONCURRENCY=10`, with a supported range of 1–50. Start by measuring schedule delay, queue wait, check duration, CPU, memory, and database latency. Raising concurrency helps when the bottleneck is waiting for network responses; it does not solve an overloaded database.

To try 20 simultaneous checks per worker, update `.env` and recreate the workers:

```dotenv
CHECK_CONCURRENCY=20
```

```sh
docker compose up -d --no-deps workers
```

You can also run multiple workers against the same Redis queue and database:

```sh
docker compose up -d --no-deps --scale workers=2 workers
```

Two replicas at concurrency 20 allow up to 40 concurrent check jobs in total. They also add database connections and background activity. Keep the same worker scale in later deployment commands if you intend to retain both replicas. BullMQ supports both approaches; see its [worker concurrency documentation](https://docs.bullmq.io/guide/workers/concurrency).

Keep a single scheduler for a simple deployment. `SCHEDULER_INTERVAL_MS` defaults to 1,000 ms and accepts 250–5,000 ms; it controls dispatch frequency, not an individual monitor's interval. The minimum monitor interval remains one minute. The current dispatcher considers up to 200 due monitors per pass, so accumulated backlog can also affect timing.

### Understand quotas and infrastructure limits

The default workspace quota is **50 real monitors**, including paused ones; demo monitors do not consume that quota. It is a guardrail, not a hardware capacity estimate. The admin API at `GET /api/settings/workspace` and `PUT /api/settings/workspace` supports a `monitorLimit` of 1–10,000. Updates require the complete validated settings object and its current `revision`, and cannot reduce the limit below current usage. The Settings UI does not yet expose this control. See the [settings route](api/src/routes/workspace-settings.js) and [validation rules](shared/domain/workspace-settings.js) for the current contract.

Once one host is genuinely constrained, move the database and Redis to appropriately sized services and run workers separately. Keep all instances on the same database, queue, and credential-encryption key. The supplied Compose files use a bundled Redis service; external Redis needs a deployment override, not just an unused variable in `.env`. PostgreSQL currently allows up to five pool connections per application process, so include every replica when planning connections.

Do not treat more replicas as automatic high availability. The database, Redis, scheduler, encryption-key storage, and network still need a recovery plan. API scaling also requires reviewing proxy configuration and process-local rate limiting. If the frontend or API stops, already-running workers can continue checking while their dependencies remain available. If workers or the scheduler stop, checks can be delayed or missed; the app cannot reconstruct observations it never made.

## Deploying beyond your laptop

The default Compose frontend binds to loopback. For remote access, put it behind an HTTPS reverse proxy, set `APP_ORIGIN` to the exact application origin, and set `COOKIE_SECURE=true`. Keep the database and Redis off the public internet. Configure proxy trust for your actual deployment rather than accepting arbitrary forwarded headers.

Back up the database, the integration-encryption key, and the persistent Redis data. Test restoration into an isolated environment. Preserve the database name and volume names during upgrades. If using PostgreSQL, follow its backup procedure rather than MongoDB-specific commands.

Checks currently target public HTTP/HTTPS addresses on standard ports. Private and reserved addresses are blocked, and followed redirects are revalidated. Self-hosting does not automatically enable scanning an internal network. These are HTTP availability checks, not TCP, database, or full infrastructure monitoring.

ServiceTrident is currently alpha. It supports optional OpenID Connect sign-in for existing accounts. It does not include app-native MFA, SAML/SCIM provisioning, password-reset email, SMS/voice paging, multi-step on-call escalation, or a hosted uptime SLA. Test upgrades and backup restores in an isolated environment before updating a pilot deployment. Automated tests are useful checks, but they are not a guarantee of production readiness.

Before calling it beta, I want the core workflows to be stable, upgrade and recovery procedures to be validated, permissions and integrations to have broader testing, and realistic load tests to establish capacity. There is no committed beta release date.

See [operations and recovery](docs/operations.md), [database deployment](docs/database-backends.md), and [audit-log coverage](docs/audit-log.md) for more detail.

## Deploy to Render

You can host ServiceTrident on [Render](https://render.com/). This is a manual deployment using the repository's Dockerfiles; the Compose file is for local hosting and is not a one-click Render deployment. I have not yet validated this guide with a live Render deployment.

### 1. Create the database and queue

Connect your GitHub repository in the [Render dashboard](https://dashboard.render.com/). Keep the application services and managed data services in the same workspace and region so they can communicate over [Render's private network](https://render.com/docs/private-network).

- **Database:** create [Render Postgres](https://render.com/docs/postgresql-creating-connecting), or use an existing MongoDB deployment such as [MongoDB Atlas](https://www.mongodb.com/atlas). For Atlas, allow the connecting services' [Render outbound IP ranges](https://render.com/docs/outbound-ip-addresses) and use a database user scoped to the application database.
- **Queue:** create a paid [Render Key Value](https://render.com/docs/key-value) instance with persistence enabled and the memory policy set to `noeviction`. Copy its internal connection URL for `REDIS_URL`. Leave external access disabled unless you need it.

Use always-on services for monitoring. Sleeping services and nonpersistent queues are unsuitable for reliable scheduled checks. Review [free-plan limitations](https://render.com/docs/free) and [Render pricing](https://render.com/pricing): the frontend, API, workers, scheduler, database, and queue are separate resources with separate costs.

### 2. Configure shared secrets

Use Render's [environment variables and environment groups](https://render.com/docs/configure-environment-variables) for configuration. Render does not read the local Compose environment automatically. Share the following settings with the API, workers, and scheduler, but never the frontend:

| Variable                     | Value                                                  |
| ---------------------------- | ------------------------------------------------------ |
| `NODE_ENV`                   | `production`                                           |
| `INTEGRATION_ENCRYPTION_KEY` | One shared, persistent 64-character hexadecimal secret |
| `INTEGRATION_KEY_FILE`       | `/srv/secrets/integration.key`                         |

For a new installation, generate the encryption key once on your own computer:

```sh
openssl rand -hex 32
```

Save it as a Render secret and keep a secure backup. For an existing installation, reuse its original key so saved integration credentials remain readable. Do not regenerate it during deployments. Separate Render containers cannot share the local Compose key volume; the shared environment secret lets each container recreate its key file safely.

Choose one database configuration and apply it to all three Node services:

| Database                             | Environment variables                                                                                                          |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| Render Postgres, internal connection | `DATABASE_PROVIDER=postgres`, `DATABASE_URL=<internal connection URL>`, `DATABASE_SCHEMA=servicetrident`, `DATABASE_SSL=false` |
| MongoDB                              | `DATABASE_PROVIDER=mongodb`, `MONGODB_URI=<authenticated connection URL>`, `MONGODB_DB=servicetrident`                         |

The PostgreSQL internal example uses an unencrypted connection on Render's private network. Render's internal TLS uses self-signed certificates, which do not work with this app's default certificate verification. If you require verified TLS, use the full external database hostname with `DATABASE_SSL=true` and restrict database access to the services' outbound IP ranges. Do not disable certificate verification. See [Render's connection and TLS guidance](https://render.com/docs/postgresql-creating-connecting) and the [database setup guide](docs/database-backends.md).

### 3. Create the application services

For each service, select the same repository and deployment branch with the **Docker** runtime. Leave **Root Directory** empty and use the repository root (`.`) as the Docker build context; the Dockerfiles need the shared workspace files. See [Docker on Render](https://render.com/docs/docker).

| Service   | Render service type | Dockerfile path      | Docker command override         |
| --------- | ------------------- | -------------------- | ------------------------------- |
| API       | Private Service     | `api/Dockerfile`     | Leave empty                     |
| Workers   | Background Worker   | `workers/Dockerfile` | Leave empty                     |
| Scheduler | Background Worker   | `workers/Dockerfile` | `node workers/src/scheduler.js` |
| Frontend  | Web Service         | `app/Dockerfile`     | Leave empty                     |

The scheduler is a continuously running [background worker](https://render.com/docs/background-workers), not a cron job. Start with one scheduler and one worker instance.

Add these service-specific environment variables:

| Service   | Variables                                                                                                       |
| --------- | --------------------------------------------------------------------------------------------------------------- |
| API       | `PORT=3000`, `APP_ORIGIN=https://<your-frontend>.onrender.com`, `COOKIE_SECURE=true`, `TRUST_PROXY=1`           |
| Workers   | `REDIS_URL=<internal Key Value URL>`, `CHECK_CONCURRENCY=10`, `APP_ORIGIN=https://<your-frontend>.onrender.com` |
| Scheduler | `REDIS_URL=<same internal Key Value URL>`, `SCHEDULER_INTERVAL_MS=1000`                                         |
| Frontend  | `PORT=8080`                                                                                                     |

Replace placeholders with your actual values. `APP_ORIGIN` must exactly match the frontend origin, without a trailing slash or path. Update it if you add a custom domain. All Node services must use the same database, and both background services must use the same queue.

### 4. Point the frontend at the private API

Before deploying the frontend, copy the API's private hostname from Render. In a deployment-specific copy or branch of `app/nginx.conf`, replace **both** occurrences of:

```nginx
proxy_pass http://api:3000;
```

with:

```nginx
proxy_pass http://YOUR_RENDER_API_PRIVATE_HOSTNAME:3000;
```

Keep the port and omit a trailing slash so the `/api/` request path is preserved. Both the normal API location and the attachment-upload location need this change. The Compose hostname `api` will not resolve on Render, and setting a frontend environment variable alone does not change this Nginx configuration.

In both proxy locations, replace `proxy_set_header X-Forwarded-Proto $scheme;` with `proxy_set_header X-Forwarded-Proto https;` for this HTTPS-only deployment, because Render terminates public TLS before Nginx. Keep the API private and retain the existing overwritten `X-Forwarded-For` header rather than trusting arbitrary client headers. With this conservative setup, API rate limits can group visitors behind the Render proxy; verify trusted client-IP forwarding before a larger rollout.

Commit the deployment configuration to the branch Render builds, then deploy the frontend after the API is available. Keep the original Compose configuration if you also run the app locally.

### 5. Verify the deployment

- Open `https://<your-frontend>.onrender.com/api/health` and confirm a successful health response.
- Register and sign in, create a service and monitor, and confirm new check events arrive after the configured interval.
- Check worker and scheduler logs for database or queue connection failures. If checks do not arrive, verify both processes are running and share `REDIS_URL`.
- Test an attachment upload and any enabled notification integration. Attachments are stored in the database, so include them in database backups.
- If writes fail with an origin error, check `APP_ORIGIN`. If the frontend reports a gateway error, check both Nginx proxy locations and the private API hostname.

Keep database backups and the encryption-key backup outside the application containers. Increase worker capacity only after measuring queue delays, memory use, and database load; see [Scaling the application](#scaling-the-application).

## Status pages

The in-app page displays **Service Status** and uses the saved status-page appearance. Service history sits flush with the page, without an outer card background or border. Admins manage visibility, subscriptions, branding, banners, and service messages in **Status Page Settings**. New service messages default to **Display message**; enter their text and save to publish, or turn the setting off to keep them hidden. **Appearance** offers Light or Dark for both private and public status pages; arbitrary background colors are no longer used.

### Public visibility and appearance

Open **Service status → Manage status page**, choose **Public**, and save. The public link uses `/status/public/<token>` and displays service health without the application sidebar. Switching back to Private revokes anonymous access. The page refreshes every 30 seconds.

Public status pages use the saved Light or Dark Appearance and configured icon/messages, independently of account, browser, or device themes. Existing custom background colors are ignored. Public visitors can switch Light/Dark for the current visit; this never changes profile preferences and resets on reload. The compact logo header keeps a smaller gap above Service Status.

Admins can upload a branding icon and publish a global banner or service-specific message with Information, Maintenance, Warning, or Critical severity. Disabled messages remain drafts. Messages are plain text and do not change measured health. Only publish information intended for your public audience.

History supports 7, 14, and 30 days, plus the current and previous UTC calendar quarters. The chosen range is included in the URL. Missing or expired observations are shown as unavailable rather than assumed healthy.

### Email and RSS subscriptions

Public visitors can use **Subscribe to updates** in the public page header to choose email or copy the RSS feed URL into their feed reader. RSS needs no email provider. Feeds include the latest 50 public updates within the last 30 days.

Status page settings let admins show or hide subscriptions and enable email and RSS independently. Hiding subscriptions also stops new signups, confirmation emails, email updates, and RSS access. Unsubscribe links remain available. Showing subscriptions restores access to the configured channels; the button is disabled if neither channel is available. Existing pages retain RSS access by default.

To enable email, configure and enable an email integration under **Integrations**, then open **Service status → Settings → Subscriptions**. Enable **Email updates**, select that integration, and set **Public origin** to your reachable HTTPS origin (for example, `https://status.example.com`). Local development allows HTTP on localhost. Your SMTP provider must authorize the sender address. SendGrid and other providers offering authenticated SMTP can use this integration.

Subscribers must confirm their email address using a link that expires after 24 hours. Each email includes an unsubscribe link; visitors confirm that action on the page, so email link scanners cannot unsubscribe them automatically. Repeat signup requests do not send duplicate confirmations during that period. Unsubscribe still works when the page is private.

Workers check for public service-health changes and published banner/service-message changes every 10 seconds. Unchanged checks do not generate emails. Internal incidents, work notes, monitor endpoints, response bodies, and drafts are excluded. Turning the page private stops new public deliveries and RSS access; previously delivered emails or cached feeds cannot be recalled.

Keep the API, workers, Redis, and database running. Delivery jobs survive restarts, retry transient email failures up to five times, and expire after seven days. Delivery is at least once: an interruption after SMTP acceptance can cause a duplicate email. Pending subscribers expire after 24 hours; confirmed subscriptions remain until unsubscribed. Delivery metadata is retained for seven days. Signup has per-IP and per-page limits; for multiple API replicas, also apply shared rate limiting at your reverse proxy and provider sending limits. Confirmation and update delivery failures are recorded in the `statusMail` collection without SMTP error details or credentials.

### Serve a public status page on your own domain

DNS alone cannot point to a URL path. Point your status domain at an HTTPS reverse
proxy, obtain a TLS certificate, and proxy to the app's port (8090 by default).
For example, add the following locations to your TLS-enabled Nginx server for
`status.example.com`. Replace `YOUR_PUBLIC_TOKEN` with the token from the public
link. This example assumes the proxy runs on the Docker host.

```nginx
location = / {
    return 302 /status/public/YOUR_PUBLIC_TOKEN;
}
location = /status/public/YOUR_PUBLIC_TOKEN {
    proxy_pass http://127.0.0.1:8090;
}
location = /api/public/status/YOUR_PUBLIC_TOKEN {
    limit_except GET { deny all; }
    proxy_pass http://127.0.0.1:8090;
}
location = /api/public/status/YOUR_PUBLIC_TOKEN/icon {
    limit_except GET { deny all; }
    proxy_pass http://127.0.0.1:8090;
}
location = /api/public/status/YOUR_PUBLIC_TOKEN/feed.xml {
    limit_except GET { deny all; }
    proxy_pass http://127.0.0.1:8090;
}
location ~ ^/api/public/status/YOUR_PUBLIC_TOKEN/subscriptions(/confirm|/unsubscribe)?$ {
    limit_except POST { deny all; }
    proxy_pass http://127.0.0.1:8090;
}
location /assets/ {
    proxy_pass http://127.0.0.1:8090;
}
location = /favicon.svg {
    proxy_pass http://127.0.0.1:8090;
}
location = /theme-init.js {
    proxy_pass http://127.0.0.1:8090;
}
location / {
    return 404;
}
```

Keep the private app on its existing origin. Set **Public origin** in status settings to this domain. Public requests stay
same-origin; subscription writes accept only the configured status origin or app
origin. No change to `APP_ORIGIN` is needed. DNS, proxy configuration, and TLS certificates remain deployment tasks;
the app does not provision domains or certificates.

## Local development

The stack uses React and Tailwind CSS, Express with ESM, the MongoDB driver or PostgreSQL adapter, and BullMQ with Redis. The code is JavaScript; Node.js 24 or newer is required.

For development outside the application containers, install [Node.js 24 LTS with npm](https://nodejs.org/en/download), alongside Git and Docker from the prerequisites above. Confirm your installation with `node --version` and `npm --version`. Run the following commands from the cloned repository with your `.env` file in place:

```sh
npm ci
docker compose -f compose.yaml -f compose.dev.yaml up -d mongo redis
```

Run each process in its own terminal:

```sh
APP_ORIGIN=http://localhost:5173 npm run dev:api
npm run dev:app
npm run dev:workers
npm run dev:scheduler
```

Open <http://localhost:5173>. Vite proxies `/api` to port 3000 and reloads frontend changes during development. Do not run local and Docker workers/schedulers against the same queue unintentionally.

Local API and workers share `.servicetrident/integration.key` automatically. If overriding its location, give both processes the same absolute `INTEGRATION_KEY_FILE`. Never commit that key, `.env`, database backups, or real provider credentials.

### Repository layout

```text
api/       Express API, authentication, routes, and workspace authorization
app/       React application, shared UI, forms, and query caching
workers/   Check execution, scheduling, notification delivery, and maintenance
shared/    Validation, form schemas, integration rules, and persistence adapters
test/      Unit tests and disposable-database integration tests
docs/      Architecture, deployment, and operational guidance
```

See [architecture](docs/architecture.md) for conventions when extending the app.

### Checks and formatting

```sh
npm run lint
npm test
npm run build
npm run format:check

docker compose -f compose.yaml -f compose.test.yaml run --build --rm test
```

`npm run format` applies the shared Prettier rules. Integration tests use isolated database names and clean up their test data. Provider tests use mocked requests; they do not send real notifications or establish compatibility with every provider account configuration.

## Contributing

If something is confusing, broken, or harder than it should be, open an issue with the steps to reproduce it and what you expected. For a larger change, describe the problem before building a broad solution. Keep changes focused, preserve workspace authorization and server-side validation, and include useful tests where behavior changes. Review and update README, bundled Help, and affected operating guides with each change; refresh affected synthetic screenshots before rebuilding the local app. The [AGENTS.md](AGENTS.md) documentation process is part of completion.

Never share credentials, webhook URLs, session cookies, or private record data in logs. Capture documentation screenshots only with the isolated synthetic fixtures, never live records or secrets, even if later redacted. See [Help screenshot capture](docs/help-screenshots.md). Please do not post exploitable security details or secrets in a public issue; use GitHub's private vulnerability reporting if enabled or arrange a private channel with the maintainer.

## License

ServiceTrident is available under the [MIT License](LICENSE). My intention is to keep this a useful, freely available tool that developers and small teams can run and adapt. Hosting and any third-party services you choose remain your responsibility.
