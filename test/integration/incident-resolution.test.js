import { ObjectId } from 'mongodb';
import { reconcileOperations } from '../../workers/src/notifications/reconcile.js';
import { processDelivery } from '../../workers/src/notifications/delivery.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { connectDatabase } from '../../shared/persistence/database.js';
import { createApp } from '../../api/src/app.js';

test('resolution enforces configurable notes and mandatory fields; knowledge links stay workspace-scoped', async (t) => {
  process.env.DATABASE_SCHEMA =
    process.env.MONGODB_DB = `resolution_${randomUUID().replaceAll('-', '')}`;
  const { db, client } = await connectDatabase();
  const server = createApp(db).listen(0, '0.0.0.0');
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await db.dropDatabase();
    await client.close();
  });
  const base = `http://127.0.0.1:${server.address().port}/api`;
  async function request(path, cookie, method = 'GET', body) {
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
      data: await response.json(),
      cookie: response.headers.get('set-cookie')?.split(';')[0],
    };
  }
  const owner = (
    await request('/auth/register', null, 'POST', {
      displayName: 'Owner',
      email: 'owner@example.com',
      password: 'long unique resolution password',
    })
  ).cookie;
  const other = (
    await request('/auth/register', null, 'POST', {
      displayName: 'Other',
      email: 'other@example.com',
      password: 'long unique resolution password',
    })
  ).cookie;
  const service = (await request('/services', owner, 'POST', { name: 'Checkout' })).data.item;
  const article = (
    await request('/knowledge', owner, 'POST', {
      title: 'Recovery runbook',
      content: 'Verify connection capacity.',
      status: 'published',
    })
  ).data.item;
  const privateArticle = (
    await request('/knowledge', other, 'POST', {
      title: 'Other tenant',
      content: 'Private instructions.',
    })
  ).data.item;
  const input = {
    title: 'Checkout unavailable',
    serviceId: service.id,
    severity: 'high',
    knowledgeIds: [article.id],
  };
  const created = await request('/incidents', owner, 'POST', input);
  assert.equal(created.status, 201, JSON.stringify(created.data));
  const incident = created.data.incident;
  assert.equal(
    (await request(`/incidents/${incident.id}`, owner)).data.knowledge[0].id,
    article.id,
  );
  assert.equal((await request(`/incidents/${incident.id}`, other)).status, 404);
  assert.equal(
    (
      await request(`/incidents/${incident.id}`, owner, 'PATCH', {
        revision: 0,
        knowledgeIds: [privateArticle.id],
      })
    ).status,
    400,
  );
  const originalSchema = (await request('/incident-fields', owner)).data;
  assert.equal(
    originalSchema.fields.find((field) => field.id === 'resolutionNotes').required,
    false,
  );
  assert.equal(
    (
      await request('/incident-fields', owner, 'PUT', {
        ...originalSchema,
        fields: originalSchema.fields.map((field) =>
          field.id === 'resolutionNotes' ? { ...field, required: true } : field,
        ),
      })
    ).status,
    200,
  );
  const missing = await request(`/incidents/${incident.id}`, owner, 'PATCH', {
    revision: 0,
    status: 'resolved',
    resolutionNotes: '  ',
  });
  assert.equal(missing.status, 400);
  assert.equal(missing.data.fields.resolutionNotes, 'Resolution notes is required.');
  const resolved = await request(`/incidents/${incident.id}`, owner, 'PATCH', {
    revision: 0,
    status: 'resolved',
    resolutionNotes: 'Restored connection capacity and verified checkout.',
  });
  assert.equal(resolved.status, 200, JSON.stringify(resolved.data));
  assert.equal(resolved.data.incident.status, 'resolved');
  assert.ok(resolved.data.incident.resolvedAt);
  assert.equal(
    (
      await request(`/incidents/${incident.id}`, owner, 'PATCH', {
        revision: 0,
        status: 'resolved',
        resolutionNotes: 'Stale update',
      })
    ).status,
    409,
  );
  const reopened = await request(`/incidents/${incident.id}`, owner, 'PATCH', {
    revision: 1,
    status: 'open',
  });
  assert.equal(reopened.status, 200);
  assert.equal(reopened.data.incident.status, 'open');
  assert.equal(reopened.data.incident.resolvedAt, null);
  assert.ok(reopened.data.incident.reopenedAt);
  assert.equal(reopened.data.incident.resolutionNotes, resolved.data.incident.resolutionNotes);
  assert.equal(reopened.data.incident.resolutionCycle, 1);
  assert.equal(reopened.data.incident.timeline.at(-1).note, 'Incident reopened');
  assert.equal(
    reopened.data.incident.timeline.at(-1).previousResolutionNotes,
    resolved.data.incident.resolutionNotes,
  );
  const again = await request(`/incidents/${incident.id}`, owner, 'PATCH', {
    revision: 2,
    status: 'resolved',
    resolutionNotes: 'Confirmed the follow-up fix.',
  });
  assert.equal(again.status, 200);
  assert.ok(
    new Date(again.data.incident.resolvedAt) >= new Date(reopened.data.incident.reopenedAt),
  );
  const stored = await db.collection('incidents').findOne({ _id: new ObjectId(incident.id) });
  const integrationId = new ObjectId().toHexString();
  await db.collection('operations').updateOne(
    { _id: stored.workspaceId },
    {
      $push: {
        integrations: {
          id: integrationId,
          name: 'Test email',
          type: 'email',
          enabled: true,
          recovery: true,
          serviceIds: [],
        },
      },
    },
  );
  const queue = { add: async () => {} };
  await reconcileOperations(db, queue);
  const oldRecovery = await db
    .collection('deliveries')
    .findOne({ incidentId: stored._id, event: 'recovered', resolutionCycle: 1 });
  assert.ok(oldRecovery);
  const secondReopen = await request(`/incidents/${incident.id}`, owner, 'PATCH', {
    revision: 3,
    status: 'open',
  });
  assert.equal(secondReopen.status, 200);
  await processDelivery(db, oldRecovery._id, async () => {
    assert.fail('Obsolete recovery must not be sent');
  });
  assert.equal(
    (await db.collection('deliveries').findOne({ _id: oldRecovery._id })).status,
    'skipped',
  );
  await reconcileOperations(db, queue);
  assert.equal(
    await db
      .collection('deliveries')
      .countDocuments({ incidentId: stored._id, event: 'impacted', resolutionCycle: 2 }),
    1,
  );
  const mandatorySchema = (await request('/incident-fields', owner)).data;
  assert.equal(
    (
      await request('/incident-fields', owner, 'PUT', {
        ...mandatorySchema,
        fields: mandatorySchema.fields.map((field) =>
          field.id === 'resolutionNotes' ? { ...field, required: false } : field,
        ),
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await request(`/incidents/${incident.id}`, owner, 'PATCH', {
        revision: secondReopen.data.incident.revision,
        status: 'resolved',
        resolutionNotes: '',
      })
    ).status,
    200,
  );
  for (const path of ['/incident-fields', '/task-fields', '/knowledge-fields']) {
    const schema = (await request(path, owner)).data;
    const rejected = await request(path, owner, 'PUT', {
      ...schema,
      fields: schema.fields.map((field, index) =>
        index ? field : { ...field, required: !field.required },
      ),
    });
    assert.equal(rejected.status, 400);
    assert.deepEqual((await request(path, owner)).data.fields, schema.fields);
    assert.equal((await request(path, owner, 'PUT', schema)).status, 200);
  }
});
