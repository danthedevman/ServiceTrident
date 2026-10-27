import { articleAccess } from '../domain/knowledge-access.js';
import { collaborationOptions, selectedIds, mayReadIncident } from './collaboration.js';
import { incidentSourceLabel } from '@servicetrident/shared/domain/incident-source';
import { incidentOrigin } from '../repositories/incident-origin.js';
import { assignmentGroup } from '../domain/assignment.js';
import { claimAttachments } from './attachments.js';
import { recordFields } from '@servicetrident/shared/forms/form-options';

import { ObjectId } from 'mongodb';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { csvRow } from '@servicetrident/shared/files/csv';
import { InputError } from '@servicetrident/shared/validation/validation';
import {
  text,
  choice,
  identifier,
  invalid,
  references,
} from '@servicetrident/shared/validation/fields';
import {
  validateValues,
  resolveChoices,
  validateMandatory,
} from '@servicetrident/shared/forms/schema';

import { catalog, id } from './services.js';
import { requireResponder } from '../auth/auth.js';
import { settings } from '../repositories/settings.js';

import { members } from '../repositories/members.js';

import { incidentAccess } from '../domain/incidents.js';
import { requireIncidentCreator } from '../domain/incidents.js';
import { incidentQuery } from '../domain/incidents.js';
import { incidentView } from '../domain/incidents.js';
/** Existing inaccessible links survive edits; only readable workspace articles can be added. */
async function linkedArticleIds(db, req, values, current = []) {
  if (
    !Array.isArray(values) ||
    values.length > 50 ||
    new Set(values).size !== values.length ||
    values.some((value) => typeof value !== 'string' || !/^[a-f\d]{24}$/i.test(value))
  )
    invalid('knowledgeIds', 'Choose up to 50 distinct articles.');
  const readable = await db
    .collection('articles')
    .find(
      {
        workspaceId: req.workspaceId,
        _id: { $in: [...new Set([...values, ...current])].map(id) },
        ...(await articleAccess(db, req)),
      },
      { projection: { _id: 1 } },
    )
    .toArray();
  const permitted = new Set(readable.map((row) => String(row._id)));
  const protectedIds = current.filter((value) => !permitted.has(value));
  references(values, [...permitted, ...protectedIds], 'knowledgeIds');
  const result = [...new Set([...values, ...protectedIds])];
  if (result.length > 50)
    invalid('knowledgeIds', 'Choose up to 50 articles including existing unavailable links.');
  return result;
}
/** Register incidents routes; authentication and workspace policy run in app.js. */
export function installIncidentsRoutes(app, db, appOrigin, machine = null) {
  app.patch('/api/incidents/:id/articles', requireResponder, async (req, res) => {
    if (
      !req.body ||
      Array.isArray(req.body) ||
      Object.keys(req.body).some((key) => !['knowledgeIds', 'revision'].includes(key))
    )
      throw new InputError('Send only article selections and revision.', 400);
    const current = await db
      .collection('incidents')
      .findOne({ _id: id(req.params.id), ...incidentAccess(req) });
    if (!current) throw new InputError('Incident not found.', 404);
    if (!Number.isInteger(req.body.revision) || req.body.revision !== current.revision)
      throw new InputError('This incident changed. Refresh and try again.', 409);
    const knowledgeIds = await linkedArticleIds(
      db,
      req,
      req.body.knowledgeIds,
      current.knowledgeIds || [],
    );
    const now = new Date();
    const result = await db.collection('incidents').updateOne(
      { _id: current._id, workspaceId: req.workspaceId, revision: current.revision },
      {
        $set: {
          knowledgeIds,
          updatedAt: now,
          updatedBy: req.user.email,
          updatedById: String(req.user._id),
          updatedByType: 'user',
        },
        $inc: { revision: 1 },
        $push: {
          timeline: {
            $each: [
              {
                at: now,
                by: req.user.email,
                status: current.status,
                note: 'Linked articles updated',
              },
            ],
            $slice: -200,
          },
        },
      },
    );
    if (!result.matchedCount)
      throw new InputError('This incident changed. Refresh and try again.', 409);
    res.json({ knowledgeIds, revision: current.revision + 1 });
  });
  app.get('/api/incidents', async (req, res) => {
    const { filter, sort, page, pageSize } = incidentQuery(req.query, req);
    const [total, rows] = await Promise.all([
      db.collection('incidents').countDocuments(filter),
      db
        .collection('incidents')
        .find(filter, { projection: { timeline: 0 } })
        .sort(sort)
        .skip((page - 1) * pageSize)
        .limit(pageSize)
        .toArray(),
    ]);
    res.json({ incidents: rows.map(incidentView), total, page, pageSize });
  });
  app.get('/api/incidents/export', async (req, res) => {
    const { filter, sort } = incidentQuery(req.query, req);
    const cursor = db.collection('incidents').find(filter).sort(sort).batchSize(100);
    res.type('text/csv; charset=utf-8').attachment('incidents.csv');
    async function* rows() {
      try {
        yield '\uFEFF' +
          csvRow([
            'ID',
            'Title',
            'Service',
            'Severity',
            'Status',
            'Source',
            'Created UTC',
            'Updated UTC',
            'Assignment group',
            'Description',
            'Custom fields (JSON)',
          ]);
        for await (const row of cursor)
          yield csvRow([
            String(row._id),
            row.title,
            row.serviceName,
            row.severity,
            row.status,
            incidentSourceLabel(row.source),
            row.createdAt.toISOString(),
            row.updatedAt.toISOString(),
            row.assignmentGroupName,
            row.description,
            JSON.stringify(
              row.fields.map((f) => ({
                id: f.id,
                label: f.label,
                value: row.custom[f.id] ?? null,
              })),
            ),
          ]);
      } finally {
        await cursor.close();
      }
    }
    try {
      await pipeline(Readable.from(rows()), res);
    } catch (error) {
      if (error.code !== 'ERR_STREAM_PREMATURE_CLOSE') throw error;
    }
  });
  /** Append-only discussion entries keep internal notes out of public activity and exports. */
  app.post('/api/incidents/:id/comments', requireIncidentCreator, async (req, res) => {
    const incident = await db
      .collection('incidents')
      .findOne({ _id: id(req.params.id), ...incidentAccess(req) });
    if (!incident) throw new InputError('Incident not found.', 404);
    const kind = choice(req.body.kind, ['comment', 'work_note'], 'kind');
    if (kind === 'work_note' && !['admin', 'responder'].includes(req.role))
      throw new InputError('Only responders and admins can add work notes.', 403);
    const directory = await collaborationOptions(db, req, incident);
    const eligible = directory.filter(
      (user) => kind === 'comment' || ['admin', 'responder'].includes(user.role ?? 'admin'),
    );
    const mentionIds = selectedIds(
      req.body.mentionIds ?? [],
      eligible.map((user) => String(user._id)),
      'mentionIds',
      20,
    );
    const body = text(req.body.body, 'body', 5000);
    const mentions = eligible
      .filter((user) => mentionIds.includes(String(user._id)))
      .map((user) => ({ id: String(user._id), label: user.displayName || user.email }));
    if (mentions.some((user) => !body.includes(`@${user.label}`)))
      invalid('mentionIds', 'Include each selected mention in your message.');
    const operations = await settings(db, req.workspaceId);
    const watcherIds = [
      ...(incident.watcherUserIds ?? []),
      ...(operations.groups ?? [])
        .filter((group) => (incident.watcherGroupIds ?? []).includes(group.id))
        .flatMap((group) => group.memberIds),
    ];
    const candidates = new Set([
      incident.createdById,
      incident.openedForId,
      incident.assigneeId,
      ...watcherIds,
      ...mentionIds,
    ]);
    const alertRecipientIds = (await members(db, req.workspaceId))
      .filter(
        (user) =>
          candidates.has(String(user._id)) &&
          String(user._id) !== String(req.user._id) &&
          mayReadIncident(user, incident) &&
          (kind === 'comment' || ['admin', 'responder'].includes(user.role ?? 'admin')),
      )
      .map((user) => String(user._id));
    const entry = {
      ...(incident.demoBatchId ? { demoBatchId: incident.demoBatchId } : {}),
      _id: new ObjectId(),
      workspaceId: req.workspaceId,
      incidentId: incident._id,
      kind,
      body,
      mentions,
      alertRecipientIds,
      authorId: String(req.user._id),
      author: req.user.displayName || req.user.email,
      createdAt: new Date(),
      recipientIds: kind === 'comment' ? alertRecipientIds : [],
      notificationsQueued: !!incident.demoBatchId || kind !== 'comment',
    };
    await db.collection('incidentComments').insertOne(entry);
    res.locals.auditRecordId = entry._id;
    res.status(201).json({ ok: true });
  });
  app.get('/api/incidents/:id', async (req, res) => {
    const incident = await db
      .collection('incidents')
      .findOne({ _id: id(req.params.id), ...incidentAccess(req) });
    if (!incident) throw new InputError('Incident not found.', 404);
    const comments = await db
      .collection('incidentComments')
      .find(
        {
          workspaceId: req.workspaceId,
          incidentId: incident._id,
          ...(!['admin', 'responder'].includes(req.role) ? { kind: 'comment' } : {}),
        },
        {
          projection: {
            kind: 1,
            body: 1,
            author: 1,
            createdAt: 1,
            ...(req.role === 'admin' ? { authorId: 1 } : {}),
          },
        },
      )
      .sort({ createdAt: -1, _id: -1 })
      .limit(200)
      .toArray();
    if (!['admin', 'responder'].includes(req.role))
      incident.timeline = incident.timeline.filter((entry) => entry.kind !== 'work_note');
    res.json({
      incident: incidentView(incident),
      origin:
        req.role !== 'user'
          ? await incidentOrigin(db, req.workspaceId, incident, req.role)
          : undefined,
      knowledge:
        req.role === 'user'
          ? []
          : await db
              .collection('articles')
              .find(
                {
                  workspaceId: req.workspaceId,
                  _id: { $in: (incident.knowledgeIds ?? []).map((value) => id(value)) },
                  ...(await articleAccess(db, req)),
                },
                { projection: { title: 1, summary: 1, status: 1, updatedAt: 1 } },
              )
              .toArray()
              .then((rows) => rows.map(({ _id, ...row }) => ({ id: String(_id), ...row }))),
      comments: comments.map(({ _id, ...entry }) => ({ id: String(_id), ...entry })),
    });
  });
  for (const method of ['post', 'patch']) {
    const saveRecord = async (req, res) => {
      const current =
        method === 'patch'
          ? await db
              .collection('incidents')
              .findOne({ _id: id(req.params.id), workspaceId: req.workspaceId })
          : null;
      if (method === 'patch' && !current) throw new InputError('Incident not found.', 404);
      if (
        current &&
        (!Number.isInteger(req.body?.revision) || req.body.revision !== current.revision)
      )
        throw new InputError('This incident changed. Refresh and try again.', 409);
      let eventAlert = null;
      if (!current && req.body.eventAlertId) {
        if (!['admin', 'responder'].includes(req.role) || req.serviceAccount)
          throw new InputError('Your role cannot create an incident from an alert.', 403);
        eventAlert = await db
          .collection('eventAlerts')
          .findOne({ _id: id(req.body.eventAlertId), workspaceId: req.workspaceId });
        if (!eventAlert) throw new InputError('Alert not found.', 404);
      }
      const schema = (await settings(db, req.workspaceId)).fields;
      const body = resolveChoices({ ...current, ...req.body }, schema, 'incidents', current);
      const services = (await catalog(db, req.workspaceId)).services;
      const serviceId = current
        ? current.serviceId
        : body.serviceId
          ? identifier(body.serviceId, 'serviceId')
          : null;
      const service = services.find((s) => s.id === serviceId);
      if (serviceId && !service && !current) invalid('serviceId', 'Choose an available service.');
      if (eventAlert && serviceId !== eventAlert.serviceId)
        invalid('serviceId', 'Use the alert’s service when creating its incident.');
      const fields = recordFields(schema, current?.fields);
      const status = choice(
        body.status ?? current?.status ?? 'open',
        ['open', 'acknowledged', 'resolved'],
        'status',
      );
      if (!current && status !== 'open') invalid('status', 'New incidents start open.');
      const reopening = current?.status === 'resolved' && status !== 'resolved';
      if (req.role === 'user' && body.assignmentGroupId)
        invalid('assignmentGroupId', 'A responder will assign your incident.');
      const group = await assignmentGroup(
        db,
        req.workspaceId,
        body.assignmentGroupId,
        body.assigneeId,
      );
      if (req.role === 'user' && body.assigneeId)
        invalid('assigneeId', 'A responder will assign your incident.');
      const openedForId =
        body.openedForId === undefined
          ? (current?.openedForId ?? String(req.user._id))
          : body.openedForId || null;
      if (req.role === 'user' && openedForId !== String(req.user._id))
        invalid('openedForId', 'You can only submit incidents for yourself.');
      if (
        openedForId &&
        !(await members(db, req.workspaceId)).some((u) => String(u._id) === openedForId)
      )
        invalid('openedForId', 'Choose a member of this workspace.');
      const assigneeId = body.assigneeId || null;
      if (
        assigneeId &&
        !(await members(db, req.workspaceId)).some(
          (u) => String(u._id) === assigneeId && !u.disabled,
        )
      )
        invalid('assigneeId', 'Choose an active teammate.');
      if (req.role === 'user' && body.knowledgeIds?.length)
        invalid('knowledgeIds', 'A responder can link knowledge.');
      const knowledgeIds = await linkedArticleIds(
        db,
        req,
        body.knowledgeIds ?? current?.knowledgeIds ?? [],
        current?.knowledgeIds || [],
      );
      const resolutionNotes = text(
        body.resolutionNotes ?? current?.resolutionNotes ?? '',
        'resolutionNotes',
        5000,
        false,
      );
      validateMandatory(schema, {
        ...body,
        serviceId,
        assigneeId,
        openedForId,
        status,
        knowledgeIds,
        resolutionNotes,
      });
      const now = new Date();
      const update = {
        ...group,
        fields,
        knowledgeIds,
        resolutionNotes,
        ...(reopening
          ? {
              acknowledgedAt: null,
              acknowledgmentDurationMs: null,
              resolutionDurationMs: null,
              resolvedAt: null,
              reopenedAt: now,
              resolutionCycle: (current.resolutionCycle ?? 0) + 1,
              notifiedOpen: false,
              notifiedResolved: false,
              ...(['monitor', 'automation'].includes(current.source)
                ? { activeAutomatic: false }
                : {}),
            }
          : {}),
        ...(status === 'acknowledged' && current?.status !== 'acknowledged'
          ? {
              acknowledgedAt: now,
              acknowledgmentDurationMs: Math.max(
                0,
                +now - +new Date(current?.reopenedAt || current?.createdAt || now),
              ),
              acknowledgedById: String(req.user._id),
            }
          : {}),
        ...(status === 'resolved'
          ? {
              resolvedAt: current?.resolvedAt ?? now,
              resolutionDurationMs:
                current?.resolutionDurationMs ??
                Math.max(0, +now - +new Date(current?.reopenedAt || current?.createdAt || now)),
              ...(['monitor', 'automation'].includes(current?.source)
                ? { activeAutomatic: false }
                : {}),
            }
          : {}),
        statusOption: body.statusOption,
        statusLabel: body.statusLabel,
        severityOption: body.severityOption,
        severityLabel: body.severityLabel,
        title: text(body.title ?? '', 'title', 160, false),
        description: text(body.description ?? '', 'description', 5000, false),
        severity: choice(body.severity, ['low', 'medium', 'high', 'critical'], 'severity'),
        status,
        assigneeId,
        openedForId,
        custom: validateValues(body.custom ?? {}, fields, current?.custom),
        updatedAt: now,
        updatedBy: req.user.email,
        updatedById: String(req.user._id),
        updatedByType: req.serviceAccount ? 'service_account' : 'user',
      };
      const recordId = current?._id ?? new ObjectId();
      update.attachmentIds = await claimAttachments(
        db,
        req,
        'incidents',
        recordId,
        body.attachmentIds ?? current?.attachmentIds ?? [],
        current?.attachmentIds ?? [],
      );
      const note = text(body.note ?? '', 'note', 2000, false);
      const entry = {
        at: now,
        by: req.user.email,
        status,
        ...(reopening
          ? {
              previousResolvedAt: current.resolvedAt,
              previousResolutionNotes: current.resolutionNotes ?? '',
            }
          : {}),
        ...(current && note ? { kind: 'work_note' } : {}),
        note:
          note ||
          (current && current.status !== 'resolved' && status === 'resolved'
            ? 'Incident resolved'
            : reopening
              ? 'Incident reopened'
              : current
                ? 'Incident updated'
                : 'Incident created'),
      };
      if (current) {
        if (!Number.isInteger(body.revision) || body.revision !== current.revision)
          throw new InputError('This incident changed. Refresh and try again.', 409);
        const result = await db.collection('incidents').updateOne(
          { _id: current._id, workspaceId: req.workspaceId, revision: current.revision },
          {
            $set: update,
            $inc: { revision: 1 },
            $push: { timeline: { $each: [entry], $slice: -200 } },
          },
        );
        if (!result.matchedCount)
          throw new InputError('This incident changed. Refresh and try again.', 409);
        res.json({
          incident: incidentView({
            ...current,
            ...update,
            revision: current.revision + 1,
            timeline: [...current.timeline, entry].slice(-200),
          }),
        });
      } else {
        const row = {
          _id: recordId,
          workspaceId: req.workspaceId,
          serviceId,
          serviceName: service?.name ?? 'Unassigned',
          createdBy: req.user.email,
          createdById: String(req.user._id),
          createdByType: req.serviceAccount ? 'service_account' : 'user',
          fields,
          ...update,
          ...(eventAlert
            ? { eventAlertId: String(eventAlert._id), originEventId: eventAlert.latestEventId }
            : {}),
          source: eventAlert
            ? eventAlert.sourceType === 'external'
              ? 'integration'
              : 'manual'
            : req.serviceAccount
              ? 'integration'
              : req.incidentSource === 'ai'
                ? 'ai'
                : 'manual',
          ...(req.serviceAccount
            ? {
                sourceAccountId: String(req.serviceAccount._id),
                sourceAccountName: req.serviceAccount.name,
              }
            : {}),
          createdAt: now,
          revision: 0,
          timeline: [entry],
        };
        await db.collection('incidents').insertOne(row);
        res.status(201).json({ incident: incidentView(row) });
      }
    };
    app.locals.aiRecordWriters ??= {};
    app.locals.aiRecordWriters[`incidents:${method}`] = saveRecord;
    app[method](
      `/api/incidents${method === 'patch' ? '/:id' : ''}`,
      method === 'post' ? requireIncidentCreator : requireResponder,
      saveRecord,
    );
    if (method === 'post' && machine)
      machine.post('/incidents', requireIncidentCreator, saveRecord);
  }
}
