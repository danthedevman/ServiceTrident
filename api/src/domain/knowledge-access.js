import { settings } from '../repositories/settings.js';
import { memberFilter } from '../repositories/members.js';
import { InputError } from '@servicetrident/shared/validation/input-error';
import { ObjectId } from 'mongodb';

/** Managers also read; empty viewer lists preserve existing workspace visibility. */
export async function knowledgeAccess(db, req) {
  if (req.knowledgeAccess) return req.knowledgeAccess;
  const groups = (await settings(db, req.workspaceId)).groups || [];
  const userId = String(req.user._id);
  const groupIds = new Set(groups.filter((g) => g.memberIds.includes(userId)).map((g) => g.id));
  const bases = await db
    .collection('knowledgeBases')
    .find(
      { workspaceId: req.workspaceId },
      {
        projection: { managerUserIds: 1, managerGroupIds: 1, viewerUserIds: 1, viewerGroupIds: 1 },
      },
    )
    .toArray();
  const matches = (base, prefix) =>
    (base[`${prefix}UserIds`] || []).includes(userId) ||
    (base[`${prefix}GroupIds`] || []).some((id) => groupIds.has(id));
  const manages = (base) =>
    req.role === 'admin' ||
    matches(base, 'manager') ||
    (!(base.managerUserIds?.length || base.managerGroupIds?.length) && req.role === 'responder');
  const readable = bases.filter(
    (base) =>
      manages(base) ||
      matches(base, 'viewer') ||
      !(base.viewerUserIds?.length || base.viewerGroupIds?.length),
  );
  return (req.knowledgeAccess = {
    readable: readable.map((base) => String(base._id)),
    manageable: bases.filter(manages).map((base) => String(base._id)),
  });
}
export async function articleAccess(db, req, manage = false) {
  const access = await knowledgeAccess(db, req);
  return {
    $or: [
      { knowledgeBaseId: { $in: manage ? access.manageable : access.readable } },
      ...(!manage || ['admin', 'responder'].includes(req.role)
        ? [{ knowledgeBaseId: null }, { knowledgeBaseId: '' }]
        : []),
    ],
  };
}
export async function assertBaseAccess(db, req, baseId, manage = false) {
  if (!(await knowledgeAccess(db, req))[manage ? 'manageable' : 'readable'].includes(baseId))
    throw new InputError('Knowledge base not found or access denied.', 404);
}
export async function validateKnowledgePermissions(db, req, body, current) {
  const result = {};
  for (const key of ['managerUserIds', 'managerGroupIds', 'viewerUserIds', 'viewerGroupIds']) {
    const ids = body[key] ?? current?.[key] ?? [];
    if (
      !Array.isArray(ids) ||
      ids.length > 100 ||
      new Set(ids).size !== ids.length ||
      ids.some((id) => typeof id !== 'string' || !/^[a-f\d]{24}$/i.test(id))
    )
      throw new InputError('Choose up to 100 unique workspace references.', 400, {
        [key]: 'Choose valid workspace users or groups.',
      });
    const valid = key.endsWith('UserIds')
      ? (
          await db
            .collection('users')
            .find(
              {
                ...memberFilter(req.workspaceId),
                _id: { $in: ids.map((id) => new ObjectId(id)) },
                disabled: { $ne: true },
              },
              { projection: { _id: 1 } },
            )
            .toArray()
        ).map((row) => String(row._id))
      : ((await settings(db, req.workspaceId)).groups || []).map((g) => g.id);
    if (ids.some((id) => !valid.includes(id)))
      throw new InputError('Choose active users and groups from this workspace.', 400, {
        [key]: 'Choose active workspace references.',
      });
    result[key] = ids;
  }
  return result;
}
