import {
  INCIDENT_SOURCES,
  incidentSourceLabel,
} from '@servicetrident/shared/domain/incident-source';
import { tableSearch } from '@servicetrident/shared/domain/table-search';
import { InputError } from '@servicetrident/shared/validation/validation';
import { choice, identifier, invalid } from '@servicetrident/shared/validation/fields';

/** End-user visibility is the same for lists, detail reads, and exports. */
export function incidentAccess(req) {
  return {
    workspaceId: req.workspaceId,
    ...(req.role === 'user'
      ? { $or: [{ createdById: String(req.user._id) }, { openedForId: String(req.user._id) }] }
      : {}),
  };
}

/** Users may submit incidents; viewers may only read them. */
export function requireIncidentCreator(req, res, next) {
  if (!['admin', 'responder', 'user'].includes(req.role))
    throw new InputError('Your role cannot create incidents.', 403);
  next();
}

/** Bound and validate list filters; CSV uses exactly the same criteria. */
export function incidentQuery(query, req) {
  const filter = incidentAccess(req);
  Object.assign(
    filter,
    tableSearch(query, {
      title: '$title',
      serviceName: '$serviceName',
      assignmentGroupName: { $ifNull: ['$assignmentGroupName', 'Unassigned'] },
      severity: { $ifNull: ['$severityLabel', '$severity'] },
      status: { $ifNull: ['$statusLabel', '$status'] },
      source: Object.entries(INCIDENT_SOURCES).reduceRight(
        (fallback, [value, label]) => ({
          $cond: [{ $eq: ['$source', value] }, { $literal: label }, fallback],
        }),
        { $literal: 'Unknown' },
      ),
      createdAt: '$createdAt',
    }),
  );
  if (query.status)
    filter.status = choice(query.status, ['open', 'acknowledged', 'resolved'], 'status');
  if (query.source) {
    const source = choice(query.source, Object.keys(INCIDENT_SOURCES), 'source');
    filter.source =
      source === 'unknown'
        ? { $nin: Object.keys(INCIDENT_SOURCES).filter((key) => key !== 'unknown') }
        : source;
  }
  if (query.serviceId) filter.serviceId = identifier(query.serviceId, 'serviceId');
  const sortBy = choice(
    query.sortBy ?? 'createdAt',
    [
      'createdAt',
      'updatedAt',
      'title',
      'severity',
      'status',
      'serviceName',
      'assignmentGroupName',
      'source',
    ],
    'sortBy',
  );
  const order = choice(query.order ?? 'desc', ['asc', 'desc'], 'order');
  const page = Number(query.page ?? 1),
    pageSize = Number(query.pageSize ?? 10);
  if (!Number.isSafeInteger(page) || page < 1 || page > 100000 || ![10, 25, 50].includes(pageSize))
    invalid('page', 'Choose a valid page and 10, 25, or 50 rows.');
  return { filter, sort: { [sortBy]: order === 'asc' ? 1 : -1, _id: -1 }, page, pageSize };
}

/** Remove MongoDB identifiers from client-facing incident records. */
export const incidentView = ({ _id, workspaceId, triggeringChecks, ...rest }) => ({
  id: String(_id),
  ...rest,
  sourceLabel: incidentSourceLabel(rest.source),
  monitorTriggersRecorded: Array.isArray(triggeringChecks),
  hasMonitorEvents: (triggeringChecks?.length ?? 0) > 0,
  ...(rest.alertGrouping === 'service'
    ? {
        groupedMonitorCount: new Set((triggeringChecks ?? []).map((check) => check.monitorId)).size,
      }
    : {}),
});
