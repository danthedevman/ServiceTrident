import { PageTitle } from '../../components/page-title.jsx';
import { AuthContext } from '../../auth/auth-context.js';
import { ConfirmDeleteButton } from '../../components/confirm-delete-button.jsx';
import { DateTime } from '../../preferences/date-time.jsx';
import React, { useContext, useState } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import { useResource } from '../../data/use-resource.js';
import { Notice } from '../../components/forms/fields.jsx';
import { useSave } from '../../data/use-save.js';
import { DataTable } from '../../components/data-table.jsx';
import { Modal } from '../../components/modal.jsx';
import { validateDemoAction } from '../../../../shared/domain/demo-data.js';

/** Admin-only dataset lifecycle. The API independently validates access, batch identity, and single-add state. */
function AdminSettings({ section }) {
  const resource = useResource(section === 'demo-data' ? '/settings/demo-data' : null, 3000),
    save = useSave();
  const marketing = useResource(section === 'hosting' ? '/settings/marketing' : null);
  const inbox = useResource(null);
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
      ...(action === 'delete' ? { batchId: batch.batchId } : {}),
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
      {section === 'audit' && (
        <section className="panel space-y-4 p-6">
          <h2 className="text-lg font-semibold">Audit Log</h2>
          <p>
            Review record activity, including who performed an action and when. Search, filter by
            date, and export matching entries.
          </p>
          <Link className="btn-primary" to="/settings/audit">
            View audit log
          </Link>
        </section>
      )}
      {section === 'identity-providers' && (
        <section className="panel space-y-4 p-6">
          <h2 className="text-lg font-semibold">Identity Providers</h2>
          <p>
            Connect Auth0, Okta, Microsoft Entra ID, Google, and other OpenID Connect providers for
            workspace sign-in.
          </p>
          <Link className="btn-primary" to="/settings/identity-providers">
            Manage Identity Providers
          </Link>
        </section>
      )}
      {section === 'service-accounts' && (
        <section className="panel space-y-4 p-6">
          <h2 className="text-lg font-semibold">Service Accounts</h2>
          <p>
            Allow external integrations to create records with scoped API keys or OAuth client
            credentials.
          </p>
          <Link className="btn-primary" to="/settings/service-accounts">
            Manage Service Accounts
          </Link>
        </section>
      )}
      {section === 'demo-data' && (
        <section id="demo-data" className="panel space-y-4 p-6">
          <h2 className="text-lg font-semibold">Demo Data</h2>
          <p className="text-sm text-slate-500">
            New batches include 50 linked RCAs alongside incidents, tasks, knowledge articles and
            runbooks, plus six sample alerts in Notifications. Existing batches stay unchanged;
            delete and re-add demo data to include newly supported types.
          </p>
          <Notice error={resource.error || save.error || clientError} />
          {message && <p role="status">{message}</p>}
          {!resource.data ? (
            <p role="status" className="sr-only">
              Loading demo-data settings…
            </p>
          ) : (
            <>
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
      {section === 'hosting' && marketing.data?.available && (
        <>
          <Notice error={inbox.error} />
          <DataTable
            source="inquiries"
            title="Hosting Inquiries"
            rows={inbox.data?.inquiries ?? []}
            loading={!inbox.data}
            rowKey={(row) => row.id}
            defaultSort="createdAt:desc"
            filename="hosting-inquiries.csv"
            deletePath="/settings/marketing/inquiries"
            description="Inquiries are retained for 90 days."
            columns={[
              { key: 'createdAt', label: 'Received', value: (row) => row.createdAt },
              { key: 'name', label: 'Name', value: (row) => row.name },
              { key: 'email', label: 'Email', value: (row) => row.email },
              { key: 'company', label: 'Organization', value: (row) => row.company },
              { key: 'interest', label: 'Interest', value: (row) => row.interest },
              {
                key: 'message',
                label: 'Message',
                value: (row) => row.message,
                className: 'whitespace-pre-wrap max-w-sm',
              },
              {
                key: 'actions',
                label: 'Actions',
                sortable: false,
                value: () => '',
                render: (row) => (
                  <ConfirmDeleteButton
                    confirmation="Delete this inquiry permanently?"
                    confirmLabel="Remove"
                    className="btn-danger"
                    type="button"
                    disabled={save.busy}
                    onConfirm={() =>
                      save.run(`/settings/marketing/inquiries/${row.id}`, 'DELETE', {})
                    }
                  >
                    Delete inquiry
                  </ConfirmDeleteButton>
                ),
              },
            ]}
          />
        </>
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
    ['groups', 'Groups', '/groups', 'View groups and their members.'],
    ...(admin
      ? [
          ['users', 'Users', '/workspace', 'Manage user profiles, roles, and account access.'],
          ['identity-providers', 'Identity Providers'],
          ['service-accounts', 'Service Accounts'],
          ['audit', 'Audit Log'],
          ['demo-data', 'Demo Data'],
          ...(marketing.data?.available ? [['hosting', 'Hosting Inquiries']] : []),
        ]
      : []),
  ];
  const selected = entries.find(([id]) => id === params.get('section')) || entries[0];
  return (
    <div className="space-y-5">
      <PageTitle>Settings</PageTitle>
      <div className="settings-layout">
        <nav aria-label="Settings categories" className="settings-categories">
          {entries.map(([id, label]) => (
            <button
              key={id}
              type="button"
              aria-current={id === selected[0] ? 'page' : undefined}
              className="settings-category"
              onClick={() => setParams({ section: id }, { replace: true })}
            >
              {label}
            </button>
          ))}
        </nav>
        <div className="min-w-0" key={selected[0]}>
          {selected[2] ? (
            <section className="panel space-y-4 p-6">
              <h2 className="text-lg font-semibold">{selected[1]}</h2>
              <p>{selected[3]}</p>
              <Link className="btn-primary" to={selected[2]}>
                Manage {selected[1]}
              </Link>
            </section>
          ) : (
            <AdminSettings section={selected[0]} />
          )}
        </div>
      </div>
    </div>
  );
}
