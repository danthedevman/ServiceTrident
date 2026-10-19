import { ObjectId } from 'mongodb';
import { objectId } from '../domain/identifiers.js';
import { createHash } from 'node:crypto';
import { requireAdmin, requireResponder } from '../auth/auth.js';
import { settings, save } from '../repositories/settings.js';
import { catalog } from './services.js';
import {
  automationInput,
  AUTOMATION_KINDS,
  routeEvent,
} from '@servicetrident/shared/domain/operational-automation';
import { externalEventInput } from '@servicetrident/shared/domain/events';
import { choice, text } from '@servicetrident/shared/validation/fields';
import { seal, unseal } from '@servicetrident/shared/integrations/secrets';
import { InputError } from '@servicetrident/shared/validation/input-error';
import { writeAudit } from '@servicetrident/shared/domain/audit';
const hash = (rule) =>
  createHash('sha256')
    .update(JSON.stringify({ ...rule, enabled: false }))
    .digest('hex');
async function validateReferences(db, workspaceId, kind, value, config) {
  const services = (await catalog(db, workspaceId)).services.map((service) => service.id);
  if (
    (value.serviceIds || []).some((key) => !services.includes(key)) ||
    (value.actions?.serviceId && !services.includes(value.actions.serviceId))
  )
    throw new InputError('Choose services from this workspace.');
  if (
    value.actions?.assignmentGroupId &&
    !(config.groups || []).some((group) => group.id === value.actions.assignmentGroupId)
  )
    throw new InputError('Choose a group from this workspace.');
  if (
    value.actions?.escalationPolicyId &&
    !(config.escalationPolicies || []).some(
      (policy) => policy.id === value.actions.escalationPolicyId && policy.enabled,
    )
  )
    throw new InputError('Choose an enabled escalation policy.');
  if (kind === 'escalationPolicies')
    for (const step of value.steps) {
      if (
        step.integrationIds.some(
          (key) =>
            !config.integrations.some(
              (integration) =>
                integration.id === key &&
                integration.enabled &&
                !integration.demoBatchId &&
                ['email', 'slack', 'teams', 'discord', 'pagerduty', 'opsgenie'].includes(
                  integration.type,
                ),
            ),
        )
      )
        throw new InputError('Choose enabled notification integrations.');
      if (
        step.userId &&
        !(await db.collection('users').findOne({
          _id: new ObjectId(step.userId),
          disabled: { $ne: true },
          $or: [{ _id: workspaceId }, { workspaceId }],
          role: { $nin: ['user', 'viewer'] },
        }))
      )
        throw new InputError('Choose an active responder or admin from this workspace.');
    }
}
export function installOperationalAutomation(app, db) {
  app.get('/api/operational-automation', requireAdmin, async (req, res) => {
    const config = await settings(db, req.workspaceId);
    res.json({
      revision: config.revision,
      ...Object.fromEntries(AUTOMATION_KINDS.map((kind) => [kind, config[kind] || []])),
    });
  });
  app.post('/api/operational-automation/preview', requireAdmin, async (req, res) => {
    const value = automationInput('eventRules', req.body.rule);
    const config = await settings(db, req.workspaceId);
    await validateReferences(db, req.workspaceId, 'eventRules', value, config);
    const sample = req.body.event || {};
    const {
      sourceType = 'external',
      sourceName = 'Preview',
      statusCode,
      durationMs,
      ...normalized
    } = sample;
    const eventType = normalized.eventType === 'check' ? 'check' : null;
    if (eventType) normalized.eventType = 'alert';
    const event = {
      ...externalEventInput(normalized),
      sourceType: choice(sourceType, ['monitor', 'external'], 'sourceType'),
      sourceName: text(sourceName, 'sourceName', 80),
      ...(eventType ? { eventType } : {}),
    };
    for (const [key, value, max] of [
      ['statusCode', statusCode, 599],
      ['durationMs', durationMs, 120000],
    ]) {
      if (
        value !== undefined &&
        value !== null &&
        (!Number.isInteger(value) || value < 0 || value > max)
      )
        throw new InputError('Use bounded numeric diagnostics for preview.');
      if (value !== undefined) event[key] = value;
    }
    const routed = routeEvent([{ ...value, enabled: true }], event);
    const previewToken = seal({
      workspaceId: String(req.workspaceId),
      actorId: String(req.user._id),
      hash: hash(value),
      expires: Date.now() + 600000,
    });
    res.json({
      matched: routed.matchedRuleIds.length > 0,
      actions: routed.matchedRuleIds.length ? value.actions : {},
      previewToken,
    });
  });
  app.put('/api/operational-automation/:kind/:id', requireAdmin, async (req, res) => {
    const value = automationInput(req.params.kind, {
      ...req.body.configuration,
      id: req.params.id,
    });
    const config = await settings(db, req.workspaceId);
    await validateReferences(db, req.workspaceId, req.params.kind, value, config);
    if (req.params.kind === 'eventRules' && value.enabled) {
      let preview;
      try {
        preview = unseal(req.body.previewToken);
      } catch {
        /* Invalid opaque preview. */
      }
      if (
        !preview ||
        preview.workspaceId !== String(req.workspaceId) ||
        preview.actorId !== String(req.user._id) ||
        preview.expires < Date.now() ||
        preview.hash !== hash(value)
      )
        throw new InputError('Preview this rule before enabling it.');
    }
    const rows = config[req.params.kind] || [];
    const existing = rows.find((item) => item.id === value.id);
    if (existing?.demoBatchId) {
      if (value.enabled) throw new InputError('Demo automation remains disabled.');
      value.demoBatchId = existing.demoBatchId;
    }
    if (rows.length >= 100 && !rows.some((item) => item.id === value.id))
      throw new InputError('Keep at most 100 configurations per category.');
    await save(db, config, req.body.revision, {
      [req.params.kind]: rows.some((item) => item.id === value.id)
        ? rows.map((item) => (item.id === value.id ? value : item))
        : [...rows, value],
    });
    if (req.params.kind === 'maintenanceWindows')
      await db
        .collection('deliveries')
        .updateMany(
          { workspaceId: req.workspaceId, status: 'pending', deliveryState: 'suppressed' },
          { $set: { nextAttemptAt: new Date() } },
        );
    res.locals.auditRecordId = value.id;
    res.json({ ok: true });
  });
  app.delete('/api/operational-automation/:kind/:id', requireAdmin, async (req, res) => {
    if (!AUTOMATION_KINDS.includes(req.params.kind))
      throw new InputError('Configuration not found.', 404);
    const config = await settings(db, req.workspaceId);
    await save(db, config, req.body.revision, {
      [req.params.kind]: (config[req.params.kind] || []).filter(
        (item) => item.id !== req.params.id,
      ),
    });
    if (req.params.kind === 'maintenanceWindows')
      await db
        .collection('deliveries')
        .updateMany(
          { workspaceId: req.workspaceId, status: 'pending', deliveryState: 'suppressed' },
          { $set: { nextAttemptAt: new Date() } },
        );
    res.json({ ok: true });
  });
  app.post('/api/incidents/:id/acknowledge', requireResponder, async (req, res) => {
    const incident = await db
      .collection('incidents')
      .findOne({ _id: objectId(req.params.id), workspaceId: req.workspaceId });
    if (!incident) throw new InputError('Incident not found.', 404);
    if (req.body.confirm !== true || !Number.isInteger(req.body.revision))
      throw new InputError('Confirm acknowledgment of the current incident.');
    const now = new Date();
    const result = await db.collection('incidents').updateOne(
      {
        _id: incident._id,
        workspaceId: req.workspaceId,
        revision: req.body.revision,
        status: 'open',
      },
      {
        $set: {
          status: 'acknowledged',
          statusOption: 'acknowledged',
          statusLabel: 'Acknowledged',
          acknowledgedAt: now,
          acknowledgmentDurationMs: Math.max(
            0,
            +now - +new Date(incident.reopenedAt || incident.createdAt),
          ),
          acknowledgedById: String(req.user._id),
          updatedAt: now,
          updatedBy: req.user.displayName || req.user.email,
          updatedById: String(req.user._id),
        },
        $inc: { revision: 1 },
      },
    );
    if (!result.matchedCount)
      throw new InputError('The incident changed. Refresh before acknowledging.', 409);
    await writeAudit(db, {
      workspaceId: req.workspaceId,
      actorId: req.user._id,
      actor: req.user.displayName,
      action: 'acknowledge',
      recordType: 'incidents',
      recordId: incident._id,
      fields: 'status,acknowledgedAt',
      operation: 'Acknowledge incident',
    });
    res.json({ ok: true });
  });
}
