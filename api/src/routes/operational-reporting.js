import { InputError } from '@servicetrident/shared/validation/input-error';
export function installOperationalReporting(app, db) {
  app.get('/api/operational-report', async (req, res) => {
    if (req.role === 'user') throw new InputError('Workspace access required.', 403);
    const days = Number(req.query.days || 30);
    if (![7, 30, 90].includes(days)) throw new InputError('Choose 7, 30, or 90 days.');
    const since = new Date(Date.now() - days * 86400000),
      workspaceId = req.workspaceId;
    const [latency, repeated, noisy, unowned, deliveryStates] = await Promise.all([
      db
        .collection('incidents')
        .aggregate([
          { $match: { workspaceId, createdAt: { $gte: since } } },
          {
            $group: {
              _id: null,
              total: { $sum: 1 },
              acknowledgeMs: { $sum: { $ifNull: ['$acknowledgmentDurationMs', 0] } },
              acknowledgeCount: {
                $sum: {
                  $cond: [{ $ne: [{ $ifNull: ['$acknowledgmentDurationMs', null] }, null] }, 1, 0],
                },
              },
              resolveMs: { $sum: { $ifNull: ['$resolutionDurationMs', 0] } },
              resolveCount: {
                $sum: {
                  $cond: [{ $ne: [{ $ifNull: ['$resolutionDurationMs', null] }, null] }, 1, 0],
                },
              },
            },
          },
        ])
        .toArray(),
      db
        .collection('incidents')
        .aggregate([
          { $match: { workspaceId, createdAt: { $gte: since }, serviceId: { $ne: null } } },
          {
            $group: {
              _id: '$serviceId',
              serviceName: { $first: '$serviceName' },
              count: { $sum: 1 },
            },
          },
          { $match: { count: { $gt: 1 } } },
          { $sort: { count: -1, _id: 1 } },
          { $limit: 10 },
        ])
        .toArray(),
      db
        .collection('events')
        .aggregate([
          {
            $match: {
              userId: workspaceId,
              checkedAt: { $gte: new Date(Date.now() - Math.min(days, 30) * 86400000) },
            },
          },
          {
            $group: {
              _id: {
                type: { $ifNull: ['$sourceType', 'monitor'] },
                name: { $ifNull: ['$sourceName', 'Legacy monitor'] },
              },
              count: { $sum: 1 },
              firing: { $sum: { $cond: [{ $eq: ['$status', 'down'] }, 1, 0] } },
            },
          },
          { $sort: { firing: -1, count: -1 } },
          { $limit: 10 },
        ])
        .toArray(),
      db.collection('eventAlerts').countDocuments({
        workspaceId,
        status: { $in: ['open', 'acknowledged'] },
        assignmentGroupId: { $in: [null, ''] },
      }),
      db
        .collection('deliveries')
        .aggregate([
          { $match: { workspaceId, createdAt: { $gte: since } } },
          { $group: { _id: { $ifNull: ['$deliveryState', '$status'] }, count: { $sum: 1 } } },
        ])
        .toArray(),
    ]);
    const metrics = latency[0] || { total: 0, acknowledgeCount: 0, resolveCount: 0 };
    res.json({
      days,
      generatedAt: new Date(),
      eventHistoryDays: Math.min(days, 30),
      incidents: metrics.total,
      meanAcknowledgmentMinutes: metrics.acknowledgeCount
        ? metrics.acknowledgeMs / metrics.acknowledgeCount / 60000
        : null,
      meanResolutionMinutes: metrics.resolveCount
        ? metrics.resolveMs / metrics.resolveCount / 60000
        : null,
      acknowledgmentSamples: metrics.acknowledgeCount,
      resolutionSamples: metrics.resolveCount,
      repeatedServices: repeated.map(({ _id, ...row }) => ({ serviceId: String(_id), ...row })),
      noisySources: noisy.map(({ _id, ...row }) => ({
        sourceType: _id.type,
        sourceName: _id.name,
        ...row,
      })),
      unownedAlerts: unowned,
      deliveryStates: deliveryStates.map(({ _id, count }) => ({ state: _id, count })),
    });
  });
}
