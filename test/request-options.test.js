import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { validateMonitor } from '../shared/validation/validation.js';
import { requestHeaders, checkWebsite } from '../workers/src/monitoring/check.js';
import { USER_AGENTS, userAgentForCheck } from '../workers/src/monitoring/user-agents.js';
import { eventQuery } from '../api/src/domain/event-query.js';

test('request method defaults to GET and accepts only GET or HEAD', () => {
  const input = { name: 'Site', url: 'https://example.com', intervalMinutes: 1 };
  assert.equal(validateMonitor(input).method, 'GET');
  assert.equal(validateMonitor({ ...input, method: 'HEAD' }).method, 'HEAD');
  for (const method of ['POST', 'head', null, {}, 'GET\r\nInjected: yes'])
    assert.throws(() => validateMonitor({ ...input, method }));
});

test('HEAD uses the actual HTTP method and never reads a response body', async (t) => {
  const response = Object.assign(new PassThrough(), {
    headers: { 'content-type': 'text/html', 'content-length': '999999' },
    statusCode: 200,
    statusMessage: 'OK',
    httpVersion: '1.1',
  });
  let sent;
  t.mock.method(http, 'request', (url, options, callback) => {
    sent = options;
    const request = new EventEmitter();
    request.end = () => queueMicrotask(() => callback(response));
    return request;
  });
  const result = await requestHeaders(
    new URL('http://93.184.215.14/'),
    new AbortController().signal,
    () => {},
    { method: 'HEAD', userAgent: USER_AGENTS[1] },
  );
  assert.equal(sent.method, 'HEAD');
  assert.equal(sent.headers['User-Agent'], USER_AGENTS[1]);
  assert.equal(result.body.bytesCaptured, 0);
  assert.match(result.body.omitted, /HEAD/);
  assert.equal(response.listenerCount('data'), 0);
  assert.equal(response.destroyed, true);
});

test('HEAD and its selected user agent survive redirects without falling back to GET', async () => {
  const seen = [];
  const result = await checkWebsite('https://example.com', {
    followRedirects: true,
    method: 'HEAD',
    userAgent: USER_AGENTS[2],
    fetchHeaders: async (url, signal, onResponse, options) => {
      seen.push(options);
      return seen.length === 1 ? { statusCode: 303, location: '/next' } : { statusCode: 405 };
    },
  });
  assert.equal(result.status, 'down');
  assert.equal(result.details.method, 'HEAD');
  assert.equal(result.details.requestHeaders['User-Agent'], USER_AGENTS[2]);
  assert.deepEqual(seen, [
    { method: 'HEAD', userAgent: USER_AGENTS[2] },
    { method: 'HEAD', userAgent: USER_AGENTS[2] },
  ]);
});

test('user agent selection has 50 additional unique profiles and selects from the whole pool', () => {
  assert.equal(new Set(USER_AGENTS).size, USER_AGENTS.length);
  assert.equal(USER_AGENTS.length, 73);
  for (let i = 0; i < USER_AGENTS.length; i++)
    assert.equal(
      userAgentForCheck((size) => {
        assert.equal(size, USER_AGENTS.length);
        return i;
      }),
      USER_AGENTS[i],
    );
  assert.ok(USER_AGENTS.includes(userAgentForCheck()));
});

test('history queries validate sorting, dates, filters and pagination', () => {
  assert.equal(eventQuery({}).pageSize, 10);
  for (const pageSize of ['10', '25', '50'])
    assert.equal(eventQuery({ pageSize }).pageSize, Number(pageSize));
  for (const pageSize of ['0', '51', '10000', '10.5', ['10', '25']])
    assert.throws(() => eventQuery({ pageSize }));
  const query = eventQuery({
    page: '2',
    sortBy: 'durationMs',
    order: 'asc',
    status: 'down',
    from: '2026-01-01',
    to: '2026-01-02',
  });
  assert.equal(query.page, 2);
  assert.deepEqual(query.sort, { durationMs: 1, _id: 1 });
  assert.equal(query.filter.status, 'down');
  assert.equal(query.filter.checkedAt.$lt.toISOString(), '2026-01-03T00:00:00.000Z');
  for (const input of [
    { page: '0' },
    { page: '-1' },
    { page: '100000' },
    { page: ['1', '2'] },
    { sortBy: '$where' },
    { order: 'invalid' },
    { status: {} },
    { from: '2026-02-30' },
    { from: '2026-03-02', to: '2026-03-01' },
  ])
    assert.throws(() => eventQuery(input));
});
