import { emptyPins, validatePins } from '@servicetrident/shared/domain/pins';
import { InputError } from '@servicetrident/shared/validation/input-error';
export function installPinRoutes(app, db) {
  app.get('/api/pins', async (req, res) => {
    const account = await db
      .collection('users')
      .findOne({ _id: req.user._id }, { projection: { pins: 1, pinsRevision: 1 } });
    res.json({ ...(account?.pins ?? emptyPins()), revision: account?.pinsRevision ?? 0 });
  });
  app.put('/api/pins', async (req, res) => {
    const pins = validatePins(req.body);
    const result = await db
      .collection('users')
      .updateOne(
        {
          _id: req.user._id,
          ...(req.body.revision === 0
            ? { $or: [{ pinsRevision: 0 }, { pinsRevision: { $exists: false } }] }
            : { pinsRevision: req.body.revision }),
        },
        { $set: { pins }, $inc: { pinsRevision: 1 } },
      );
    if (!result.matchedCount)
      throw new InputError('Pinned items changed. Refresh before saving.', 409);
    res.json({ ...pins, revision: req.body.revision + 1 });
  });
}
