import { CreateButton } from '../../components/create-button.jsx';
import { ValidatedForm } from '../../components/forms/validated-form.jsx';
import { PageTitle } from '../../components/page-title.jsx';
import { UserAccountForm } from './user-account-form.jsx';
import { UserRecord } from './user-record.jsx';
import { StateBadge } from '../../components/state-badge.jsx';
import { displayValue } from '../../lib/display-value.js';
import React, { useContext, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { AuthContext } from '../../auth/auth-context.js';
import { setSessionUser } from '../../data/query-client.js';
import { useResource } from '../../data/use-resource.js';
import { DataTable } from '../../components/data-table.jsx';
import { Field, Notice } from '../../components/forms/fields.jsx';
import { useSave } from '../../data/use-save.js';

/** Accept a one-time invitation without exposing a token through an API GET URL. */
export function JoinPage() {
  const { token } = useParams(),
    navigate = useNavigate(),
    save = useSave(),
    [password, setPassword] = useState('');
  return (
    <main className="mx-auto max-w-lg space-y-6 p-8">
      <PageTitle>Join Your Workspace</PageTitle>
      <ValidatedForm
        noValidate
        className="panel space-y-5 p-6"
        onSubmit={(e) => {
          e.preventDefault();
          save.run('/auth/invite', 'POST', { token, password }, (result) => {
            setSessionUser(result.user);
            navigate('/', { replace: true });
          });
        }}
      >
        <p>Set a password to accept your invitation. Invitations expire after 48 hours.</p>
        <Notice error={save.error} />
        <Field name="password" label="Password (12–128 characters)" errors={save.fields}>
          <input
            type="password"
            autoComplete="new-password"
            value={password}
            minLength={12}
            maxLength={128}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
        <button className="btn-primary" disabled={save.busy}>
          {save.busy ? 'Joining…' : 'Join workspace'}
        </button>
        <Link className="block text-sm text-blue-600" to="/login">
          Sign in instead
        </Link>
      </ValidatedForm>
    </main>
  );
}
/** Admin-only user directory with dedicated account and password pages. */
export function WorkspacePage({ form }) {
  const { id } = useParams(),
    navigate = useNavigate();
  const { user } = useContext(AuthContext),
    admin = user?.role === 'admin';
  const members = useResource(id ? '/members' : null);
  const actions = (
    <CreateButton className="btn-primary" onClick={() => navigate('/workspace/new')}>
      Create
    </CreateButton>
  );
  if (!admin)
    return (
      <div className="space-y-6">
        <PageTitle>Users</PageTitle>
        <p>Workspace admin access is required.</p>
      </div>
    );
  if (form === 'create' || form === 'password')
    return <UserAccountForm reset={form === 'password'} />;
  if (form === 'edit') return <Navigate replace to={`/workspace/${id}`} />;
  if (id) {
    const member = members.data?.members.find((row) => row.id === id);
    return (
      <div className="space-y-6">
        <Notice error={members.error} />
        {member ? (
          <UserRecord key={member.id} member={member} />
        ) : (
          <p role="status" className={members.data ? undefined : 'sr-only'}>
            {members.data ? 'Member not found.' : 'Loading member…'}
          </p>
        )}
      </div>
    );
  }
  return (
    <div className="list-page">
      <Notice error={members.error} />

      <DataTable
        fullPage
        loading={!members.data}
        actions={actions}
        secondaryActions={
          <Link className="btn-secondary" to="/groups">
            Manage groups
          </Link>
        }
        title="Users"
        rows={members.data?.members ?? []}
        rowKey={(r) => r.id}
        filename="workspace-members.csv"
        source="members"
        deletePath="/members"
        onRefresh={members.refresh}
        columns={[
          {
            key: 'displayName',
            label: 'Name',
            value: (r) => r.displayName,
            render: (r) => (
              <Link className="text-blue-700 dark:text-blue-300" to={`/workspace/${r.id}`}>
                {r.displayName || r.email}
              </Link>
            ),
          },
          { key: 'email', label: 'Email', value: (r) => r.email },
          {
            key: 'role',
            label: 'Role',
            value: (r) => (r.owner ? 'Admin (owner)' : displayValue(r.role)),
          },
          {
            key: 'disabled',
            label: 'Access',
            value: (r) => (r.disabled ? 'Disabled' : 'Active'),
            render: (r) => <StateBadge status={r.disabled ? 'disabled' : 'active'} />,
          },
          {
            key: 'actions',
            label: 'Actions',
            sortable: false,
            value: () => '',
            render: (r) =>
              !r.owner && (
                <button
                  className="btn-secondary"
                  onClick={() => navigate(`/workspace/${r.id}/edit`)}
                >
                  Edit
                </button>
              ),
          },
        ]}
      />
    </div>
  );
}
