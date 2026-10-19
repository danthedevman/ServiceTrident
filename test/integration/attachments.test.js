import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { connectDatabase } from '../../shared/persistence/database.js';
import { cleanupAttachments } from '../../shared/files/attachment-cleanup.js';
import { createApp } from '../../api/src/app.js';

test(
  'private uploads, article images, attachment roles, cleanup, and dashboard aggregates',
  { timeout: 30000 },
  async (t) => {
    process.env.DATABASE_SCHEMA =
      process.env.MONGODB_DB = `attachments_test_${randomUUID().replaceAll('-', '')}`;
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
        if (path === '/knowledge' && method === 'POST' && !body.knowledgeBaseId) {
        const baseRecord = await request('/knowledge-bases', cookie, 'POST', {
          title: 'Test runbooks',
        });
        if (baseRecord.status === 201) body = { ...body, knowledgeBaseId: baseRecord.data.item.id };
      }
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
        password: 'long test password for owner',
      }),
      other = await request('/auth/register', null, 'POST', {
        displayName: 'Test user',
        email: 'other@example.com',
        password: 'long test password for other',
      });
    async function invite(role) {
      const invitation = await request('/invitations', owner.cookie, 'POST', {
        email: `${role}@example.com`,
        displayName: role,
        role,
      });
      return request('/auth/invite', null, 'POST', {
        token: invitation.data.inviteUrl.split('/').at(-1),
        password: 'long invited test password',
      });
    }
    const responder = await invite('responder'),
      viewer = await invite('viewer'),
      user = await invite('user');
    async function upload(kind, cookie, name, bytes, headers = {}) {
      const response = await fetch(`${base}/attachments/${kind}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/octet-stream',
          'X-Requested-With': 'ServiceTrident',
          'X-File-Name': encodeURIComponent(name),
          ...(cookie ? { Cookie: cookie } : {}),
          ...headers,
        },
        body: bytes,
      });
      return { status: response.status, data: await response.json() };
    }
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j5xkAAAAASUVORK5CYII=',
      'base64',
    );
    assert.equal((await upload('knowledge', null, 'image.png', png)).status, 401);
    assert.equal((await upload('knowledge', viewer.cookie, 'image.png', png)).status, 403);
    assert.equal(
      (await upload('tasks', user.cookie, 'notes.txt', Buffer.from('hello'))).status,
      403,
    );
    assert.equal(
      (await upload('knowledge', owner.cookie, 'bad.svg', Buffer.from('<svg/>'))).status,
      400,
    );
    assert.equal(
      (await upload('knowledge', owner.cookie, 'fake.png', Buffer.from('<html/>'))).status,
      400,
    );
    assert.equal(
      (
        await upload('knowledge', owner.cookie, 'image.png', png, {
          Origin: 'https://evil.example',
        })
      ).status,
      403,
    );
    assert.equal(
      (await upload('knowledge', owner.cookie, 'big.txt', Buffer.alloc(5 * 1024 * 1024 + 1)))
        .status,
      413,
    );
    const uploaded = await upload('knowledge', owner.cookie, 'diagram.png', png);
    assert.equal(uploaded.status, 201, JSON.stringify(uploaded.data));
    const file = uploaded.data.attachment;
    const download = async (url, cookie) =>
      fetch(`http://127.0.0.1:${server.address().port}${url}`, {
        headers: cookie ? { Cookie: cookie } : {},
      });
    assert.equal(
      (await download(file.previewUrl, viewer.cookie)).status,
      404,
      'Draft images stay with their author',
    );
    assert.equal((await download(file.previewUrl, owner.cookie)).status, 200);
    const document = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'Safe runbook', marks: [{ type: 'bold' }] }],
        },
        { type: 'image', attrs: { src: file.previewUrl, alt: 'Diagram' } },
      ],
    };
    assert.equal(
      (
        await request('/knowledge', other.cookie, 'POST', {
          title: 'Stolen',
          contentDocument: document,
          attachmentIds: [file.id],
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await request('/knowledge', owner.cookie, 'POST', {
          title: 'Missing',
          contentDocument: document,
        })
      ).status,
      400,
    );
    const created = await request('/knowledge', owner.cookie, 'POST', {
      title: 'Image runbook',
      contentDocument: document,
      attachmentIds: [file.id],
    });
    assert.equal(created.status, 201, JSON.stringify(created.data));
    const article = created.data.item;
    assert.equal(article.content, 'Safe runbook\nDiagram');
    assert.equal(
      (await request(`/knowledge/${article.id}`, viewer.cookie)).data.item.contentDocument.type,
      'doc',
    );
    assert.equal(
      (await request('/knowledge', viewer.cookie)).data.items[0].contentDocument,
      undefined,
    );
    const preview = await download(file.previewUrl, viewer.cookie);
    assert.equal(preview.status, 200);
    assert.equal(preview.headers.get('content-type'), 'image/png');
    assert.deepEqual(Buffer.from(await preview.arrayBuffer()), png);
    assert.equal((await download(file.previewUrl, other.cookie)).status, 404);
    assert.equal((await download(file.previewUrl, user.cookie)).status, 404);
    assert.equal(
      (await request(`/attachments/knowledge/${article.id}/${file.id}`, owner.cookie, 'DELETE', {}))
        .status,
      409,
      'Cannot break an embedded image',
    );
    assert.equal(
      (
        await request(
          `/attachments/knowledge/${article.id}/${file.id}`,
          viewer.cookie,
          'DELETE',
          {},
        )
      ).status,
      403,
    );
    assert.equal(
      (
        await request('/knowledge', owner.cookie, 'POST', {
          title: 'Reuse',
          contentDocument: document,
          attachmentIds: [file.id],
        })
      ).status,
      400,
      'Files cannot be reused in another record',
    );
    const saved = await request(`/knowledge/${article.id}`, responder.cookie, 'PATCH', {
      revision: 0,
      title: 'Edited',
      contentDocument: document,
      attachmentIds: [file.id],
    });
    assert.equal(saved.status, 200, JSON.stringify(saved.data));
    const notes = (
      await upload(
        'tasks',
        responder.cookie,
        'notes.txt',
        Buffer.from('<script>literal download</script>'),
      )
    ).data.attachment;
    const task = (
      await request('/tasks', responder.cookie, 'POST', {
        title: 'Task with file',
        attachmentIds: [notes.id],
        priority: 'high',
        status: 'blocked',
      })
    ).data.item;
    const fileResponse = await download(notes.downloadUrl, viewer.cookie);
    assert.equal(fileResponse.status, 200);
    assert.equal(fileResponse.headers.get('content-type'), 'application/octet-stream');
    assert.match(fileResponse.headers.get('content-disposition'), /^attachment;/);
    assert.equal(await fileResponse.text(), '<script>literal download</script>');
    const service = (await request('/services', owner.cookie, 'POST', { name: 'API' })).data.item;
    const incident = (
      await request('/incidents', user.cookie, 'POST', {
        title: 'My issue',
        serviceId: service.id,
        severity: 'high',
      })
    ).data.incident;
    const incidentFile = (
      await upload('incidents', user.cookie, 'log.txt', Buffer.from('incident details'))
    ).data.attachment;
    assert.equal(
      (
        await request(`/attachments/incidents/${incident.id}`, user.cookie, 'POST', {
          attachmentIds: [incidentFile.id],
        })
      ).status,
      200,
    );
    assert.equal((await download(incidentFile.downloadUrl, user.cookie)).status, 200);
    assert.equal((await download(incidentFile.downloadUrl, other.cookie)).status, 404);
    const privateIncident = (
      await request('/incidents', owner.cookie, 'POST', {
        title: 'Staff only',
        serviceId: service.id,
        severity: 'low',
      })
    ).data.incident;
    assert.equal(
      (await request(`/attachments/incidents/${privateIncident.id}`, user.cookie)).status,
      404,
    );
    assert.equal(
      (await request(`/attachments/tasks/${task.id}`, viewer.cookie, 'POST', { attachmentIds: [] }))
        .status,
      403,
    );
    const extra = (await upload('tasks', responder.cookie, 'extra.csv', Buffer.from('a,b\n1,2')))
      .data.attachment;
    assert.equal(
      (
        await request(`/attachments/tasks/${task.id}`, responder.cookie, 'POST', {
          attachmentIds: [extra.id],
        })
      ).status,
      200,
    );
    assert.equal(
      (await request(`/attachments/tasks/${task.id}`, viewer.cookie)).data.attachments.length,
      2,
    );
    assert.equal(
      (await request(`/attachments/tasks/${task.id}/${extra.id}`, responder.cookie, 'DELETE', {}))
        .status,
      204,
    );
    assert.equal((await download(extra.downloadUrl, responder.cookie)).status, 404);
    const abandoned = (
      await upload('tasks', responder.cookie, 'abandoned.txt', Buffer.from('unused'))
    ).data.attachment;
    const old = new Date(Date.now() - 2 * 86400000);
    await db.collection('attachments').updateMany({}, { $set: { lastLinkedAt: old } });
    await cleanupAttachments(db);
    assert.equal(await db.collection('attachments').countDocuments({ recordId: null }), 0);
    assert.equal(
      (await download(file.previewUrl, viewer.cookie)).status,
      200,
      'Referenced images survive cleanup',
    );
    assert.equal((await download(abandoned.downloadUrl, responder.cookie)).status, 404);
    const dashboard = (await request('/response-dashboard', owner.cookie)).data;
    assert.equal(dashboard.taskPriority.high, 1);
    assert.equal(dashboard.taskStatus.blocked, 1);
    assert.equal(dashboard.incidentStatus.open, 2);
  },
);
