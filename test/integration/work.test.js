import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { ObjectId } from 'mongodb';
import { connectDatabase } from '../../shared/persistence/database.js';
import { fieldChoices } from '../../shared/forms/form-options.js';
import { reconcileOperations } from '../../workers/src/notifications/reconcile.js';
import { processDelivery } from '../../workers/src/notifications/delivery.js';
import { createApp } from '../../api/src/app.js';

test(
  'four roles, private incident portal, related tasks, articles, groups, and service ownership',
  { timeout: 30000 },
  async (t) => {
    process.env.DATABASE_SCHEMA =
      process.env.MONGODB_DB = `work_test_${randomUUID().replaceAll('-', '')}`;
    const { db, client } = await connectDatabase(),
      server = createApp(db).listen(0, '0.0.0.0');
    await new Promise((resolve) => server.once('listening', resolve));
    t.after(async () => {
      await new Promise((resolve) => server.close(resolve));
      await db.dropDatabase();
      await client.close();
    });
    const base = `http://127.0.0.1:${server.address().port}/api`;
    const request = async (path, cookie, method = 'GET', body) => {
        const response = await fetch(base + path, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'X-Requested-With': 'ServiceTrident',
          ...(cookie ? { Cookie: cookie } : {}),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      return {
        status: response.status,
        data: response.status === 204 ? null : await response.json(),
        cookie: response.headers.get('set-cookie')?.split(';')[0],
      };
    };
    const owner = await request('/auth/register', null, 'POST', {
      displayName: 'Test user',
      email: 'owner@example.com',
      password: 'long unique test password',
    });
    const other = await request('/auth/register', null, 'POST', {
      displayName: 'Test user',
      email: 'other@example.com',
      password: 'another unique test password',
    });
    async function invite(role, email) {
      const result = await request('/invitations', owner.cookie, 'POST', {
        role,
        email,
        displayName: role,
      });
      assert.equal(result.status, 201);
      const token = result.data.inviteUrl.split('/').at(-1);
      return request('/auth/invite', null, 'POST', {
        token,
        password: 'long unique invited password',
      });
    }
    const responder = await invite('responder', 'responder@example.com'),
      viewer = await invite('viewer', 'viewer@example.com'),
      user = await invite('user', 'user@example.com'),
      user2 = await invite('user', 'user2@example.com');
    assert.equal(
      (await request(`/members/${owner.data.user.id}`, owner.cookie, 'DELETE', {})).status,
      409,
    );
    assert.equal(
      (await request(`/members/${responder.data.user.id}`, viewer.cookie, 'DELETE', {})).status,
      403,
    );
    const contact = {
      displayName: 'On-call responder',
      phone: '+1 (555) 123-4567',
      timeZone: 'America/New_York',
      jobTitle: 'Engineer',
      department: 'Platform',
      location: 'New York',
      role: 'admin',
      email: 'changed@example.com',
      disabled: true,
    };
    assert.equal((await request('/auth/details', responder.cookie, 'PATCH', contact)).status, 200);
    const directory = (await request('/members', owner.cookie)).data.members;
    const savedContact = directory.find((member) => member.id === responder.data.user.id);
    assert.equal(savedContact.phone, contact.phone);
    assert.equal(savedContact.timeZone, contact.timeZone);
    assert.equal(
      (await request('/auth/me', responder.cookie)).data.user.timeZone,
      contact.timeZone,
    );
    assert.equal(savedContact.role, 'responder');
    assert.equal(savedContact.email, 'responder@example.com');
    assert.equal(savedContact.disabled, false);
    assert.equal('passwordHash' in savedContact, false);
    assert.equal('uiPreferences' in savedContact, false);
    assert.equal(
      (await request('/auth/details', responder.cookie, 'PATCH', { timeZone: 'Not/A_Zone' }))
        .status,
      400,
    );
    assert.equal(
      (await request('/auth/details', responder.cookie, 'PATCH', { phone: 'invalid contact' }))
        .status,
      400,
    );
    assert.equal(
      (
        await request(`/members/${responder.data.user.id}`, viewer.cookie, 'PATCH', {
          ...contact,
          disabled: false,
        })
      ).status,
      403,
    );
    assert.equal(
      (
        await request(`/members/${responder.data.user.id}`, other.cookie, 'PATCH', {
          ...contact,
          disabled: false,
        })
      ).status,
      404,
    );
    const service = (await request('/services', owner.cookie, 'POST', { name: 'Payments' })).data
      .item;
    const foreignService = (
      await request('/services', other.cookie, 'POST', { name: 'Foreign service' })
    ).data.item;
    const incidentInput = {
      title: 'Private outage',
      serviceId: service.id,
      severity: 'high',
      description: 'Investigating',
      custom: {},
    };
    const privateIncident = (await request('/incidents', responder.cookie, 'POST', incidentInput))
      .data.incident;
    const created = await request('/incidents', user.cookie, 'POST', {
      ...incidentInput,
      title: 'My submitted incident',
      createdById: user2.data.user.id,
    });
    assert.equal(created.status, 201);
    assert.equal(created.data.incident.createdById, user.data.user.id);
    assert.equal(created.data.incident.openedForId, user.data.user.id);
    const forUser = await request('/incidents', responder.cookie, 'POST', {
      ...incidentInput,
      title: 'Opened for User',
      openedForId: user.data.user.id,
    });
    assert.equal(forUser.status, 201);
    assert.equal((await request('/incidents', user.cookie)).data.total, 2);
    assert.equal((await request('/incidents', user2.cookie)).data.total, 0);
    assert.equal((await request(`/incidents/${privateIncident.id}`, user.cookie)).status, 404);
    assert.equal(
      (await request(`/incidents/${forUser.data.incident.id}`, user.cookie)).status,
      200,
    );
    assert.equal(
      (
        await request('/incidents', user.cookie, 'POST', {
          ...incidentInput,
          openedForId: user2.data.user.id,
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await request('/incidents', user.cookie, 'POST', {
          ...incidentInput,
          assigneeId: responder.data.user.id,
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await request(`/incidents/${created.data.incident.id}`, user.cookie, 'PATCH', {
          ...incidentInput,
          revision: 0,
        })
      ).status,
      403,
    );
    assert.equal((await request('/incidents', viewer.cookie, 'POST', incidentInput)).status, 403);
    assert.equal((await request('/incidents', viewer.cookie)).data.total, 3);
    const csv = await fetch(`${base}/incidents/export`, { headers: { Cookie: user.cookie } });
    const csvText = await csv.text();
    assert.ok(
      csvText.includes('My submitted incident') &&
        csvText.includes('Opened for User') &&
        !csvText.includes('Private outage'),
    );
    assert.equal((await request('/members', user.cookie)).data.members.length, 1);
    for (const path of [
      '/tasks',
      '/knowledge',
      '/groups',
      '/monitors',
      '/on-call',
      '/integrations',
    ])
      assert.equal((await request(path, user.cookie)).status, 403, path);
    const taskInput = {
      title: 'Investigate payments',
      incidentId: privateIncident.id,
      description: 'Check dependencies',
      assigneeId: responder.data.user.id,
      dueDate: '2026-10-10',
      priority: 'high',
    };
    const taskResult = await request('/tasks', responder.cookie, 'POST', taskInput);
    assert.equal(taskResult.status, 201, JSON.stringify(taskResult.data));
    const task = taskResult.data.item;
    assert.equal(task.serviceId, service.id);
    assert.equal((await request(`/tasks/${task.id}`, other.cookie)).status, 404);
    assert.equal((await request(`/tasks/${task.id}`, viewer.cookie)).status, 200);
    assert.equal((await request('/tasks', other.cookie)).data.total, 0);
    assert.equal(
      (
        await request('/tasks', responder.cookie, 'POST', {
          ...taskInput,
          serviceId: foreignService.id,
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await request('/tasks', responder.cookie, 'POST', {
          ...taskInput,
          assigneeId: other.data.user.id,
        })
      ).status,
      400,
    );
    assert.equal((await request('/tasks', viewer.cookie, 'POST', taskInput)).status, 403);
    assert.equal(
      (
        await request(`/tasks/${task.id}`, responder.cookie, 'PATCH', {
          status: 'in_progress',
          revision: 0,
        })
      ).status,
      200,
    );
    assert.equal(
      (
        await request(`/tasks/${task.id}`, responder.cookie, 'PATCH', {
          status: 'done',
          revision: 0,
        })
      ).status,
      409,
    );
    assert.equal(
      (await request(`/tasks/${task.id}`, viewer.cookie, 'PATCH', { status: 'done', revision: 1 }))
        .status,
      403,
    );
    assert.equal(
      (
        await request(`/tasks/${task.id}`, responder.cookie, 'PATCH', {
          workspaceId: other.data.user.id,
          revision: 1,
        })
      ).status,
      400,
    );
    const filteredCsv = await fetch(
      `${base}/tasks/export?status=in_progress&incidentId=${privateIncident.id}`,
      { headers: { Cookie: viewer.cookie } },
    );
    assert.equal(filteredCsv.status, 200);
    assert.match(await filteredCsv.text(), /Investigate payments/);
    const orderTarget = (
      await request('/tasks', responder.cookie, 'POST', {
        ...taskInput,
        title: 'Ordering target',
        status: 'in_progress',
      })
    ).data.item;
    const reordered = await request(`/tasks/${task.id}`, responder.cookie, 'PATCH', {
      revision: 1,
      boardPosition: { targetId: orderTarget.id, side: 'after' },
    });
    assert.equal(reordered.status, 200, JSON.stringify(reordered.data));
    const board = await request(
      '/tasks?status=in_progress&sortBy=boardRank&order=asc',
      responder.cookie,
    );
    assert.deepEqual(
      board.data.items.map((item) => item.id),
      [orderTarget.id, task.id],
    );
    assert.equal(
      (
        await request(`/tasks/${task.id}`, responder.cookie, 'PATCH', {
          revision: 1,
          boardPosition: { targetId: orderTarget.id, side: 'before' },
        })
      ).status,
      409,
    );
    assert.equal(
      (
        await request(`/tasks/${task.id}`, viewer.cookie, 'PATCH', {
          revision: 2,
          boardPosition: { targetId: orderTarget.id, side: 'before' },
        })
      ).status,
      403,
    );
    assert.equal(
      (await request(`/tasks/${orderTarget.id}`, owner.cookie, 'DELETE', {})).status,
      204,
    );
    assert.equal(
      (
        await request(`/tasks/${task.id}`, responder.cookie, 'PATCH', {
          status: 'archived',
          revision: 2,
        })
      ).status,
      200,
    );
    assert.equal((await request('/tasks', responder.cookie)).data.total, 0);
    assert.equal((await request('/tasks?status=archived', responder.cookie)).data.total, 1);
    assert.equal(
      (
        await request('/knowledge', responder.cookie, 'POST', {
          title: 'Optional base',
          content: 'Text',
        })
      ).status,
      201,
    );
    const baseResult = await request('/knowledge-bases', responder.cookie, 'POST', {
      title: 'Operations',
      description: 'Runbooks',
    });
    assert.equal(baseResult.status, 201);
    const knowledgeBaseId = baseResult.data.item.id;
    assert.equal((await request('/knowledge-bases?search=runbooks', viewer.cookie)).data.total, 1);
    assert.equal((await request('/knowledge-bases?search=missing', viewer.cookie)).data.total, 0);
    assert.equal((await request(`/knowledge-bases/${knowledgeBaseId}`, other.cookie)).status, 404);
    assert.equal(
      (await request('/knowledge-bases', viewer.cookie, 'POST', { title: 'No' })).status,
      403,
    );
    assert.equal(
      (
        await request('/knowledge', other.cookie, 'POST', {
          title: 'Foreign base',
          content: 'Text',
          knowledgeBaseId,
        })
      ).status,
      400,
    );
    const boardOrder = ['done', 'blocked', 'in_progress', 'todo'];
    assert.equal(
      (
        await request('/task-board-settings', responder.cookie, 'PUT', {
          order: boardOrder,
          revision: 0,
        })
      ).status,
      403,
    );
    assert.equal(
      (
        await request('/task-board-settings', owner.cookie, 'PUT', {
          order: boardOrder,
          revision: 0,
        })
      ).status,
      200,
    );
    assert.deepEqual((await request('/task-board-settings', viewer.cookie)).data.order, boardOrder);
    assert.equal(
      (
        await request('/task-board-settings', owner.cookie, 'PUT', {
          order: boardOrder,
          revision: 0,
        })
      ).status,
      409,
    );
    const article = await request('/knowledge', responder.cookie, 'POST', {
      knowledgeBaseId,
      title: '=Payment runbook',
      content: '<script>This is plain text</script>\nRestart steps',
      serviceId: service.id,
      status: 'published',
    });
    assert.equal(article.status, 201);
    assert.equal(
      (await request(`/knowledge/${article.data.item.id}`, viewer.cookie)).data.item.content,
      '<script>This is plain text</script>\nRestart steps',
    );
    assert.equal((await request(`/knowledge/${article.data.item.id}`, other.cookie)).status, 404);
    assert.equal(
      (await request('/knowledge', viewer.cookie, 'POST', { title: 'No', content: 'No' })).status,
      403,
    );
    assert.equal(
      (
        await request('/knowledge', responder.cookie, 'POST', {
          title: 'No',
          content: 'No',
          serviceId: foreignService.id,
        })
      ).status,
      400,
    );
    const articleCsv = await fetch(`${base}/knowledge/export`, {
      headers: { Cookie: viewer.cookie },
    });
    assert.match(await articleCsv.text(), /'=Payment runbook/);
    for (const articleType of ['article', 'runbook']) {
      const unassigned = await request('/knowledge', responder.cookie, 'POST', {
        title: `Unassigned ${articleType}`,
        articleTypeOption: articleType,
        ...(articleType === 'article'
          ? { content: 'Unassigned knowledge content.' }
          : { steps: [{ title: 'Check', instructions: 'Verify the service.' }] }),
      });
      assert.equal(unassigned.status, 201, JSON.stringify(unassigned.data));
      assert.equal(unassigned.data.item.articleType, articleType);
      assert.equal(unassigned.data.item.knowledgeBaseId, null);
    }
    const sourceBase = (
      await request('/knowledge-bases', owner.cookie, 'POST', { title: 'Temporary source' })
    ).data.item;
    const destinationBase = (
      await request('/knowledge-bases', owner.cookie, 'POST', { title: 'Temporary destination' })
    ).data.item;
    const destinations = await request(
      `/references/knowledgeBases?q=Temporary&excludeId=${sourceBase.id}`,
      owner.cookie,
    );
    assert.equal(destinations.status, 200);
    assert.ok(!destinations.data.options.some((option) => option.id === sourceBase.id));
    assert.ok(destinations.data.options.some((option) => option.id === destinationBase.id));
    assert.equal(
      (await request('/references/knowledgeBases?excludeId=invalid', owner.cookie)).status,
      400,
    );
    const runbookResult = await request('/knowledge', responder.cookie, 'POST', {
      title: 'Recovery procedure',
      articleType: 'runbook',
      knowledgeBaseId: sourceBase.id,
      steps: [{ title: 'Check health', instructions: 'Confirm the service responds.' }],
    });
    assert.equal(runbookResult.status, 201, JSON.stringify(runbookResult.data));
    const runbookId = runbookResult.data.item.id;
    const updateRunbook = await request(`/knowledge/${runbookId}`, responder.cookie, 'PATCH', {
      revision: runbookResult.data.item.revision,
      statusOption: 'published',
    });
    assert.equal(updateRunbook.status, 200, JSON.stringify(updateRunbook.data));
    assert.equal(updateRunbook.data.item.content.match(/1. Check health/g).length, 1);
    await db.collection('attachments').insertOne({
      _id: new ObjectId(),
      workspaceId: new ObjectId(owner.data.user.id),
      kind: 'knowledge',
      recordId: runbookId,
    });
    await db
      .collection('incidents')
      .updateOne({ _id: new ObjectId(privateIncident.id) }, { $push: { knowledgeIds: runbookId } });
    const deletionBody = {
      mode: 'move',
      targetId: destinationBase.id,
      revision: sourceBase.revision,
      articleCount: 1,
    };
    assert.equal(
      (await request(`/knowledge-bases/${sourceBase.id}`, responder.cookie, 'DELETE', deletionBody))
        .status,
      403,
    );
    assert.equal(
      (
        await request(`/knowledge-bases/${sourceBase.id}`, owner.cookie, 'DELETE', {
          ...deletionBody,
          targetId: sourceBase.id.toUpperCase(),
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await request(`/knowledge-bases/${sourceBase.id}`, owner.cookie, 'DELETE', {
          ...deletionBody,
          articleCount: 0,
        })
      ).status,
      409,
    );
    assert.equal(
      (await request(`/knowledge-bases/${sourceBase.id}`, owner.cookie, 'DELETE', deletionBody))
        .status,
      204,
    );
    assert.equal(
      (await request(`/knowledge/${runbookId}`, viewer.cookie)).data.item.knowledgeBaseId,
      destinationBase.id,
    );
    assert.equal(await db.collection('attachments').countDocuments({ recordId: runbookId }), 1);
    assert.equal((await request(`/knowledge-bases/${sourceBase.id}`, viewer.cookie)).status, 404);
    assert.equal(
      (
        await request(`/knowledge-bases/${destinationBase.id}`, owner.cookie, 'DELETE', {
          mode: 'delete',
          revision: destinationBase.revision,
          articleCount: 1,
        })
      ).status,
      204,
    );
    assert.equal((await request(`/knowledge/${runbookId}`, viewer.cookie)).status, 404);
    assert.equal(await db.collection('attachments').countDocuments({ recordId: runbookId }), 0);
    assert.ok(
      !(
        await db.collection('incidents').findOne({ _id: new ObjectId(privateIncident.id) })
      ).knowledgeIds.includes(runbookId),
    );

    const groupState = (await request('/groups', owner.cookie)).data;
    const groupBody = {
      name: 'Payments team',
      description: 'Service owners',
      memberIds: [responder.data.user.id, viewer.data.user.id],
      revision: groupState.revision,
    };
    assert.equal((await request('/groups', responder.cookie, 'POST', groupBody)).status, 403);
    assert.equal(
      (
        await request('/groups', owner.cookie, 'POST', {
          ...groupBody,
          memberIds: [other.data.user.id],
        })
      ).status,
      400,
    );
    const group = await request('/groups', owner.cookie, 'POST', groupBody);
    assert.equal(group.status, 201);
    const assignmentGroupId = group.data.group.id;
    const filtered = await request(
      `/references/members?groupId=${assignmentGroupId}`,
      responder.cookie,
    );
    assert.deepEqual(
      filtered.data.options.map((row) => row.id).sort(),
      groupBody.memberIds.slice().sort(),
    );
    assert.equal(
      (await request(`/references/members?groupId=${assignmentGroupId}`, other.cookie)).status,
      404,
    );
    for (const [route, input, key] of [
      ['incidents', incidentInput, 'incident'],
      ['tasks', taskInput, 'item'],
    ]) {
      const assigned = await request(`/${route}`, responder.cookie, 'POST', {
        ...input,
        assignmentGroupId,
        assigneeId: responder.data.user.id,
      });
      assert.equal(assigned.status, 201, JSON.stringify(assigned.data));
      assert.equal(assigned.data[key].assignmentGroupId, assignmentGroupId);
      assert.equal(assigned.data[key].assignmentGroupName, groupBody.name);
      assert.equal(
        (
          await request(`/${route}/${assigned.data[key].id}`, responder.cookie, 'PATCH', {
            ...input,
            assignmentGroupId,
            assigneeId: owner.data.user.id,
            revision: assigned.data[key].revision,
          })
        ).status,
        400,
      );
      assert.equal(
        (
          await request(`/${route}`, responder.cookie, 'POST', {
            ...input,
            assignmentGroupId: new ObjectId().toHexString(),
          })
        ).status,
        400,
      );
      assert.equal(
        (
          await request(`/${route}`, responder.cookie, 'POST', {
            ...input,
            assignmentGroupId,
            assigneeId: '',
          })
        ).status,
        201,
      );
    }
    assert.equal(
      (await request('/incidents', user.cookie, 'POST', { ...incidentInput, assignmentGroupId }))
        .status,
      400,
    );

    assert.equal((await request('/groups', viewer.cookie)).data.groups.length, 1);
    assert.equal((await request('/groups', other.cookie)).data.groups.length, 0);
    assert.equal(
      (
        await request(`/services/${service.id}`, owner.cookie, 'PATCH', {
          ownerIds: [responder.data.user.id],
          ownerGroupIds: [group.data.group.id],
          primaryContactId: user.data.user.id,
        })
      ).status,
      200,
    );
    assert.equal(
      (
        await request(`/services/${service.id}`, owner.cookie, 'PATCH', {
          ownerIds: [other.data.user.id],
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await request(`/services/${service.id}`, owner.cookie, 'PATCH', {
          ownerGroupIds: [new ObjectId().toHexString()],
        })
      ).status,
      400,
    );
    assert.equal(
      (await request(`/services/${service.id}`, viewer.cookie, 'PATCH', { name: 'No' })).status,
      403,
    );
    assert.deepEqual((await request('/services', viewer.cookie)).data.services[0].ownerIds, [
      responder.data.user.id,
    ]);
    assert.equal((await request('/services', user.cookie)).data.services[0].ownerIds, undefined);
    const publicSettings = await request('/status-settings', owner.cookie, 'PATCH', {
      visibility: 'public',
      statusTheme: 'dark',
    });
    const publicStatus = await request(
      publicSettings.data.publicPath.replace('/status/public/', '/public/status/'),
    );
    assert.equal(publicStatus.status, 200);
    assert.equal(publicStatus.data.statusTheme, 'dark');
    assert.equal(publicStatus.data.backgroundColor, undefined);
    assert.equal(publicStatus.data.services[0].ownerIds, undefined);
    assert.equal(publicStatus.data.services[0].primaryContactId, undefined);
    assert.equal(publicStatus.data.services[0].ownerGroupIds, undefined);
    assert.equal(
      (await request('/members', owner.cookie)).data.members.find(
        (m) => m.id === viewer.data.user.id,
      ).role,
      'viewer',
    );
    const commentPath = `/incidents/${created.data.incident.id}/comments`;
    assert.equal(
      (
        await request(commentPath, responder.cookie, 'POST', {
          kind: 'comment',
          body: 'We are investigating.',
        })
      ).status,
      201,
    );
    assert.equal(
      (
        await request(commentPath, responder.cookie, 'POST', {
          kind: 'work_note',
          body: 'INTERNAL_SECRET',
        })
      ).status,
      201,
    );
    assert.equal(
      (await request(commentPath, user.cookie, 'POST', { kind: 'work_note', body: 'Forbidden' }))
        .status,
      403,
    );
    assert.equal(
      (await request(commentPath, viewer.cookie, 'POST', { kind: 'comment', body: 'Forbidden' }))
        .status,
      403,
    );
    assert.equal(
      (await request(commentPath, user2.cookie, 'POST', { kind: 'comment', body: 'Forbidden' }))
        .status,
      404,
    );
    assert.equal(
      (await request(commentPath, other.cookie, 'POST', { kind: 'comment', body: 'Forbidden' }))
        .status,
      404,
    );
    assert.equal(
      (await request(commentPath, user.cookie, 'POST', { kind: 'comment', body: ' ' })).status,
      400,
    );
    for (const person of [user, viewer]) {
      const detail = await request(`/incidents/${created.data.incident.id}`, person.cookie);
      assert.equal(detail.data.comments.length, 1);
      assert.ok(detail.data.comments.every((entry) => !Object.hasOwn(entry, 'authorId')));
      assert.ok(!JSON.stringify(detail.data).includes('INTERNAL_SECRET'));
    }
    const authored = (await request(`/incidents/${created.data.incident.id}`, owner.cookie)).data
      .comments;
    assert.equal(authored.length, 2);
    assert.ok(authored.every((entry) => entry.authorId === responder.data.user.id));
    const authorTable = (
      await request(`/tables/comments?recordId=${created.data.incident.id}`, owner.cookie)
    ).data;
    assert.equal(authorTable.rows.length, 2);
    assert.ok(authorTable.rows.every((entry) => entry.authorId === responder.data.user.id));
    const queue = { add: async () => {} };
    await reconcileOperations(db, queue);
    await reconcileOperations(db, queue);
    const deliveries = await db.collection('deliveries').find({ event: 'comment' }).toArray();
    assert.equal(
      deliveries.length,
      1,
      'One deduplicated email for creator/opened-for; no note email',
    );
    assert.equal(deliveries[0].recipientId, user.data.user.id);
    let sent = 0;
    // Delivery requires an enabled communication app; the sender below is mocked.
    await db.collection('operations').updateOne(
      { _id: deliveries[0].workspaceId },
      {
        $push: {
          integrations: {
            id: String(new ObjectId()),
            type: 'email',
            enabled: true,
            commentNotifications: true,
          },
        },
      },
    );
    await processDelivery(db, deliveries[0]._id, async (integration, incident, delivery) => {
      sent++;
      assert.deepEqual(integration.recipients, ['user@example.com']);
      assert.equal(delivery.commentBody, 'We are investigating.');
      return {};
    });
    assert.equal(sent, 1);
    assert.equal(
      (await db.collection('deliveries').findOne({ _id: deliveries[0]._id })).status,
      'sent',
    );
    const responseDashboard = await request('/response-dashboard', responder.cookie);
    assert.equal(responseDashboard.status, 200);
    assert.equal(responseDashboard.data.severity.high, 5);
    assert.equal(responseDashboard.data.services.length, 1);
    assert.equal(responseDashboard.data.services[0].count, 5);
    assert.equal((await request('/response-dashboard', user.cookie)).status, 403);
    assert.equal((await request('/response-dashboard', other.cookie)).data.services.length, 0);

    assert.equal((await request('/search?q=x', owner.cookie)).status, 400);
    assert.equal((await request('/search?q=incident&type=invalid', owner.cookie)).status, 400);
    const ownSearch = await request('/search?q=incident', user.cookie);
    assert.equal(ownSearch.status, 200);
    assert.ok(ownSearch.data.results.every((row) => row.type === 'incidents'));
    assert.ok(!ownSearch.data.results.some((row) => row.id === privateIncident.id));
    assert.ok(ownSearch.data.results.some((row) => row.id === created.data.incident.id));
    assert.equal(
      (await request('/search?q=INTERNAL_SECRET', viewer.cookie)).data.results.length,
      0,
    );
    assert.equal(
      (await request('/search?q=Payments&type=services', other.cookie)).data.results.length,
      0,
    );
    const catalogSearch = await request('/search?q=Payments&type=services', viewer.cookie);
    assert.equal(catalogSearch.data.results[0].id, service.id);
    assert.equal(catalogSearch.data.results[0].href, `/services/${service.id}`);
    const adminPeopleSearch = await request('/search?q=example.com&type=users', owner.cookie);
    assert.equal(
      adminPeopleSearch.data.results[0].href,
      `/workspace/${adminPeopleSearch.data.results[0].id}`,
    );
    const peopleSearch = await request('/search?q=example.com&type=users', user.cookie);
    assert.equal(peopleSearch.data.results.length, 1);
    assert.equal(peopleSearch.data.results[0].id, user.data.user.id);
    assert.ok(!JSON.stringify(peopleSearch.data).includes('passwordHash'));
    assert.equal(
      (await request('/search?q=.*', owner.cookie)).data.results.length,
      0,
      'Regex syntax is literal',
    );
    const edit = await request(
      `/incidents/${created.data.incident.id}`,
      responder.cookie,
      'PATCH',
      { ...created.data.incident, note: 'EDIT_INTERNAL_SECRET' },
    );
    assert.equal(edit.status, 200);
    assert.ok(
      !JSON.stringify(
        (await request(`/incidents/${created.data.incident.id}`, user.cookie)).data,
      ).includes('EDIT_INTERNAL_SECRET'),
    );
    await db.collection('incidents').insertMany(
      Array.from({ length: 12 }, (_, index) => ({
        workspaceId: new ObjectId(owner.data.user.id),
        title: `Dashboard total ${index}`,
        severity: 'critical',
        status: 'open',
        serviceId: service.id,
        serviceName: 'Payments',
        createdAt: new Date(),
      })),
    );
    const allCounts = (await request('/response-dashboard', owner.cookie)).data;
    assert.equal(allCounts.severity.critical, 12);
    assert.equal(allCounts.incidents.length, 10);
    assert.ok(allCounts.incidents.every((row) => row.severity === 'critical'));

    for (const [kind, path] of [
      ['tasks', 'task-fields'],
      ['knowledge', 'knowledge-fields'],
    ]) {
      const form = (await request(`/${path}`, owner.cookie)).data;
      const fieldId = new ObjectId().toHexString(),
        optionId = new ObjectId().toHexString();
      const fields = form.fields.map((field) =>
        field.id === 'status'
          ? {
              ...field,
              choices: [
                ...fieldChoices(kind, field),
                {
                  value: optionId,
                  label: 'Waiting for review',
                  base: kind === 'tasks' ? 'in_progress' : 'draft',
                  hidden: false,
                },
              ],
            }
          : field,
      );
      fields.push({
        id: fieldId,
        label: 'Environment',
        type: 'select',
        required: true,
        archived: false,
        options: ['Production', 'Staging'],
        hiddenOptions: ['Staging'],
      });
      assert.equal(
        (await request(`/${path}`, viewer.cookie, 'PUT', { fields, revision: form.revision }))
          .status,
        403,
      );
      assert.equal(
        (await request(`/${path}`, owner.cookie, 'PUT', { fields, revision: form.revision }))
          .status,
        200,
      );
      const body = {
        title: 'Schema test',
        statusOption: optionId,
        custom: { [fieldId]: 'Production' },
        ...(kind === 'knowledge' ? { content: 'Runbook', knowledgeBaseId } : {}),
      };
      assert.equal(
        (
          await request(`/${kind}`, responder.cookie, 'POST', {
            ...body,
            custom: { [fieldId]: 'Staging' },
          })
        ).status,
        400,
      );
      const result = await request(`/${kind}`, responder.cookie, 'POST', body);
      assert.equal(result.status, 201, JSON.stringify(result.data));
      assert.equal(result.data.item.status, kind === 'tasks' ? 'in_progress' : 'draft');
      assert.equal(result.data.item.statusLabel, 'Waiting for review');
      assert.equal(result.data.item.custom[fieldId], 'Production');
      const updated = (await request(`/${path}`, owner.cookie)).data;
      assert.equal(
        (
          await request(`/${path}`, owner.cookie, 'PUT', {
            revision: updated.revision,
            fields: updated.fields.map((field) =>
              field.id === fieldId ? { ...field, type: 'text' } : field,
            ),
          })
        ).status,
        400,
      );
      const hidden = updated.fields.map((field) =>
        field.id === 'status'
          ? {
              ...field,
              choices: field.choices.map((option) =>
                option.value === optionId ? { ...option, hidden: true } : option,
              ),
            }
          : field,
      );
      assert.equal(
        (
          await request(`/${path}`, owner.cookie, 'PUT', {
            revision: updated.revision,
            fields: hidden,
          })
        ).status,
        400,
      );
      assert.equal((await request(`/${kind}`, responder.cookie, 'POST', body)).status, 201);
      assert.equal(
        (
          await request(`/${kind}/${result.data.item.id}`, responder.cookie, 'PATCH', {
            ...body,
            revision: 0,
          })
        ).status,
        200,
        'Saved choice may be retained',
      );
      const exportResponse = await fetch(`${base}/${kind}/export`, {
        headers: { Cookie: owner.cookie },
      });
      const exportText = await exportResponse.text();
      assert.ok(exportText.includes('Custom fields (JSON)') && exportText.includes('Production'));
      const deletePath = `/${kind}/${result.data.item.id}`;
      assert.equal((await request(deletePath, responder.cookie, 'DELETE', {})).status, 403);
      assert.equal((await request(deletePath, other.cookie, 'DELETE', {})).status, 409);
      assert.equal(
        (await request(deletePath, owner.cookie, 'DELETE', { revision: 999 })).status,
        409,
      );
      assert.equal((await request(deletePath, owner.cookie, 'DELETE', {})).status, 204);
      assert.equal((await request(deletePath, owner.cookie)).status, 404);
    }
  },
);
