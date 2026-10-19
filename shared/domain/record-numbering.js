import { ObjectId } from 'mongodb';

export const RECORD_PREFIXES = {
  incidents: 'INC',
  events: 'EVT',
  eventAlerts: 'ALT',
  tasks: 'TASK',
  projects: 'PRJ',
  projectMilestones: 'MS',
  rcas: 'RCA',
  articles: 'KB',
  knowledgeBases: 'KBASE',
  monitors: 'MON',
  users: 'USR',
  services: 'SVC',
  collections: 'COL',
  groups: 'GRP',
  shifts: 'OC',
  integrations: 'INT',
  serviceAccounts: 'REC',
};
const direct = new Set([
  'incidents',
  'events',
  'eventAlerts',
  'tasks',
  'projectMilestones',
  'rcas',
  'articles',
  'knowledgeBases',
  'monitors',
  'users',
  'serviceAccounts',
]);
const embedded = {
  catalogs: ['services', 'collections'],
  operations: ['groups', 'shifts', 'integrations', 'projects'],
};

/** Stable identities are server-owned, workspace-scoped and independent of record content. */
export function numberedDatabase(raw) {
  const cache = new Map(),
    ready = new Set(),
    repositories = new Map();
  async function number(workspaceId, kind, recordId) {
    const identity = `${workspaceId}:${kind}:${recordId}`;
    if (cache.has(identity)) return cache.get(identity);
    const identities = raw.collection('recordIdentities');
    let saved = await identities.findOne({ _id: identity });
    if (!saved) {
      const counterId = `${workspaceId}:${kind}`,
        counters = raw.collection('recordCounters');
      if (!ready.has(counterId)) {
        try {
          await counters.insertOne({ _id: counterId, sequence: 0 });
        } catch (error) {
          if (error.code !== 11000) throw error;
        }
        if (ready.size >= 5000) ready.clear();
        ready.add(counterId);
      }
      const counter = await counters.findOneAndUpdate(
        { _id: counterId, sequence: { $lt: Number.MAX_SAFE_INTEGER } },
        { $inc: { sequence: 1 } },
        { returnDocument: 'after' },
      );
      if (!counter) throw new Error('Record number capacity exceeded');
      const assigned = `${RECORD_PREFIXES[kind]}${String(counter.sequence).padStart(7, '0')}`;
      saved = { _id: identity, workspaceId, kind, recordId: String(recordId), number: assigned };
      try {
        await identities.insertOne(saved);
        await raw.collection('auditEvents').insertOne({
          workspaceId,
          createdAt: new Date(),
          actor: 'System',
          actualRole: 'system',
          effectiveRole: 'system',
          source: 'worker',
          action: 'number_assigned',
          recordType: kind,
          recordId: String(recordId),
          operation: 'Assign sequential record number',
          fields: 'number',
          outcome: 'success',
          statusCode: 200,
        });
      } catch (error) {
        if (error.code !== 11000) throw error;
        saved = await identities.findOne({ _id: identity });
      }
    }
    if (cache.size >= 5000) cache.delete(cache.keys().next().value);
    cache.set(identity, saved.number);
    return saved.number;
  }
  async function enrich(name, row, write = false) {
    if (!row || !row._id || !/^[a-f\d]{24}$/i.test(String(row._id))) return row;
    if (direct.has(name)) {
      if (
        !write &&
        typeof row.number === 'string' &&
        new RegExp(`^${RECORD_PREFIXES[name]}\\d{7,}$`).test(row.number)
      )
        return row;
      const full =
        row.workspaceId || row.userId
          ? row
          : await raw
              .collection(name)
              .findOne({ _id: row._id }, { projection: { workspaceId: 1, userId: 1, number: 1 } });
      if (!full) return row;
      const scope = full.workspaceId || full.userId || (name === 'users' ? row._id : null);
      if (!scope) return row;
      row.number = full.number && !write ? full.number : await number(scope, name, row._id);
      if (!write && !full.number)
        await raw
          .collection(name)
          .updateOne(
            { _id: row._id, number: { $exists: false } },
            { $set: { number: row.number } },
          );
    }
    for (const key of embedded[name] || [])
      for (const item of row[key] || [])
        if (item.id) item.number = await number(row._id, key, item.id);
    return row;
  }
  function cursor(name, source) {
    let proxy;
    proxy = new Proxy(source, {
      get(target, key) {
        if (key === 'toArray')
          return async () => {
            const rows = await target.toArray();
            for (const row of rows) await enrich(name, row);
            return rows;
          };
        if (key === Symbol.asyncIterator)
          return async function* () {
            for await (const row of target) yield await enrich(name, row);
          };
        const value = target[key];
        return typeof value === 'function'
          ? (...args) => {
              const result = value.apply(target, args);
              return result === target ? proxy : result;
            }
          : value;
      },
    });
    return proxy;
  }
  return new Proxy(raw, {
    get(target, key) {
      if (key !== 'collection') {
        const value = target[key];
        return typeof value === 'function' ? value.bind(target) : value;
      }
      return (name) => {
        if (!direct.has(name) && !embedded[name]) return target.collection(name);
        if (!repositories.has(name)) {
          const repository = target.collection(name);
          repositories.set(
            name,
            new Proxy(repository, {
              get(repo, method) {
                if (method === 'updateOne' && embedded[name])
                  return async (filter, update, ...args) => {
                    if (!Array.isArray(update) && update.$set && filter._id)
                      await enrich(name, { _id: filter._id, ...update.$set });
                    return repo.updateOne(filter, update, ...args);
                  };
                if (method === 'insertOne' || method === 'insertMany')
                  return async (input, ...args) => {
                    for (const row of method === 'insertMany' ? input : [input]) {
                      row._id ??= new ObjectId();
                      await enrich(name, row, true);
                    }
                    return repo[method](input, ...args);
                  };
                if (method === 'findOne' || method === 'findOneAndUpdate')
                  return async (...args) => enrich(name, await repo[method](...args));
                if (method === 'find') return (...args) => cursor(name, repo[method](...args));
                const value = repo[method];
                return typeof value === 'function' ? value.bind(repo) : value;
              },
            }),
          );
        }
        return repositories.get(name);
      };
    },
  });
}
