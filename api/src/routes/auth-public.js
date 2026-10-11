import { auditStamp } from '@servicetrident/shared/domain/audit';

import { fieldErrors } from '@servicetrident/shared/validation/form-validation';

import { InputError } from '@servicetrident/shared/validation/validation';
import {
  createSession,
  credentials,
  digestToken,
  hashPassword,
  sessionToken,
  verifyPassword,
  serializeUser,
  authenticatedIdentity,
} from '../auth/auth.js';

/** Register public sign-in routes; authentication and workspace policy run in app.js. */
export function installPublicAuthRoutes(app, db, authLimit) {
  app.post('/api/auth/register', authLimit, async (req, res) => {
    const fields = fieldErrors('register', req.body);
    if (Object.keys(fields).length)
      throw new InputError('Check the highlighted fields.', 400, fields);
    const displayName = req.body.displayName.trim();
    const { email, password } = credentials(req.body);
    const passwordHash = await hashPassword(password);
    let result;
    try {
      result = await db.collection('users').insertOne({
        ...auditStamp(null, { email }),
        email,
        displayName,
        passwordHash,
        monitorCount: 0,
      });
    } catch (error) {
      if (error.code === 11000)
        throw new InputError('An account with this email already exists.', 409);
      throw error;
    }
    await createSession(db, res, result.insertedId);
    authenticatedIdentity(req, { _id: result.insertedId, email, displayName });
    res.status(201).json({ user: serializeUser({ _id: result.insertedId, email, displayName }) });
  });
  app.post('/api/auth/login', authLimit, async (req, res) => {
    const { email, password } = credentials(req.body);
    const user = await db.collection('users').findOne({ email });
    // Do comparable password work even when an account does not exist.
    const valid = await verifyPassword(
      password,
      user?.passwordHash ?? `${'0'.repeat(32)}:${'0'.repeat(128)}`,
    );
    if (!user || user.disabled || !valid)
      throw new InputError('Email or password is incorrect.', 401);
    const oldToken = sessionToken(req);
    if (oldToken) await db.collection('sessions').deleteOne({ _id: digestToken(oldToken) });
    await createSession(db, res, user._id);
    authenticatedIdentity(req, user);
    res.json({ user: serializeUser(user) });
  });
}
