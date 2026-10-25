import { articleAccess } from '../domain/knowledge-access.js';
import { text, choice, invalid } from '@servicetrident/shared/validation/fields';
import { memberFilter } from '../repositories/members.js';

/** Search only authorized workspace records, using literal text and bounded result projections. */
export function installSearchRoute(app, db) {
  app.get('/api/search', async (req, res) => {
    const query = text(req.query.q ?? '', 'q', 100);
    if (query.length < 2) invalid('q', 'Enter at least two characters.');
    const type = choice(
      req.query.type ?? 'all',
      [
        'all',
        'incidents',
        'tasks',
        'rcas',
        'knowledge',
        'services',
        'components',
        'collections',
        'monitors',
        'groups',
        'users',
      ],
      'type',
    );
    const knowledgeFilter = await articleAccess(db, req);
    const regex = { $regex: query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' };
    const workspaceId = req.workspaceId,
      userId = String(req.user._id),
      limited = req.role === 'user';
    const wanted = (name) => type === 'all' || type === name;
    const jobs = [];
    /** Every database query has a tenant filter, explicit projection, result limit, and deadline. */
    function search(name, collection, filter, fields, label, url) {
      if (collection === 'articles') filter = { $and: [filter, knowledgeFilter] };
      if (!wanted(name)) return;
      jobs.push(
        db
          .collection(collection)
          .find(
            { $and: [filter, { $or: fields.map((field) => ({ [field]: regex })) }] },
            { projection: Object.fromEntries(fields.map((field) => [field, 1])), maxTimeMS: 2000 },
          )
          .sort({ _id: -1 })
          .limit(6)
          .toArray()
          .then((rows) =>
            rows.map((row) => ({
              id: String(row._id),
              type: name,
              title: row.title || row.name || row.displayName || row.email,
              description: row.email || '',
              label,
              href: url?.(row),
            })),
          ),
      );
    }
    search(
      'incidents',
      'incidents',
      {
        workspaceId,
        ...(limited ? { $or: [{ createdById: userId }, { openedForId: userId }] } : {}),
      },
      ['title', 'description'],
      'Incident',
      (row) => `/incidents/${row._id}`,
    );
    search(
      'users',
      'users',
      limited ? { _id: req.user._id } : memberFilter(workspaceId),
      ['displayName', 'email'],
      'User',
      (row) =>
        req.role === 'admin'
          ? `/workspace/${row._id}`
          : String(row._id) === String(req.user._id)
            ? '/profile'
            : undefined,
    );
    if (!limited) {
      search(
        'components',
        'components',
        { workspaceId },
        ['name', 'description'],
        'Component',
        (row) => `/components/${row._id}`,
      );
      search(
        'rcas',
        'rcas',
        { workspaceId, status: { $ne: 'archived' } },
        ['title', 'summary'],
        'RCA',
        (row) => `/rcas/${row._id}`,
      );
      search(
        'tasks',
        'tasks',
        { workspaceId },
        ['title', 'description'],
        'Task',
        (row) => `/tasks/${row._id}`,
      );
      search(
        'knowledge',
        'articles',
        { workspaceId },
        ['title', 'summary', 'content'],
        'Knowledge article',
        (row) => `/knowledge/${row._id}`,
      );
      search(
        'monitors',
        'monitors',
        { userId: workspaceId },
        ['name', 'url', 'component'],
        'Monitor',
        (row) => `/monitors/${row._id}`,
      );
      if (wanted('services') || wanted('collections'))
        jobs.push(
          db
            .collection('catalogs')
            .findOne({ _id: workspaceId }, { projection: { services: 1, collections: 1 } })
            .then((catalog) =>
              ['services', 'collections'].flatMap((name) =>
                !wanted(name)
                  ? []
                  : (catalog?.[name] || [])
                      .filter((row) =>
                        `${row.name} ${row.description || ''}`
                          .toLowerCase()
                          .includes(query.toLowerCase()),
                      )
                      .slice(0, 6)
                      .map((row) => ({
                        id: row.id,
                        type: name,
                        title: row.name,
                        label: name === 'services' ? 'Service' : 'Collection',
                        href: `/${name}/${row.id}`,
                      })),
              ),
            ),
        );
      if (wanted('groups'))
        jobs.push(
          db
            .collection('operations')
            .findOne({ _id: workspaceId }, { projection: { groups: 1 } })
            .then((settings) =>
              (settings?.groups || [])
                .filter((row) =>
                  `${row.name} ${row.description || ''}`
                    .toLowerCase()
                    .includes(query.toLowerCase()),
                )
                .slice(0, 6)
                .map((row) => ({
                  id: row.id,
                  type: 'groups',
                  title: row.name,
                  label: 'Group',
                  href: `/groups/${row.id}`,
                })),
            ),
        );
    }
    res.json({ results: (await Promise.all(jobs)).flat(), limitPerType: 6 });
  });
}
