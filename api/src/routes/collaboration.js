import { ObjectId } from 'mongodb';
import { InputError } from '@servicetrident/shared/validation/validation';
import { seal, unseal } from '@servicetrident/shared/integrations/secrets';
import { invalid, choice } from '@servicetrident/shared/validation/fields';
import { incidentAccess } from '../domain/incidents.js';
import { members } from '../repositories/members.js';
import { settings } from '../repositories/settings.js';
import { requireResponder } from '../auth/auth.js';

export function mayReadIncident(user, incident) {
  return (
    !user.disabled &&
    (user.role !== 'user' ||
      [incident.createdById, incident.openedForId].includes(String(user._id)))
  );
}
export async function collaborationOptions(db, req, incident) {
  const directory = await members(db, req.workspaceId);
  return directory.filter(
    (user) =>
      mayReadIncident(user, incident) &&
      (req.role !== 'user' ||
        [
          incident.createdById,
          incident.openedForId,
          incident.assigneeId,
          String(req.user._id),
        ].includes(String(user._id))),
  );
}
export function selectedIds(value, available, field, limit = 100) {
  if (
    !Array.isArray(value) ||
    value.length > limit ||
    new Set(value).size !== value.length ||
    value.some((id) => typeof id !== 'string' || !available.includes(id))
  )
    invalid(field, `Choose up to ${limit} available entries without duplicates.`);
  return value;
}

/** Notifications contain references only; permission is rechecked before every read. */
export function installCollaborationRoutes(app, db) {
  app.get('/api/communication-options', async (req, res) => {
    const data = await settings(db, req.workspaceId);
    res.json({
      slack: (data.integrations ?? []).some((item) => item.type === 'slack' && item.enabled),
    });
  });
  app.get('/api/incidents/:id/collaboration', async (req, res) => {
    if (!ObjectId.isValid(req.params.id)) throw new InputError('Incident not found.', 404);
    const incident = await db
      .collection('incidents')
      .findOne({ _id: new ObjectId(req.params.id), ...incidentAccess(req) });
    if (!incident) throw new InputError('Incident not found.', 404);
    const directory = await collaborationOptions(db, req, incident);
    const data = await settings(db, req.workspaceId);
    res.json({
      members: directory.map((user) => ({
        id: String(user._id),
        label: user.displayName || user.email,
        staff: ['admin', 'responder'].includes(user.role ?? 'admin'),
      })),
      groups:
        req.role === 'user'
          ? []
          : (data.groups ?? []).map((group) => ({ id: group.id, label: group.name })),
      watcherUserIds: incident.watcherUserIds ?? [],
      watcherGroupIds: incident.watcherGroupIds ?? [],
      revision: incident.revision,
    });
  });
  app.put('/api/incidents/:id/watchers', requireResponder, async (req, res) => {
    if (!ObjectId.isValid(req.params.id)) throw new InputError('Incident not found.', 404);
    const incident = await db
      .collection('incidents')
      .findOne({ _id: new ObjectId(req.params.id), workspaceId: req.workspaceId });
    if (!incident) throw new InputError('Incident not found.', 404);
    const directory = await collaborationOptions(db, req, incident),
      data = await settings(db, req.workspaceId);
    const watcherUserIds = selectedIds(
      req.body.watcherUserIds,
      directory.map((user) => String(user._id)),
      'watcherUserIds',
    );
    const watcherGroupIds = selectedIds(
      req.body.watcherGroupIds,
      (data.groups ?? []).map((group) => group.id),
      'watcherGroupIds',
    );
    if (req.body.revision !== incident.revision)
      throw new InputError('This incident changed. Refresh and try again.', 409);
    const result = await db.collection('incidents').updateOne(
      { _id: incident._id, workspaceId: req.workspaceId, revision: incident.revision },
      {
        $set: {
          watcherUserIds,
          watcherGroupIds,
          updatedAt: new Date(),
          updatedBy: req.user.displayName || req.user.email,
          updatedById: String(req.user._id),
        },
        $inc: { revision: 1 },
      },
    );
    if (!result.matchedCount)
      throw new InputError('This incident changed. Refresh and try again.', 409);
    res.json({ ok: true });
  });
  app.get('/api/notifications', async (req, res) => {
    const state = choice(req.query.state ?? 'all', ['all', 'unread', 'read'], 'state');
    const order = choice(req.query.order ?? 'desc', ['asc', 'desc'], 'order');
    if (
      req.query.search !== undefined &&
      (typeof req.query.search !== 'string' || req.query.search.length > 100)
    )
      invalid('search', 'Use at most 100 search characters.');
    const search = (req.query.search || '').trim();
    const direction = order === 'asc' ? 1 : -1;
    const comparison = order === 'asc' ? '$gt' : '$lt';
    const pageSize = Number(req.query.pageSize ?? 100);
    if (!Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 100)
      invalid('pageSize', 'Choose a page size between 1 and 100.');
    const seen = req.user.notificationsSeenAt
      ? new Date(req.user.notificationsSeenAt).getTime()
      : 0;
    const filter = {
      workspaceId: req.workspaceId,
      alertRecipientIds: String(req.user._id),
      ...(!['admin', 'responder'].includes(req.role) ? { kind: 'comment' } : {}),
      ...(state !== 'all'
        ? { createdAt: { [state === 'unread' ? '$gt' : '$lte']: new Date(seen) } }
        : {}),
    };
    if (search) {
      const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const matches = await db
        .collection('incidents')
        .find(
          {
            ...incidentAccess(req),
            $or: [
              { title: { $regex: escaped, $options: 'i' } },
              { number: { $regex: escaped, $options: 'i' } },
            ],
          },
          { projection: { _id: 1 }, maxTimeMS: 3000 },
        )
        .toArray();
      filter.$or = [
        { incidentId: { $in: matches.map((row) => row._id) } },
        { author: { $regex: escaped, $options: 'i' } },
      ];
    }
    if (req.query.cursor) {
      let cursor;
      try {
        if (typeof req.query.cursor !== 'string' || req.query.cursor.length > 2000)
          throw new Error();
        cursor = unseal(req.query.cursor);
      } catch {
        invalid('cursor', 'Refresh notifications and try again.');
      }
      if (
        cursor.actor !== String(req.user._id) ||
        cursor.workspace !== String(req.workspaceId) ||
        cursor.state !== state ||
        cursor.order !== order ||
        cursor.search !== search ||
        cursor.seen !== seen ||
        !Number.isFinite(cursor.expires) ||
        cursor.expires <= Date.now() ||
        !/^[a-f\d]{24}$/i.test(cursor.id ?? '') ||
        !Number.isFinite(new Date(cursor.at).getTime())
      )
        invalid('cursor', 'Notifications changed. Refresh this view.');
      filter.$and = [
        {
          $or: [
            { createdAt: { [comparison]: new Date(cursor.at) } },
            { createdAt: new Date(cursor.at), _id: { [comparison]: new ObjectId(cursor.id) } },
          ],
        },
      ];
    }
    const candidates = await db
      .collection('incidentComments')
      .find(filter, { maxTimeMS: 3000 })
      .sort({ createdAt: direction, _id: direction })
      .limit(pageSize + 1)
      .toArray();
    const entries = candidates.slice(0, pageSize);
    const more = candidates.length > pageSize;
    const last = entries.at(-1);
    const nextCursor =
      more && last
        ? seal({
            actor: String(req.user._id),
            workspace: String(req.workspaceId),
            state,
            order,
            search,
            seen,
            id: String(last._id),
            at: new Date(last.createdAt).toISOString(),
            expires: Date.now() + 3600000,
          })
        : null;
    const ids = [...new Set(entries.map((entry) => String(entry.incidentId)))].map(
      (id) => new ObjectId(id),
    );
    const incidents = ids.length
      ? await db
          .collection('incidents')
          .find(
            { ...incidentAccess(req), _id: { $in: ids } },
            { projection: { title: 1, number: 1 } },
          )
          .toArray()
      : [];
    const available = new Map(incidents.map((item) => [String(item._id), item]));
    res.json({
      notifications: entries
        .filter((entry) => available.has(String(entry.incidentId)))
        .map((entry) => ({
          id: String(entry._id),
          incidentId: String(entry.incidentId),
          title: available.get(String(entry.incidentId)).title,
          number: available.get(String(entry.incidentId)).number,
          author: entry.author,
          kind: entry.kind,
          createdAt: entry.createdAt,
          unread: new Date(entry.createdAt).getTime() > seen,
        })),
      checkedAt: new Date().toISOString(),
      hasMore: more,
      nextCursor,
    });
  });
  app.post('/api/notifications/read', async (req, res) => {
    const date = new Date(req.body.checkedAt);
    if (
      !Number.isFinite(date.getTime()) ||
      date.getTime() > Date.now() ||
      date.getTime() < Date.now() - 86400000
    )
      invalid('checkedAt', 'Refresh notifications and try again.');
    await db.collection('users').updateOne(
      {
        _id: req.user._id,
        $or: [{ notificationsSeenAt: { $exists: false } }, { notificationsSeenAt: { $lt: date } }],
      },
      { $set: { notificationsSeenAt: date } },
    );
    res.json({ ok: true });
  });
}
