import { statusTimeZone, statusMidnight } from '../../../shared/domain/status-time-zone.js';
import { serviceHealth, rollupHealth } from '@servicetrident/shared/domain/service-health';
import { subscriptionInfo } from '@servicetrident/shared/status/subscriptions';
import { statusRange } from '@servicetrident/shared/domain/status-range';
import { catalog } from '../routes/services.js';

/** Summarize operational state without treating absent or paused checks as healthy. */
export const rollup = rollupHealth;

/** Build status-only output; public responses exclude URLs, headers, bodies, and account details.
 * @param {import('mongodb').Db} db @param {import('mongodb').ObjectId} userId
 * @param {Function} serializeMonitor @param {boolean} [publicView] @returns {Promise<object>}
 */
export async function statusData(
  db,
  userId,
  serializeMonitor,
  publicView = false,
  range = '30',
  requestedTimeZone = 'UTC',
) {
  const timeZone = statusTimeZone(requestedTimeZone);
  const generatedAt = new Date();
  const { start, end } = statusRange(range, generatedAt, timeZone);
  const since = statusMidnight(start.toISOString().slice(0, 10), timeZone);
  const until = new Date(
    Math.min(
      +generatedAt,
      +statusMidnight(new Date(+end + 86400000).toISOString().slice(0, 10), timeZone),
    ),
  );
  const [raw, data, recentDays, archivedDays] = await Promise.all([
    db.collection('monitors').find({ userId }).sort({ name: 1 }).toArray(),
    catalog(db, userId),
    db
      .collection('events')
      .aggregate([
        {
          $match: {
            userId,
            monitorId: { $exists: true, $ne: null },
            sourceType: { $ne: 'external' },
            probeId: { $exists: false },
            checkedAt: { $gte: since, $lt: until },
          },
        },
        {
          $group: {
            _id: {
              monitorId: '$monitorId',
              day: {
                $dateToString: { format: '%Y-%m-%d', date: '$checkedAt', timezone: timeZone },
              },
            },
            total: { $sum: 1 },
            up: { $sum: { $cond: [{ $eq: ['$status', 'up'] }, 1, 0] } },
          },
        },
        { $sort: { '_id.day': 1 } },
      ])
      .toArray(),
    // Daily archives cannot be split accurately into another timezone after raw checks expire.
    timeZone !== 'UTC'
      ? Promise.resolve([])
      : db
          .collection('statusDaily')
          .find({
            '_id.userId': userId,
            '_id.day': {
              $gte: since.toISOString().slice(0, 10),
              $lte: end.toISOString().slice(0, 10),
            },
          })
          .toArray(),
  ]);
  const daily = new Map(archivedDays.map((day) => [`${day._id.monitorId}-${day._id.day}`, day]));
  for (const day of recentDays) {
    const key = `${day._id.monitorId}-${day._id.day}`;
    if (!daily.has(key) || day.total >= daily.get(key).total) daily.set(key, day);
  }
  const days = [...daily.values()];
  const monitors = raw.map((monitor) => {
    const history = days
      .filter((day) => String(day._id?.monitorId) === String(monitor._id))
      .map((day) => ({ day: day._id.day, total: day.total, up: day.up }));
    const total = history.reduce((sum, day) => sum + day.total, 0);
    const up = history.reduce((sum, day) => sum + day.up, 0);
    const item = serializeMonitor(monitor);
    // A concurrently removed service must never hide its monitors.
    if (!data.services.some((service) => service.id === item.serviceId)) {
      item.serviceId = null;
      item.component = '';
    }
    const safe = publicView
      ? {
          id: item.id,
          name: item.name,
          serviceId: item.serviceId,
          component: item.component,
          status: item.status,
          paused: item.paused,
        }
      : item;
    return { ...safe, history, total, uptime: total ? (up / total) * 100 : null };
  });
  const health = serviceHealth(data.services, raw);
  const services = data.services.map((service) => ({
    ...(publicView
      ? {
          id: service.id,
          name: service.name,
          description: service.description,
          dependencyIds: service.dependencyIds,
        }
      : service),
    status: health.get(service.id),
    message:
      data.serviceMessages?.find(
        (message) => message.serviceId === service.id && message.enabled,
      ) ?? null,
  }));
  const collections = data.collections.map((collection) => ({
    ...(publicView
      ? { id: collection.id, name: collection.name, serviceIds: collection.serviceIds }
      : collection),
    status: rollup(
      collection.serviceIds.map(
        (serviceId) => services.find((service) => service.id === serviceId)?.status ?? 'unknown',
      ),
    ),
  }));
  const icon = await db
    .collection('statusIcons')
    .findOne({ _id: userId }, { projection: { updatedAt: 1 } });
  return {
    ...(publicView ? { subscriptions: await subscriptionInfo(db, data) } : {}),
    iconUrl: icon
      ? `${publicView ? `/api/public/status/${data.publicToken}/icon` : '/api/status-settings/icon'}?v=${icon.updatedAt.getTime()}`
      : null,
    monitors,
    services,
    collections,
    statusTheme: data.statusTheme || 'light',
    banner: data.banner?.enabled ? data.banner : null,
    generatedAt,
    timeZone,
  };
}
