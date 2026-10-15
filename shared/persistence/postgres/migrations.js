export const tables = [
  'recordCounters',
  'recordIdentities',
  'serviceAccounts',
  'serviceAccessTokens',
  'identityProviders',
  'identityTransactions',
  'identityLinks',
  'statusSubscribers',
  'publicStatusUpdates',
  'publicStatusState',
  'statusMail',
  'auditEvents',
  'users',
  'sessions',
  'invitations',
  'catalogs',
  'operations',
  'monitors',
  'events',
  'statusDaily',
  'statusIcons',
  'incidents',
  'incidentComments',
  'tasks',
  'rcas',
  'articles',
  'knowledgeBases',
  'attachments',
  'deliveries',
  'demoData',
  'contactTokens',
  'marketingInquiries',
];

/** Identifiers come only from validated configuration or this fixed table list. */
export function identifier(value) {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]{0,62}$/.test(value)) throw new Error('Invalid database identifier');
  return `"${value}"`;
}

/** Versioned, transactionally serialized schema setup shared by every application process. */
export async function migrate(pool, schema) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
      `servicetrident:migrate:${schema}`,
    ]);
    await client.query(`CREATE SCHEMA IF NOT EXISTS ${identifier(schema)}`);
    await client.query(
      'CREATE TABLE IF NOT EXISTS sk_migrations (version integer PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())',
    );
    const { rows } = await client.query('SELECT version FROM sk_migrations WHERE version=1');
    if (!rows.length) {
      await client.query(
        `CREATE FUNCTION sk_scalar(v jsonb) RETURNS jsonb LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$ SELECT COALESCE(v->'$date', v->'$oid', v) $$`,
      );
      await client.query(`CREATE FUNCTION sk_values(v jsonb, path text[]) RETURNS SETOF jsonb LANGUAGE plpgsql IMMUTABLE PARALLEL SAFE AS $$
        DECLARE element jsonb;
        BEGIN
          IF v IS NULL THEN RETURN; END IF;
          IF cardinality(path)=0 THEN
            RETURN NEXT v;
            IF jsonb_typeof(v)='array' THEN RETURN QUERY SELECT value FROM jsonb_array_elements(v); END IF;
          ELSIF jsonb_typeof(v)='array' THEN
            FOR element IN SELECT value FROM jsonb_array_elements(v) LOOP RETURN QUERY SELECT * FROM sk_values(element,path); END LOOP;
          ELSE RETURN QUERY SELECT * FROM sk_values(v->path[1],path[2:]); END IF;
        END $$`);
      for (const name of tables)
        await client.query(
          `CREATE TABLE ${identifier(name)} (id text PRIMARY KEY, data jsonb NOT NULL)`,
        );
      await client.query(
        'CREATE TABLE sk_expiration (name text PRIMARY KEY, field text NOT NULL, seconds integer NOT NULL)',
      );
      await client.query('INSERT INTO sk_migrations(version) VALUES (1)');
    }
    await client.query(
      'CREATE TABLE IF NOT EXISTS "auditEvents" (id text PRIMARY KEY, data jsonb NOT NULL)',
    );
    await client.query('INSERT INTO sk_migrations(version) VALUES (2) ON CONFLICT DO NOTHING');
    for (const name of [
      'statusSubscribers',
      'publicStatusUpdates',
      'publicStatusState',
      'statusMail',
    ])
      await client.query(
        `CREATE TABLE IF NOT EXISTS ${identifier(name)} (id text PRIMARY KEY, data jsonb NOT NULL)`,
      );
    await client.query('INSERT INTO sk_migrations(version) VALUES (3) ON CONFLICT DO NOTHING');
    await client.query(
      'CREATE TABLE IF NOT EXISTS "knowledgeBases" (id text PRIMARY KEY, data jsonb NOT NULL)',
    );
    await client.query('INSERT INTO sk_migrations(version) VALUES (4) ON CONFLICT DO NOTHING');
    for (const name of ['identityProviders', 'identityTransactions', 'identityLinks'])
      await client.query(
        `CREATE TABLE IF NOT EXISTS ${identifier(name)} (id text PRIMARY KEY, data jsonb NOT NULL)`,
      );
    await client.query('INSERT INTO sk_migrations(version) VALUES (5) ON CONFLICT DO NOTHING');
    for (const name of ['serviceAccounts', 'serviceAccessTokens'])
      await client.query(
        `CREATE TABLE IF NOT EXISTS ${identifier(name)} (id text PRIMARY KEY, data jsonb NOT NULL)`,
      );
    await client.query('INSERT INTO sk_migrations(version) VALUES (6) ON CONFLICT DO NOTHING');
    for (const name of ['recordCounters', 'recordIdentities'])
      await client.query(
        `CREATE TABLE IF NOT EXISTS ${identifier(name)} (id text PRIMARY KEY, data jsonb NOT NULL)`,
      );
    await client.query('INSERT INTO sk_migrations(version) VALUES (7) ON CONFLICT DO NOTHING');
    await client.query(
      'CREATE TABLE IF NOT EXISTS "rcas" (id text PRIMARY KEY, data jsonb NOT NULL)',
    );
    await client.query('INSERT INTO sk_migrations(version) VALUES (8) ON CONFLICT DO NOTHING');
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
