import { DEFAULT_FORM_LAYOUT, validateFormLayout } from '@servicetrident/shared/forms/layout';
import { validateFields } from '@servicetrident/shared/forms/schema';

import { requireAdmin } from '../auth/auth.js';
import { settings } from '../repositories/settings.js';
import { save } from '../repositories/settings.js';

/** Register incident-fields routes; authentication and workspace policy run in app.js. */
export function installIncidentFieldsRoutes(app, db, appOrigin) {
  app.get('/api/incident-fields', async (req, res) => {
    const data = await settings(db, req.workspaceId);
    res.json({
      fields: data.fields,
      layout: data.formLayouts?.incidents ?? DEFAULT_FORM_LAYOUT,
      revision: data.revision,
    });
  });
  app.put('/api/incident-fields', requireAdmin, async (req, res) => {
    const data = await settings(db, req.workspaceId);
    const fields = validateFields(req.body.fields, data.fields);
    await save(db, data, req.body.revision, {
      fields,
      ...(req.body.layout !== undefined
        ? {
            formLayouts: {
              ...data.formLayouts,
              incidents: validateFormLayout(req.body.layout, fields),
            },
          }
        : {}),
    });
    res.json({ ok: true });
  });
}
