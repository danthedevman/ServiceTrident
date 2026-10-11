import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, randomBytes } from 'node:crypto';
import { ObjectId } from 'mongodb';
import { connectDatabase } from '../../shared/persistence/database.js';
import { createApp } from '../../api/src/app.js';

test(
  'assigned reports and dashboard counts enforce current membership, roles, active work and workspace scope',
  { timeout: 30000 },
  async (t) => {
    process.env.DATABASE_SCHEMA =
      process.env.MONGODB_DB = `assigned_reports_${randomUUID().replaceAll('-', '')}`;
    const { db, client } = await connectDatabase();
    const server = createApp(db).listen(0, '0.0.0.0');
    await new Promise((resolve) => server.once('listening', resolve));
    t.after(async () => {
      await new Promise((resolve) => server.close(resolve));
      await db.dropDatabase();
      await client.close();
    });
    const origin = `http://127.0.0.1:${server.address().port}/api`;
    async function request(path, cookie, body) {
      const response = await fetch(origin + path, {
        method: body ? 'POST' : 'GET',
        headers: {
          'Content-Type': 'application/json',
          'X-Requested-With': 'ServiceTrident',
          ...(cookie ? { Cookie: cookie } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      return {
        status: response.status,
        data: response.headers.get('content-type')?.includes('json')
          ? await response.json()
          : await response.text(),
        cookie: response.headers.get('set-cookie')?.split(';')[0],
      };
    }
    const register = (email) =>
      request('/auth/register', null, {
        email,
        displayName: 'Demo Owner',
        password: randomBytes(24).toString('hex'),
      });
    const owner = await register('owner@example.test'),
      outside = await register('outside@example.test');
    const workspaceId = new ObjectId(owner.data.user.id),
      outsideId = new ObjectId(outside.data.user.id);
    const teamId = String(new ObjectId()),
      otherTeamId = String(new ObjectId());
    await db.collection('operations').updateOne(
      { _id: workspaceId },
      {
        $set: {
          groups: [
            { id: teamId, name: 'Demo Team', memberIds: [owner.data.user.id] },
            { id: otherTeamId, name: 'Other Team', memberIds: [] },
          ],
        },
      },
      { upsert: true },
    );
    for (const kind of ['incidents', 'tasks']) {
      const active = kind === 'incidents' ? 'open' : 'todo';
      await db.collection(kind).insertMany([
        {
          workspaceId,
          title: 'Mine and team',
          status: active,
          assigneeId: owner.data.user.id,
          assignmentGroupId: teamId,
          assignmentGroupName: 'Demo Team',
          severity: 'high',
          priority: 'high',
          dueDate: '2000-01-01',
          createdAt: new Date(),
        },
        {
          workspaceId,
          title: 'Mine only',
          status: active,
          assigneeId: owner.data.user.id,
          severity: 'low',
          priority: 'low',
          dueDate: '2099-01-01',
          createdAt: new Date(),
        },
        {
          workspaceId,
          title: 'Team only',
          status: active,
          assignmentGroupId: teamId,
          severity: 'low',
          priority: 'low',
          createdAt: new Date(),
        },
        {
          workspaceId,
          title: 'Other team',
          status: active,
          assignmentGroupId: otherTeamId,
          createdAt: new Date(),
        },
        {
          workspaceId,
          title: 'Completed record',
          status: kind === 'incidents' ? 'resolved' : 'done',
          assigneeId: owner.data.user.id,
          assignmentGroupId: teamId,
          createdAt: new Date(),
        },
        {
          workspaceId: outsideId,
          title: 'Foreign record',
          status: active,
          assigneeId: owner.data.user.id,
          assignmentGroupId: teamId,
          createdAt: new Date(),
        },
      ]);
    }
    const reports = ['my-incidents', 'team-incidents', 'my-tasks', 'team-tasks'];
    const dashboard = await request('/response-dashboard', owner.cookie);
    assert.equal(dashboard.status, 200);
    assert.equal(dashboard.data.teamCount, 1);
    for (const report of reports) {
      assert.deepEqual(dashboard.data.assignedWork[report], { total: 2, needsAttention: 1 });
      const path = `/tables/dashboard-report?report=${report}`;
      const list = await request(path, owner.cookie);
      assert.equal(list.status, 200);
      assert.equal(list.data.total, 2);
      assert.ok(
        list.data.rows.every(
          (row) => !['Other team', 'Completed record', 'Foreign record'].includes(row.title),
        ),
      );
      const spoof = await request(
        `${path}&assigneeId=${outside.data.user.id}&assignmentGroupId=${otherTeamId}`,
        owner.cookie,
      );
      assert.deepEqual(spoof.data.rows, list.data.rows);
      assert.equal((await request(`${path}&page=2`, owner.cookie)).data.rows.length, 0);
      const csv = await request(`${path}&export=csv`, owner.cookie);
      assert.equal(csv.status, 200);
      assert.match(csv.data, /Mine and team/);
      assert.doesNotMatch(csv.data, /Other team|Completed record|Foreign record/);
      assert.equal((await request(path)).status, 401);
      assert.equal((await request(path, outside.cookie)).data.total, 0);
    }
    for (const role of ['viewer', 'responder', 'user']) {
      const invitation = await request('/invitations', owner.cookie, {
        email: `${role}@example.test`,
        displayName: 'Demo Member',
        role,
      });
      const member = await request('/auth/invite', null, {
        token: invitation.data.inviteUrl.split('/').at(-1),
        password: randomBytes(24).toString('hex'),
      });
      for (const report of reports) {
        const result = await request(`/tables/dashboard-report?report=${report}`, member.cookie);
        assert.equal(result.status, role === 'user' ? 403 : 200);
        if (role !== 'user') assert.equal(result.data.total, 0);
      }
      assert.equal(
        (await request('/response-dashboard', member.cookie)).status,
        role === 'user' ? 403 : 200,
      );
    }
    await db.collection('operations').updateOne({ _id: workspaceId }, { $set: { groups: [] } });
    assert.equal(
      (await request('/tables/dashboard-report?report=team-incidents', owner.cookie)).data.total,
      0,
    );
    const updated = (await request('/response-dashboard', owner.cookie)).data;
    assert.equal(updated.assignedWork['team-tasks'].total, 0);
    assert.equal(updated.assignedWork['my-tasks'].total, 2);
  },
);
