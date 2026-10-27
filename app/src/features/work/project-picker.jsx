import { CreateButton } from '../../components/create-button.jsx';
import { PencilSquareIcon } from '@heroicons/react/24/outline';
import { createPortal } from 'react-dom';
import React, { useContext, useEffect, useState, useId } from 'react';
import { AuthContext } from '../../auth/auth-context.js';
import { ReferenceField } from '../../components/forms/reference-field.jsx';
import { Field, Notice } from '../../components/forms/fields.jsx';
import { AutoTextarea } from '../../components/forms/auto-textarea.jsx';
import { ValidatedForm } from '../../components/forms/validated-form.jsx';
import { Modal } from '../../components/modal.jsx';
import { useSave } from '../../data/use-save.js';
import { useResource } from '../../data/use-resource.js';
import { Skeleton } from '../../components/skeleton.jsx';

/** Project selection is shared by board, list and task forms. */
export function ProjectPicker({
  value,
  onChange,
  label = 'Project',
  errors,
  required = false,
  showSelector = true,
  showCreate = true,
  showEdit = false,
  actionLabel,
}) {
  const { user } = useContext(AuthContext),
    [mode, setMode] = useState(null),
    [busy, setBusy] = useState(false),
    [footerTarget, setFooterTarget] = useState(null);
  const resource = useResource(mode === 'edit' && value ? `/projects/${value}` : null);
  const editable = ['admin', 'responder'].includes(user?.role);
  return (
    <div className="flex min-w-0 flex-wrap items-end gap-2">
      {showSelector && (
        <div className="min-w-0 flex-1">
          <ReferenceField
            referenceType="projects"
            label={label}
            value={value}
            onChange={onChange}
            error={errors?.projectId}
            required={required}
          />
        </div>
      )}
      {editable && showCreate && (
        <CreateButton
          type="button"
          className="btn-primary shrink-0"
          aria-label="Create"
          title="Create Project"
          onClick={() => setMode('create')}
        >
          Create
        </CreateButton>
      )}
      {editable && showEdit && value && (
        <button
          type="button"
          className="btn-secondary inline-flex items-center gap-2"
          aria-label={actionLabel || 'Edit Project'}
          onClick={() => setMode('edit')}
        >
          <PencilSquareIcon className="h-4 w-4" aria-hidden="true" />
          {actionLabel || 'Edit'}
        </button>
      )}
      {mode && (
        <Modal
          busy={busy}
          footer={<div ref={setFooterTarget} className="flex flex-wrap justify-end gap-2" />}
          title={mode === 'create' ? 'Create Project' : 'Edit Project'}
          onClose={() => setMode(null)}
        >
          <Notice error={resource.error} />
          {mode === 'create' || resource.data ? (
            <ProjectForm
              key={`${mode}:${value}`}
              item={mode === 'edit' ? resource.data.item : null}
              actionsTarget={footerTarget}
              onBusyChange={setBusy}
              projectCount={resource.data?.projectCount}
              onClose={() => setMode(null)}
              onSaved={(item) => {
                onChange(item.id);
                setMode(null);
              }}
              onDeleted={(targetProjectId) => {
                onChange(targetProjectId);
                setMode(null);
              }}
            />
          ) : (
            <Skeleton className="h-64" />
          )}
        </Modal>
      )}
    </div>
  );
}
function ProjectForm({
  item,
  projectCount,
  onClose,
  onSaved,
  onDeleted,
  onBusyChange,
  actionsTarget,
}) {
  const formId = useId();
  const [value, setValue] = useState({
    name: item?.name || '',
    description: item?.description || '',
    ownerIds: item?.ownerIds || [],
    ownerGroupIds: item?.ownerGroupIds || [],
  });
  const [deleting, setDeleting] = useState(item?.deleting === true),
    [target, setTarget] = useState(item?.moveTargetId || '');
  const save = useSave();
  useEffect(() => {
    onBusyChange(save.busy);
  }, [save.busy, onBusyChange]);
  return (
    <ValidatedForm
      id={formId}
      noValidate
      className="space-y-4"
      onSubmit={(event, report) => {
        event.preventDefault();
        if (save.busy) return;
        if (deleting) {
          if (!target || target === item.id) {
            report({ targetProjectId: 'Choose a different project.' });
            return;
          }
          save.run(
            `/projects/${item.id}`,
            'DELETE',
            { confirmed: true, targetProjectId: target, revision: item.revision || 0 },
            (data) => onDeleted(data.targetProjectId),
          );
        } else
          save.run(
            item ? `/projects/${item.id}` : '/projects',
            item ? 'PATCH' : 'POST',
            { ...value, ...(item ? { revision: item.revision || 0 } : {}) },
            (data) => onSaved(data.item),
          );
      }}
    >
      <Notice error={save.error} />
      {deleting ? (
        <>
          <p>
            Delete <strong>{item.name}</strong>? All its tasks, including archived tasks, will move
            to the project you select.
          </p>
          <ReferenceField
            name="targetProjectId"
            referenceType="projects"
            excludeId={item.id}
            label="Move Tasks to Project"
            value={target}
            onChange={setTarget}
            required
            error={save.fields.targetProjectId}
          />
        </>
      ) : (
        <>
          <Field name="name" label="Name" errors={save.fields}>
            <input
              name="name"
              required
              maxLength={160}
              autoFocus
              value={value.name}
              onChange={(event) => setValue({ ...value, name: event.target.value })}
            />
          </Field>
          <Field name="description" label="Description" errors={save.fields}>
            <AutoTextarea
              name="description"
              maxLength={2000}
              rows={3}
              value={value.description}
              onChange={(event) => setValue({ ...value, description: event.target.value })}
            />
          </Field>
          <ReferenceField
            name="ownerIds"
            referenceType="members"
            label="Owners"
            multiple
            value={value.ownerIds}
            onChange={(ownerIds) => setValue({ ...value, ownerIds })}
            error={save.fields.ownerIds}
          />
          <ReferenceField
            name="ownerGroupIds"
            referenceType="groups"
            label="Owning Groups"
            multiple
            value={value.ownerGroupIds}
            onChange={(ownerGroupIds) => setValue({ ...value, ownerGroupIds })}
            error={save.fields.ownerGroupIds}
          />
          {item && projectCount === 1 && (
            <p className="text-sm text-slate-500">
              Keep at least one project. Create another project before deleting this one.
            </p>
          )}
        </>
      )}
      {actionsTarget &&
        createPortal(
          <React.Fragment>
            {item && !deleting && (
              <button
                type="button"
                className="btn-danger"
                disabled={save.busy || projectCount === 1}
                onClick={() => setDeleting(true)}
              >
                Delete Project
              </button>
            )}
            <button
              type="button"
              className="btn-secondary"
              disabled={save.busy}
              form={formId}
              onClick={() => (deleting && !item.deleting ? setDeleting(false) : onClose())}
            >
              Cancel
            </button>
            <CreateButton
              type="submit"
              form={formId}
              className={deleting ? 'btn-danger' : 'btn-primary'}
              disabled={save.busy}
            >
              {deleting ? 'Delete' : item ? 'Save' : 'Create'}
            </CreateButton>
          </React.Fragment>,
          actionsTarget,
        )}
    </ValidatedForm>
  );
}
