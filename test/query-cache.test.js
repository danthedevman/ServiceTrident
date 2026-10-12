import test from 'node:test';
import assert from 'node:assert/strict';
import { InfiniteQueryObserver, QueryObserver } from '@tanstack/react-query';
import {
  infiniteResourceOptions,
  queryClient,
  resourceKey,
  resourceOptions,
  setSessionUser,
  writeApi,
} from '../app/src/data/query-client.js';

/** Keep tests independent and avoid leaving garbage-collection timers running. */
function setup(t) {
  queryClient.clear();
  queryClient.setDefaultOptions({
    queries: { ...queryClient.getDefaultOptions().queries, gcTime: Infinity },
  });
  t.after(() => queryClient.clear());
  setSessionUser({ email: 'owner@example.com' });
}

/** Return an API-shaped response without making network requests or creating real accounts. */
function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

test('fresh route data is reused and accounts, public pages, and filters have distinct keys', async (t) => {
  setup(t);
  let requests = 0;
  const options = {
    queryKey: resourceKey('/monitors', 'owner@example.com'),
    queryFn: async () => {
      requests++;
      return { monitors: [] };
    },
  };
  await queryClient.fetchQuery(options);
  await queryClient.fetchQuery(options);
  assert.equal(requests, 1);
  assert.notDeepEqual(resourceKey('/monitors', 'other@example.com'), options.queryKey);
  assert.notDeepEqual(
    resourceKey('/monitors/id/events?page=1', 'owner'),
    resourceKey('/monitors/id/events?page=2', 'owner'),
  );
  assert.equal(resourceKey('/public/status/token', null)[0], 'public');
  await queryClient.invalidateQueries({ queryKey: options.queryKey });
  await queryClient.fetchQuery(options);
  assert.equal(requests, 2);
});

test('successful writes refresh active views, invalidate inactive views, and seed monitor details', async (t) => {
  setup(t);
  const account = 'owner@example.com';
  const listKey = resourceKey('/monitors', account);
  const statusKey = resourceKey('/status', account);
  queryClient.setQueryData(listKey, { monitors: [{ id: 'one', name: 'Old' }] });
  queryClient.setQueryData(statusKey, { monitors: [] });
  const next = { monitor: { id: 'one', name: 'New' } };
  t.mock.method(globalThis, 'fetch', async (_url, options) =>
    json(options.method === 'PATCH' ? next : { monitors: [next.monitor] }),
  );
  const observer = new QueryObserver(queryClient, {
    queryKey: listKey,
    queryFn: async () => ({ monitors: [next.monitor] }),
  });
  const unsubscribe = observer.subscribe(() => {});
  t.after(unsubscribe);
  await writeApi('/monitors/one', { method: 'PATCH', body: { name: 'New' } });
  assert.equal(queryClient.getQueryData(listKey).monitors[0].name, 'New');
  assert.equal(queryClient.getQueryState(statusKey).isInvalidated, true);
  assert.equal(queryClient.getQueryData(resourceKey('/monitors/one', account)).monitor.name, 'New');
});

test('logout cancels private reads and prevents late responses from repopulating the cache', async (t) => {
  setup(t);
  let resolve;
  let signal;
  const key = resourceKey('/monitors', 'owner@example.com');
  const pending = queryClient
    .fetchQuery({
      queryKey: key,
      queryFn: (context) => {
        signal = context.signal;
        return new Promise((done) => {
          resolve = done;
        });
      },
    })
    .catch(() => null);
  setSessionUser(null);
  assert.equal(signal.aborted, true);
  resolve({ monitors: [{ name: 'Private' }] });
  await pending;
  assert.equal(queryClient.getQueryData(key), undefined);
  assert.equal(queryClient.getQueryData(['session']).user, null);
  setSessionUser({ email: 'other@example.com' });
  assert.equal(queryClient.getQueryCache().findAll({ queryKey: ['private'] }).length, 0);
});

test('late writes after logout cannot restore private settings', async (t) => {
  setup(t);
  let resolve;
  t.mock.method(
    globalThis,
    'fetch',
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  const pending = writeApi('/status-settings', {
    method: 'PATCH',
    body: { visibility: 'private' },
  });
  setSessionUser(null);
  resolve(json({ visibility: 'private' }));
  await pending;
  assert.equal(queryClient.getQueryCache().findAll({ queryKey: ['private'] }).length, 0);
});

test('failed writes preserve cached data and field validation messages', async (t) => {
  setup(t);
  const key = resourceKey('/monitors', 'owner@example.com');
  const data = { monitors: [{ id: 'one' }] };
  queryClient.setQueryData(key, data);
  t.mock.method(globalThis, 'fetch', async () =>
    json({ error: 'Invalid monitor', fields: { name: 'Name is required.' } }, 400),
  );
  await assert.rejects(
    writeApi('/monitors/one', { method: 'PATCH', body: {} }),
    (error) => error.fields.name === 'Name is required.',
  );
  assert.deepEqual(queryClient.getQueryData(key), data);
  assert.equal(queryClient.getQueryState(key).isInvalidated, false);
});

test('deleting a monitor removes its cached event pages and detail', async (t) => {
  setup(t);
  const paths = ['/monitors/one', '/monitors/one/events?page=1', '/monitors/one/events/event'];
  for (const path of paths)
    queryClient.setQueryData(resourceKey(path, 'owner@example.com'), { private: true });
  t.mock.method(globalThis, 'fetch', async (_url, options) => {
    assert.equal(options.method, 'DELETE');
    assert.equal(options.headers['Content-Type'], 'application/json');
    assert.deepEqual(JSON.parse(options.body), {});
    return new Response(null, { status: 204 });
  });
  await writeApi('/monitors/one', { method: 'DELETE', body: {} });
  for (const path of paths)
    assert.equal(queryClient.getQueryData(resourceKey(path, 'owner@example.com')), undefined);
});

test('switching roles clears private data and ignores late writes from the previous role', async (t) => {
  setup(t);
  const email = 'owner@example.com';
  setSessionUser({ email, role: 'admin' });
  queryClient.setQueryData(resourceKey('/status-settings', email), { visibility: 'private' });
  let resolve;
  t.mock.method(
    globalThis,
    'fetch',
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  const pending = writeApi('/status-settings', { method: 'PATCH', body: { visibility: 'public' } });
  setSessionUser({ email, role: 'user', actualRole: 'admin', impersonating: true });
  resolve(json({ visibility: 'public' }));
  await pending;
  assert.equal(queryClient.getQueryCache().findAll({ queryKey: ['private'] }).length, 0);
  assert.equal(queryClient.getQueryData(['session']).user.role, 'user');
});

test('reference scrolling appends pages, retains results after failure, and resets for a new search', async (t) => {
  setup(t);
  let fail = true;
  const requests = [];
  t.mock.method(globalThis, 'fetch', async (url) => {
    requests.push(url);
    const page = Number(new URL(url, 'https://example.test').searchParams.get('page'));
    if (page === 2 && fail) return json({ error: 'Try again' }, 503);
    return json({ options: [{ id: String(page), label: `Record ${page}` }], hasMore: page < 2 });
  });
  const observer = new InfiniteQueryObserver(queryClient, {
    ...infiniteResourceOptions('/references/services?q=', 'owner@example.com'),
    enabled: false,
  });
  const unsubscribe = observer.subscribe(() => {});
  t.after(unsubscribe);
  await observer.refetch();
  await observer.fetchNextPage();
  assert.equal(observer.getCurrentResult().data.pages.length, 1);
  assert.equal(observer.getCurrentResult().isFetchNextPageError, true);
  fail = false;
  await observer.fetchNextPage();
  assert.deepEqual(
    observer.getCurrentResult().data.pages.flatMap((page) => page.options.map((row) => row.id)),
    ['1', '2'],
  );
  assert.equal(observer.getCurrentResult().hasNextPage, false);
  const count = requests.length;
  await observer.fetchNextPage();
  assert.equal(requests.length, count);
  observer.setOptions({
    ...infiniteResourceOptions('/references/services?q=new', 'owner@example.com'),
    enabled: false,
  });
  assert.equal(observer.getCurrentResult().data, undefined);
  await observer.refetch();
  assert.deepEqual(observer.getCurrentResult().data.pageParams, [1]);
  setSessionUser({ email: 'other@example.com' });
  assert.equal(
    queryClient.getQueryCache().findAll({ queryKey: ['private', 'owner@example.com'] }).length,
    0,
  );
});

test('removing a custom status icon clears public branding without replacing status settings', async (t) => {
  setup(t);
  const key = resourceKey('/status-settings', 'owner@example.com');
  const settings = { visibility: 'public', revision: 3, hasStatusIcon: true };
  queryClient.setQueryData(key, settings);
  queryClient.setQueryData(resourceKey('/public/status/token', null), { iconUrl: '/old-icon' });
  t.mock.method(globalThis, 'fetch', async (_url, options) => {
    assert.equal(options.method, 'DELETE');
    assert.equal(options.headers['Content-Type'], 'application/json');
    assert.deepEqual(JSON.parse(options.body), {});
    return new Response(null, { status: 204 });
  });
  await writeApi('/status-settings/icon', { method: 'DELETE' });
  assert.equal(queryClient.getQueryCache().findAll({ queryKey: ['public'] }).length, 0);
  assert.deepEqual(queryClient.getQueryData(key), settings);
  assert.equal(queryClient.getQueryState(key).isInvalidated, true);
});

test('related count summaries cache for one minute without focus polling', () => { const options = resourceOptions('/related-counts/services/111111111111111111111111', 'synthetic@example.test'); assert.equal(options.staleTime, 60000); assert.equal(options.refetchOnWindowFocus, false); });
