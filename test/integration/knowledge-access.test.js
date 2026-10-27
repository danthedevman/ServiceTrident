import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { ObjectId } from 'mongodb';
import { connectDatabase } from '../../shared/persistence/database.js';
import { createApp } from '../../api/src/app.js';

test(
  'knowledge base access protects lists, direct records, references, search and writes',
  { timeout: 60000 },
  async (t) => {
    process.env.DATABASE_SCHEMA =
      process.env.MONGODB_DB = `knowledge_access_test_${randomUUID().replaceAll('-', '')}`;
    const { db, client } = await connectDatabase();
    const server = createApp(db).listen(0, '0.0.0.0');
    await new Promise((resolve) => server.once('listening', resolve));
    t.after(async () => {
      await new Promise((resolve) => server.close(resolve));
      await db.dropDatabase();
      await client.close();
    });
    async function request(path, cookie, method = 'GET', body) {
      const response = await fetch(`http://127.0.0.1:${server.address().port}/api${path}`, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'X-Requested-With': 'ServiceTrident',
          ...(cookie ? { Cookie: cookie } : {}),
        },
        body: body === undefined && method !== 'DELETE' ? undefined : JSON.stringify(body ?? {}),
      });
      return {
        status: response.status,
        data:
          response.status === 204
            ? null
            : response.headers.get('content-type')?.includes('application/json')
              ? await response.json()
              : await response.text(),
        cookie: response.headers.get('set-cookie')?.split(';')[0],
      };
    }
    async function register(email) {
      return (
        await request('/auth/register', null, 'POST', {
          displayName: 'Synthetic tester',
          email,
          password: 'isolated synthetic test password',
        })
      ).cookie;
    }
    const owner = await register('owner@example.invalid'),
      reader = await register('reader@example.invalid'),
      denied = await register('denied@example.invalid'),
      foreign = await register('foreign@example.invalid');
    const ownerUser = await db.collection('users').findOne({ email: 'owner@example.invalid' });
    const readerUser = await db.collection('users').findOne({ email: 'reader@example.invalid' });
    const deniedUser = await db.collection('users').findOne({ email: 'denied@example.invalid' });
    for (const user of [readerUser, deniedUser])
      await db
        .collection('users')
        .updateOne({ _id: user._id }, { $set: { workspaceId: ownerUser._id, role: 'responder' } });
    const created = await request('/knowledge-bases', owner, 'POST', {
      title: 'Restricted Handbook',
      description: 'Synthetic only',
      managerUserIds: [String(ownerUser._id)],
      viewerUserIds: [String(readerUser._id)],
    });
    assert.equal(created.status, 201);
    const base = created.data.item;
    const articleResult = await request('/knowledge', owner, 'POST', {
      title: 'Restricted procedure',
      knowledgeBaseId: base.id,
      content: 'Synthetic procedure',
      summary: 'Synthetic only',
      status: 'published',
    });
    assert.equal(articleResult.status, 201);
    const article = articleResult.data.item;
    assert.equal((await request(`/knowledge-bases/${base.id}`, reader)).data.item.canManage, false);
    assert.equal((await request(`/knowledge/${article.id}`, reader)).status, 200);
    assert.equal((await request(`/knowledge/${article.id}`, denied)).status, 404);
    assert.equal((await request(`/knowledge/${article.id}`, foreign)).status, 404);
    assert.equal((await request(`/knowledge-bases/${base.id}`, denied)).status, 404);
    assert.equal((await request('/knowledge-bases', denied)).data.total, 0);
    assert.equal((await request('/knowledge', denied)).data.total, 0);
    assert.equal(
      (await request('/knowledge/export', denied)).data.includes('Restricted procedure'),
      false,
    );
    const fileId = new ObjectId();
    await db.collection('attachments').insertOne({
      _id: fileId,
      workspaceId: ownerUser._id,
      kind: 'knowledge',
      recordId: article.id,
      name: 'synthetic.txt',
      size: 9,
      mime: 'text/plain',
      data: Buffer.from('synthetic'),
      createdAt: new Date(),
    });
    await db
      .collection('articles')
      .updateOne({ _id: new ObjectId(article.id) }, { $set: { attachmentIds: [String(fileId)] } });
    assert.equal((await request(`/attachments/knowledge/${article.id}`, denied)).status, 404);
    assert.equal((await request(`/attachments/files/${fileId}/download`, denied)).status, 404);
    assert.equal((await request(`/attachments/files/${fileId}/download`, reader)).status, 200);
    assert.equal((await request('/references/knowledge', denied)).data.options.length, 0);
    assert.equal((await request('/references/knowledgeBases', denied)).data.options.length, 0);
    const search = await request('/search?q=Restricted&type=knowledge', denied);
    assert.equal(JSON.stringify(search.data).includes('Restricted procedure'), false);
    assert.equal(
      (
        await request(`/knowledge-bases/${base.id}`, reader, 'PATCH', {
          title: 'Override',
          revision: base.revision,
        })
      ).status,
      404,
    );
    assert.equal(
      (
        await request(`/knowledge/${article.id}`, reader, 'PATCH', {
          title: 'Override',
          revision: article.revision,
        })
      ).status,
      404,
    );
    const incidentId = new ObjectId();
    await db
      .collection('incidents')
      .insertOne({
        _id: incidentId,
        workspaceId: ownerUser._id,
        title: 'Synthetic incident',
        status: 'open',
        knowledgeIds: [],
        revision: 0,
        timeline: [],
      });
    const linkPath = `/incidents/${incidentId}/articles`;
    assert.equal(
      (await request(linkPath, denied, 'PATCH', { knowledgeIds: [article.id], revision: 0 }))
        .status,
      400,
    );
    assert.equal(
      (await request(linkPath, foreign, 'PATCH', { knowledgeIds: [], revision: 0 })).status,
      404,
    );
    const linked = await request(linkPath, reader, 'PATCH', {
      knowledgeIds: [article.id],
      revision: 0,
    });
    assert.equal(linked.status, 200);
    assert.deepEqual(linked.data.knowledgeIds, [article.id]);
    assert.equal(
      (await request(linkPath, reader, 'PATCH', { knowledgeIds: [], revision: 0 })).status,
      409,
    );
    assert.equal(
      (
        await request(linkPath, owner, 'PATCH', {
          knowledgeIds: [],
          revision: 1,
          status: 'resolved',
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await request(linkPath, owner, 'PATCH', {
          knowledgeIds: [article.id, article.id],
          revision: 1,
        })
      ).status,
      400,
    );
    const retained = await request(linkPath, denied, 'PATCH', { knowledgeIds: [], revision: 1 });
    assert.equal(retained.status, 200);
    assert.deepEqual(
      retained.data.knowledgeIds,
      [article.id],
      'An inaccessible existing relationship cannot be silently removed',
    );
    assert.equal((await db.collection('incidents').findOne({ _id: incidentId })).status, 'open');
    await db.collection('users').updateOne({ _id: deniedUser._id }, { $set: { role: 'user' } });
    assert.equal(
      (await request(linkPath, denied, 'PATCH', { knowledgeIds: [], revision: 2 })).status,
      403,
    );
    await db
      .collection('users')
      .updateOne({ _id: deniedUser._id }, { $set: { role: 'responder' } });
    assert.equal(
      (await request(linkPath, owner, 'PATCH', { knowledgeIds: [], revision: 2 })).status,
      200,
    );
    const groupId = new ObjectId().toString();
    await db.collection('operations').updateOne(
      { _id: ownerUser._id },
      {
        $push: {
          groups: {
            id: groupId,
            name: 'Synthetic Editors',
            memberIds: [String(readerUser._id)],
          },
        },
      },
    );
    const changed = await request(`/knowledge-bases/${base.id}`, owner, 'PATCH', {
      title: base.title,
      description: base.description,
      revision: base.revision,
      managerUserIds: [],
      managerGroupIds: [groupId],
      viewerUserIds: [],
      viewerGroupIds: [groupId],
    });
    assert.equal(changed.status, 200);
    assert.equal((await request(`/knowledge-bases/${base.id}`, reader)).data.item.canManage, true);
    assert.equal((await request(`/knowledge-bases/${base.id}`, denied)).status, 404);
    const updated = await request(`/knowledge-bases/${base.id}`, reader, 'PATCH', {
      title: 'Updated Handbook',
      description: '',
      revision: changed.data.item.revision,
    });
    assert.equal(updated.status, 200);
    assert.equal(
      (
        await request(`/knowledge-bases/${base.id}`, owner, 'PATCH', {
          title: 'Invalid',
          revision: updated.data.item.revision,
          viewerUserIds: [
            (
              await db.collection('users').findOne({ email: 'foreign@example.invalid' })
            )._id.toString(),
          ],
        })
      ).status,
      400,
    );
    // Removing group membership immediately revokes read and manage access on the next request.
    await db
      .collection('operations')
      .updateOne({ _id: ownerUser._id }, { $set: { 'groups.0.memberIds': [] } });
    assert.equal((await request(`/knowledge/${article.id}`, reader)).status, 404);
  },
);
