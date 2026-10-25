import { articleAccess } from '../domain/knowledge-access.js';
import express from 'express';
import { rateLimit } from 'express-rate-limit';
import { ObjectId } from 'mongodb';
import { InputError } from '@servicetrident/shared/validation/validation';
import {
  MAX_FILE_BYTES,
  MAX_ATTACHMENTS,
  validateFile,
} from '@servicetrident/shared/files/attachment-files';
import { validateRichContent } from '@servicetrident/shared/files/rich-content';
import { id } from './services.js';

const collections = { incidents: 'incidents', tasks: 'tasks', knowledge: 'articles' };
/** Reuse the incident portal's visibility rule for every file read and write. */
async function recordFilter(db, req, kind, recordId) {
  if (!collections[kind] || (req.role === 'user' && kind !== 'incidents'))
    throw new InputError('Record not found.', 404);
  return {
    _id: id(recordId),
    ...(kind === 'knowledge'
      ? await articleAccess(db, req, !['GET', 'HEAD'].includes(req.method))
      : {}),
    workspaceId: req.workspaceId,
    ...(req.role === 'user'
      ? { $or: [{ createdById: String(req.user._id) }, { openedForId: String(req.user._id) }] }
      : {}),
  };
}
/** Viewers never upload; users can only attach to their own incident portal records. */
function canWrite(req, kind) {
  if (
    !collections[kind] ||
    !['admin', 'responder', 'user'].includes(req.role) ||
    (req.role === 'user' && kind !== 'incidents')
  )
    throw new InputError('Your role cannot add attachments here.', 403);
}
/** Only expose filename, size, type and safe same-origin download URLs. */
function view(file) {
  return {
    id: String(file._id),
    name: file.name,
    size: file.size,
    mime: file.mime,
    createdAt: file.createdAt,
    downloadUrl: `/api/attachments/files/${file._id}/download`,
    previewUrl: file.mime.startsWith('image/')
      ? `/api/attachments/files/${file._id}/preview`
      : null,
  };
}
/** Claim staged files before saving a record, without permitting reuse from another record or author. */
export async function claimAttachments(
  db,
  req,
  kind,
  recordId,
  values = [],
  current = [],
  imageIds = [],
) {
  if (
    !Array.isArray(values) ||
    values.length > MAX_ATTACHMENTS ||
    new Set(values).size !== values.length ||
    values.some((value) => typeof value !== 'string' || !/^[a-f0-9]{24}$/.test(value))
  )
    throw new InputError('Use at most 20 unique attachments.', 400, {
      attachments: 'Choose up to 20 files.',
    });
  if (imageIds.some((value) => !values.includes(value)))
    throw new InputError('An article image is missing from its attachments.', 400, {
      content: 'Upload each image before saving.',
    });
  const parent = await db
    .collection(collections[kind])
    .findOne({ _id: recordId, workspaceId: req.workspaceId }, { projection: { demoBatchId: 1 } });
  const now = new Date();
  for (const value of values) {
    const existing = current.includes(value);
    const file = await db.collection('attachments').findOneAndUpdate(
      {
        _id: id(value),
        workspaceId: req.workspaceId,
        kind,
        ...(existing
          ? { recordId: String(recordId) }
          : {
              ownerId: String(req.user._id),
              $or: [{ recordId: null }, { recordId: String(recordId) }],
              lastLinkedAt: { $gte: new Date(Date.now() - 86400000) },
            }),
      },
      {
        $set: {
          recordId: String(recordId),
          lastLinkedAt: now,
          ...(parent?.demoBatchId ? { demoBatchId: parent.demoBatchId } : {}),
        },
      },
      { returnDocument: 'after', projection: { data: 0 } },
    );
    if (!file)
      throw new InputError(
        'An attachment is unavailable or belongs to another record. Upload it again.',
        400,
      );
    if (imageIds.includes(value) && !file.mime.startsWith('image/'))
      throw new InputError('Only uploaded images can appear in article content.', 400);
  }
  return values;
}
/** Private binary storage uses MongoDB so attachments survive container recreation and backups. */
export function installAttachmentRoutes(app, db) {
  const uploadLimit = rateLimit({
    windowMs: 60000,
    limit: 30,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { error: 'Too many uploads. Try again in a minute.' },
  });
  app.post(
    '/api/attachments/:kind',
    uploadLimit,
    (req, res, next) => {
      canWrite(req, req.params.kind);
      next();
    },
    express.raw({ type: 'application/octet-stream', limit: MAX_FILE_BYTES, inflate: false }),
    async (req, res) => {
      let filename;
      try {
        filename = decodeURIComponent(req.get('x-file-name') ?? '');
      } catch {
        throw new InputError('Invalid filename.');
      }
      const file = validateFile(filename, req.body);
      const count = await db.collection('attachments').countDocuments({
        workspaceId: req.workspaceId,
        ownerId: String(req.user._id),
        recordId: null,
      });
      if (count >= 40)
        throw new InputError(
          'Save your current uploads before adding more files. Abandoned uploads are removed after 24 hours.',
          409,
        );
      const now = new Date(),
        row = {
          _id: new ObjectId(),
          workspaceId: req.workspaceId,
          ownerId: String(req.user._id),
          kind: req.params.kind,
          recordId: null,
          ...file,
          createdAt: now,
          lastLinkedAt: now,
          data: req.body,
        };
      await db.collection('attachments').insertOne(row);
      res.status(201).json({ attachment: view(row) });
    },
  );
  app.get('/api/attachments/files/:id/:action', async (req, res) => {
    if (!['preview', 'download'].includes(req.params.action))
      throw new InputError('File not found.', 404);
    const file = await db
      .collection('attachments')
      .findOne({ _id: id(req.params.id), workspaceId: req.workspaceId });
    if (!file) throw new InputError('File not found.', 404);
    if (file.recordId) {
      const record = await db
        .collection(collections[file.kind])
        .findOne(
          {
            ...(await recordFilter(db, req, file.kind, file.recordId)),
            attachmentIds: String(file._id),
          },
          { projection: { _id: 1 } },
        );
      if (!record) throw new InputError('File not found.', 404);
    } else if (
      file.ownerId !== String(req.user._id) ||
      +file.lastLinkedAt < Date.now() - 86400000
    ) {
      throw new InputError('File not found.', 404);
    } else canWrite(req, file.kind);
    const preview = req.params.action === 'preview';
    if (preview && !file.mime.startsWith('image/'))
      throw new InputError('This file is download-only.', 400);
    res.attachment(file.name);
    if (preview) res.set('Content-Disposition', 'inline');
    res.set({
      'Content-Type': preview ? file.mime : 'application/octet-stream',
      'Content-Security-Policy': "default-src 'none'; sandbox",
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'private, no-store',
    });
    res.send(Buffer.from(file.data.buffer));
  });
  app.get('/api/attachments/:kind/:recordId', async (req, res) => {
    const { kind, recordId } = req.params,
      filter = await recordFilter(db, req, kind, recordId);
    const record = await db
      .collection(collections[kind])
      .findOne(filter, { projection: { attachmentIds: 1 } });
    if (!record) throw new InputError('Record not found.', 404);
    const files = await db
      .collection('attachments')
      .find(
        {
          _id: { $in: (record.attachmentIds ?? []).map((value) => id(value)) },
          workspaceId: req.workspaceId,
        },
        { projection: { data: 0 } },
      )
      .sort({ createdAt: -1 })
      .toArray();
    res.json({ attachments: files.map(view) });
  });
  app.post('/api/attachments/:kind/:recordId', async (req, res) => {
    const { kind, recordId } = req.params;
    canWrite(req, kind);
    const filter = await recordFilter(db, req, kind, recordId),
      collection = db.collection(collections[kind]),
      record = await collection.findOne(filter);
    if (!record) throw new InputError('Record not found.', 404);
    const added = req.body?.attachmentIds;
    if (!Array.isArray(added)) throw new InputError('Choose the attachments to add.');
    const values = [...new Set([...(record.attachmentIds ?? []), ...added])];
    await claimAttachments(db, req, kind, record._id, values, record.attachmentIds ?? []);
    const result = await collection.updateOne(
      { ...filter, revision: record.revision },
      {
        $set: {
          attachmentIds: values,
          updatedAt: new Date(),
          updatedBy: req.user.email,
          updatedById: String(req.user._id),
        },
        $inc: { revision: 1 },
      },
    );
    if (!result.matchedCount)
      throw new InputError('The record changed. Refresh and add the files again.', 409);
    res.json({ ok: true });
  });
  app.delete('/api/attachments/:kind/:recordId/:fileId', async (req, res) => {
    const { kind, recordId, fileId } = req.params;
    canWrite(req, kind);
    id(fileId);
    const filter = await recordFilter(db, req, kind, recordId),
      collection = db.collection(collections[kind]),
      record = await collection.findOne(filter);
    if (!record) throw new InputError('Record not found.', 404);
    if (
      kind === 'knowledge' &&
      record.contentDocument &&
      validateRichContent(record.contentDocument).imageIds.includes(fileId)
    )
      throw new InputError(
        'Remove this image from the article content before removing its attachment.',
        409,
      );
    const result = await collection.updateOne(
      { ...filter, revision: record.revision },
      {
        $pull: { attachmentIds: fileId },
        $set: {
          updatedAt: new Date(),
          updatedBy: req.user.email,
          updatedById: String(req.user._id),
        },
        $inc: { revision: 1 },
      },
    );
    if (!result.matchedCount)
      throw new InputError('The record changed. Refresh and try again.', 409);
    res.status(204).end();
  });
}
