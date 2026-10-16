## Scaling the application

There is no single monitor count that every host can handle. The number of monitors, check intervals, endpoint response times, response sizes, database performance, and other workspace activity all matter. The examples here are planning estimates, not published load-test results or a capacity guarantee.

### Estimate the workload

```text
Checks per second = active monitors / interval in seconds
Approximate busy check slots = checks per second × average check duration in seconds
```

For example, 500 monitors checked every minute generate about **8.3 checks per second**, **720,000 events per day**, and **21.6 million events over 30 days** before expiration catches up. At an average of 2 seconds per check, that is about 17 busy check slots before allowing for bursts, database work, and slower requests. If many endpoints time out, the required capacity increases substantially.

Detailed events expire after 30 days. Daily summaries retain 400 days of status history; they do not preserve full response details. External intake adds its own event volume. Alert summaries persist separately; healthy and failed checks update one summary per monitor, and external keys create one summary per workspace/account/service/key. Attachments and audit activity also consume space, and audit records do not have automatic expiration. Monitor actual database growth instead of sizing only for the application containers.

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

The default workspace quota is **50 real monitors**, including paused ones; demo monitors do not consume that quota. It is a guardrail, not a hardware capacity estimate. The admin API at `GET /api/settings/workspace` and `PUT /api/settings/workspace` supports a `monitorLimit` of 1–10,000. Updates require the complete validated settings object and its current `revision`, and cannot reduce the limit below current usage. The Settings UI does not yet expose this control. See the [settings route](../api/src/routes/workspace-settings.js) and [validation rules](../shared/domain/workspace-settings.js) for the current contract.

Once one host is genuinely constrained, move the database and Redis to appropriately sized services and run workers separately. Keep all instances on the same database, queue, and credential-encryption key. The supplied Compose files use a bundled Redis service; external Redis needs a deployment override, not just an unused variable in `.env`. PostgreSQL currently allows up to five pool connections per application process, so include every replica when planning connections.

Do not treat more replicas as automatic high availability. The database, Redis, scheduler, encryption-key storage, and network still need a recovery plan. API scaling also requires reviewing proxy configuration and process-local rate limiting. If the frontend or API stops, already-running workers can continue checking while their dependencies remain available. If workers or the scheduler stop, checks can be delayed or missed; the app cannot reconstruct observations it never made.

See [Operations](operations.md) for backup and recovery guidance.
