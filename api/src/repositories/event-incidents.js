export const eventLinkKey = (event) =>
  event.monitorId
    ? `${event.monitorId}:${new Date(event.checkedAt).toISOString()}`
    : `event:${event._id}`;

/** Resolve exact trigger pairs for a bounded event batch, with tenant scope and safe incident projections. */
export async function eventIncidents(db, workspaceId, events) {
  const key = (monitorId, checkedAt) => `${monitorId}:${new Date(checkedAt).toISOString()}`;
  const links = new Map(events.map((event) => [eventLinkKey(event), []]));
  if (!events.length) return links;
  if (!events.some((event) => event.monitorId || event.alertId)) return links;
  const cursor = db
    .collection('incidents')
    .find(
      {
        workspaceId,
        $or: [
          ...events
            .filter((event) => event.monitorId)
            .map((event) => ({
              triggeringChecks: {
                $elemMatch: { monitorId: String(event.monitorId), checkedAt: event.checkedAt },
              },
            })),
          ...events
            .filter((event) => event.alertId)
            .map((event) => ({ eventAlertId: event.alertId })),
        ],
      },
      {
        projection: {
          _id: 1,
          title: 1,
          status: 1,
          number: 1,
          triggeringChecks: 1,
          eventAlertId: 1,
        },
      },
    )
    .sort({ createdAt: -1, _id: -1 })
    .batchSize(100);
  try {
    for await (const incident of cursor) {
      if (incident.eventAlertId)
        for (const event of events.filter((row) => row.alertId === incident.eventAlertId)) {
          const list = links.get(eventLinkKey(event));
          if (list && list.length < 101)
            list.push({
              id: String(incident._id),
              title: incident.title,
              number: incident.number,
              status: incident.status,
            });
        }
      const seen = new Set();
      for (const check of incident.triggeringChecks ?? []) {
        const pair = key(check.monitorId, check.checkedAt),
          list = links.get(pair);
        if (!list || seen.has(pair)) continue;
        seen.add(pair);
        if (list.length < 101)
          list.push({
            id: String(incident._id),
            title: incident.title,
            number: incident.number,
            status: incident.status,
          });
      }
    }
  } finally {
    await cursor.close?.();
  }
  return links;
}

/** Keep exports streaming and avoid one incident lookup per row. */
export function withEventIncidents(db, workspaceId, cursor) {
  return {
    close: () => cursor.close?.(),
    async *[Symbol.asyncIterator]() {
      const enrich = async (rows) => {
        const links = await eventIncidents(db, workspaceId, rows);
        return rows.map((row) => {
          const incidents = links.get(eventLinkKey(row)) || [];
          return {
            ...row,
            incidents: incidents.slice(0, 100),
            incidentsTruncated: incidents.length > 100,
            incidentTitles: incidents
              .slice(0, 100)
              .map((incident) => incident.number)
              .join('; '),
          };
        });
      };
      try {
        let batch = [];
        for await (const row of cursor) {
          batch.push(row);
          if (batch.length === 100) {
            yield* await enrich(batch);
            batch = [];
          }
        }
        if (batch.length) yield* await enrich(batch);
      } finally {
        await cursor.close?.();
      }
    },
  };
}
