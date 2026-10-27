import { userDetails, userDetailView } from '@servicetrident/shared/domain/user-details';
import { auditStamp, auditFields } from '@servicetrident/shared/domain/audit';

import { rateLimit } from 'express-rate-limit';
import { randomBytes } from 'node:crypto';
import { ObjectId } from 'mongodb';

import { InputError } from '@servicetrident/shared/validation/validation';
import { text, choice, identifier, invalid } from '@servicetrident/shared/validation/fields';

import { id } from './services.js';
import {
  requireAdmin,
  digestToken,
  serializeUser,
  credentials,
  hashPassword,
  verifyPassword,
} from '../auth/auth.js';

import { memberFilter } from '../repositories/members.js';
import { members } from '../repositories/members.js';
import { settings, save } from '../repositories/settings.js';

/** Register workspace routes; authentication and workspace policy run in app.js. */
export function installWorkspaceRoutes(app, db, appOrigin) {
  const credentialLimit = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 30,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many account changes. Try again in 15 minutes.' },
  });
  // Account creation never accepts identity, workspace, or session fields from the client.
  app.post('/api/members', requireAdmin, credentialLimit, async (req, res) => {
    const { email, password } = credentials(req.body);
    const details = userDetails(req.body);
    const role = choice(req.body.role, ['admin', 'responder', 'user', 'viewer'], 'role');
    if (req.body.confirmPassword !== password) invalid('confirmPassword', 'Passwords must match.');
    const groupIds = req.body.groupIds ?? [];
    if (
      !Array.isArray(groupIds) ||
      groupIds.length > 100 ||
      new Set(groupIds).size !== groupIds.length ||
      groupIds.some((value) => typeof value !== 'string')
    )
      invalid('groupIds', 'Choose up to 100 groups without duplicates.');
    const groupSettings = groupIds.length ? await settings(db, req.workspaceId) : null;
    if (
      groupIds.some(
        (value) =>
          !(groupSettings.groups ?? []).some(
            (group) => group.id === value && !group.demoBatchId && group.memberIds.length < 100,
          ),
      )
    )
      invalid('groupIds', 'Choose available workspace groups with room for another member.');
    if (await db.collection('users').findOne({ email }))
      invalid('email', 'An account already uses this email address.');
    const count = await db
      .collection('users')
      .countDocuments({ ...memberFilter(req.workspaceId), demoBatchId: { $exists: false } });
    const pending = await db
      .collection('invitations')
      .countDocuments({ workspaceId: req.workspaceId, demoBatchId: { $exists: false } });
    if (count + pending >= 100)
      throw new InputError('A workspace supports up to 100 users and pending invitations.', 409);
    const user = {
      _id: new ObjectId(),
      workspaceId: req.workspaceId,
      email,
      ...details,
      role,
      disabled: false,
      passwordHash: await hashPassword(password),
      ...auditStamp(null, req.user),
    };
    try {
      await db.collection('users').insertOne(user);
    } catch (error) {
      if (error.code === 11000) invalid('email', 'An account already uses this email address.');
      throw error;
    }
    if (groupSettings) {
      try {
        await save(db, groupSettings, groupSettings.revision, {
          groups: groupSettings.groups.map((group) =>
            groupIds.includes(group.id)
              ? {
                  ...group,
                  ...auditStamp(group, req.user),
                  memberIds: [...group.memberIds, String(user._id)],
                }
              : group,
          ),
        });
      } catch (error) {
        // Roll back this newly created account if membership saving conflicts.
        await db.collection('users').deleteOne({ _id: user._id, workspaceId: req.workspaceId });
        throw error;
      }
    }
    res.status(201).json({ user: serializeUser(user) });
  });
  // Reauthentication protects privileged resets; existing target sessions are revoked.
  app.patch('/api/members/:id/password', requireAdmin, credentialLimit, async (req, res) => {
    const userId = id(req.params.id);
    if (String(userId) === String(req.user._id))
      throw new InputError('Change your own password in Profile settings.', 409);
    if (String(userId) === String(req.workspaceId))
      throw new InputError('The workspace owner must change their own password.', 409);
    const target = await db
      .collection('users')
      .findOne({ ...memberFilter(req.workspaceId), _id: userId });
    if (!target) throw new InputError('User not found.', 404);
    if (target.demoBatchId)
      throw new InputError('Demo users cannot sign in or receive password resets.', 409);
    const { password } = credentials({ email: target.email, password: req.body.password });
    if (req.body.confirmPassword !== password) invalid('confirmPassword', 'Passwords must match.');
    if (typeof req.body.currentPassword !== 'string' || req.body.currentPassword.length > 128)
      invalid('currentPassword', 'Enter your current password.');
    const actor = await db.collection('users').findOne({ _id: req.user._id });
    if (
      !actor ||
      actor.disabled ||
      (actor.workspaceId ? actor.role : 'admin') !== 'admin' ||
      !(await verifyPassword(req.body.currentPassword, actor.passwordHash))
    )
      invalid('currentPassword', 'Your current password is incorrect.');
    const result = await db
      .collection('users')
      .updateOne(
        { ...memberFilter(req.workspaceId), _id: userId, passwordHash: target.passwordHash },
        { $set: { passwordHash: await hashPassword(password), ...auditStamp(target, req.user) } },
      );
    if (!result.matchedCount)
      throw new InputError('This account changed. Refresh and try again.', 409);
    await db.collection('sessions').deleteMany({ userId });
    res.json({ ok: true });
  });
  app.get('/api/members', async (req, res) => {
    const data = await settings(db, req.workspaceId);
    res.json({
      members: (await members(db, req.workspaceId))
        .filter((u) => req.role !== 'user' || String(u._id) === String(req.user._id))
        .map((u) => ({
          ...serializeUser(u),
          ...userDetailView(u),
          uiPreferences: undefined,
          ...auditFields(u),
          disabled: u.disabled === true,
          owner: String(u._id) === String(req.workspaceId),
          groupsRevision: data.revision,
          groupIds: (data.groups ?? [])
            .filter((group) => group.memberIds.includes(String(u._id)))
            .map((group) => group.id),
          groupNames: (data.groups ?? [])
            .filter((group) => group.memberIds.includes(String(u._id)))
            .map((group) => group.name),
        })),
    });
  });
  app.get('/api/invitations', requireAdmin, async (req, res) => {
    const rows = await db
      .collection('invitations')
      .find({ workspaceId: req.workspaceId, expiresAt: { $gt: new Date() } })
      .toArray();
    res.json({
      invitations: rows.map(({ inviteId, email, displayName, role, expiresAt }) => ({
        id: inviteId,
        email,
        displayName,
        role,
        expiresAt,
      })),
    });
  });
  app.post('/api/invitations', requireAdmin, async (req, res) => {
    const email = text(req.body.email, 'email', 254).toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) invalid('email', 'Enter a valid email address.');
    const displayName = text(req.body.displayName, 'displayName', 80);
    const role = choice(req.body.role, ['admin', 'responder', 'user', 'viewer'], 'role');
    if (await db.collection('users').findOne({ email }))
      invalid(
        'email',
        'This email already has an account. Existing workspaces cannot be merged by invitation.',
      );
    if (
      (await db
        .collection('invitations')
        .countDocuments({ workspaceId: req.workspaceId, demoBatchId: { $exists: false } })) +
        (await db
          .collection('users')
          .countDocuments({ ...memberFilter(req.workspaceId), demoBatchId: { $exists: false } })) >=
      100
    )
      throw new InputError('A workspace supports up to 100 members and pending invitations.', 409);
    const token = randomBytes(32).toString('hex'),
      inviteId = new ObjectId().toHexString();
    await db.collection('invitations').deleteMany({ workspaceId: req.workspaceId, email });
    await db.collection('invitations').insertOne({
      _id: digestToken(token),
      inviteId,
      workspaceId: req.workspaceId,
      email,
      displayName,
      role,
      ...auditStamp(null, req.user),
      expiresAt: new Date(Date.now() + 48 * 3600000),
    });
    res.status(201).json({ inviteUrl: `${appOrigin}/join/${token}` });
  });
  app.delete('/api/invitations/:id', requireAdmin, async (req, res) => {
    await db
      .collection('invitations')
      .deleteOne({ inviteId: identifier(req.params.id), workspaceId: req.workspaceId });
    res.status(204).end();
  });
  app.delete('/api/members/:id', requireAdmin, async (req, res) => {
    const userId = id(req.params.id);
    if (String(userId) === String(req.workspaceId) || String(userId) === String(req.user._id))
      throw new InputError('You cannot delete yourself or the workspace owner.', 409);
    const current = await db
      .collection('users')
      .findOne({ ...memberFilter(req.workspaceId), _id: userId });
    if (!current) throw new InputError('Teammate not found.', 404);
    const assigned = await db.collection('catalogs').findOne({
      _id: req.workspaceId,
      $or: [{ 'services.ownerIds': req.params.id }, { 'services.primaryContactId': req.params.id }],
    });
    const scheduled = await db.collection('operations').findOne({
      _id: req.workspaceId,
      $or: [{ 'shifts.userId': req.params.id }, { 'groups.memberIds': req.params.id }],
    });
    if (assigned || scheduled)
      throw new InputError(
        'Remove service ownership, group membership, and on-call coverage before deleting this teammate.',
        409,
      );
    await db.collection('users').deleteOne({ ...memberFilter(req.workspaceId), _id: userId });
    await db.collection('sessions').deleteMany({ userId });
    await db
      .collection('aiConversations')
      .deleteMany({ workspaceId: req.workspaceId, actorId: userId });
    res.status(204).end();
  });
  app.patch('/api/members/:id', requireAdmin, async (req, res) => {
    const userId = id(req.params.id);
    if (
      String(userId) === String(req.workspaceId) &&
      (req.body.role !== 'admin' || req.body.disabled !== false)
    )
      throw new InputError('The workspace owner must remain an active admin.', 409);
    const displayName = text(req.body.displayName, 'displayName', 80);
    const role = choice(req.body.role, ['admin', 'responder', 'user', 'viewer'], 'role');
    if (typeof req.body.disabled !== 'boolean')
      invalid('disabled', 'Choose whether this account is active.');
    const current = await db
      .collection('users')
      .findOne({ ...memberFilter(req.workspaceId), _id: userId });
    if (!current) throw new InputError('Teammate not found.', 404);
    if (current.demoBatchId && req.body.disabled !== true)
      invalid('disabled', 'Demo users cannot sign in.');
    const details = userDetails(req.body, current);
    if (req.body.groupIds !== undefined) {
      const groupIds = req.body.groupIds;
      const data = await settings(db, req.workspaceId);
      const groups = data.groups ?? [];
      if (
        !Array.isArray(groupIds) ||
        groupIds.length > 100 ||
        new Set(groupIds).size !== groupIds.length ||
        groupIds.some(
          (value) =>
            typeof value !== 'string' ||
            !groups.some(
              (group) =>
                group.id === value &&
                (group.memberIds.includes(String(userId)) ||
                  (!group.demoBatchId && group.memberIds.length < 100)),
            ),
        )
      )
        invalid('groupIds', 'Choose available workspace groups without duplicates.');
      await save(db, data, req.body.groupsRevision, {
        groups: groups.map((group) => {
          const included = group.memberIds.includes(String(userId));
          const selected = groupIds.includes(group.id);
          if (included === selected) return group;
          return {
            ...group,
            ...auditStamp(group, req.user),
            memberIds: selected
              ? [...group.memberIds, String(userId)]
              : group.memberIds.filter((value) => value !== String(userId)),
          };
        }),
      });
    }
    const result = await db.collection('users').updateOne(
      { ...memberFilter(req.workspaceId), _id: userId },
      {
        $set: {
          ...auditStamp(current, req.user),
          ...details,
          displayName,
          role,
          disabled: req.body.disabled,
        },
      },
    );
    if (!result.matchedCount) throw new InputError('Teammate not found.', 404);
    if (
      String(userId) !== String(req.user._id) ||
      role !== current.role ||
      req.body.disabled !== current.disabled
    )
      await db.collection('sessions').deleteMany({ userId });
    res.json({ ok: true });
  });
}
