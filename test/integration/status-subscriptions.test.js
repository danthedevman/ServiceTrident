import { subscriptionInfo } from '../../shared/status/subscriptions.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { connectDatabase } from '../../shared/persistence/database.js';
import { createApp } from '../../api/src/app.js';
import { seal, unseal } from '../../shared/integrations/secrets.js';
import {
  reconcileStatusSubscriptions,
  processStatusMail,
} from '../../workers/src/status/subscriptions.js';

test('public subscriptions confirm, deliver, isolate, and unsubscribe while private', async (t) => {
  process.env.INTEGRATION_ENCRYPTION_KEY = 'a'.repeat(64);
  process.env.DATABASE_SCHEMA =
    process.env.MONGODB_DB = `subscriptions_test_${randomUUID().replaceAll('-', '')}`;
  const { db, client } = await connectDatabase();
  const server = createApp(db).listen(0, '0.0.0.0');
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await db.dropDatabase();
    await client.close();
  });
  const token = 'a'.repeat(48),
    workspace = 'test-workspace';
  await db.collection('catalogs').insertOne({
    _id: workspace,
    publicToken: token,
    visibility: 'public',
    publicOrigin: 'https://status.example.com',
    emailSubscriptions: true,
    subscriptionIntegrationId: 'smtp',
    services: [{ id: 'service', name: 'API <script>', dependencyIds: [] }],
    collections: [],
  });
  await db.collection('operations').insertOne({
    _id: workspace,
    integrations: [
      {
        id: 'smtp',
        type: 'email',
        smtpConfigured: true,
        enabled: true,
        secret: seal({ host: 'smtp.example.com' }),
      },
    ],
  });
  const base = `http://127.0.0.1:${server.address().port}/api/public/status/${token}`;
  for (const theme of ['light', 'dark']) {
    await db.collection('catalogs').updateOne({ _id: workspace }, { $set: { statusTheme: theme } });
    const style = await fetch(base + '/appearance.css');
    assert.equal(style.status, 200);
    assert.match(style.headers.get('content-type'), /text\/css/);
    assert.match(style.headers.get('cache-control'), /no-store/);
    assert.ok((await style.text()).includes(theme === 'dark' ? '#000000' : '#ffffff'));
  }
  const post = (path, body, origin = 'https://status.example.com') =>
    fetch(base + path, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Requested-With': 'ServiceTrident',
        Origin: origin,
      },
      body: JSON.stringify(body),
    });
  assert.equal(
    (
      await post(
        '/subscriptions',
        { email: 'subscriber@example.com', consent: true },
        'https://evil.example',
      )
    ).status,
    403,
  );
  assert.equal((await post('/subscriptions', { email: 'invalid', consent: true })).status, 400);
  assert.equal(
    (await post('/subscriptions', { email: 'subscriber@example.com', consent: false })).status,
    400,
  );
  assert.equal(
    (await post('/subscriptions', { email: 'subscriber@example.com', consent: true })).status,
    202,
  );
  assert.equal(
    (await post('/subscriptions', { email: 'subscriber@example.com', consent: true })).status,
    202,
  );
  assert.equal(await db.collection('statusSubscribers').countDocuments({}), 1);
  const subscriber = await db.collection('statusSubscribers').findOne({});
  const secret = unseal(subscriber.secrets);
  const queue = { add: async () => {} },
    messages = [];
  const send = async (integration, message) => messages.push(message);
  await reconcileStatusSubscriptions(db, queue);
  await reconcileStatusSubscriptions(db, queue);
  const confirmation = await db.collection('statusMail').findOne({ kind: 'confirmation' });
  await processStatusMail(db, confirmation._id, send);
  assert.equal(messages.length, 1);
  assert.deepEqual(messages[0].to, ['subscriber@example.com']);
  assert.ok(messages[0].text.includes(`#confirm=${secret.confirm}`));
  assert.equal((await post('/subscriptions/confirm', { token: secret.confirm })).status, 200);
  assert.equal((await post('/subscriptions/confirm', { token: secret.confirm })).status, 400);
  await db.collection('catalogs').updateOne(
    { _id: workspace },
    {
      $set: {
        banner: {
          enabled: true,
          text: 'Maintenance <script>alert(1)</script>',
          level: 'warning',
        },
      },
    },
  );
  await reconcileStatusSubscriptions(db, queue);
  const update = await db.collection('statusMail').findOne({ kind: 'update' });
  assert.ok(update);
  await processStatusMail(db, update._id, async () => {
    throw new Error('secret provider error');
  });
  const retry = await db.collection('statusMail').findOne({ _id: update._id });
  assert.equal(retry.status, 'pending');
  assert.equal(retry.attempts, 1);
  assert.ok(!retry.error.includes('secret provider'));
  await db
    .collection('statusMail')
    .updateOne({ _id: update._id }, { $set: { nextAttemptAt: new Date(0) } });
  await processStatusMail(db, update._id, send);
  assert.equal(messages.length, 2);
  assert.ok(messages[1].text.includes('Announcement: Maintenance'));
  const feed = await fetch(base + '/feed.xml');
  assert.equal(feed.status, 200);
  assert.match(feed.headers.get('content-type'), /application\/rss\+xml/);
  const xml = await feed.text();
  assert.ok(!xml.includes('<script>'));
  assert.ok(!xml.includes('subscriber@example.com'));
  await db
    .collection('catalogs')
    .updateOne({ _id: workspace }, { $set: { subscriptionButtonVisible: false } });
  let capabilities = await subscriptionInfo(
    db,
    await db.collection('catalogs').findOne({ _id: workspace }),
  );
  assert.equal(capabilities.visible, false);
  assert.equal(capabilities.emailEnabled, false);
  assert.equal((await fetch(base + '/feed.xml')).status, 404);
  await db
    .collection('catalogs')
    .updateOne({ _id: workspace }, { $set: { rssSubscriptions: false } });
  assert.equal((await fetch(base + '/feed.xml')).status, 404);
  capabilities = await subscriptionInfo(
    db,
    await db.collection('catalogs').findOne({ _id: workspace }),
  );
  assert.equal(capabilities.rssPath, null);
  assert.equal(capabilities.emailEnabled, false);
  await db
    .collection('catalogs')
    .updateOne(
      { _id: workspace },
      { $set: { subscriptionButtonVisible: false, rssSubscriptions: true } },
    );
  assert.equal((await fetch(base + '/feed.xml')).status, 404);
  assert.equal(
    (await post('/subscriptions', { email: 'another@example.com', consent: true })).status,
    409,
  );
  capabilities = await subscriptionInfo(
    db,
    await db.collection('catalogs').findOne({ _id: workspace }),
  );
  assert.equal(capabilities.enabled, false);
  assert.equal(capabilities.emailEnabled, false);
  assert.equal(capabilities.rssEnabled, false);
  await db
    .collection('statusMail')
    .updateOne({ _id: update._id }, { $set: { status: 'pending', nextAttemptAt: new Date(0) } });
  await processStatusMail(db, update._id, send);
  assert.equal(messages.length, 2);
  assert.equal((await db.collection('statusMail').findOne({ _id: update._id })).status, 'skipped');
  await db
    .collection('catalogs')
    .updateOne({ _id: workspace }, { $set: { subscriptionButtonVisible: true } });
  assert.equal((await fetch(base + '/feed.xml')).status, 200);

  await db
    .collection('catalogs')
    .updateOne({ _id: workspace }, { $set: { visibility: 'private' } });
  assert.equal((await fetch(base + '/appearance.css')).status, 404);
  assert.equal((await fetch(base + '/feed.xml')).status, 404);
  await db
    .collection('statusMail')
    .updateOne({ _id: update._id }, { $set: { status: 'pending', nextAttemptAt: new Date(0) } });
  await processStatusMail(db, update._id, send);
  assert.equal(messages.length, 2);
  assert.equal((await db.collection('statusMail').findOne({ _id: update._id })).status, 'skipped');

  assert.equal(
    (await post('/subscriptions/unsubscribe', { token: secret.unsubscribe })).status,
    200,
  );
  assert.equal(await db.collection('statusSubscribers').countDocuments({}), 0);
});
