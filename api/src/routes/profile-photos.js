import { randomUUID } from 'node:crypto';
import { rateLimit } from 'express-rate-limit';
import { InputError } from '@servicetrident/shared/validation/validation';
import { memberFilter } from '../repositories/members.js';
import { id } from './services.js';

/** Private, workspace-scoped raster photos; no client paths or external URLs are accepted. */
export function installProfilePhotos(app, db) {
  const limit = rateLimit({
    windowMs: 60000,
    limit: 20,
    standardHeaders: true,
    legacyHeaders: false,
  });
  async function target(req, write = false) {
    const userId = req.params.id ? id(req.params.id) : req.user._id;
    const own = String(userId) === String(req.user._id);
    if ((write && !own && req.role !== 'admin') || (!own && req.role === 'user'))
      throw new InputError('You cannot access this profile photo.', 403);
    const user = await db
      .collection('users')
      .findOne({ ...memberFilter(req.workspaceId), _id: userId });
    if (!user) throw new InputError('User not found.', 404);
    if (write && user.demoBatchId)
      throw new InputError('Demo profile photos cannot be changed.', 409);
    return user;
  }
  const paths = ['/api/auth/photo', '/api/member-photos/:id'];
  app.get(paths, async (req, res) => {
    const user = await target(req);
    const photo = await db
      .collection('profilePhotos')
      .findOne({ _id: user._id, workspaceId: req.workspaceId });
    if (!photo) throw new InputError('Profile photo not found.', 404);
    res
      .set('Cache-Control', 'no-store')
      .set('X-Content-Type-Options', 'nosniff')
      .type('image/png')
      .send(Buffer.from(photo.base64, 'base64'));
  });
  app.put(paths, limit, async (req, res) => {
    const user = await target(req, true);
    const value = req.body?.base64;
    if (
      Object.keys(req.body ?? {}).some((key) => key !== 'base64') ||
      typeof value !== 'string' ||
      value.length > 140000 ||
      !/^[A-Za-z0-9+/]+={0,2}$/.test(value)
    )
      throw new InputError('Upload a PNG profile photo up to 100 KB.');
    const bytes = Buffer.from(value, 'base64');
    if (
      bytes.length < 45 ||
      bytes.length > 102400 ||
      !bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ||
      bytes.subarray(12, 16).toString() !== 'IHDR' ||
      bytes.readUInt32BE(16) < 1 ||
      bytes.readUInt32BE(20) < 1 ||
      bytes.readUInt32BE(16) > 256 ||
      bytes.readUInt32BE(20) > 256 ||
      bytes.subarray(-8, -4).toString() !== 'IEND'
    )
      throw new InputError('Use a PNG profile photo no larger than 256 × 256 pixels and 100 KB.');
    const photoVersion = randomUUID();
    await db
      .collection('profilePhotos')
      .updateOne(
        { _id: user._id, workspaceId: req.workspaceId },
        { $set: { base64: bytes.toString('base64'), updatedAt: new Date() } },
        { upsert: true },
      );
    await db
      .collection('users')
      .updateOne({ _id: user._id, ...memberFilter(req.workspaceId) }, { $set: { photoVersion } });
    res.json({ photoVersion });
  });
  app.delete(paths, limit, async (req, res) => {
    const user = await target(req, true);
    await db.collection('profilePhotos').deleteOne({ _id: user._id, workspaceId: req.workspaceId });
    await db
      .collection('users')
      .updateOne(
        { _id: user._id, ...memberFilter(req.workspaceId) },
        { $unset: { photoVersion: '' } },
      );
    res.status(204).end();
  });
}
