import { writeAudit } from '@servicetrident/shared/domain/audit';
import { authenticatedIdentity } from '../auth/auth.js';
import { ObjectId } from 'mongodb';

import { InputError } from '@servicetrident/shared/validation/validation';

import {
  credentials,
  digestToken,
  hashPassword,
  createSession,
  serializeUser,
} from '../auth/auth.js';

/** Invitation tokens are one-use, expire, and never move an existing account. */
export function installInviteRoute(app, db, limit) {
  app.post('/api/auth/invite', limit, async (req, res) => {
    const { token, password } = req.body ?? {};
    if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token))
      throw new InputError('This invitation is invalid or expired.', 400);
    const invitation = await db
      .collection('invitations')
      .findOne({ _id: digestToken(token), expiresAt: { $gt: new Date() } });
    if (!invitation || invitation.demoBatchId)
      throw new InputError('This invitation is invalid or expired.', 400);
    credentials({ email: invitation.email, password });
    const passwordHash = await hashPassword(password);
    const consumed = await db
      .collection('invitations')
      .findOneAndDelete({ _id: invitation._id, expiresAt: { $gt: new Date() } });
    if (!consumed) throw new InputError('This invitation is invalid or expired.', 400);
    const user = {
      _id: new ObjectId(),
      email: invitation.email,
      displayName: invitation.displayName,
      createdBy: invitation.createdBy,
      createdById: invitation.createdById,
      updatedAt: new Date(),
      updatedBy: invitation.email,
      revision: 0,
      role: invitation.role,
      workspaceId: invitation.workspaceId,
      passwordHash,
      createdAt: new Date(),
    };
    try {
      await db.collection('users').insertOne(user);
    } catch (error) {
      if (error.code === 11000)
        throw new InputError(
          'This email already has an account. Ask the admin to invite a different address.',
          409,
        );
      await db.collection('invitations').insertOne(consumed);
      throw error;
    }
    await writeAudit(db, {
      workspaceId: user.workspaceId,
      actorId: user._id,
      actor: user.displayName || user.email,
      actualRole: user.role,
      effectiveRole: user.role,
      action: 'accept invitation',
      recordType: 'members',
      recordId: user._id,
      operation: 'POST /api/auth/invite',
      statusCode: 201,
    });
    await createSession(db, res, user._id);
    authenticatedIdentity(req, user);
    res.status(201).json({ user: serializeUser(user) });
  });
}
