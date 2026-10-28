import { SettingsRecordPanels } from './record-panels.jsx';
import { IdentityProvidersPage } from './identity-providers.jsx';
import { ServiceAccountsPage } from './service-accounts.jsx';
import {
  UserGroupIcon,
  UsersIcon,
  ShieldCheckIcon,
  KeyIcon,
  ClockIcon,
  CircleStackIcon,
  CpuChipIcon,
  InboxIcon,
} from '@heroicons/react/24/outline';
import { AIProviderPage } from '../ai/ai.jsx';
import { DEMO_INDUSTRIES, demoIndustry } from '../../../../shared/domain/demo-industries.js';
import { Select } from '../../components/forms/select.jsx';
import { PageTitle } from '../../components/page-title.jsx';
import { AuthContext } from '../../auth/auth-context.js';
import { DateTime } from '../../preferences/date-time.jsx';
import React, { useContext, useState } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import { useResource } from '../../data/use-resource.js';
import { Notice } from '../../components/forms/fields.jsx';
import { useSave } from '../../data/use-save.js';
import { Modal } from '../../components/modal.jsx';
import { validateDemoAction } from '../../../../shared/domain/demo-data.js';

/** Admin-only dataset lifecycle. The API independently validates access, batch identity, and single-add state. */
function AdminSettings({ section }) {
  const resource = useResource(section === 'demo-data' ? '/settings/demo-data' : null, 3000),
    save = useSave();
  const [industry, setIndustry] = useState('saas');
  const [confirm, setConfirm] = useState(false),
    [message, setMessage] = useState(''),
    [clientError, setClientError] = useState('');
  const batch = resource.data?.batch,
    working = batch && ['creating', 'deleting'].includes(batch.status) && !batch.recoverable;
  function run(action) {
    if (
      save.busy ||
      working ||
      !resource.data ||
      (action === 'add' && batch) ||
      (action === 'delete' && !batch)
    )
      return;
    const body = {
      confirmation: action === 'add' ? 'ADD DEMO DATA' : 'DELETE DEMO DATA',
      ...(action === 'delete' ? { batchId: batch.batchId } : { industry }),
    };
    setClientError('');
    setMessage('');
    try {
      validateDemoAction(action, body);
    } catch (error) {
      setClientError(error.message);
      return;
    }
    save.run('/settings/demo-data', action === 'add' ? 'POST' : 'DELETE', body, () => {
      setConfirm(false);
      setMessage(action === 'add' ? '' : 'Demo data deleted. Your other records were retained.');
    });
  }
  return (
    <div className="space-y-6">
      {section === 'demo-data' && (
        <section id="demo-data" className="panel space-y-4 p-6">
          <h2 className="text-lg font-semibold">Demo Data</h2>
          <p className="text-sm text-slate-500">
            Choose an industry to explore linked services, components, monitors, incidents, tasks,
            and runbooks. Solo User includes 10 examples per supported type; other presets include
            50, with three components per service. Existing batches stay unchanged; delete and
            re-add demo data to change industry or receive new examples.
          </p>
          <Notice error={resource.error || save.error || clientError} />
          {message && <p role="status">{message}</p>}
          {!resource.data ? (
            <p role="status" className="sr-only">
              Loading demo-data settings…
            </p>
          ) : (
            <>
              <label className="field-label max-w-md">
                Industry
                <Select
                  aria-label="Industry"
                  value={batch ? batch.industry || '' : industry}
                  onChange={(event) => setIndustry(event.target.value)}
                  disabled={!!batch || save.busy || working}
                >
                  {batch && !batch.industry && <option value="">Existing dataset</option>}
                  {DEMO_INDUSTRIES.map((preset) => (
                    <option key={preset.id} value={preset.id}>
                      {preset.label}
                    </option>
                  ))}
                </Select>
              </label>
              {batch && (
                <p className="text-sm text-slate-500">
                  Industry:{' '}
                  {batch.industry ? demoIndustry(batch.industry)?.label : 'Existing dataset'}
                </p>
              )}
              {!working && (
                <p role="status">
                  {batch?.status === 'failed' || batch?.recoverable
                    ? 'An interrupted operation needs cleanup. Use Delete demo data before adding again.'
                    : batch
                      ? 'Demo data is installed.'
                      : 'No demo data installed.'}
                </p>
              )}
              {batch && (
                <p className="text-sm text-slate-500">
                  Added by {batch.createdBy} · {<DateTime value={batch.createdAt} />}
                </p>
              )}
              <div className="flex flex-wrap gap-3">
                <button
                  className="btn-primary"
                  disabled={save.busy || working || !!batch}
                  onClick={() => run('add')}
                >
                  Add Demo Data
                </button>
                <button
                  className="btn-danger"
                  disabled={save.busy || working || !batch}
                  onClick={() => setConfirm(true)}
                >
                  Delete demo data
                </button>
              </div>
            </>
          )}
        </section>
      )}
      {confirm && (
        <Modal
          title="Delete Demo Data?"
          busy={save.busy}
          onClose={() => setConfirm(false)}
          footer={
            <>
              <button
                className="btn-secondary"
                disabled={save.busy}
                onClick={() => setConfirm(false)}
              >
                Cancel
              </button>
              <button
                className="btn-danger"
                disabled={save.busy || working || !batch}
                onClick={() => run('delete')}
              >
                {save.busy ? 'Deleting…' : 'Delete demo data'}
              </button>
            </>
          }
        >
          <p>
            Delete all records in this demo dataset, including edits and files added to those demo
            records. Other records are retained. References from other records to deleted demo items
            may become unavailable.
          </p>
          <Notice error={save.error} />
        </Modal>
      )}
    </div>
  );
}

/** Directory entry points retain existing role permissions while sharing Settings navigation. */
export function SettingsPage() {
  const { user, loading } = useContext(AuthContext);
  const [params, setParams] = useSearchParams();
  const marketing = useResource(user?.role === 'admin' ? '/settings/marketing' : null);
  if (loading) return null;
  if (!user || user.role === 'user') return <p>Workspace access is required.</p>;
  const moved = {
    'alert-grouping': 'alert-grouping',
    integrations: 'integrations',
    eventRules: 'event-rules',
    escalationPolicies: 'escalation-policies',
    maintenanceWindows: 'maintenance-windows',
    probes: 'probe-agents',
  };
  if (user.role === 'admin' && Object.hasOwn(moved, params.get('section')))
    return <Navigate to={`/${moved[params.get('section')]}`} replace />;
  const admin = user.role === 'admin';
  const entries = [
    ['groups', 'Groups', UserGroupIcon],
    ...(admin
      ? [
          ['users', 'Users', UsersIcon],
          ['identity-providers', 'Identity Providers', ShieldCheckIcon],
          ['service-accounts', 'Service Accounts', KeyIcon],
          ['audit', 'Audit Log', ClockIcon],
          ['demo-data', 'Demo Data', CircleStackIcon],
          ['ai', 'AI Provider', CpuChipIcon],
          ...(marketing.data?.available ? [['hosting', 'Hosting Inquiries', InboxIcon]] : []),
        ]
      : []),
  ];
  const selected = entries.find(([id]) => id === params.get('section')) || entries[0];
  return (
    <div className="settings-page space-y-5">
      <PageTitle>Settings</PageTitle>
      <div className="settings-layout">
        <nav aria-label="Settings categories" className="settings-categories">
          {entries.map(([id, label, Icon]) => (
            <button
              key={id}
              type="button"
              aria-current={id === selected[0] ? 'page' : undefined}
              className="settings-category"
              onClick={() => setParams({ section: id }, { replace: true })}
            >
              <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />
              <span>{label}</span>
            </button>
          ))}
        </nav>
        <div className="min-w-0" key={selected[0]}>
          {selected[0] === 'ai' ? (
            <AIProviderPage />
          ) : selected[0] === 'groups' ? (
            <SettingsRecordPanels section="groups" />
          ) : selected[0] === 'users' ? (
            <SettingsRecordPanels section="users" />
          ) : selected[0] === 'audit' ? (
            <SettingsRecordPanels section="audit" />
          ) : selected[0] === 'identity-providers' ? (
            <IdentityProvidersPage />
          ) : selected[0] === 'service-accounts' ? (
            <ServiceAccountsPage embedded />
          ) : selected[0] === 'hosting' ? (
            <SettingsRecordPanels section="hosting" />
          ) : (
            <AdminSettings section={selected[0]} />
          )}
        </div>
      </div>
    </div>
  );
}
