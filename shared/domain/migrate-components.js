import { ObjectId } from 'mongodb';
import { createHash } from 'node:crypto';
import { writeAudit } from './audit.js';

/** Materialize legacy labels once, retaining monitored history and using only workspace-owned links. */
export async function migrateComponents(db) {
  const catalogs = await db
    .collection('catalogs')
    .find({ componentSchemaVersion: { $ne: 1 } })
    .toArray();
  for (const catalog of catalogs) {
    const monitors = await db
      .collection('monitors')
      .find({ userId: catalog._id }, { projection: { serviceId: 1, component: 1, componentId: 1 } })
      .toArray();
    const services = [];
    for (const service of catalog.services || []) {
      const candidates = [
        ...(service.components || []),
        ...monitors
          .filter((row) => String(row.serviceId) === service.id && row.component)
          .map((row) => ({ id: row.componentId, name: row.component })),
      ];
      const componentIds = new Set(service.componentIds || []);
      for (const candidate of candidates) {
        const name = String(candidate.name || '')
          .trim()
          .slice(0, 80);
        if (!name) continue;
        const nameKey = name.toLowerCase();
        const _id = new ObjectId(
          createHash('sha256').update(`${catalog._id}:${nameKey}`).digest('hex').slice(0, 24),
        );
        let component;
        try {
          component = await db
            .collection('components')
            .findOneAndUpdate(
              { _id, workspaceId: catalog._id, nameKey },
              {
                $setOnInsert: {
                  _id,
                  workspaceId: catalog._id,
                  name,
                  nameKey,
                  description: '',
                  createdAt: new Date(),
                  createdBy: 'System',
                  updatedAt: new Date(),
                  updatedBy: 'System',
                  revision: 0,
                  ...(service.demoBatchId ? { demoBatchId: service.demoBatchId } : {}),
                },
              },
              { upsert: true, returnDocument: 'after' },
            );
        } catch (error) {
          if (error.code !== 11000) throw error;
          component = await db
            .collection('components')
            .findOne({ workspaceId: catalog._id, nameKey });
        }
        componentIds.add(String(component._id));
        await db
          .collection('monitors')
          .updateMany(
            {
              userId: catalog._id,
              serviceId: new ObjectId(service.id),
              component: candidate.name,
              componentId: { $ne: String(component._id) },
            },
            {
              $set: {
                componentId: String(component._id),
                component: name,
                updatedAt: new Date(),
                updatedBy: 'System',
              },
              $inc: { revision: 1 },
            },
          );
      }
      const { components: _legacy, ...saved } = service;
      services.push({ ...saved, componentIds: [...componentIds] });
    }
    const result = await db
      .collection('catalogs')
      .updateOne(
        { _id: catalog._id, revision: catalog.revision },
        { $set: { services, componentSchemaVersion: 1 }, $inc: { revision: 1 } },
      );
    if (result.matchedCount)
      await writeAudit(db, {
        workspaceId: catalog._id,
        actor: 'System',
        action: 'migrate',
        recordType: 'components',
        operation: 'Migrate managed component references',
        fields: 'componentIds,componentId',
        outcome: 'success',
      });
  }
}
