# Choose a storage backend

ServiceTrident supports **MongoDB and PostgreSQL 17+** for application records. MySQL, SQLite, and SQL Server are not supported. This is storage for ServiceTrident itself, not a database availability monitor.

The API, scheduler, and workers must use the same backend configuration. Redis remains required for BullMQ jobs. Selecting another provider does not copy any data.

## Existing MongoDB deployments

No change is required. `DATABASE_PROVIDER` defaults to `mongodb`, and the existing `MONGODB_URI` and `MONGODB_DB` settings remain supported. `DATABASE_URL`, when nonempty, overrides `MONGODB_URI`. Preserve your `.env`, data volumes, and integration encryption key.

## New PostgreSQL deployment

Use Docker Compose 2.24.4 or newer. In `.env`, configure:

```dotenv
DATABASE_PROVIDER=postgres
POSTGRES_DB=servicetrident
POSTGRES_USER=servicetrident
POSTGRES_PASSWORD=choose-a-long-random-password
DATABASE_URL=postgresql://servicetrident:choose-a-long-random-password@postgres:5432/servicetrident
DATABASE_SCHEMA=servicetrident
DATABASE_SSL=false
```

URL-encode special characters in the password portion of `DATABASE_URL`. The `POSTGRES_PASSWORD` value is the original password, not its URL-encoded representation. Keep this file private and out of source control.

```sh
docker compose -f compose.yaml -f compose.postgres.yaml up -d --build
docker compose -f compose.yaml -f compose.postgres.yaml ps
```

This selects PostgreSQL instead of starting MongoDB. PostgreSQL has no published host port. `DATABASE_SSL=false` is intended for this isolated local container network. Changing the database password environment variable does not change the password in an already initialized PostgreSQL volume; rotate that password in PostgreSQL and update all clients together.

Schema migrations run at startup under a database advisory lock. They are versioned in `sk_migrations`. The database account must be able to create a schema, tables, functions, and indexes in the chosen database. Use a dedicated application database/account, not a shared superuser account for an external server.

## External database

Use the external-database override with a connection URL for the already provisioned database:

```sh
docker compose -f compose.yaml -f compose.external-db.yaml up -d --build
```

Set `DATABASE_PROVIDER`, `DATABASE_URL`, and (for PostgreSQL) `DATABASE_SCHEMA`. For external PostgreSQL, set `DATABASE_SSL=true`; certificates are verified. A private CA may be provided with `DATABASE_CA_FILE`, but the file must also be mounted read-only at that path in each connecting service. For MongoDB, configure verified TLS using MongoDB connection options and mount any required CA files. The application never exposes these credentials through workspace settings.

## Record layout and compatibility

Each PostgreSQL record type has its own table. A text primary key and JSONB document preserve flexible fields and existing identifiers without a destructive rewrite of MongoDB data. Timestamps, identifiers, and attachment bytes are encoded with explicit types. SQL expression indexes support workspace, identity, scheduling, and reporting queries. This is a document-oriented PostgreSQL schema, not a fully normalized relational schema or a general MongoDB emulator.

The shared persistence contract implements only the operators the application uses. Unsupported queries fail explicitly. PostgreSQL executes record filtering, ordering, counts, grouping, and paging; exports use cursors. Embedded catalogs, schedules, and configuration remain bounded documents and are filtered on the API server. Increasing their current quotas substantially should include normalizing those records and benchmarking, not just changing a limit.

Updates that compare a revision or claim a monitor lock the matching record inside a transaction. Scheduling uses database time. Unique email and active-incident constraints are enforced in the database. MongoDB continues to use its native driver and atomic operations.

PostgreSQL runs retention cleanup every minute while a connecting process is alive. Sessions and invitations also check expiry during authorization. Daily status summaries retain the existing 400-day expiry; event retention remains 30 days. Back up Redis and the integration key as well as the primary database. Attachments are part of the primary database backup.

## Switching existing installations

An empty PostgreSQL database is a new installation. There is no automatic cross-provider migration command. Do not point an existing deployment at it expecting accounts, attachments, settings, or history to appear. Keep the original database and volumes intact. A future migration must preserve identifiers, relationships, timestamps, binary data, and encryption keys, with a write freeze and verified record counts before cutover.

## Verify both backends

The integration suite creates disposable namespaces and exercises the same application behavior against each backend:

```sh
docker compose -f compose.yaml -f compose.test.yaml up -d mongo redis test-postgres
docker compose -f compose.yaml -f compose.test.yaml run --build --rm --no-deps test
docker compose -f compose.yaml -f compose.test.yaml run --build --rm --no-deps -e DATABASE_PROVIDER=postgres -e DATABASE_URL=postgresql://test:test-only@test-postgres:5432/servicetrident_test test
```

The PostgreSQL fixture uses an isolated database with a test-only password and temporary storage. These commands do not migrate or change the configured application backend.

PostgreSQL migration 8 adds the `rcas` table for internal root cause analysis records; initialization adds workspace/update-time and incident/task reference indexes on both backends. RCA records use shared sequential numbering and revision-based optimistic concurrency. Rebuild API, workers, and scheduler when applying shared persistence changes.
