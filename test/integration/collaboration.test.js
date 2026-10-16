import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, randomBytes } from 'node:crypto';
import { ObjectId } from 'mongodb';
import { connectDatabase } from '../../shared/persistence/database.js';
import { createApp } from '../../api/src/app.js';

test('mentions, watchers and notification reads preserve tenant and internal-note access', async (t) => {
  process.env.DATABASE_SCHEMA =
    process.env.MONGODB_DB = `collaboration_test_${randomUUID().replaceAll('-', '')}`;
  process.env.INTEGRATION_ENCRYPTION_KEY = randomBytes(32).toString('hex');
  const { db, client } = await connectDatabase();
  const server = createApp(db).listen(0, '0.0.0.0');
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await db.dropDatabase();
    await client.close();
  });
  const base = `http://127.0.0.1:${server.address().port}/api`;
  async function call(path, cookie, body, method = body ? 'POST' : 'GET') {
    const response = await fetch(base + path, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'X-Requested-With': 'ServiceTrident',
        ...(cookie ? { Cookie: cookie } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    return {
      status: response.status,
      data: await response.json(),
      cookie: response.headers.get('set-cookie')?.split(';')[0],
    };
  }
  async function register(name) {
    return call('/auth/register', null, {
      displayName: name,
      email: `${name.toLowerCase()}@collaboration.example`,
      password: randomBytes(24).toString('hex'),
    });
  }
  const owner = await register('Owner'),
    staff = await register('Responder'),
    portal = await register('Portal'),
    foreign = await register('Foreign');
  const ownerDoc = await db.collection('users').findOne({ email: 'owner@collaboration.example' });
  const staffDoc = await db
    .collection('users')
    .findOne({ email: 'responder@collaboration.example' });
  const portalDoc = await db.collection('users').findOne({ email: 'portal@collaboration.example' });
  const foreignDoc = await db
    .collection('users')
    .findOne({ email: 'foreign@collaboration.example' });
  await db
    .collection('users')
    .updateOne({ _id: staffDoc._id }, { $set: { workspaceId: ownerDoc._id, role: 'responder' } });
  await db
    .collection('users')
    .updateOne({ _id: portalDoc._id }, { $set: { workspaceId: ownerDoc._id, role: 'user' } });
  const incidentId = new ObjectId();
  await db.collection('incidents').insertOne({
    _id: incidentId,
    workspaceId: ownerDoc._id,
    title: 'Synthetic collaboration incident',
    number: 'INC0000001',
    createdById: String(ownerDoc._id),
    openedForId: String(portalDoc._id),
    revision: 1,
    timeline: [],
  });
  const path = `/incidents/${incidentId}`;
  const groups = await call('/groups', owner.cookie);
  const group = await call('/groups', owner.cookie, {
    name: 'Watch group',
    memberIds: [String(staffDoc._id)],
    email: 'team@collaboration.example',
    slackChannel: '#operations',
    revision: groups.data.revision,
  });
  assert.equal(group.status, 201);
  assert.equal(group.data.group.email, 'team@collaboration.example');
  assert.equal(
    (
      await call(
        '/auth/details',
        staff.cookie,
        { displayName: 'Responder', slackId: 'U0123456789' },
        'PATCH',
      )
    ).status,
    200,
  );
  assert.equal(
    (
      await call(
        '/auth/details',
        staff.cookie,
        { displayName: 'Responder', slackId: 'https://invalid.example' },
        'PATCH',
      )
    ).status,
    400,
  );
  const groupRevision = (await call('/groups', owner.cookie)).data.revision;
  assert.equal(
    (
      await call('/groups', owner.cookie, {
        name: 'Invalid email',
        memberIds: [],
        email: 'not-an-email',
        revision: groupRevision,
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await call('/groups', owner.cookie, {
        name: 'Invalid Slack',
        memberIds: [],
        slackChannel: 'https://invalid.example',
        revision: groupRevision,
      })
    ).status,
    400,
  );

  assert.equal(
    (
      await call(
        `${path}/watchers`,
        owner.cookie,
        { watcherUserIds: [String(foreignDoc._id)], watcherGroupIds: [], revision: 1 },
        'PUT',
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await call(
        `${path}/watchers`,
        owner.cookie,
        { watcherUserIds: [], watcherGroupIds: [group.data.group.id], revision: 1 },
        'PUT',
      )
    ).status,
    200,
  );
  assert.equal(
    (
      await call(
        `${path}/watchers`,
        portal.cookie,
        { watcherUserIds: [], watcherGroupIds: [], revision: 2 },
        'PUT',
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await call(`${path}/comments`, owner.cookie, {
        body: '@Foreign hidden mention',
        kind: 'comment',
        mentionIds: [String(foreignDoc._id)],
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await call(`${path}/comments`, owner.cookie, {
        body: 'Missing mention',
        kind: 'comment',
        mentionIds: [String(staffDoc._id)],
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await call(`${path}/comments`, owner.cookie, {
        body: '@Responder please investigate',
        kind: 'comment',
        mentionIds: [String(staffDoc._id)],
      })
    ).status,
    201,
  );
  assert.equal(
    (
      await call(`${path}/comments`, owner.cookie, {
        body: 'Private synthetic work note',
        kind: 'work_note',
        mentionIds: [String(portalDoc._id)],
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await call(`${path}/comments`, owner.cookie, {
        body: '@Responder private investigation',
        kind: 'work_note',
        mentionIds: [String(staffDoc._id)],
      })
    ).status,
    201,
  );
  const alerts = await call('/notifications', staff.cookie);
  assert.equal(alerts.status, 200);
  assert.equal(alerts.data.notifications.length, 2);
  assert.ok(alerts.data.notifications.every((entry) => entry.unread && !('body' in entry)));
  const first = await call('/notifications?pageSize=1&state=all', staff.cookie);
  assert.equal(first.status, 200, first.data.error);
  assert.equal(first.data.notifications.length, 1);
  assert.ok(first.data.nextCursor);
  const next = await call(
    `/notifications?pageSize=1&state=all&cursor=${encodeURIComponent(first.data.nextCursor)}`,
    staff.cookie,
  );
  assert.equal(next.data.notifications.length, 1);
  assert.notEqual(next.data.notifications[0].id, first.data.notifications[0].id);
  assert.equal(next.data.nextCursor, null);
  assert.equal(
    (
      await call(
        `/notifications?pageSize=1&state=all&cursor=${encodeURIComponent(first.data.nextCursor)}`,
        foreign.cookie,
      )
    ).status,
    400,
  );
  assert.equal(
    (await call('/notifications?state=read', staff.cookie)).data.notifications.length,
    0,
  );
  assert.equal(
    (await call('/notifications?state=unread', staff.cookie)).data.notifications.length,
    2,
  );
  assert.equal((await call('/notifications?pageSize=1000', staff.cookie)).status, 400);
  assert.equal((await call('/notifications?cursor=bad', staff.cookie)).status, 400);

  assert.equal((await call('/notifications', portal.cookie)).data.notifications.length, 1);
  assert.equal((await call('/notifications', foreign.cookie)).data.notifications.length, 0);
  assert.equal(
    (await call('/notifications/read', staff.cookie, { checkedAt: alerts.data.checkedAt })).status,
    200,
  );
  assert.ok(
    (await call('/notifications', staff.cookie)).data.notifications.every((entry) => !entry.unread),
  );
  assert.equal(
    (await call('/notifications?state=read', staff.cookie)).data.notifications.length,
    2,
  );
  assert.equal(
    (await call('/notifications?state=unread', staff.cookie)).data.notifications.length,
    0,
  );
  assert.equal(
    (
      await call(
        `/notifications?pageSize=1&state=all&cursor=${encodeURIComponent(first.data.nextCursor)}`,
        staff.cookie,
      )
    ).status,
    400,
  );

  await db.collection('users').updateOne({ _id: staffDoc._id }, { $set: { role: 'user' } });
  assert.equal(
    (await call('/notifications?state=unread', staff.cookie)).data.notifications.length,
    0,
  );
  assert.equal((await call('/notifications', staff.cookie)).data.notifications.length, 0);
  assert.equal(
    (await call('/notifications/read', staff.cookie, { checkedAt: 'invalid' })).status,
    400,
  );
  const options = await call(`${path}/collaboration`, portal.cookie);
  assert.ok(
    options.data.members.every((member) =>
      [String(ownerDoc._id), String(portalDoc._id)].includes(member.id),
    ),
  );
  assert.deepEqual(options.data.groups, []);
});
