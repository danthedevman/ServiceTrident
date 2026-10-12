import test from 'node:test';
import assert from 'node:assert/strict';
import { monitorContext } from '../workers/src/notifications/monitor-context.js';
import { slackMessage } from '../workers/src/notifications/slack.js';

test('monitor diagnostics retain dependency failures and scope every event lookup to its workspace and check', async () => {
  const now = new Date();
  const incident = { source: 'monitor', serviceId: 'parent' };
  const services = [
    { id: 'parent', name: 'Portal', dependencyIds: ['child'] },
    { id: 'child', name: 'API', dependencyIds: ['parent'] },
  ];
  const monitors = ['child', 'unrelated', 'child', 'child'].map((serviceId, index) => ({
    _id: `monitor-${index}`,
    serviceId,
    name: 'Demo check',
    intervalMinutes: 1,
    paused: index === 2,
    demoBatchId: index === 3 ? 'demo' : undefined,
    lastCheck: {
      checkedAt: now,
      status: 'down',
      statusCode: 503,
      error: 'HTTP 503',
      durationMs: 45,
    },
  }));
  const queries = [];
  const db = {
    collection: (name) => {
      assert.equal(name, 'events');
      return {
        findOne: async (query, options) => {
          queries.push({ query, options });
          return {
            details: {
              responses: [
                {
                  statusMessage: 'Service Unavailable',
                  body: { error: 'Response body was interrupted.', text: 'Private response' },
                  headers: { authorization: 'Private header' },
                },
              ],
            },
          };
        },
      };
    },
  };
  const checks = await monitorContext(
    db,
    'workspace-a',
    incident,
    'impacted',
    services,
    monitors,
    now,
  );
  assert.equal(checks.length, 1);
  assert.deepEqual(queries[0].query, {
    userId: 'workspace-a',
    monitorId: 'monitor-0',
    checkedAt: now,
  });
  assert.equal(queries[0].options.projection['details.responses.body.text'], undefined);
  assert.equal(checks[0].statusCode, 503);
  assert.equal(checks[0].responseError, 'Response body was interrupted.');
  assert.ok(!JSON.stringify(checks).includes('Private'));
  monitors[0].lastCheck.statusCode = 200;
  assert.equal(checks[0].statusCode, 503);
  assert.deepEqual(
    await monitorContext(
      db,
      'workspace-a',
      { ...incident, source: 'manual' },
      'impacted',
      services,
      monitors,
      now,
    ),
    [],
  );
});

test('Slack links replace IDs and monitor failures are plain text with bounded output', (t) => {
  const previous = process.env.APP_ORIGIN;
  process.env.APP_ORIGIN = 'https://app.example.test';
  t.after(() =>
    previous === undefined ? delete process.env.APP_ORIGIN : (process.env.APP_ORIGIN = previous),
  );
  const incident = {
    _id: '0123456789abcdef01234567',
    source: 'monitor',
    title: '<!channel>',
    serviceName: 'Portal',
    severity: 'high',
  };
  const payload = slackMessage(incident, {
    event: 'impacted',
    monitorChecks: [
      {
        name: '<!here>',
        service: 'API',
        statusCode: 503,
        statusMessage: 'Service Unavailable',
        error: 'HTTP 503',
        responseError: 'Response body was interrupted.',
        method: 'GET',
        durationMs: 45,
        checkedAt: '2026-10-10T12:00:00.000Z',
      },
    ],
  });
  assert.match(
    payload.blocks.map((block) => block.text.text).join('\n'),
    /HTTP status: 503\nHTTP reason: Service Unavailable/,
  );
  assert.match(
    payload.blocks.map((block) => block.text.text).join('\n'),
    /Response error: Response body was interrupted/,
  );
  assert.equal(payload.blocks[1].text.type, 'plain_text');
  assert.equal(
    payload.blocks.at(-1).text.text,
    'Incident: <https://app.example.test/incidents/0123456789abcdef01234567|View Incident>',
  );
  for (const block of payload.blocks.slice(0, -1)) {
    assert.equal(block.text.type, 'plain_text');
    assert.ok(!block.text.text.includes('\n'));
    assert.ok(!block.text.text.includes(incident._id));
  }
  assert.ok(
    slackMessage(incident, {
      event: 'comment',
      monitorChecks: Array(5).fill({
        name: 'Check',
        service: 'API',
        statusCode: 500,
        statusMessage: 'Error',
        method: 'GET',
        checkedAt: 'now',
        durationMs: 5,
        error: 'Failure',
        responseError: 'Interrupted',
      }),
    }).blocks.length <= 50,
  );
  assert.ok(payload.text.includes('&lt;!channel&gt;'));
  const multiline = slackMessage(
    { ...incident, title: 'Outage\r\nDetails', description: 'First line\nSecond line' },
    {
      event: 'impacted',
      monitorChecks: [
        { name: 'Monitor\nName', statusCode: 503, error: 'Failure\r\nDetails', durationMs: null },
      ],
    },
  );
  assert.match(
    multiline.blocks.map((block) => block.text.text).join('\n'),
    /Description: First line Second line/,
  );
  assert.match(
    multiline.blocks.map((block) => block.text.text).join('\n'),
    /Error: Failure Details/,
  );
  for (const block of multiline.blocks) {
    for (const line of block.text.text.split('\n')) assert.match(line, /^[A-Za-z ]+: .+/);
  }
  const noResponse = slackMessage(incident, {
    event: 'impacted',
    monitorChecks: [
      {
        name: 'Check',
        service: 'API',
        statusCode: null,
        error: 'Connection, DNS, or TLS check failed.',
        durationMs: null,
      },
    ],
  });
  assert.match(noResponse.blocks.map((block) => block.text.text).join('\n'), /No HTTP response/);
  const long = slackMessage({ ...incident, description: 'x'.repeat(10000) }, { event: 'impacted' });
  assert.ok(long.blocks[0].text.text.length <= 3000);
  process.env.APP_ORIGIN = 'https://user:password@app.example.test';
  assert.throws(() => slackMessage(incident, {}), /APP_ORIGIN/);
});
