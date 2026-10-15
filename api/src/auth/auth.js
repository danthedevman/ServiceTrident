import { uiPreferences } from '@servicetrident/shared/domain/ui-preferences';
import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { fieldErrors } from '@servicetrident/shared/validation/form-validation';
import { InputError } from '@servicetrident/shared/validation/validation';

const scrypt = promisify(scryptCallback);
const sessionLifetime = 7 * 86400 * 1000;
const cookieName = 'servicetrident_session';

/** @param {string} value @returns {string} One-way digest of a session token. */
export function digestToken(value) {
  return createHash('sha256').update(value).digest('hex');
}

/** @param {string} password @returns {Promise<string>} Salted password hash. */
export async function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const key = await scrypt(password, salt, 64);
  return `${salt}:${key.toString('hex')}`;
}

/** @param {string} password @param {string} stored @returns {Promise<boolean>} */
export async function verifyPassword(password, stored) {
  const [salt, hash] = stored.split(':');
  const key = await scrypt(password, salt, 64);
  const expected = Buffer.from(hash, 'hex');
  return expected.length === key.length && timingSafeEqual(expected, key);
}

/** @param {unknown} body @returns {{email: string, password: string}} */
export function credentials(body) {
  const errors = fieldErrors('auth', body ?? {});
  if (Object.keys(errors).length)
    throw new InputError('Check the highlighted account fields.', 400, errors);
  const { email: rawEmail, password } = body;
  const email = rawEmail.trim();
  if (
    typeof email !== 'string' ||
    email.length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  ) {
    throw new InputError('Enter a valid email address.');
  }
  if (typeof password !== 'string' || password.length < 12 || password.length > 128) {
    throw new InputError('Use a password between 12 and 128 characters.');
  }
  return { email: email.trim().toLowerCase(), password };
}

/** @param {import('express').Request} req @returns {string | undefined} */
export function sessionToken(req) {
  return req.headers.cookie
    ?.split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${cookieName}=`))
    ?.slice(cookieName.length + 1);
}

/** @returns {object} Consistent options for setting and removing the session cookie. */
export function cookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.COOKIE_SECURE === 'true',
    path: '/api',
  };
}

/** @param {import('mongodb').Db} db @param {import('express').Response} res @param {import('mongodb').ObjectId} userId */
export async function createSession(db, res, userId) {
  const token = randomBytes(32).toString('hex');
  await db.collection('sessions').insertOne({
    _id: digestToken(token),
    userId,
    expiresAt: new Date(Date.now() + sessionLifetime),
  });
  res.cookie(cookieName, token, { ...cookieOptions(), maxAge: sessionLifetime });
}

/** @param {import('mongodb').Db} db @returns {import('express').RequestHandler} */
export function requireUser(db) {
  return async (req, res, next) => {
    const token = sessionToken(req);
    if (!token || !/^[a-f0-9]{64}$/.test(token))
      throw new InputError('Please sign in to continue.', 401);
    const session = await db
      .collection('sessions')
      .findOne({ _id: digestToken(token), expiresAt: { $gt: new Date() } });
    if (!session) throw new InputError('Your session expired. Please sign in again.', 401);
    req.user = await db.collection('users').findOne(
      { _id: session.userId },
      {
        projection: {
          email: 1,
          displayName: 1,
          timeZone: 1,
          uiPreferences: 1,
          notificationsSeenAt: 1,
          workspaceId: 1,
          role: 1,
          disabled: 1,
        },
      },
    );
    if (!req.user || req.user.disabled) throw new InputError('Please sign in to continue.', 401);
    req.workspaceId = req.user.workspaceId ?? req.user._id;
    req.actualRole = req.user.workspaceId ? req.user.role : 'admin';
    req.role =
      req.actualRole === 'admin' && ['responder', 'viewer', 'user'].includes(session.viewRole)
        ? session.viewRole
        : req.actualRole;
    req.sessionId = session._id;
    next();
  };
}

/** Attach an identity only after a public authentication flow has verified it. */
export function authenticatedIdentity(req, user) {
  req.user = user;
  req.workspaceId = user.workspaceId ?? user._id;
  req.actualRole = user.workspaceId ? user.role : 'admin';
  req.role = req.actualRole;
}

/** @param {import('express').Response} res */
export function clearSessionCookie(res) {
  res.clearCookie(cookieName, cookieOptions());
}

/** Expose only session identity and effective workspace role. */
export function serializeUser(user) {
  return {
    id: String(user._id),
    email: user.email,
    displayName: user.displayName ?? '',
    timeZone: user.timeZone ?? '',
    uiPreferences: user.uiPreferences ? uiPreferences(user.uiPreferences) : null,
    workspaceId: String(user.workspaceId ?? user._id),
    role: user.workspaceId ? user.role : 'admin',
    actualRole: user.workspaceId ? user.role : 'admin',
    impersonating: false,
  };
}
/** Enforce workspace administration independently of hidden UI controls. */
export function requireAdmin(req, res, next) {
  if (req.role !== 'admin') throw new InputError('Workspace admin access is required.', 403);
  next();
}

/** Responders and admins can manage operational work; ordinary users have read-only access. */
export function requireResponder(req, res, next) {
  if (!['admin', 'responder'].includes(req.role))
    throw new InputError('Responder or admin access is required.', 403);
  next();
}

/** Serialize the effective session role without changing the stored account or identity. */
export function serializeSessionUser(req) {
  return {
    ...serializeUser(req.user),
    role: req.role,
    actualRole: req.actualRole,
    impersonating: req.role !== req.actualRole,
  };
}
