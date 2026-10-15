import { randomUUID } from 'node:crypto';
import { writeAudit } from '@servicetrident/shared/domain/audit';

const safeFields = new Set([
  'title',
  'name',
  'displayName',
  'description',
  'healthPolicy',
  'status',
  'severity',
  'priority',
  'serviceId',
  'serviceIds',
  'incidentId',
  'assignmentGroupId',
  'assigneeId',
  'openedForId',
  'knowledgeIds',
  'ownerIds',
  'ownerGroupIds',
  'primaryContactId',
  'collectionIds',
  'dependencyIds',
  'role',
  'disabled',
  'enabled',
  'visibility',
  'intervalMinutes',
  'paused',
  'method',
  'followRedirects',
  'fields',
  'custom',
  'resolutionNotes',
  'attachmentIds',
  'contentDocument',
  'body',
  'kind',
  'shifts',
  'memberIds',
  'startsAt',
  'endsAt',
  'scopes',
  'apiKeyEnabled',
  'oauthEnabled',
  'expiresInDays',
]);
const objectId = (value) => (/^[a-f\d]{24}$/i.test(String(value ?? '')) ? String(value) : '');

/** Audit every API response, including list reads, failures and machine authentication.
 * Append before ending the response. Mutations and audit inserts are separate writes; this is
 * application history, not a transactional or tamper-proof compliance ledger.
 */
export function auditActivity(db) {
  return (req, res, next) => {
    const path = req.path;
    const mutation = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method);
    const recordRead = req.method === 'GET' && /\/[a-f\d]{24}(?:\/|$)/i.test(path);
    const exporting =
      req.method === 'GET' &&
      (req.query.export === 'csv' ||
        ['csv', 'pdf'].includes(req.query.recordExport) ||
        path.endsWith('/export'));
    const requestId = randomUUID();
    const originalJson = res.json,
      originalEnd = res.end;
    let payload,
      ending = false;
    res.json = function (value) {
      payload = value;
      return originalJson.call(this, value);
    };
    res.end = function (...args) {
      if (ending) return this;
      ending = true;
      // Identity is resolved later in the pipeline. Unverified requests never inherit
      // a tenant from input, cookies, client IDs or record IDs.
      const actor = {
        workspaceId: req.workspaceId ?? null,
        actorId: req.user?._id ?? '',
        actor: req.user?.displayName || req.user?.email || 'System',
        actualRole: req.actualRole || 'unauthenticated',
        effectiveRole: req.serviceAccount ? 'service_account' : req.role || 'unauthenticated',
        requestId,
      };
      const route = typeof req.route?.path === 'string' ? req.route.path : '/api/unknown';
      const parts = route
        .replace(/^\/api\//, '')
        .replace(/^\//, '')
        .split('/');
      const record =
        payload?.group ||
        payload?.item ||
        payload?.incident ||
        payload?.monitor ||
        payload?.attachment ||
        payload?.user;
      // Collection-backed exports may identify only an item actually returned by the authorized read.
      const exportId = exporting && objectId(req.query.recordExportId);
      const verifiedExportId =
        exportId &&
        ['services', 'collections', 'groups', 'members', 'integrations', 'shifts'].some(
          (key) => Array.isArray(payload?.[key]) && payload[key].some((row) => row.id === exportId),
        )
          ? exportId
          : '';
      const recordId =
        objectId(res.locals.auditRecordId) ||
        verifiedExportId ||
        objectId(req.params.fileId) ||
        objectId(record?.id) ||
        objectId(req.params.id) ||
        objectId(req.params.recordId) ||
        (parts[0] === 'auth' ? String(actor.actorId) : '');
      const action = exporting
        ? 'export'
        : recordRead
          ? 'view'
          : {
              POST: parts[0] === 'auth' || parts.includes('test') ? 'execute' : 'create',
              PUT: 'update',
              PATCH: 'update',
              DELETE: 'delete',
            }[req.method] || 'request';
      const entry = {
        ...actor,
        recordId,
        parentId:
          objectId(req.params.recordId) ||
          (parts.includes('comments') ? objectId(req.params.id) : ''),
        recordType:
          res.locals.auditRecordType ||
          (parts.includes('comments')
            ? 'comments'
            : parts[0] === 'tables'
              ? String(req.params.kind)
              : parts[0]),
        operation:
          res.locals.auditOperation ||
          `${req.method} ${route}${['csv', 'pdf'].includes(req.query.recordExport) ? ` (${req.query.recordExport.toUpperCase()} record export)` : ''}`,
        action,
        fields:
          mutation && req.body && !Buffer.isBuffer(req.body)
            ? Object.keys(req.body)
                .filter((key) => safeFields.has(key))
                .join(', ')
            : '',
        outcome: res.statusCode < 400 ? 'success' : 'failed',
        statusCode: res.statusCode,
      };
      void Promise.all(
        (res.locals.auditChanges?.length ? res.locals.auditChanges : [{}]).map((change) =>
          writeAudit(db, {
            ...entry,
            ...(objectId(change.id)
              ? { recordId: objectId(change.id), action: change.action }
              : {}),
          }),
        ),
      )
        .then(() => originalEnd.apply(res, args))
        .catch(() => {
          console.error('Audit history could not be saved', actor.requestId);
          if (!res.headersSent) {
            res.statusCode = 503;
            res.removeHeader('Content-Length');
            res.setHeader('Content-Type', 'application/json');
            originalEnd.call(
              res,
              JSON.stringify({
                error:
                  'The operation may have completed, but its audit entry could not be saved. Refresh before retrying.',
              }),
            );
          } else originalEnd.apply(res, args);
        });
      return this;
    };
    next();
  };
}
