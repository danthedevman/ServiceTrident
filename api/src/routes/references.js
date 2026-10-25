import { articleAccess, knowledgeAccess } from '../domain/knowledge-access.js';
import { InputError } from '@servicetrident/shared/validation/input-error';
import { tableSearch } from '@servicetrident/shared/domain/table-search';
import { catalog, id } from './services.js';
import { settings } from '../repositories/settings.js';
import { memberFilter } from '../repositories/members.js';
import { incidentAccess } from '../domain/incidents.js';

/** Reference results are authorized, bounded, and searched on the server; selected labels load separately. */
export function installReferenceRoutes(app, db) {
  app.get('/api/references/:type', async (req, res) => {
    const type = req.params.type,
      q = String(req.query.q ?? '').trim(),
      page = Number(req.query.page ?? 1);
    const excludeId = String(req.query.excludeId ?? '');
    const selected = String(req.query.selected ?? '')
      .split(',')
      .filter(Boolean);
    if (
      q.length > 100 ||
      (excludeId && !/^[a-f\d]{24}$/i.test(excludeId)) ||
      !Number.isSafeInteger(page) ||
      page < 1 ||
      page > 100000 ||
      selected.length > 500 ||
      selected.some((v) => !/^[a-f\d]{24}$/i.test(v))
    )
      throw new InputError('Invalid reference search.');
    if (req.role === 'user' && !['services', 'members', 'incidents'].includes(type))
      throw new InputError('Reference unavailable.', 403);
    const definitions = {
      members: ['users', 'displayName'],
      incidents: ['incidents', 'title'],
      tasks: ['tasks', 'title'],
      knowledge: ['articles', 'title'],
      knowledgeBases: ['knowledgeBases', 'title'],
      monitors: ['monitors', 'name'],
      components: ['components', 'name'],
    };
    if (Object.hasOwn(definitions, type)) {
      const [collection, label] = definitions[type];
      const base =
        type === 'members'
          ? req.role === 'user'
            ? { _id: req.user._id }
            : memberFilter(req.workspaceId)
          : type === 'incidents'
            ? incidentAccess(req)
            : type === 'monitors'
              ? { userId: req.workspaceId }
              : { workspaceId: req.workspaceId };
      if (type === 'knowledge') base.$and = [await articleAccess(db, req)];
      if (type === 'knowledgeBases')
        base._id = { $in: (await knowledgeAccess(db, req)).readable.map(id) };
      if (type === 'components' && req.query.serviceId) {
        const service = (await catalog(db, req.workspaceId)).services.find(
          (row) => row.id === req.query.serviceId,
        );
        if (!service) throw new InputError('Service not found.', 404);
        base._id = { $in: (service.componentIds || []).map(id) };
      }
      if (type === 'tasks' && req.query.projectId) {
        const projectId = String(req.query.projectId);
        if (
          !/^[a-f\d]{24}$/i.test(projectId) ||
          (await settings(db, req.workspaceId)).projects?.every(
            (p) => p.id !== projectId || p.deleting,
          )
        )
          throw new InputError('Project not found.', 404);
        base.projectId = projectId;
      }
      if (type === 'members' && req.query.groupId) {
        const groupId = String(req.query.groupId);
        if (!/^[a-f\d]{24}$/i.test(groupId)) throw new InputError('Invalid group.');
        const group = (await settings(db, req.workspaceId)).groups?.find(
          (row) => row.id === groupId,
        );
        if (!group) throw new InputError('Group not found.', 404);
        base.$and = [...(base.$and ?? []), { _id: { $in: group.memberIds.map(id) } }];
      }
      const search = tableSearch(
        { search: q },
        {
          label: `$${label}`,
          ...(type === 'members' ? { email: '$email' } : {}),
          ...(type === 'incidents' ? { number: '$number' } : {}),
        },
      );
      const filter = {
        $and: [
          base,
          search,
          ...(excludeId ? [{ _id: { $ne: id(excludeId) } }] : []),
          ...(type === 'members' ? [{ disabled: { $ne: true } }] : []),
        ],
      };
      const projection = { _id: 1, [label]: 1, ...(type === 'members' ? { email: 1 } : {}) };
      const [matches, saved] = await Promise.all([
        db
          .collection(collection)
          .find(filter, { projection })
          .sort({ [label]: 1, _id: 1 })
          .skip((page - 1) * 30)
          .limit(31)
          .toArray(),
        selected.length
          ? db
              .collection(collection)
              .find({ $and: [base, { _id: { $in: selected.map(id) } }] }, { projection })
              .toArray()
          : [],
      ]);
      const view = (row) => ({
        id: String(row._id),
        label:
          type === 'incidents' && row.number
            ? `${row.number} · ${row[label]}`
            : row[label] || row.email || 'Untitled record',
      });
      return res.json({
        options: matches.slice(0, 30).map(view),
        selected: saved.map(view),
        hasMore: matches.length > 30,
      });
    }
    let rows;
    if (['services', 'collections'].includes(type))
      rows = (await catalog(db, req.workspaceId))[type];
    else if (type === 'notificationIntegrations') {
      if (req.role !== 'admin') throw new InputError('Admin access required.', 403);
      rows = ((await settings(db, req.workspaceId)).integrations || []).filter(
        (row) =>
          row.enabled &&
          !row.demoBatchId &&
          ['email', 'slack', 'teams', 'discord', 'pagerduty', 'opsgenie'].includes(row.type),
      );
    } else if (type === 'projects')
      rows = ((await settings(db, req.workspaceId)).projects ?? []).filter((row) => !row.deleting);
    else if (type === 'groups') rows = (await settings(db, req.workspaceId)).groups ?? [];
    else throw new InputError('Reference unavailable.', 404);
    const matches = rows
      .filter(
        (row) =>
          row.id !== excludeId && row.name.toLocaleLowerCase().includes(q.toLocaleLowerCase()),
      )
      .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
    const view = (row) => ({ id: row.id, label: row.name });
    res.json({
      options: matches.slice((page - 1) * 30, page * 30).map(view),
      selected: rows.filter((row) => selected.includes(row.id)).map(view),
      hasMore: matches.length > page * 30,
    });
  });
}
