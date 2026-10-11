import { randomBytes } from 'node:crypto';
import { ObjectId } from 'mongodb';
import { InputError } from '@servicetrident/shared/validation/validation';
import { identityProvider, providerView } from '@servicetrident/shared/domain/identity-provider';
import { seal, unseal } from '@servicetrident/shared/integrations/secrets';
import { memberFilter } from '../repositories/members.js';
import {
  requireAdmin,
  digestToken,
  createSession,
  verifyPassword,
  sessionToken,
  authenticatedIdentity,
} from '../auth/auth.js';
import { identityConfiguration, oidc } from '../auth/oidc.js';

const callbackPath = '/api/auth/sso/callback';
const bindingCookie = 'servicetrident_sso';
const bindingOptions = () => ({
  httpOnly: true,
  secure: process.env.COOKIE_SECURE === 'true',
  sameSite: 'lax',
  path: callbackPath,
});
const providerId = (raw) => {
  if (!/^[a-f\d]{24}$/i.test(String(raw)))
    throw new InputError('Identity provider not found.', 404);
  return new ObjectId(raw);
};
const revisionFilter = (item, revision) => {
  if (!Number.isSafeInteger(revision) || revision < 0)
    throw new InputError('Refresh before changing this provider.');
  return { _id: item._id, workspaceId: item.workspaceId, revision };
};
const enabledProvider = async (db, id) => {
  const provider = await db
    .collection('identityProviders')
    .findOne({ _id: providerId(id), enabled: true });
  if (
    !provider ||
    !(await db.collection('users').findOne({ _id: provider.workspaceId, disabled: { $ne: true } }))
  )
    throw new InputError('Identity provider is unavailable.', 404);
  return provider;
};

/** Public routes expose only labels through a workspace's unguessable sign-in link. */
export function installPublicIdentityRoutes(app, db, limit, appOrigin, fetchImpl) {
  app.get('/api/public/identity-providers/:key', limit, async (req, res) => {
    if (!/^[a-f\d]{48}$/.test(req.params.key))
      throw new InputError('Workspace sign-in link is invalid.', 404);
    const owner = await db
      .collection('users')
      .findOne(
        { identitySignInKey: req.params.key, disabled: { $ne: true } },
        { projection: { _id: 1 } },
      );
    if (!owner) throw new InputError('Workspace sign-in link is invalid.', 404);
    const providers = await db
      .collection('identityProviders')
      .find({ workspaceId: owner._id, enabled: true }, { projection: { name: 1, provider: 1 } })
      .limit(10)
      .toArray();
    res.json({
      providers: providers.map((p) => ({ id: String(p._id), name: p.name, provider: p.provider })),
    });
  });
  app.get('/api/auth/sso/:id/start', limit, async (req, res) => {
    const provider = await enabledProvider(db, req.params.id);
    if (typeof req.query.workspace !== 'string' || !/^[a-f\d]{48}$/.test(req.query.workspace))
      throw new InputError('Use your workspace sign-in link.', 403);
    const owner = await db
      .collection('users')
      .findOne({ _id: provider.workspaceId, identitySignInKey: req.query.workspace });
    if (
      !owner ||
      typeof req.query.workspace !== 'string' ||
      !/^[a-f\d]{48}$/.test(req.query.workspace)
    )
      throw new InputError('Use your workspace sign-in link.', 403);
    try {
      res.redirect(303, await startIdentity(db, res, provider, appOrigin, fetchImpl));
    } catch {
      res.redirect(303, '/login?ssoError=provider');
    }
  });
  app.get(callbackPath, limit, async (req, res) => {
    const fail = () => res.redirect(303, '/login?ssoError=failed');
    const state = req.query.state;
    const cookie = req.headers.cookie
      ?.split(';')
      .map((p) => p.trim())
      .find((p) => p.startsWith(`${bindingCookie}=`))
      ?.slice(bindingCookie.length + 1);
    if (
      typeof state !== 'string' ||
      !/^[a-f\d]{64}$/.test(state) ||
      !/^[a-f\d]{64}$/.test(cookie || '')
    )
      return fail();
    res.clearCookie(bindingCookie, bindingOptions());
    // Atomic consumption, browser binding, expiry, and provider revision reject replay and stale configuration.
    const transaction = await db.collection('identityTransactions').findOneAndDelete({
      _id: digestToken(state),
      binding: digestToken(cookie),
      expiresAt: { $gt: new Date() },
    });
    if (!transaction) return fail();
    try {
      const provider = await enabledProvider(db, String(transaction.providerId));
      if (provider.revision !== transaction.revision) return fail();
      const config = await identityConfiguration(provider, fetchImpl);
      const { verifier, nonce } = unseal(transaction.secret);
      const currentUrl = new URL(req.originalUrl, appOrigin);
      const tokens = await oidc.authorizationCodeGrant(config, currentUrl, {
        pkceCodeVerifier: verifier,
        expectedState: state,
        expectedNonce: nonce,
        idTokenExpected: true,
      });
      const claims = tokens.claims();
      if (typeof claims?.sub !== 'string' || !claims.sub || claims.sub.length > 512) return fail();
      const subjectKey = digestToken(
        JSON.stringify([String(provider._id), provider.issuer, claims.sub]),
      );
      let user;
      if (transaction.userId) {
        const session = await db.collection('sessions').findOne({
          _id: transaction.sessionId,
          userId: transaction.userId,
          expiresAt: { $gt: new Date() },
        });
        if (!session) return fail();
        user = await db.collection('users').findOne({
          _id: transaction.userId,
          ...memberFilter(provider.workspaceId),
          disabled: { $ne: true },
        });
        if (!user) return fail();
        const current = await db.collection('identityLinks').findOne({ _id: subjectKey });
        if (current && String(current.userId) !== String(user._id)) return fail();
        await db.collection('identityLinks').updateOne(
          { _id: subjectKey, userId: user._id },
          {
            $set: {
              userId: user._id,
              workspaceId: provider.workspaceId,
              providerId: provider._id,
              issuer: provider.issuer,
            },
          },
          { upsert: true },
        );
        authenticatedIdentity(req, user);
        res.redirect(303, '/profile?ssoConnected=1');
        return;
      }
      const link = await db
        .collection('identityLinks')
        .findOne({ _id: subjectKey, workspaceId: provider.workspaceId, providerId: provider._id });
      if (!link) return res.redirect(303, '/login?ssoError=unlinked');
      user = await db.collection('users').findOne({
        _id: link.userId,
        ...memberFilter(provider.workspaceId),
        disabled: { $ne: true },
      });
      if (!user) return fail();
      // No email matching, account creation, or provider-controlled role assignment.
      const previous = sessionToken(req);
      if (previous) await db.collection('sessions').deleteOne({ _id: digestToken(previous) });
      await createSession(db, res, user._id);
      authenticatedIdentity(req, user);
      res.redirect(303, '/');
    } catch {
      fail();
    }
  });
}

async function startIdentity(db, res, provider, appOrigin, fetchImpl, linkedSession = {}) {
  const config = await identityConfiguration(provider, fetchImpl);
  const state = randomBytes(32).toString('hex'),
    binding = randomBytes(32).toString('hex');
  const verifier = oidc.randomPKCECodeVerifier(),
    nonce = oidc.randomNonce();
  const url = oidc.buildAuthorizationUrl(config, {
    redirect_uri: appOrigin + callbackPath,
    response_type: 'code',
    scope: 'openid profile email',
    state,
    nonce,
    code_challenge: await oidc.calculatePKCECodeChallenge(verifier),
    code_challenge_method: 'S256',
    ...(linkedSession.userId ? { prompt: 'login' } : {}),
  });
  await db.collection('identityTransactions').insertOne({
    _id: digestToken(state),
    binding: digestToken(binding),
    providerId: provider._id,
    revision: provider.revision,
    secret: seal({ verifier, nonce }),
    expiresAt: new Date(Date.now() + 10 * 60000),
    ...linkedSession,
  });
  res.cookie(bindingCookie, binding, { ...bindingOptions(), maxAge: 10 * 60000 });
  return url.href;
}

/** Workspace-scoped configuration never returns secrets; every mutation checks role and revision. */
export function installIdentitySettings(app, db, appOrigin, fetchImpl, limit) {
  const collection = db.collection('identityProviders');
  const find = async (req) => {
    const item = await collection.findOne({
      _id: providerId(req.params.id),
      workspaceId: req.workspaceId,
    });
    if (!item) throw new InputError('Identity provider not found.', 404);
    return item;
  };
  app.get('/api/settings/identity-providers', requireAdmin, async (req, res) => {
    const providers = await collection.find({ workspaceId: req.workspaceId }).limit(10).toArray();
    const owner = await db
      .collection('users')
      .findOne({ _id: req.workspaceId }, { projection: { identitySignInKey: 1 } });
    res.json({
      providers: providers.map(providerView),
      callbackUrl: appOrigin + callbackPath,
      signInUrl: owner?.identitySignInKey
        ? `${appOrigin}/login?workspace=${owner.identitySignInKey}`
        : '',
    });
  });
  app.post('/api/settings/identity-providers', requireAdmin, async (req, res) => {
    const settings = identityProvider(req.body);
    // Serialize creation on the workspace owner to enforce the provider limit under concurrent requests.
    const owner = await db
      .collection('users')
      .findOneAndUpdate(
        { _id: req.workspaceId, $expr: { $lt: [{ $ifNull: ['$identityProviderCount', 0] }, 10] } },
        { $inc: { identityProviderCount: 1 } },
        { returnDocument: 'after' },
      );
    if (!owner) throw new InputError('A workspace supports up to ten identity providers.', 409);
    try {
      const item = {
        _id: new ObjectId(),
        workspaceId: req.workspaceId,
        ...settings,
        revision: 0,
        secret: seal({ clientSecret: req.body.clientSecret }),
      };
      await db
        .collection('users')
        .updateOne(
          { _id: req.workspaceId, identitySignInKey: { $exists: false } },
          { $set: { identitySignInKey: randomBytes(24).toString('hex') } },
        );
      await collection.insertOne(item);
      res.status(201).json({ provider: providerView(item) });
    } catch (error) {
      await db
        .collection('users')
        .updateOne({ _id: req.workspaceId }, { $inc: { identityProviderCount: -1 } });
      throw error;
    }
  });
  app.put('/api/settings/identity-providers/:id', requireAdmin, async (req, res) => {
    const current = await find(req),
      settings = identityProvider(req.body, current);
    const result = await collection.findOneAndUpdate(
      revisionFilter(current, req.body.revision),
      {
        $set: {
          ...settings,
          secret: req.body.clientSecret
            ? seal({ clientSecret: req.body.clientSecret })
            : current.secret,
        },
        $inc: { revision: 1 },
      },
      { returnDocument: 'after' },
    );
    if (!result) throw new InputError('Provider changed. Refresh and try again.', 409);
    res.json({ provider: providerView(result) });
  });
  app.delete('/api/settings/identity-providers/:id', requireAdmin, async (req, res) => {
    const current = await find(req);
    const deleted = await collection.findOneAndDelete(revisionFilter(current, req.body.revision));
    if (!deleted) throw new InputError('Provider changed. Refresh and try again.', 409);
    await db
      .collection('identityLinks')
      .deleteMany({ providerId: current._id, workspaceId: req.workspaceId });
    await db
      .collection('users')
      .updateOne({ _id: req.workspaceId }, { $inc: { identityProviderCount: -1 } });
    res.json({ ok: true });
  });
  app.post('/api/settings/identity-providers/:id/test', requireAdmin, async (req, res) => {
    const current = await find(req);
    try {
      await identityConfiguration(current, fetchImpl);
    } catch {
      throw new InputError(
        'Discovery failed. Check the issuer and public HTTPS endpoints. Client credentials are verified during sign-in.',
        400,
      );
    }
    res.json({
      message:
        'Discovery succeeded. Connect your account in Profile to test sign-in and client credentials.',
    });
  });
  app.get('/api/auth/identity-providers', async (req, res) => {
    const providers = await collection
      .find({ workspaceId: req.workspaceId, enabled: true })
      .limit(10)
      .toArray();
    const links = await db
      .collection('identityLinks')
      .find({ workspaceId: req.workspaceId, userId: req.user._id })
      .toArray();
    res.json({
      providers: providers.map((p) => ({
        id: String(p._id),
        name: p.name,
        connected: links.some(
          (l) => String(l.providerId) === String(p._id) && l.issuer === p.issuer,
        ),
      })),
    });
  });
  app.post('/api/auth/identity-providers/:id/connect', limit, async (req, res) => {
    const provider = await enabledProvider(db, req.params.id);
    if (String(provider.workspaceId) !== String(req.workspaceId))
      throw new InputError('Identity provider not found.', 404);
    const account = await db.collection('users').findOne({ _id: req.user._id });
    const password = req.body?.currentPassword;
    if (
      typeof password !== 'string' ||
      password.length > 128 ||
      !(await verifyPassword(password, account.passwordHash))
    )
      throw new InputError('Confirm your current password to connect an identity provider.', 400);
    try {
      res.json({
        url: await startIdentity(db, res, provider, appOrigin, fetchImpl, {
          userId: req.user._id,
          sessionId: req.sessionId,
        }),
      });
    } catch {
      throw new InputError(
        'Could not start sign-in. Check the identity provider configuration.',
        400,
      );
    }
  });
  app.delete('/api/auth/identity-providers/:id/connect', async (req, res) => {
    await db.collection('identityLinks').deleteMany({
      providerId: providerId(req.params.id),
      workspaceId: req.workspaceId,
      userId: req.user._id,
    });
    res.json({ ok: true });
  });
}
