/** Normalize legacy automated actor labels without rewriting saved history. */
export const systemActor = (label) => (label === 'ServiceTrident' ? 'System' : label);

/** Server-owned audit fields. Never invent creator history for existing legacy records. */
export function auditStamp(current, actor, now = new Date()) {
  const updatedBy = actor.email || actor.displayName || 'System';
  const updatedById = actor._id ? String(actor._id) : undefined;
  return {
    ...(current
      ? Object.fromEntries(
          ['createdAt', 'createdBy', 'createdById', 'demoBatchId']
            .filter((key) => current[key] !== undefined)
            .map((key) => [key, current[key]]),
        )
      : {
          createdAt: now,
          createdBy: updatedBy,
          ...(updatedById ? { createdById: updatedById } : {}),
        }),
    updatedAt: now,
    updatedBy,
    ...(updatedById ? { updatedById } : {}),
    revision: (current?.revision ?? -1) + 1,
  };
}

/** Explicit audit projection keeps account secrets and tenant data out of metadata responses. */
export function auditFields(record) {
  return Object.fromEntries(
    [
      'demoBatchId',
      'createdAt',
      'createdBy',
      'createdById',
      'updatedAt',
      'updatedBy',
      'updatedById',
      'revision',
    ]
      .filter((key) => record[key] !== undefined)
      .map((key) => [
        key,
        ['createdBy', 'updatedBy'].includes(key) && !record[`${key}Id`]
          ? systemActor(record[key])
          : record[key],
      ]),
  );
}

/** Append metadata only: never copy request bodies, record contents, tokens, or credentials. */
export async function writeAudit(db, entry) {
  const text = (value, max = 160) => String(value ?? '').slice(0, max);
  await db.collection('auditEvents').insertOne({
    workspaceId: entry.workspaceId,
    createdAt: new Date(),
    actorId: text(entry.actorId),
    actor: text(entry.actor || 'System'),
    actualRole: text(entry.actualRole || 'system', 32),
    effectiveRole: text(entry.effectiveRole || 'system', 32),
    source: entry.source === 'worker' ? 'worker' : 'api',
    action: text(entry.action, 40),
    recordType: text(entry.recordType, 64),
    recordId: text(entry.recordId, 64),
    parentId: text(entry.parentId, 64),
    operation: text(entry.operation, 200),
    fields: text(entry.fields, 1000),
    outcome: entry.outcome === 'failed' ? 'failed' : 'success',
    statusCode: Number.isInteger(entry.statusCode) ? entry.statusCode : 200,
    requestId: text(entry.requestId, 64),
  });
}
