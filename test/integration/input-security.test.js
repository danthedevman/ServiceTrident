import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, randomBytes } from 'node:crypto';
import { connectDatabase } from '../../shared/persistence/database.js';
import { createApp } from '../../api/src/app.js';
test('malformed input fails safely while valid literal content round-trips within its workspace', async (t) => {
  process.env.DATABASE_SCHEMA =
    process.env.MONGODB_DB = `input_test_${randomUUID().replaceAll('-', '')}`;
  const { db, client } = await connectDatabase();
  const server = createApp(db).listen(0, '0.0.0.0');
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await db.dropDatabase();
    await client.close();
  });
  const base = `http://127.0.0.1:${server.address().port}/api`;
  async function request(path, cookie, raw, extra = {}) {
    const response = await fetch(base + path, {
      method: raw === undefined ? 'GET' : 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Requested-With': 'ServiceTrident',
        ...(cookie ? { Cookie: cookie } : {}),
        ...extra,
      },
      ...(raw === undefined ? {} : { body: typeof raw === 'string' ? raw : JSON.stringify(raw) }),
    });
    return {
      status: response.status,
      data: await response.json(),
      cookie: response.headers.get('set-cookie')?.split(';')[0],
    };
  }
  const owner = await request('/auth/register', null, {
    email: 'owner@input.example',
    password: randomBytes(24).toString('hex'),
    displayName: 'Synthetic owner',
  });
  assert.equal(owner.status, 201);
  assert.equal(
    (await request('/services', owner.cookie, '{"name":"bad","constructor":{"polluted":true}}'))
      .status,
    400,
  );
  assert.equal((await request('/services', owner.cookie, { name: 'bad\u0000name' })).status, 400);
  assert.equal((await request('/services?search=a&search=b', owner.cookie)).status, 400);
  for (const type of ['__proto__', 'constructor', 'toString'])
    assert.equal((await request(`/references/${type}`, owner.cookie)).status, 404);
  assert.equal(
    (
      await request('/auth/register', null, {
        email: 'bad\u0000@example.test',
        password: randomBytes(24).toString('hex'),
        displayName: 'Test',
      })
    ).status,
    400,
  );
  const literal = '<img src=x onerror=alert(1)>\nRésumé 日本語';
  const saved = await request('/services', owner.cookie, {
    name: 'Literal content',
    description: literal,
  });
  assert.equal(saved.status, 201);
  assert.equal(saved.data.item.description, literal);
  const rejectedOrigin = await request(
    '/services',
    owner.cookie,
    { name: 'No' },
    { Origin: 'https://user:PRIVATE_ORIGIN_VALUE@invalid.example' },
  );
  assert.equal(rejectedOrigin.status, 403);
  assert.ok(!JSON.stringify(rejectedOrigin.data).includes('PRIVATE_ORIGIN_VALUE'));
  assert.ok(
    !(await request('/services', owner.cookie)).data.services.some((row) =>
      row.name.includes('\u0000'),
    ),
  );
  assert.ok(
    !JSON.stringify(await db.collection('auditEvents').find({}).toArray()).includes(
      'PRIVATE_ORIGIN_VALUE',
    ),
  );
});
