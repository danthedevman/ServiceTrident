/** Membership comes from the authenticated workspace, never report query parameters. */
export async function reportAssignments(db, workspaceId, userId) {
  const operations = await db
    .collection('operations')
    .findOne({ _id: workspaceId }, { projection: { groups: 1 } });
  return {
    assigneeId: String(userId),
    teamIds: (operations?.groups ?? [])
      .filter((group) => group.memberIds?.includes(String(userId)))
      .map((group) => group.id),
  };
}
