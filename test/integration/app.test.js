import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { Queue, Worker } from 'bullmq';
import Redis from 'ioredis';
import { ObjectId } from 'mongodb';
import { connectDatabase } from '../../shared/persistence/database.js';
import { createApp } from '../../api/src/app.js';
import { dispatchDue, processMonitor } from '../../workers/src/monitoring/processor.js';
import { USER_AGENTS } from '../../workers/src/monitoring/user-agents.js';

test('API, MongoDB persistence, and BullMQ scheduling', { timeout: 30000 }, async (t) => {
  process.env.DATABASE_SCHEMA =
    process.env.MONGODB_DB = `servicetrident_test_${randomUUID().replaceAll('-', '')}`;
  const { db, client } = await connectDatabase();
  const server = createApp(db).listen(0, '0.0.0.0');
  await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}/api`;
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await db.dropDatabase();
    await client.close();
  });

  /** @param {string} path @param {object} [options] Send an authenticated test request. */
  async function request(path, { cookie, method = 'GET', body, headers = {} } = {}) {
    const response = await fetch(`${base}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'X-Requested-With': 'ServiceTrident',
        ...(cookie ? { Cookie: cookie } : {}),
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = response.status === 204 ? null : await response.json();
    return {
      status: response.status,
      data,
      cookie: response.headers.get('set-cookie')?.split(';')[0],
      headers: response.headers,
    };
  }
  let cookie;
  let otherCookie;
  let monitorId, serviceId;
  await t.test('registers accounts and issues protected session cookies', async () => {
    assert.equal((await request('/monitors')).status, 401);
    const missingName = await request('/auth/register', {
      method: 'POST',
      body: { email: 'missing@example.com', password: 'long registration password' },
    });
    assert.equal(missingName.status, 400);
    assert.equal(missingName.data.fields.displayName, 'Name is required.');
    const first = await request('/auth/register', {
      method: 'POST',
      headers: { Origin: new URL(process.env.APP_ORIGIN ?? 'http://127.0.0.1:8090').origin },
      body: {
        displayName: 'Test user',
        email: 'owner@example.com',
        password: 'correct horse battery staple',
      },
    });
    assert.equal(first.status, 201);
    assert.match(first.headers.get('set-cookie'), /HttpOnly/);
    assert.match(first.headers.get('set-cookie'), /SameSite=Strict/);
    cookie = first.cookie;
    serviceId = (
      await request('/services', { cookie, method: 'POST', body: { name: 'Monitor test service' } })
    ).data.item.id;
    otherCookie = (
      await request('/auth/register', {
        method: 'POST',
        body: {
          displayName: 'Test user',
          email: 'other@example.com',
          password: 'another correct password',
        },
      })
    ).cookie;
    assert.equal((await request('/auth/me', { cookie })).data.user.email, 'owner@example.com');
    const user = await db.collection('users').findOne({ email: 'owner@example.com' });
    assert.notEqual(user.passwordHash, 'correct horse battery staple');
    assert.equal(
      (await db.collection('sessions').findOne({ userId: user._id }))._id.includes(
        cookie.split('=')[1],
      ),
      false,
    );
  });
  await t.test(
    'profile edits confirm credentials, reject collisions, and rotate sessions',
    async () => {
      const credentials = {
        displayName: 'Test user',
        email: 'profile@example.com',
        password: 'profile original password',
      };
      const first = await request('/auth/register', { method: 'POST', body: credentials });
      const second = await request('/auth/login', { method: 'POST', body: credentials });
      const body = {
        email: 'updated@example.com',
        displayName: 'Kraken owner',
        currentPassword: credentials.password,
        newPassword: '',
      };
      const missingName = await request('/auth/profile', {
        cookie: first.cookie,
        method: 'PATCH',
        body: { ...body, displayName: '  ' },
      });
      assert.equal(missingName.status, 400);
      assert.equal(missingName.data.fields.displayName, 'Name is required.');
      assert.equal((await request('/auth/profile', { method: 'PATCH', body })).status, 401);
      const invalid = await request('/auth/profile', {
        cookie: first.cookie,
        method: 'PATCH',
        body: { ...body, newPassword: 'short' },
      });
      assert.equal(invalid.status, 400);
      assert.ok(invalid.data.fields.newPassword);
      assert.equal(
        (
          await request('/auth/profile', {
            cookie: first.cookie,
            method: 'PATCH',
            body: { ...body, currentPassword: 'incorrect password' },
          })
        ).status,
        400,
      );
      assert.equal(
        (
          await request('/auth/profile', {
            cookie: first.cookie,
            method: 'PATCH',
            body: { ...body, email: 'owner@example.com' },
          })
        ).status,
        409,
      );
      const saved = await request('/auth/profile', { cookie: first.cookie, method: 'PATCH', body });
      assert.equal(saved.status, 200);
      assert.equal(saved.data.user.email, body.email);
      assert.equal(saved.data.user.displayName, body.displayName);
      assert.equal(saved.data.user.role, 'admin');
      assert.equal(saved.data.user.workspaceId, saved.data.user.id);
      assert.equal((await request('/auth/me', { cookie: first.cookie })).status, 401);
      assert.equal((await request('/auth/me', { cookie: second.cookie })).status, 401);
      assert.deepEqual(
        (await request('/auth/me', { cookie: saved.cookie })).data.user,
        saved.data.user,
      );
      const changed = await request('/auth/profile', {
        cookie: saved.cookie,
        method: 'PATCH',
        body: { ...body, newPassword: 'replacement profile password' },
      });
      assert.equal(changed.status, 200);
      assert.equal(
        (
          await request('/auth/login', {
            method: 'POST',
            body: { email: body.email, password: credentials.password },
          })
        ).status,
        401,
      );
      assert.equal(
        (
          await request('/auth/login', {
            method: 'POST',
            body: { email: body.email, password: 'replacement profile password' },
          })
        ).status,
        200,
      );
      assert.equal(
        (await request('/auth/me', { cookie: otherCookie })).data.user.email,
        'other@example.com',
      );
    },
  );
  await t.test('rejects cross-origin writes, unsafe URLs, and short intervals', async () => {
    const body = { serviceId, name: 'Example', url: 'https://example.com', intervalMinutes: 1 };
    assert.equal(
      (
        await request('/monitors', {
          cookie,
          method: 'POST',
          body,
          headers: { Origin: 'https://evil.example' },
        })
      ).status,
      403,
    );
    assert.equal(
      (
        await request('/monitors', {
          cookie,
          method: 'POST',
          body,
          headers: { 'X-Requested-With': '' },
        })
      ).status,
      403,
    );
    assert.equal(
      (
        await request('/monitors', {
          cookie,
          method: 'POST',
          body: { ...body, intervalMinutes: 0 },
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await request('/monitors', {
          cookie,
          method: 'POST',
          body: { ...body, url: 'http://127.0.0.1' },
        })
      ).status,
      400,
    );
    const result = await request('/monitors', { cookie, method: 'POST', body });
    assert.equal(result.status, 201);
    monitorId = result.data.monitor.id;
    assert.equal((await request('/monitors', { cookie })).data.monitors.length, 1);
  });
  await t.test('protects monitor data and mutations from other users', async () => {
    assert.equal((await request('/monitors', { cookie: otherCookie })).data.monitors.length, 0);
    for (const path of [`/monitors/${monitorId}`, `/monitors/${monitorId}/events`])
      assert.equal((await request(path, { cookie: otherCookie })).status, 404);
    assert.equal(
      (
        await request(`/monitors/${monitorId}`, {
          cookie: otherCookie,
          method: 'PATCH',
          body: { paused: true },
        })
      ).status,
      404,
    );
    assert.equal(
      (await request(`/monitors/${monitorId}`, { cookie: otherCookie, method: 'DELETE', body: {} }))
        .status,
      404,
    );
    assert.equal(
      (await request(`/monitors/${monitorId}/events?before=bad&before=also-bad`, { cookie }))
        .status,
      400,
    );
  });
  await t.test(
    'concurrent duplicate jobs produce one check and preserve one-minute spacing',
    async () => {
      let calls = 0;
      const check = async () => {
        calls++;
        return {
          status: 'up',
          statusCode: 200,
          durationMs: 42,
          error: null,
          details: {
            method: 'GET',
            requestedUrl: 'https://example.com/',
            finalUrl: 'https://example.com/',
            responses: [
              {
                statusCode: 200,
                headers: { server: 'example' },
                body: { text: '<h1>Hello</h1>', bytesCaptured: 14 },
              },
            ],
          },
        };
      };
      const claims = await Promise.all(
        Array.from({ length: 8 }, () => processMonitor(db, monitorId, check)),
      );
      assert.equal(claims.filter(Boolean).length, 1);
      assert.equal(calls, 1);
      const monitor = await db.collection('monitors').findOne({ _id: new ObjectId(monitorId) });
      assert.equal(monitor.nextCheckAt - monitor.lastStartedAt, 60000);
      const eventResult = await request(`/monitors/${monitorId}/events`, { cookie });
      assert.equal(eventResult.data.events.length, 1);
      assert.equal(eventResult.data.events[0].statusCode, 200);
      assert.equal(eventResult.data.events[0].details, undefined);
      assert.equal(monitor.lastCheck.details, undefined);
      const eventPath = `/monitors/${monitorId}/events/${eventResult.data.events[0].id}`;
      assert.equal(
        (await request(eventPath, { cookie })).data.event.details.responses[0].body.text,
        '<h1>Hello</h1>',
      );
      assert.equal((await request(eventPath, { cookie: otherCookie })).status, 404);
      assert.equal(
        (await request(`/monitors/${monitorId}/events/${new ObjectId()}`, { cookie })).status,
        404,
      );
      await request(`/monitors/${monitorId}`, { cookie, method: 'PATCH', body: { paused: true } });
      assert.equal(await processMonitor(db, monitorId, check), false);
      await request(`/monitors/${monitorId}`, { cookie, method: 'PATCH', body: { paused: false } });
      assert.equal(await processMonitor(db, monitorId, check), false);
      assert.equal(calls, 1);
    },
  );
  await t.test(
    'edits monitor settings while preserving minimum spacing and historical responses',
    async () => {
      const path = `/monitors/${monitorId}`;
      const update = { name: '$A new name', url: 'https://example.org', intervalMinutes: 2 };
      assert.equal(
        (await request(path, { cookie: otherCookie, method: 'PATCH', body: update })).status,
        404,
      );
      assert.equal(
        (await request(path, { cookie, method: 'PATCH', body: { intervalMinutes: 0 } })).status,
        400,
      );
      assert.equal(
        (await request(path, { cookie, method: 'PATCH', body: { url: 'http://127.0.0.1' } }))
          .status,
        400,
      );
      const changed = await request(path, { cookie, method: 'PATCH', body: update });
      assert.equal(changed.status, 200);
      assert.equal(changed.data.monitor.name, '$A new name');
      assert.equal(changed.data.monitor.url, 'https://example.org/');
      assert.equal(changed.data.monitor.lastCheck, null);
      let stored = await db.collection('monitors').findOne({ _id: new ObjectId(monitorId) });
      assert.equal(stored.nextCheckAt - stored.lastStartedAt, 120000);
      await request(path, { cookie, method: 'PATCH', body: { intervalMinutes: 1 } });
      stored = await db.collection('monitors').findOne({ _id: stored._id });
      assert.equal(stored.nextCheckAt - stored.lastStartedAt, 60000);
      assert.equal(
        await processMonitor(db, monitorId, async () => {
          throw new Error('Must not check early');
        }),
        false,
      );
      const history = (await request(`${path}/events`, { cookie })).data.events;
      assert.equal(history.length, 1);
      assert.equal(
        (await request(`${path}/events/${history[0].id}`, { cookie })).data.event.details
          .requestedUrl,
        'https://example.com/',
      );
    },
  );
  await t.test(
    'paginates events and calculates uptime without exposing other accounts',
    async () => {
      const monitor = await db.collection('monitors').findOne({ _id: new ObjectId(monitorId) });
      await db.collection('events').insertMany(
        Array.from({ length: 55 }, (_, index) => ({
          monitorId: monitor._id,
          userId: monitor.userId,
          checkedAt: new Date(),
          status: index % 2 ? 'up' : 'down',
          statusCode: index % 2 ? 200 : 503,
          durationMs: 10,
          error: null,
        })),
      );
      const first = (await request(`/monitors/${monitorId}/events?pageSize=50`, { cookie })).data;
      const second = (
        await request(`/monitors/${monitorId}/events?pageSize=50&before=${first.nextCursor}`, {
          cookie,
        })
      ).data;
      assert.equal(first.events.length, 50);
      assert.equal(second.events.length, 6);
      assert.equal(new Set([...first.events, ...second.events].map((event) => event.id)).size, 56);
      const legacy = await request(`/monitors/${monitorId}/events/${first.events[0].id}`, {
        cookie,
      });
      assert.equal(legacy.data.event.details, null);
      const expired = await db.collection('events').insertOne({
        monitorId: monitor._id,
        userId: monitor.userId,
        checkedAt: new Date(Date.now() - 31 * 86400000),
        status: 'up',
      });
      assert.equal(
        (await request(`/monitors/${monitorId}/events/${expired.insertedId}`, { cookie })).status,
        404,
      );
      const status = (await request('/status', { cookie })).data.monitors[0];
      assert.equal(status.total, 56);
      assert.equal(status.uptime, 50);
      assert.equal((await request('/status', { cookie: otherCookie })).data.monitors.length, 0);
      await db
        .collection('monitors')
        .updateOne(
          { _id: monitor._id },
          { $set: { lastCheck: { status: 'up', checkedAt: new Date(Date.now() - 180000) } } },
        );
      assert.equal(
        (await request(`/monitors/${monitorId}`, { cookie })).data.monitor.status,
        'unknown',
      );
    },
  );
  await t.test('filters and sorts the complete event history before paging', async () => {
    const path = `/monitors/${monitorId}/events`;
    const defaults = (await request(`${path}?page=1`, { cookie })).data;
    assert.equal(defaults.events.length, 10);
    assert.equal(defaults.pageSize, 10);
    assert.equal(defaults.totalPages, 6);
    const medium = (await request(`${path}?page=2&pageSize=25`, { cookie })).data;
    assert.equal(medium.events.length, 25);
    assert.equal(medium.totalPages, 3);
    const last = (await request(`${path}?page=3&pageSize=25`, { cookie })).data;
    assert.equal(last.events.length, 6);
    assert.equal((await request(`${path}?pageSize=51`, { cookie })).status, 400);
    const first = (
      await request(`${path}?page=1&pageSize=50&sortBy=durationMs&order=asc`, { cookie })
    ).data;
    const second = (
      await request(`${path}?page=2&pageSize=50&sortBy=durationMs&order=asc`, { cookie })
    ).data;
    assert.equal(first.total, 56);
    assert.equal(first.totalPages, 2);
    assert.equal(first.events.length, 50);
    assert.equal(second.events.length, 6);
    assert.equal(new Set([...first.events, ...second.events].map((event) => event.id)).size, 56);
    assert.equal(second.events.at(-1).durationMs, 42);
    const filtered = (
      await request(`${path}?page=1&status=down&sortBy=statusCode&order=desc`, { cookie })
    ).data;
    assert.equal(filtered.total, 28);
    assert.ok(
      filtered.events.every((event) => event.status === 'down' && event.statusCode === 503),
    );
    const day = new Date().toISOString().slice(0, 10);
    assert.equal(
      (await request(`${path}?page=1&from=${day}&to=${day}`, { cookie })).data.total,
      56,
    );
    assert.equal((await request(`${path}?page=1&to=2000-01-01`, { cookie })).data.total, 0);
    assert.equal((await request(`${path}?sortBy=passwordHash`, { cookie })).status, 400);
    assert.equal(
      (await request(`${path}?page=1&status=down`, { cookie: otherCookie })).status,
      404,
    );
  });
  await t.test(
    'CSV exports all filtered history in list order and enforces ownership',
    async () => {
      const path = `/monitors/${monitorId}/events`;
      const params = 'status=down&sortBy=durationMs&order=desc&page=1&pageSize=10';
      const list = (await request(`${path}?${params}`, { cookie })).data;
      assert.ok(list.total > 10);
      const response = await fetch(`${base}${path}/export?${params}`, {
        headers: { Cookie: cookie },
      });
      assert.equal(response.status, 200);
      assert.match(response.headers.get('content-type'), /text\/csv/);
      assert.match(response.headers.get('content-disposition'), /attachment/);
      assert.equal(response.headers.get('cache-control'), 'no-store');
      const csv = await response.text();
      const lines = csv.split('\r\n').filter(Boolean);
      assert.equal(lines.length, list.total + 1);
      assert.deepEqual(
        lines.slice(1, 11).map((line) => line.split(',')[0].replaceAll('"', '')),
        list.events.map((event) => event.id),
      );
      assert.ok(lines.slice(1).every((line) => line.includes(',"down",')));
      assert.ok(!csv.includes('<h1>Hello</h1>'));
      const all = await fetch(`${base}${path}/export?sortBy=checkedAt&order=asc`, {
        headers: { Cookie: cookie },
      });
      assert.equal((await all.text()).split('\r\n').filter(Boolean).length, 57);
      assert.equal(
        (await fetch(`${base}${path}/export`, { headers: { Cookie: otherCookie } })).status,
        404,
      );
      assert.equal((await fetch(`${base}${path}/export`)).status, 401);
      assert.equal(
        (await fetch(`${base}${path}/export?from=2026-02-30`, { headers: { Cookie: cookie } }))
          .status,
        400,
      );
      const empty = await fetch(`${base}${path}/export?to=2000-01-01`, {
        headers: { Cookie: cookie },
      });
      assert.equal((await empty.text()).split('\r\n').filter(Boolean).length, 1);
    },
  );
  await t.test(
    'persists HEAD settings and user agent rotation without stale results after edits',
    async () => {
      const created = await request('/monitors', {
        cookie,
        method: 'POST',
        body: {
          serviceId,
          name: 'Method test',
          url: 'https://example.com',
          intervalMinutes: 1,
          method: 'HEAD',
        },
      });
      const id = created.data.monitor.id;
      const path = `/monitors/${id}`;
      assert.equal(created.data.monitor.method, 'HEAD');
      assert.equal(
        (await request(path, { cookie, method: 'PATCH', body: { method: 'POST' } })).status,
        400,
      );
      let release;
      let started;
      const ready = new Promise((resolve) => {
        started = resolve;
      });
      const waiting = new Promise((resolve) => {
        release = resolve;
      });
      let options;
      const inFlight = processMonitor(db, id, async (url, input) => {
        options = input;
        started();
        await waiting;
        return {
          status: 'up',
          statusCode: 200,
          durationMs: 1,
          error: null,
          details: {
            method: input.method,
            requestHeaders: { 'User-Agent': input.userAgent },
            responses: [],
          },
        };
      });
      await ready;
      const edited = await request(path, { cookie, method: 'PATCH', body: { method: 'GET' } });
      release();
      await inFlight;
      assert.equal(edited.status, 200);
      assert.equal(options.method, 'HEAD');
      assert.ok(USER_AGENTS.includes(options.userAgent));
      assert.equal((await request(path, { cookie })).data.monitor.lastCheck, null);
      const oldEvent = (await request(`${path}/events`, { cookie })).data.events[0];
      assert.equal(
        (await request(`${path}/events/${oldEvent.id}`, { cookie })).data.event.details.method,
        'HEAD',
      );
      assert.equal(await processMonitor(db, id), false);
      await db
        .collection('monitors')
        .updateOne({ _id: new ObjectId(id) }, { $set: { nextCheckAt: new Date(0) } });
      await processMonitor(db, id, async (url, input) => {
        assert.equal(input.method, 'GET');
        assert.ok(USER_AGENTS.includes(input.userAgent));
        return { status: 'up', statusCode: 200, durationMs: 1, error: null };
      });
      assert.equal(
        (await db.collection('monitors').findOne({ _id: new ObjectId(id) })).checkSequence,
        2,
      );
      await request(path, { cookie, method: 'DELETE', body: {} });
    },
  );
  await t.test('redirect preference persists and prevents stale in-flight summaries', async () => {
    const created = await request('/monitors', {
      cookie,
      method: 'POST',
      body: { serviceId, name: 'Redirect test', url: 'https://example.com', intervalMinutes: 1 },
    });
    const id = created.data.monitor.id;
    const path = `/monitors/${id}`;
    assert.equal(created.data.monitor.followRedirects, false);
    assert.equal(
      (await request(path, { cookie, method: 'PATCH', body: { followRedirects: 'true' } })).status,
      400,
    );
    assert.equal(
      (
        await request(path, {
          cookie: otherCookie,
          method: 'PATCH',
          body: { followRedirects: true },
        })
      ).status,
      404,
    );
    let release, started;
    const ready = new Promise((resolve) => {
      started = resolve;
    });
    const waiting = new Promise((resolve) => {
      release = resolve;
    });
    const inFlight = processMonitor(db, id, async (url, options) => {
      assert.equal(options.followRedirects, false);
      started();
      await waiting;
      return {
        status: 'up',
        statusCode: 302,
        durationMs: 1,
        error: null,
        details: { followRedirects: false, responses: [] },
      };
    });
    await ready;
    const edited = await request(path, {
      cookie,
      method: 'PATCH',
      body: { followRedirects: true },
    });
    release();
    await inFlight;
    assert.equal(edited.data.monitor.followRedirects, true);
    assert.equal((await request(path, { cookie })).data.monitor.lastCheck, null);
    const event = (await request(`${path}/events`, { cookie })).data.events[0];
    assert.equal(
      (await request(`${path}/events/${event.id}`, { cookie })).data.event.details.followRedirects,
      false,
    );
    await db
      .collection('monitors')
      .updateOne({ _id: new ObjectId(id) }, { $set: { nextCheckAt: new Date(0) } });
    await processMonitor(db, id, async (url, options) => {
      assert.equal(options.followRedirects, true);
      return { status: 'up', statusCode: 200, durationMs: 1, error: null };
    });
    const disabled = await request(path, {
      cookie,
      method: 'PATCH',
      body: { followRedirects: false },
    });
    assert.equal(disabled.data.monitor.followRedirects, false);
    assert.equal(disabled.data.monitor.lastCheck, null);
    await request(path, { cookie, method: 'DELETE', body: {} });
  });
  await t.test('dedicated scheduling continues while a check worker is occupied', async () => {
    const created = await request('/monitors', {
      cookie,
      method: 'POST',
      body: { serviceId, name: 'Scheduled', url: 'https://example.org', intervalMinutes: 1 },
    });
    const scheduledId = created.data.monitor.id;
    const connection = new Redis(process.env.REDIS_URL ?? 'redis://127.0.0.1:6379', {
      maxRetriesPerRequest: null,
    });
    const queue = new Queue(`test-${randomUUID()}`, { connection });
    const schedules = new Queue(`test-scheduler-${randomUUID()}`, { connection });
    let dispatches = 0;
    let checks = 0;
    let release;
    const blocked = new Promise((resolve) => {
      release = resolve;
    });
    const worker = new Worker(
      queue.name,
      async (job) =>
        processMonitor(
          db,
          job.data.monitorId,
          async () => {
            checks++;
            await blocked;
            return { status: 'up', statusCode: 200, durationMs: 20, error: null };
          },
          { queuedAt: job.data.queuedAt },
        ),
      { connection, concurrency: 1 },
    );
    const scheduler = new Worker(
      schedules.name,
      async () => {
        dispatches++;
        await dispatchDue(db, queue);
      },
      { connection, concurrency: 1 },
    );
    try {
      await schedules.upsertJobScheduler(
        'test-dispatch',
        { every: 100 },
        { name: 'dispatch', data: {}, opts: { removeOnComplete: true } },
      );
      const deadline = Date.now() + 5000;
      while ((dispatches < 3 || checks < 1) && Date.now() < deadline) await delay(50);
      assert.ok(dispatches >= 3, 'scheduler kept running while execution was blocked');
      assert.equal(checks, 1);
      assert.equal(
        await db.collection('events').countDocuments({ monitorId: new ObjectId(scheduledId) }),
        0,
      );
      release();
      let event;
      while (
        !(event = await db
          .collection('events')
          .findOne({ monitorId: new ObjectId(scheduledId) })) &&
        Date.now() < deadline
      )
        await delay(25);
      assert.ok(event);
      assert.equal(event.timing.startedAt.getTime(), event.checkedAt.getTime());
      assert.ok(event.timing.scheduleDelayMs >= 0);
      assert.ok(event.timing.queueDelayMs >= 0);
      assert.equal(
        event.timing.dispatchDelayMs + event.timing.queueDelayMs,
        event.timing.scheduleDelayMs,
      );
      const monitor = await db.collection('monitors').findOne({ _id: new ObjectId(scheduledId) });
      assert.equal(monitor.nextCheckAt - monitor.lastStartedAt, 60000);
      assert.equal(
        (await request(`/monitors/${scheduledId}/events/${event._id}`, { cookie })).data.event
          .timing.scheduleDelayMs,
        event.timing.scheduleDelayMs,
      );
    } finally {
      release();
      await scheduler.close();
      await worker.close();
      await Promise.all([queue.obliterate({ force: true }), schedules.obliterate({ force: true })]);
      await Promise.all([queue.close(), schedules.close()]);
      await connection.quit();
    }
  });
  await t.test('deletes monitors, removes history, and revokes sessions on logout', async () => {
    assert.equal(
      (await request(`/monitors/${monitorId}`, { cookie, method: 'DELETE', body: {} })).status,
      204,
    );
    assert.equal(
      await db.collection('events').countDocuments({ monitorId: new ObjectId(monitorId) }),
      0,
    );
    assert.equal((await request(`/monitors/${monitorId}`, { cookie })).status, 404);
    assert.equal((await request('/auth/logout', { cookie, method: 'POST', body: {} })).status, 204);
    assert.equal((await request('/auth/me', { cookie })).status, 401);
    const login = await request('/auth/login', {
      method: 'POST',
      body: { email: 'owner@example.com', password: 'correct horse battery staple' },
    });
    assert.equal(login.status, 200);
    assert.notEqual(login.cookie, cookie);
  });
});
