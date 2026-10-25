import { RecordTabs } from '../../components/record-tabs.jsx';
import React, { useContext, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { AuthContext } from '../../auth/auth-context.js';
import { useResource } from '../../data/use-resource.js';
import { writeApi } from '../../data/query-client.js';
import { DataTable } from '../../components/data-table.jsx';
import { RecordWorkspace, RecordMetadata } from '../../components/record-workspace.jsx';
import { RecordActions } from '../../components/record-actions.jsx';
import { ValidatedForm } from '../../components/forms/validated-form.jsx';
import { StaticRecordFields } from '../../components/forms/record-field-layout.jsx';
import { AutoTextarea } from '../../components/forms/auto-textarea.jsx';
import { ConfirmDeleteButton } from '../../components/confirm-delete-button.jsx';
import { ErrorNotice } from '../../components/feedback.jsx';
import { FormSkeleton } from '../../components/skeleton.jsx';
import { ReferenceValue } from '../../components/reference-value.jsx';

/** The same authorized component table serves the list and a service's related records. */
export function ComponentsTable({ serviceId }) {
  const { user } = useContext(AuthContext);
  return (
    <DataTable
      source={`components${serviceId ? `?serviceId=${serviceId}` : ''}`}
      title="Components"
      fullPage={!serviceId}
      defaultSort="name:asc"
      columns={[
        {
          key: 'number',
          label: 'Number',
          render: (row) => (
            <ReferenceValue type="components" id={row.id} label={row.number || row.name} />
          ),
        },
        {
          key: 'name',
          label: 'Name',
          render: (row) => <ReferenceValue type="components" id={row.id} label={row.name} />,
        },
        { key: 'description', label: 'Description' },
      ]}
      actions={
        user?.role === 'admin' ? (
          <Link className="btn-primary" to="/components/new">
            Create Component
          </Link>
        ) : undefined
      }
    />
  );
}

/** Component records have their own form; service membership is edited through service references. */
export function ComponentPage({ create = false }) {
  const { id } = useParams(),
    { user } = useContext(AuthContext),
    navigate = useNavigate();
  const resource = useResource(create ? null : `/components/${id}`);
  const services = useResource(create ? null : '/services');
  const linkedServices =
    services.data?.services?.filter((service) => (service.componentIds || []).includes(id)) || [];
  const item = resource.data?.item;
  const [editing, setEditing] = useState(false),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  const readOnly = !create && !editing;
  async function save(event, reportErrors) {
    event.preventDefault();
    if (busy || readOnly) return;
    const values = new FormData(event.currentTarget);
    setBusy(true);
    setError('');
    try {
      const result = await writeApi(create ? '/components' : `/components/${id}`, {
        method: create ? 'POST' : 'PATCH',
        body: {
          name: values.get('name'),
          description: values.get('description'),
          ...(item ? { revision: item.revision } : {}),
        },
      });
      setEditing(false);
      if (create) navigate(`/components/${result.item.id}`, { state: { createdRecord: true } });
    } catch (error) {
      setError(error.message);
      reportErrors?.(error.fields);
    } finally {
      setBusy(false);
    }
  }
  if (!create && !item)
    return (
      <>
        <ErrorNotice>{resource.error}</ErrorNotice>
        <FormSkeleton fields={[{ id: 'name' }, { id: 'description' }]} />
      </>
    );
  const form = (
    <ValidatedForm
      key={`${id || 'new'}-${editing}-${item?.revision}`}
      className="form-body"
      onSubmit={save}
    >
      <ErrorNotice>{error}</ErrorNotice>
      <StaticRecordFields readOnly={readOnly}>
        <label className="field-label">
          Name *
          <input
            name="name"
            required
            maxLength={80}
            defaultValue={item?.name || ''}
            autoFocus={!readOnly}
          />
        </label>
        <label className="field-label">
          Description
          <AutoTextarea
            name="description"
            maxLength={1000}
            defaultValue={item?.description || ''}
          />
        </label>
      </StaticRecordFields>
      {!readOnly && (
        <RecordActions>
          <button
            type="button"
            className="btn-secondary"
            disabled={busy}
            onClick={() => (create ? navigate('/components') : setEditing(false))}
          >
            Cancel
          </button>
          <button className="btn-primary" disabled={busy}>
            {create ? 'Create Component' : 'Save'}
          </button>
        </RecordActions>
      )}
    </ValidatedForm>
  );
  return (
    <RecordWorkspace
      item={item}
      kind="components"
      onEdit={!create && !editing && user?.role === 'admin' ? () => setEditing(true) : undefined}
      relatedTabs={
        item ? (
          <RecordTabs
            related
            lazy
            tabs={[
              {
                id: 'monitors',
                label: 'Monitors',
                content: (
                  <DataTable
                    source={`monitors?componentId=${id}`}
                    title="Monitors"
                    columns={[
                      {
                        key: 'number',
                        label: 'Number',
                        render: (row) => (
                          <ReferenceValue
                            type="monitors"
                            id={row.id}
                            label={row.number || row.name}
                          />
                        ),
                      },
                      {
                        key: 'name',
                        label: 'Name',
                        render: (row) => (
                          <ReferenceValue type="monitors" id={row.id} label={row.name} />
                        ),
                      },
                      { key: 'status', label: 'Status' },
                    ]}
                    actions={
                      user?.role === 'admin' && linkedServices.length ? (
                        <Link
                          className="btn-primary"
                          to={`/monitors/new?componentId=${id}${linkedServices.length === 1 ? `&serviceId=${linkedServices[0].id}` : ''}`}
                        >
                          Create Monitor
                        </Link>
                      ) : undefined
                    }
                  />
                ),
              },
            ]}
          />
        ) : undefined
      }
      sidebar={item ? <RecordMetadata item={item} /> : undefined}
      secondaryActions={
        !create && user?.role === 'admin' ? (
          <ConfirmDeleteButton
            title="Delete Component"
            confirmation={`Delete “${item.name}”? Remove it from services and reassign monitors first.`}
            onConfirm={async () => {
              await writeApi(`/components/${id}`, { method: 'DELETE' });
              navigate('/components');
            }}
          >
            Delete Component
          </ConfirmDeleteButton>
        ) : undefined
      }
    >
      {form}
    </RecordWorkspace>
  );
}
