import { numberedDatabase } from '../domain/record-numbering.js';
import { connectMongo } from './mongodb/connection.js';
import { initializeDatabase } from './indexes.js';

/** Open the deployment-selected persistence backend with the same record contract. */
export async function connectDatabase() {
  const provider = process.env.DATABASE_PROVIDER || 'mongodb';
  if (!['mongodb', 'postgres'].includes(provider))
    throw new Error('DATABASE_PROVIDER must be mongodb or postgres');
  const connection =
    provider === 'mongodb'
      ? await connectMongo()
      : await (await import('./postgres/connection.js')).connectPostgres();
  try {
    if (connection.db.pool) {
      const lock = await connection.db.pool.connect();
      try {
        await lock.query("SELECT pg_advisory_lock(hashtext('servicetrident:indexes'))");
        await initializeDatabase(connection.db);
      } finally {
        await lock.query("SELECT pg_advisory_unlock(hashtext('servicetrident:indexes'))");
        lock.release();
      }
    } else await initializeDatabase(connection.db);
    if (connection.db.cleanupExpired) {
      const timer = setInterval(
        () =>
          connection.db
            .cleanupExpired()
            .catch(() => console.error('Database retention cleanup failed')),
        60000,
      );
      timer.unref();
      const close = connection.client.close;
      connection.client.close = async () => {
        clearInterval(timer);
        await close();
      };
    }
    connection.db = numberedDatabase(connection.db);
    return connection;
  } catch (error) {
    await connection.client.close();
    throw error;
  }
}
