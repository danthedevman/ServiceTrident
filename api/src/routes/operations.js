import { InputError } from '@servicetrident/shared/validation/validation';

import { installGroupsRoutes } from './groups.js';
import { installWorkspaceRoutes } from './workspace.js';
import { installIncidentFieldsRoutes } from './incident-fields.js';
import { installResponseDashboardRoutes } from './response-dashboard.js';
import { installIncidentsRoutes } from './incidents.js';
import { installOnCallRoutes } from './on-call.js';
import { installIntegrationsRoutes } from './integrations.js';
/** All writes below either use workspace filters or a bounded CAS settings document. */
export function installOperationsRoutes(app, db, appOrigin, integrationRequest, machine = null) {
  app.use(
    [
      '/api/groups',
      '/api/members',
      '/api/invitations',
      '/api/incidents',
      '/api/incident-fields',
      '/api/on-call',
      '/api/integrations',
      '/api/deliveries',
    ],
    (req, res, next) => {
      if (
        !['GET', 'HEAD', 'OPTIONS'].includes(req.method) &&
        (!req.body || typeof req.body !== 'object' || Array.isArray(req.body))
      )
        throw new InputError('Send a JSON object.');
      next();
    },
  );
  installGroupsRoutes(app, db, appOrigin);

  installWorkspaceRoutes(app, db, appOrigin);

  installIncidentFieldsRoutes(app, db, appOrigin);

  installResponseDashboardRoutes(app, db, appOrigin);
  installIncidentsRoutes(app, db, appOrigin, machine);

  installOnCallRoutes(app, db, appOrigin);

  installIntegrationsRoutes(app, db, appOrigin, integrationRequest);
}
