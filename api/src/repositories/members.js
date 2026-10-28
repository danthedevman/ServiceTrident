/** Include the legacy workspace owner and explicitly attached teammates. */
export function memberFilter(workspaceId) {
  return { $or: [{ _id: workspaceId }, { workspaceId }] };
}

/** Exclude credentials from every member response. */
export async function members(db, workspaceId) {
  return db
    .collection('users')
    .find(memberFilter(workspaceId), {
      projection: {
        email: 1,
        displayName: 1,
        photoVersion: 1,
        jobTitle: 1,
        department: 1,
        phone: 1,
        timeZone: 1,
        location: 1,
        slackId: 1,
        role: 1,
        disabled: 1,
        workspaceId: 1,
        demoBatchId: 1,
        createdAt: 1,
        createdBy: 1,
        createdById: 1,
        updatedAt: 1,
        updatedBy: 1,
        updatedById: 1,
        revision: 1,
      },
    })
    .toArray();
}
