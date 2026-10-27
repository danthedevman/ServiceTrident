import { createHash, randomUUID } from 'node:crypto';
import { ObjectId } from 'mongodb';
import { InputError } from '@servicetrident/shared/validation/validation';
import { seal, unseal } from '@servicetrident/shared/integrations/secrets';
import { articleAccess } from '../domain/knowledge-access.js';
import { incidentAccess } from '../domain/incidents.js';

const validId = (id) =>
  typeof id === 'string' && /^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i.test(id);
const identity = (req) => ({
  _id: createHash('sha256').update(`${req.workspaceId}:${req.user._id}:${req.role}`).digest('hex'),
  workspaceId: req.workspaceId,
  actorId: req.user._id,
  role: req.role,
});
// One encrypted, bounded vault per identity prevents cross-user reads and unbounded history growth.
export async function conversationVault(db, req) {
  const owner = identity(req);
  const row = await db.collection('aiConversations').findOne(owner);
  return {
    owner,
    revision: row?.revision ?? null,
    entries: row ? unseal(row.payload).entries : [],
  };
}
async function store(db, vault, entries) {
  // Bound ciphertext size below MongoDB's document ceiling even with multibyte text.
  while (Buffer.byteLength(JSON.stringify({ entries })) > 5 * 1024 * 1024 && entries.length > 1)
    entries.pop();
  const payload = seal({ entries });
  if (vault.revision === null) {
    try {
      await db.collection('aiConversations').insertOne({ ...vault.owner, revision: 0, payload });
    } catch (error) {
      if (error.code === 11000)
        throw new InputError('Conversation changed. Reopen it and retry.', 409);
      throw error;
    }
  } else {
    const result = await db
      .collection('aiConversations')
      .updateOne(
        { ...vault.owner, revision: vault.revision },
        { $set: { payload }, $inc: { revision: 1 } },
      );
    if (!result.matchedCount)
      throw new InputError('Conversation changed. Reopen it and retry.', 409);
  }
}
export async function canReadConversation(db, req, entry) {
  const grouped = new Map();
  for (const ref of entry.sources ?? [])
    grouped.set(ref.kind, [...(grouped.get(ref.kind) ?? []), new ObjectId(ref.id)]);
  for (const [kind, ids] of grouped) {
    const filter =
      kind === 'incidents'
        ? incidentAccess(req)
        : {
            [kind === 'events' ? 'userId' : 'workspaceId']: req.workspaceId,
            ...(kind === 'knowledge' ? await articleAccess(db, req) : {}),
          };
    const count = await db
      .collection(kind === 'knowledge' ? 'articles' : kind)
      .countDocuments({ ...filter, _id: { $in: ids } }, { maxTimeMS: 3000 });
    if (count !== ids.length) return false;
  }
  return true;
}
export async function prepareConversation(db, req) {
  if (req.body.conversationId !== undefined && !validId(req.body.conversationId))
    throw new InputError('Choose a valid conversation.');
  const vault = await conversationVault(db, req);
  const id = req.body.conversationId ?? randomUUID();
  const entry = vault.entries.find((row) => row.id === id);
  if (entry && !(await canReadConversation(db, req, entry)))
    throw new InputError(
      'This conversation references records you can no longer access. Start a new conversation.',
      403,
    );
  if (entry && entry.mode !== (req.body.demo ? 'demo' : 'live'))
    throw new InputError('Start a new conversation to change mode.', 409);
  return {
    entry,
    async reply(res, reply) {
      const refs = reply.demo
        ? []
        : (reply.records ?? [])
            .filter(
              (row) =>
                ['incidents', 'tasks', 'knowledge', 'events', 'rcas'].includes(row.kind) &&
                /^[a-f\d]{24}$/i.test(row.id),
            )
            .map(({ kind, id }) => ({ kind, id }));
      const sources = [
        ...new Map(
          [
            ...(entry?.sources ?? []),
            ...refs,
            ...(!reply.demo && req.body.context ? [req.body.context] : []),
          ].map((ref) => [`${ref.kind}:${ref.id}`, ref]),
        ).values(),
      ];
      if (sources.length > 100)
        throw new InputError('Start a new conversation to include more records.', 409);
      // Store text and safe navigation metadata only. Proposals and reusable action tokens stay in memory.
      const savedReply = {
        role: 'assistant',
        text: reply.text.slice(0, 12000),
        demo: reply.demo,
        records: (reply.records ?? []).map(({ id, kind, href, title, number, status, type }) => ({
          id,
          kind,
          href,
          title,
          number,
          status,
          type,
        })),
        navigation: reply.navigation ?? [],
        previousProposal: !!(reply.action || reply.demoAction),
      };
      const updated = {
        id,
        title: entry?.title ?? req.body.message.slice(0, 100),
        mode: reply.demo ? 'demo' : 'live',
        updatedAt: new Date().toISOString(),
        context: reply.demo ? undefined : req.body.context,
        sources,
        messages: [
          ...(entry?.messages ?? []),
          { role: 'user', text: req.body.message },
          savedReply,
        ].slice(-20),
      };
      await store(
        db,
        vault,
        [updated, ...vault.entries.filter((row) => row.id !== id)].slice(0, 20),
      );
      return res.json({ ...reply, conversationId: id });
    },
  };
}
export function installConversations(app, db) {
  app.get('/api/ai/conversations', async (req, res) => {
    const vault = await conversationVault(db, req);
    const items = [];
    for (const entry of vault.entries)
      if (await canReadConversation(db, req, entry)) {
        const { id, title, mode, updatedAt } = entry;
        items.push({ id, title, mode, updatedAt, messageCount: entry.messages.length });
      }
    res.json({ items });
  });
  app.get('/api/ai/conversations/:id', async (req, res) => {
    if (!validId(req.params.id)) throw new InputError('Choose a valid conversation.');
    const vault = await conversationVault(db, req);
    const entry = vault.entries.find((row) => row.id === req.params.id);
    if (!entry || !(await canReadConversation(db, req, entry)))
      throw new InputError('Conversation not found.', 404);
    const { sources: _sources, ...item } = entry;
    res.json({ item });
  });
  app.delete('/api/ai/conversations/:id', async (req, res) => {
    if (!validId(req.params.id)) throw new InputError('Choose a valid conversation.');
    const vault = await conversationVault(db, req);
    if (!vault.entries.some((row) => row.id === req.params.id))
      throw new InputError('Conversation not found.', 404);
    await store(
      db,
      vault,
      vault.entries.filter((row) => row.id !== req.params.id),
    );
    res.json({ ok: true });
  });
}
