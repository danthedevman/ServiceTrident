import { PageTitle } from '../../components/page-title.jsx';
import { UsersIcon, UserGroupIcon, ChevronRightIcon } from '@heroicons/react/24/outline';
import { AuthContext } from '../../auth/auth-context.js';
import { ConfirmDeleteButton } from '../../components/confirm-delete-button.jsx';
import { DateTime } from '../../preferences/date-time.jsx';
import React, { useContext, useState } from 'react';
import { Link } from 'react-router-dom';
import { useResource } from '../../data/use-resource.js';
import { Notice } from '../../components/forms/fields.jsx';
import { useSave } from '../../data/use-save.js';
import { DataTable } from '../../components/data-table.jsx';
import { Modal } from '../../components/modal.jsx';
import { validateDemoAction } from '../../../../shared/domain/demo-data.js';

/** Admin-only dataset lifecycle. The API independently validates access, batch identity, and single-add state. */
function AdminSettings() {
  const resource = useResource('/settings/demo-data', 3000),
    save = useSave();
  const marketing = useResource('/settings/marketing');
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
      <section className="panel space-y-4 p-6">
        <h2 className="text-lg font-semibold">Integrations</h2>
        <p>
          Connect email, Slack, Microsoft Teams, or ServiceNow and choose where service-impact
          notifications go.
        </p>
        <Link className="btn-primary" to="/integrations">
          Manage integrations
        </Link>
      </section>
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
      <section className="panel space-y-4 p-6">
        <h2 className="text-lg font-semibold">Service Accounts</h2>
        <p>Allow external integrations to create records with scoped API keys or OAuth client credentials.</p>
        <Link className="btn-primary" to="/settings/service-accounts">Manage Service Accounts</Link>
      </section>
      <section className="panel space-y-4 p-6">
        <h2 className="text-lg font-semibold">Demo Data</h2>
        <Notice error={resource.error || save.error || clientError} />
        {message && <p role="status">{message}</p>}
        {!resource.data ? (
          <p role="status" className="sr-only">
            Loading demo-data settings…
          </p>
        ) : (
          <>
            <p role="status">
              {working
                ? 'Updating demo data…'
                : batch?.status === 'failed' || batch?.recoverable
                  ? 'An interrupted operation needs cleanup. Use Delete demo data before adding again.'
                  : batch
                    ? 'Demo data is installed.'
                    : 'No demo data installed.'}
            </p>
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
                {save.busy && !confirm ? 'Adding…' : 'Add Demo Data'}
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
      {marketing.data?.available && (
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
  if (loading) return null;
  if (!user || user.role === 'user') return <p>Workspace access is required.</p>;
  const admin = user.role === 'admin';
  const panels = [
    ...(admin
      ? [
          {
            title: 'Users',
            to: '/workspace',
            Icon: UsersIcon,
            description: 'Manage user profiles, roles, and account access.',
          },
        ]
      : []),
    {
      title: 'Groups',
      to: '/groups',
      Icon: UserGroupIcon,
      description: admin
        ? 'Organize members into groups for ownership and assignments.'
        : 'View groups and their members.',
    },
  ];
  return (
    <div className="space-y-6">
      <PageTitle>Settings</PageTitle>
      <div className="grid gap-4 sm:grid-cols-2">
        {panels.map(({ title, to, Icon, description }) => (
          <Link
            key={to}
            to={to}
            className="panel flex items-start gap-4 p-6 hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500 dark:hover:bg-slate-800"
          >
            <Icon
              className="h-6 w-6 shrink-0 text-blue-700 dark:text-blue-400"
              aria-hidden="true"
            />
            <div className="min-w-0 flex-1 space-y-2">
              <h2 className="text-lg font-semibold">{title}</h2>
              <p className="text-sm text-slate-600 dark:text-slate-400">{description}</p>
            </div>
            <ChevronRightIcon className="h-5 w-5 shrink-0 text-slate-500" aria-hidden="true" />
          </Link>
        ))}
      </div>
      {admin && <AdminSettings />}
    </div>
  );
}
