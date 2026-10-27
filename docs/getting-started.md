# Installation and development

Deployment instructions for self-hosting ServiceTrident. For in-app tasks and configuration, use bundled Help.

## Start with Docker

Install [Git](https://git-scm.com/install/) and [Docker with Compose](https://docs.docker.com/get-started/get-docker/), then start Docker. The containers supply Node.js, the database, and Redis; keep port **8090** available.

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

## Local development

The stack uses React and Tailwind CSS, Express with ESM, the MongoDB driver or PostgreSQL adapter, and BullMQ with Redis. The code is JavaScript; Node.js 24 or newer is required.

For development outside the application containers, install [Node.js 24 LTS with npm](https://nodejs.org/en/download), alongside Git and Docker. Confirm your installation with `node --version` and `npm --version`. Run the following commands from the cloned repository with your `.env` file in place:

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

See [architecture](architecture.md) for conventions when extending the app.

### Checks and formatting

```sh
npm run lint
npm test
npm run build
npm run format:check

docker compose -f compose.yaml -f compose.test.yaml run --build --rm test
```

`npm run format` applies the shared Prettier rules. Integration tests use isolated database names and clean up their test data. Provider tests use mocked requests; they do not send real notifications or establish compatibility with every provider account configuration.


