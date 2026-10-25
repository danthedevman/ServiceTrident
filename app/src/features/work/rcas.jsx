import { RecordArticle } from '../../components/record-article.jsx';
import { RecordFieldLayout } from '../../components/forms/record-field-layout.jsx';
import { useListFilter } from '../../data/use-list-filter.js';
import { recordFields } from '../../../../shared/forms/form-options.js';
import { PlusIcon, AdjustmentsHorizontalIcon } from '@heroicons/react/24/outline';
import React, { useContext, useEffect, useId, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { RCA_STATUSES, RCA_SECTIONS, RCA_FIELDS } from '../../../../shared/domain/rca.js';
import { AuthContext } from '../../auth/auth-context.js';
import { DataTable } from '../../components/data-table.jsx';
import { RecordWorkspace, RecordMetadata } from '../../components/record-workspace.jsx';
import { RecordHeader } from '../../components/record-actions.jsx';
import { RecordLink } from '../../components/record-navigation.jsx';
import { FormPage } from '../../components/forms/form-page.jsx';
import { ValidatedForm } from '../../components/forms/validated-form.jsx';
import { Field, CustomField, Notice } from '../../components/forms/fields.jsx';
import { AutoTextarea } from '../../components/forms/auto-textarea.jsx';
import { ReferenceField } from '../../components/forms/reference-field.jsx';
import { Select } from '../../components/forms/select.jsx';
import { DateTime } from '../../preferences/date-time.jsx';
import { Skeleton } from '../../components/skeleton.jsx';
import { ConfirmDeleteButton } from '../../components/confirm-delete-button.jsx';
import { useResource } from '../../data/use-resource.js';
import { useSave } from '../../data/use-save.js';

const editable = (item = {}) =>
  Object.fromEntries(
    ['title', 'status', 'incidentIds', 'taskIds', ...Object.keys(RCA_SECTIONS)].map((key) => [
      key,
      item[key] ?? (key.endsWith('Ids') ? [] : key === 'status' ? 'draft' : ''),
    ]),
  );

/** One server table supports the main list and indexed related lists. */
export function RcaList({ incidentId = '', taskId = '', related = false }) {
  const { user } = useContext(AuthContext);
  const canEdit = ['admin', 'responder'].includes(user?.role);
  const [status, setStatus] = useListFilter('status', '', 'rcas');
  if (!user || user.role === 'user') return null;
  const scope = new URLSearchParams({ incidentId, taskId, status });
  return (
    <DataTable
      fullPage={!related}
      source={`rcas?${scope}`}
      title="Root Cause Analyses"
      filename="root-cause-analyses.csv"
      defaultSort="updatedAt:desc"
      dateColumn="updatedAt"
      actions={
        canEdit ? (
          <Link
            className="btn-primary"
            to={`/rcas/new?${new URLSearchParams({ incidentId, taskId })}`}
          >
            <PlusIcon className="h-5 w-5 shrink-0" aria-hidden="true" />
            Create
          </Link>
        ) : undefined
      }
      secondaryActions={
        user.role === 'admin' ? (
          <Link to="/rcas/fields">
            <AdjustmentsHorizontalIcon className="h-5 w-5" />
            Form Builder
          </Link>
        ) : undefined
      }
      filters={
        <label className="field-label">
          Status
          <Select value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="">All active statuses</option>
            {Object.entries(RCA_STATUSES).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </label>
      }
      columns={[
        {
          key: 'title',
          label: 'Title',
          value: (row) => row.title,
          render: (row) => (
            <RecordLink
              to={`/rcas/${row.id}`}
              className="text-blue-700 hover:underline dark:text-blue-300"
            >
              {row.title}
            </RecordLink>
          ),
        },
        { key: 'status', label: 'Status', value: (row) => RCA_STATUSES[row.status] || row.status },
        { key: 'createdBy', label: 'Author', value: (row) => row.createdBy || 'Not recorded' },
        {
          key: 'updatedAt',
          label: 'Updated',
          value: (row) => row.updatedAt,
          render: (row) => <DateTime value={row.updatedAt} />,
        },
      ]}
    />
  );
}

/** Internal RCA records keep source links and corrective-action tasks together. */
export function RcaPage({ create = false }) {
  const { id } = useParams(),
    [params] = useSearchParams(),
    navigate = useNavigate();
  const { user } = useContext(AuthContext);
  const allowed = user && user.role !== 'user';
  const canEdit = ['admin', 'responder'].includes(user?.role);
  const schema = useResource(allowed ? '/rca-fields' : null);
  const fields = schema.data?.fields ?? RCA_FIELDS;
  const resource = useResource(!create && allowed ? `/rcas/${id}` : null, 30000);
  const [editor, setEditor] = useState(() =>
    create
      ? {
          ...editable(),
          custom: {},
          incidentIds: params.get('incidentId') ? [params.get('incidentId')] : [],
          taskIds: params.get('taskId') ? [params.get('taskId')] : [],
        }
      : null,
  );
  const save = useSave(),
    formId = useId();
  const item = resource.data?.item;
  const customFields = recordFields(fields, item?.fields).filter((field) => !field.archived);
  useEffect(() => {
    if (!create) setEditor(null);
  }, [id, create]);
  if (!allowed) return null;
  const submit = (event) => {
    event.preventDefault();
    save.run(create ? '/rcas' : `/rcas/${id}`, create ? 'POST' : 'PATCH', editor, (result) => {
      setEditor(null);
      if (create)
        navigate(`/rcas/${result.item.id}`, { replace: true, state: { createdRecord: true } });
    });
  };
  const actions =
    editor && canEdit ? (
      <>
        <button
          type="button"
          className="btn-secondary"
          disabled={save.busy}
          form={formId}
          onClick={() => (create ? navigate('/rcas') : setEditor(null))}
        >
          Cancel
        </button>
        <button type="submit" form={formId} className="btn-primary" disabled={save.busy}>
          Save
        </button>
      </>
    ) : undefined;
  const content =
    editor && canEdit ? (
      <ValidatedForm id={formId} noValidate className="form-body" onSubmit={submit}>
        <Notice error={save.error} />
        <RecordFieldLayout
          fields={fields}
          layout={schema.data?.layout}
          editing={!create}
          renderField={(field) => {
            const key = field.id;
            if (field.type !== 'builtin')
              return (
                <CustomField
                  key={key}
                  field={field}
                  value={editor.custom?.[key]}
                  errors={save.fields}
                  onChange={(value) =>
                    setEditor({ ...editor, custom: { ...editor.custom, [key]: value } })
                  }
                />
              );
            if (key === 'incidentIds' || key === 'taskIds')
              return (
                <ReferenceField
                  key={key}
                  referenceType={key === 'incidentIds' ? 'incidents' : 'tasks'}
                  label={field.label}
                  required={field.required}
                  helpText={field.helpText}
                  multiple
                  value={editor[key]}
                  onChange={(value) => setEditor({ ...editor, [key]: value })}
                  error={save.fields[key]}
                />
              );
            return (
              <Field
                key={key}
                name={key}
                label={field.label}
                helpText={field.helpText}
                errors={save.fields}
              >
                {key === 'status' ? (
                  <Select
                    required={field.required}
                    value={editor.status}
                    onChange={(event) => setEditor({ ...editor, status: event.target.value })}
                  >
                    {Object.entries(RCA_STATUSES).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </Select>
                ) : key === 'title' ? (
                  <input
                    required={field.required}
                    maxLength={160}
                    value={editor.title}
                    onChange={(event) => setEditor({ ...editor, title: event.target.value })}
                  />
                ) : (
                  <AutoTextarea
                    required={
                      field.required ||
                      (editor.status === 'completed' &&
                        ['summary', 'rootCause', 'correctiveActions'].includes(key))
                    }
                    maxLength={10000}
                    value={editor[key]}
                    onChange={(event) => setEditor({ ...editor, [key]: event.target.value })}
                  />
                )}
              </Field>
            );
          }}
        />
      </ValidatedForm>
    ) : item ? (
      <RecordArticle
        kind="rcas"
        className="rca-reader"
        fields={[
          ...fields,
          ...customFields.filter((field) => !fields.some((row) => row.id === field.id)),
        ]}
        layout={schema.data?.layout}
        item={{ ...item, statusLabel: RCA_STATUSES[item.status] }}
        renderValue={(field) =>
          ['incidentIds', 'taskIds'].includes(field.id) ? (
            <div className="space-y-2">
              {(field.id === 'incidentIds' ? resource.data.incidents : resource.data.tasks).map(
                (row) => (
                  <RecordLink
                    key={row.id}
                    className="block text-blue-700 hover:underline dark:text-blue-300"
                    to={`/${field.id === 'incidentIds' ? 'incidents' : 'tasks'}/${row.id}`}
                  >
                    {row.title}
                  </RecordLink>
                ),
              )}
            </div>
          ) : undefined
        }
      />
    ) : (
      <Skeleton className="h-64 w-full" />
    );
  if (create)
    return canEdit ? (
      <FormPage title="Create RCA">
        <RecordHeader>{actions}</RecordHeader>
        {content}
      </FormPage>
    ) : (
      <p>Responder or admin access is required.</p>
    );
  return (
    <>
      <Notice error={resource.error || (!editor ? save.error : '')} />
      {item ? (
        <RecordWorkspace
          showDetailsTab={!!editor}
          showIdentity={!!editor}
          kind="rcas"
          item={item}
          onEdit={
            canEdit && !editor
              ? () =>
                  setEditor({
                    ...editable(item),
                    custom: item.custom ?? {},
                    revision: item.revision,
                  })
              : undefined
          }
          actions={actions}
          sidebar={editor ? <RecordMetadata item={item} /> : undefined}
          secondaryActions={
            !editor && canEdit && item.status !== 'archived' ? (
              <ConfirmDeleteButton
                title="Archive RCA?"
                confirmLabel="Archive RCA"
                confirmation="Archive this analysis? Its content and links will remain available in the Archived filter."
                onConfirm={() =>
                  save.run(`/rcas/${id}`, 'PATCH', {
                    ...editable(item),
                    custom: item.custom ?? {},
                    revision: item.revision,
                    status: 'archived',
                  })
                }
              >
                Archive RCA
              </ConfirmDeleteButton>
            ) : undefined
          }
        >
          {content}
        </RecordWorkspace>
      ) : (
        !resource.error && content
      )}
    </>
  );
}
