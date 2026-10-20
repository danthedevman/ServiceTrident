# Deployment guides

For prerequisites, backups, and recovery, read [Operations](operations.md). For local installation, see the [README](../README.md#start-with-docker).

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

The PostgreSQL internal example uses an unencrypted connection on Render's private network. Render's internal TLS uses self-signed certificates, which do not work with this app's default certificate verification. If you require verified TLS, use the full external database hostname with `DATABASE_SSL=true` and restrict database access to the services' outbound IP ranges. Do not disable certificate verification. See [Render's connection and TLS guidance](https://render.com/docs/postgresql-creating-connecting) and the [database setup guide](database-backends.md).

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

Keep database backups and the encryption-key backup outside the application containers. Increase worker capacity only after measuring queue delays, memory use, and database load; see [Scaling the application](scaling.md).

## Status pages

The in-app page displays **Service Status** and follows your profile appearance and color scheme. Service history sits flush with the page, without an outer card background or border. Admins manage visibility, subscriptions, branding, banners, and service messages in **Status Page Settings**. New service messages default to **Display message**; enter their text and save to publish, or turn the setting off to keep them hidden. **Appearance** sets the public page’s initial Light or Dark mode; arbitrary background colors are no longer used.

### Public visibility and appearance

Open **Service status → Manage status page**, choose **Public**, and save. The public link uses `/status/public/<token>` and displays service health without the application sidebar. Switching back to Private revokes anonymous access. The page refreshes every 30 seconds. History uses your profile timezone in the app and your browser timezone on public pages. The current day’s percentage covers checks collected so far. Local-day history uses retained checks (up to 30 days); older UTC summaries remain available only in UTC.

Public status pages use the saved Light or Dark Appearance and configured icon/messages, independently of account, browser, or device themes. Existing custom background colors are ignored. Public visitors can switch Light/Dark with the sun/moon icon at the right edge of the header for the current visit; this never changes profile preferences and resets on reload. The compact logo header keeps a smaller gap above Service Status.

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
