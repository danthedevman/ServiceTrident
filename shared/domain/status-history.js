/** Idempotent daily rollups preserve quarterly history without retaining response bodies. */
export async function summarizeStatusHistory(db) {
  const since = new Date(Date.now() - 30 * 86400000);
  await db
    .collection('events')
    .aggregate([
      {
        $match: {
          monitorId: { $exists: true, $ne: null },
          sourceType: { $ne: 'external' },
          checkedAt: { $gte: since },
        },
      },
      {
        $group: {
          _id: {
            userId: '$userId',
            monitorId: '$monitorId',
            day: { $dateToString: { format: '%Y-%m-%d', date: '$checkedAt', timezone: 'UTC' } },
          },
          total: { $sum: 1 },
          up: { $sum: { $cond: [{ $eq: ['$status', 'up'] }, 1, 0] } },
        },
      },
      {
        $set: {
          expiresAt: {
            $dateAdd: {
              startDate: { $dateFromString: { dateString: '$_id.day' } },
              unit: 'day',
              amount: 400,
            },
          },
        },
      },
      {
        $merge: {
          into: 'statusDaily',
          on: '_id',
          whenMatched: [
            { $replaceWith: { $cond: [{ $gte: ['$$new.total', '$total'] }, '$$new', '$$ROOT'] } },
          ],
          whenNotMatched: 'insert',
        },
      },
    ])
    .toArray();
}
