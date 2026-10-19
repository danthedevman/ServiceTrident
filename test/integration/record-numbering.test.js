import { databaseTable, tableQuery, embeddedTable } from '../../api/src/repositories/table-page.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { ObjectId } from 'mongodb';
import { connectDatabase } from '../../shared/persistence/database.js';

test('workspace record numbers are unique, stable, separate by kind and expand past seven digits', async (t) => {
  process.env.DATABASE_SCHEMA =
    process.env.MONGODB_DB = `numbering_test_${randomUUID().replaceAll('-', '')}`;
  const { db, client } = await connectDatabase();
  t.after(async () => {
    await db.dropDatabase();
    await client.close();
  });
  const workspaceId = new ObjectId();
  const rows = Array.from({ length: 24 }, () => ({
    _id: new ObjectId(),
    workspaceId,
    title: 'Synthetic incident',
  }));
  await Promise.all(rows.map((row) => db.collection('incidents').insertOne(row)));
  assert.equal(new Set(rows.map((row) => row.number)).size, 24);
  assert.ok(rows.every((row) => /^INC\d{7}$/.test(row.number)));
  assert.equal(
    (await db.collection('incidents').findOne({ _id: rows[0]._id })).number,
    rows[0].number,
  );
  const table = databaseTable(db, 'incidents', { workspaceId }, { title: 'title' }, (row) => row);
  for (const order of ['asc', 'desc']) {
    const query = tableQuery({ sortBy: 'number', order, pageSize: '10', page: '2' }, table.fields);
    const result = await table.read(query);
    const values = await result.cursor.toArray();
    const expected = rows.map((row) => row.number).sort();
    if (order === 'desc') expected.reverse();
    assert.deepEqual(
      values.map((row) => row.number),
      expected.slice(10, 20),
    );
    assert.equal(result.total, 24);
  }
  const empty = embeddedTable([], ['name']);
  assert.equal((await empty.read(tableQuery({ sortBy: 'number' }, empty.fields))).total, 0);
  const task = { _id: new ObjectId(), workspaceId, title: 'Synthetic task' };
  await db.collection('tasks').insertOne(task);
  assert.equal(task.number, 'TASK0000001');
  const outside = { _id: new ObjectId(), workspaceId: new ObjectId(), title: 'Separate workspace' };
  await db.collection('incidents').insertOne(outside);
  assert.equal(outside.number, 'INC0000001');
  await db
    .collection('recordCounters')
    .insertOne({ _id: `${workspaceId}:monitors`, sequence: 9999999 });
  const monitor = { _id: new ObjectId(), userId: workspaceId };
  await db.collection('monitors').insertOne(monitor);
  assert.equal(monitor.number, 'MON10000000');
  await db.collection('catalogs').insertOne({
    _id: workspaceId,
    services: [{ id: String(new ObjectId()), name: 'Synthetic service' }],
    collections: [],
  });
  const first = await db.collection('catalogs').findOne({ _id: workspaceId });
  const second = await db.collection('catalogs').findOne({ _id: workspaceId });
  assert.equal(first.services[0].number, 'SVC0000001');
  assert.equal(second.services[0].number, first.services[0].number);
});
