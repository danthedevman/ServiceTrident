import { randomUUID } from 'node:crypto';
import { settings } from '../repositories/settings.js';
import { InputError } from '@servicetrident/shared/validation/input-error';
/** Serialize project moves with task writes across API replicas on both database backends. */
export async function withProjectMutation(db, workspaceId, run, response) {
  await settings(db, workspaceId);
  const token = randomUUID(),
    now = new Date();
  const lock = await db.collection('operations').findOneAndUpdate(
    {
      _id: workspaceId,
      $or: [{ projectMutationUntil: { $lte: now } }, { projectMutationUntil: { $exists: false } }],
    },
    { $set: { projectMutationToken: token, projectMutationUntil: new Date(+now + 300000) } },
    { returnDocument: 'after' },
  );
  if (!lock) throw new InputError('Project tasks are being updated. Try again shortly.', 409);
  let output;
  const send = response?.json;
  if (response)
    response.json = (body) => {
      output = body;
      return response;
    };
  let result;
  try {
    result = await run();
  } finally {
    if (response) response.json = send;
    await db
      .collection('operations')
      .updateOne(
        { _id: workspaceId, projectMutationToken: token },
        { $unset: { projectMutationUntil: '', projectMutationToken: '' } },
      );
  }
  // Release before responding, so the next sequential task write cannot race the lease cleanup.
  if (response && output !== undefined) send.call(response, output);
  return result;
}
