import { ValidatedForm } from '../../components/forms/validated-form.jsx';
import { PlusIcon } from '@heroicons/react/24/outline';
import { RecordActions } from '../../components/record-actions.jsx';
import { CancelButton } from '../../components/forms/cancel-button.jsx';
import { FormPage } from '../../components/forms/form-page.jsx';
import { RecordWorkspace, RecordMetadata } from '../../components/record-workspace.jsx';
import { ReferenceField } from '../../components/forms/reference-field.jsx';
import { ReferenceValue } from '../../components/reference-value.jsx';
import { displayValue } from '../../lib/display-value.js';
import React, { useContext, useState } from 'react';
import { Link, Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { AuthContext } from '../../auth/auth-context.js';
import { useResource } from '../../data/use-resource.js';
import { DataTable } from '../../components/data-table.jsx';
import { AutoTextarea } from '../../components/forms/auto-textarea.jsx';
import { Field, Notice } from '../../components/forms/fields.jsx';
import { useSave } from '../../data/use-save.js';

/** Workspace groups organize people without granting or overriding their individual roles. */
export function GroupsPage({ form = false }) {
  const { user } = useContext(AuthContext),
    admin = user?.role === 'admin';
  const [params] = useSearchParams(),
    { id } = useParams(),
    navigate = useNavigate();
  const groups = useResource(id || form ? '/groups' : null),
    members = useResource(id || form ? '/members' : null);
  const [formVersion, setFormVersion] = useState(0);
  const [editingId, setEditingId] = useState(null);
  const editing = editingId === useParams().id;
  const resetForm = () => {
    setEditingId(null);
    setFormVersion((value) => value + 1);
  };
  const adding = params.get('create') === '1';
  const close = () => navigate(id ? `/groups/${id}` : '/groups');
  const memberName = (id) => {
    const member = members.data?.members.find((m) => m.id === id);
    return member
      ? `${member.displayName || member.email}${member.disabled ? ' (disabled)' : ''}`
      : 'Unavailable member';
  };
  if (adding) return <Navigate replace to="/groups/new" />;
  const item = groups.data?.groups.find((group) => group.id === id);
  if (form && id) return <Navigate replace to={`/groups/${id}`} />;
  if (form)
    return !groups.data || !members.data ? (
      <p role="status" className="sr-only">
        Loading group…
      </p>
    ) : !admin ? (
      <p>Admin access is required.</p>
    ) : id && !item ? (
      <p role="alert">Group not found.</p>
    ) : (
      <GroupEditor
        initial={item ?? {}}
        revision={groups.data.revision}
        members={members.data.members}
        onClose={close}
        onSaved={(result) =>
          navigate(`/groups/${result.group.id}`, { state: { createdRecord: !id } })
        }
      />
    );
  if (id)
    return (
      <div className="space-y-6">
        <Notice error={groups.error || members.error} />
        {item ? (
          <RecordWorkspace
            item={item}
            kind={'groups'}
            onEdit={admin && !editing ? () => setEditingId(id) : undefined}
            sidebar={
              <>
                <RecordMetadata item={item} />
              </>
            }
          >
            {admin && editing && members.data ? (
              <GroupEditor
                key={`${id}-${formVersion}`}
                initial={item}
                revision={groups.data.revision}
                members={members.data.members}
                onClose={resetForm}
                onSaved={resetForm}
              />
            ) : (
              <section className="record-details space-y-6">
                <dl>
                  <div>
                    <dt>Name</dt>
                    <dd>{item.name}</dd>
                  </div>
                  <div>
                    <dt>Description</dt>
                    <dd className="whitespace-pre-wrap">{item.description || 'No description.'}</dd>
                  </div>
                </dl>
                <h2 className="font-semibold">Members</h2>
                <ul className="space-y-2">
                  {item.memberIds.map((memberId) => (
                    <li key={memberId}>
                      <ReferenceValue type="members" id={memberId} label={memberName(memberId)} />
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </RecordWorkspace>
        ) : (
          <p role="status" className={groups.data ? undefined : 'sr-only'}>
            {groups.data ? 'Group not found.' : 'Loading group…'}
          </p>
        )}
      </div>
    );
  return (
    <div className="list-page">
      <Notice error={groups.error || members.error} />
      {
        <DataTable
          source="groups"
          deletePath="/groups"
          onRefresh={groups.refresh}
          fullPage
          loading={!groups.data || !members.data}
          secondaryActions={
            admin && (
              <Link className="btn-secondary" to="/workspace">
                Users
              </Link>
            )
          }
          actions={
            admin && (
              <button className="btn-primary" onClick={() => navigate('/groups/new')}>
                <PlusIcon className="h-5 w-5 shrink-0" aria-hidden="true" />
                Create
              </button>
            )
          }
          title="Groups"
          rows={groups.data?.groups ?? []}
          rowKey={(r) => r.id}
          filename="groups.csv"
          columns={[
            {
              key: 'name',
              label: 'Group',
              value: (r) => r.name,
              render: (r) => (
                <Link className="text-blue-700 dark:text-blue-300" to={`/groups/${r.id}`}>
                  {r.name}
                </Link>
              ),
            },
            { key: 'description', label: 'Description', value: (r) => r.description },
            {
              key: 'members',
              label: 'Members',
              value: (r) => r.memberIds.map(memberName).join(', ') || 'No members',
            },
            ...(admin
              ? [
                  {
                    key: 'actions',
                    label: 'Actions',
                    sortable: false,
                    value: () => '',
                    render: (r) => (
                      <button
                        className="btn-secondary"
                        onClick={() => navigate(`/groups/${r.id}/edit`)}
                      >
                        Edit
                      </button>
                    ),
                  },
                ]
              : []),
          ]}
        />
      }
    </div>
  );
}

/** A searchable, scrollable member picker supports large groups without enlarging the page. */
function GroupEditor({ initial, revision, members, onClose, onSaved }) {
  const save = useSave(),
    [value, setValue] = useState({
      name: initial.name ?? '',
      description: initial.description ?? '',
      memberIds: initial.memberIds ?? [],
    });
  const [originalRevision] = useState(revision);
  return (
    <FormPage title={initial.id ? 'Edit Group' : 'Create Group'}>
      <ValidatedForm
        noValidate
        className="form-body"
        onSubmit={(e) => {
          e.preventDefault();
          save.run(
            initial.id ? `/groups/${initial.id}` : '/groups',
            initial.id ? 'PATCH' : 'POST',
            { ...value, revision: originalRevision },
            onSaved,
          );
        }}
      >
        <Notice error={save.error} />
        <Field name="name" label="Group name *" errors={save.fields}>
          <input
            autoFocus
            value={value.name}
            maxLength={80}
            onChange={(e) => setValue({ ...value, name: e.target.value })}
          />
        </Field>
        <Field name="description" label="Description" errors={save.fields}>
          <AutoTextarea
            value={value.description}
            maxLength={1000}
            onChange={(e) => setValue({ ...value, description: e.target.value })}
          />
        </Field>
        <ReferenceField
          referenceType="members"
          label="Group members"
          multiple
          options={members.map((member) => ({
            id: member.id,
            label: member.displayName || member.email,
            description: displayValue(member.role),
          }))}
          value={value.memberIds}
          onChange={(memberIds) => setValue({ ...value, memberIds })}
          error={save.fields.memberIds}
        />
        <p className="text-sm text-slate-500">
          Groups are organizational. Each member keeps their individual role and access.
        </p>
        <RecordActions>
          <CancelButton onCancel={onClose} to={'/groups'} disabled={save.busy} />
          <button className="btn-primary" disabled={save.busy}>
            {save.busy ? 'Saving…' : 'Save group'}
          </button>
        </RecordActions>
      </ValidatedForm>
    </FormPage>
  );
}
