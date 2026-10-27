import { CreateButton } from '../../components/create-button.jsx';
import { useResource } from '../../data/use-resource.js';
import { StaticRecordFields } from '../../components/forms/record-field-layout.jsx';
import { healthPolicy } from '../../../../shared/domain/service-health.js';
import { Toggle } from '../../components/forms/toggle.jsx';
import { FormPage } from '../../components/forms/form-page.jsx';
import { FormSkeleton } from '../../components/skeleton.jsx';
import { RecordActions } from '../../components/record-actions.jsx';
import { CancelButton } from '../../components/forms/cancel-button.jsx';
import { ReferenceField } from '../../components/forms/reference-field.jsx';

import { AutoTextarea } from '../../components/forms/auto-textarea.jsx';

import { writeApi } from '../../data/query-client.js';

import React, { useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { ValidatedForm } from '../../components/forms/validated-form.jsx';
import { useCatalog } from './use-catalog.js';

/** Accessible multi-selection with explicit labels and normal keyboard controls. */
export function ServiceChoices({ services, selected, onChange, label, name }) {
  return (
    <ReferenceField
      referenceType={
        name === 'ownerIds' ? 'members' : name === 'ownerGroupIds' ? 'groups' : 'services'
      }
      label={label}
      name={name}
      multiple
      options={services.map((row) => ({ id: row.id, label: row.name }))}
      value={selected}
      onChange={onChange}
    />
  );
}

/** Collections are selected here; creation opens a dedicated page in another tab. */
export function CollectionField({ collections, value, onChange, disabled = false }) {
  return (
    <ReferenceField
      referenceType="collections"
      label="Collections"
      name="collectionIds"
      multiple
      options={collections.map((item) => ({ id: item.id, label: item.name }))}
      value={value}
      onChange={onChange}
      disabled={disabled}
    />
  );
}

/** Create or update service definitions and collections without modifying monitor histories. */
export function CatalogForm({
  kind,
  item,
  services,
  collections,
  members,
  groups,
  onSaved,
  onCancel,
  readOnly = false,
}) {
  const isService = kind === 'services';
  const componentRecords = useResource(isService ? '/components' : null);
  const [componentIds, setComponentIds] = useState(item?.componentIds || []);
  const [manualDown, setManualDown] = useState(item?.healthPolicy?.manualDown ?? false);
  const [manualDegraded, setManualDegraded] = useState(item?.healthPolicy?.manualDegraded ?? false);
  const [ownerIds, setOwnerIds] = useState(item?.ownerIds ?? []);
  const [ownerGroupIds, setOwnerGroupIds] = useState(item?.ownerGroupIds ?? []);
  const [contactId, setContactId] = useState(item?.primaryContactId ?? '');
  const [selected, setSelected] = useState(
    item?.[isService ? 'dependencyIds' : 'serviceIds'] ?? [],
  );
  const [collectionIds, setCollectionIds] = useState(
    collections
      .filter((collection) => collection.serviceIds.includes(item?.id))
      .map((collection) => collection.id),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  /** Submit bounded catalog fields; the server independently validates references and cycles. */
  async function submit(event, reportErrors) {
    event.preventDefault();
    if (busy || readOnly) return;
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError('');
    try {
      const result = await writeApi(`/${kind}${item ? `/${item.id}` : ''}`, {
        method: item ? 'PATCH' : 'POST',
        body: {
          name: form.get('name'),
          ...(isService
            ? {
                healthPolicy: healthPolicy({
                  manualDown,
                  manualDegraded,
                  responseTimeMs: Number(form.get('responseTimeMs')),
                  failuresBeforeDown: Number(form.get('failuresBeforeDown')),
                }),
                description: form.get('description'),
                componentIds,
                ownerIds,
                ownerGroupIds,
                primaryContactId: contactId,
                dependencyIds: selected,
                collectionIds,
              }
            : { serviceIds: selected }),
        },
      });
      onSaved(result.item);
    } catch (error) {
      setError(error.message);
      reportErrors?.(error.fields);
    } finally {
      setBusy(false);
    }
  }
  return (
    <ValidatedForm kind={kind} className="form-body" onSubmit={submit}>
      {error && (
        <p role="alert" className="text-rose-700 dark:text-rose-400">
          {error}
        </p>
      )}
      <StaticRecordFields readOnly={readOnly}>
        <label className="field-label">
          Name *
          <input
            autoFocus={!readOnly}
            name="name"
            maxLength={80}
            required
            defaultValue={item?.name ?? ''}
            placeholder={isService ? 'Customer portal' : 'Production'}
          />
        </label>
        {isService && (
          <label className="field-label">
            Description
            <AutoTextarea
              name="description"
              maxLength={1000}
              defaultValue={item?.description ?? ''}
              placeholder="What this service provides"
            />
          </label>
        )}
        {isService && (
          <ReferenceField
            referenceType="components"
            label="Components"
            name="componentIds"
            multiple
            options={(componentRecords.data?.items || []).map((row) => ({
              id: row.id,
              label: row.name,
            }))}
            value={componentIds}
            onChange={setComponentIds}
            disabled={componentRecords.loading || !!componentRecords.error}
          />
        )}
        {isService && (
          <section className="space-y-5">
            <h2 className="font-semibold">Health Thresholds</h2>
            <label className="flex items-center gap-2">
              <Toggle
                aria-describedby="manual-degraded-help"
                checked={manualDegraded}
                onChange={(event) => {
                  setManualDegraded(event.target.checked);
                  if (event.target.checked) setManualDown(false);
                }}
              />
              Flag as degraded
            </label>
            <label className="flex items-center gap-2">
              <Toggle
                aria-describedby="manual-degraded-help"
                checked={manualDown}
                onChange={(event) => {
                  setManualDown(event.target.checked);
                  if (event.target.checked) setManualDegraded(false);
                }}
              />
              Flag as down
            </label>
            <p id="manual-degraded-help" className="text-sm text-slate-500">
              Manual flags stay enabled until you clear them. Down takes precedence over all other
              health signals.
            </p>
            <label className="field-label">
              Degraded response time (ms)
              <input
                aria-describedby="response-time-help"
                name="responseTimeMs"
                type="number"
                min="0"
                max="120000"
                step="1"
                defaultValue={item?.healthPolicy?.responseTimeMs ?? 0}
              />
            </label>
            <p id="response-time-help" className="text-sm text-slate-500">
              A successful check at or above this duration marks the service Degraded. Use 0 to
              disable.
            </p>
            <label className="field-label">
              Consecutive failures before Down
              <input
                aria-describedby="failure-threshold-help"
                name="failuresBeforeDown"
                type="number"
                min="1"
                max="10"
                step="1"
                required
                defaultValue={item?.healthPolicy?.failuresBeforeDown ?? 1}
              />
            </label>
            <p id="failure-threshold-help" className="text-sm text-slate-500">
              Each monitor is evaluated separately. Failed checks below this threshold show
              Degraded; a successful check resets the failure count.
            </p>
          </section>
        )}
        {isService && (
          <section className="space-y-5 border-t border-slate-200 pt-5 dark:border-slate-700">
            <h2 className="font-semibold">Ownership and Contact</h2>
            <ServiceChoices
              name="ownerIds"
              label="Service owners"
              services={members
                .filter((m) => !m.disabled || ownerIds.includes(m.id))
                .map((m) => ({ id: m.id, name: m.displayName || m.email }))}
              selected={ownerIds}
              onChange={setOwnerIds}
            />
            <ServiceChoices
              name="ownerGroupIds"
              label="Owning groups"
              services={groups}
              selected={ownerGroupIds}
              onChange={setOwnerGroupIds}
            />
            <ReferenceField
              referenceType="members"
              label="Primary point of contact"
              name="primaryContactId"
              options={members
                .filter((member) => !member.disabled || member.id === contactId)
                .map((member) => ({ id: member.id, label: member.displayName || member.email }))}
              value={contactId}
              onChange={setContactId}
            />
          </section>
        )}
        <ServiceChoices
          name={isService ? 'dependencyIds' : 'serviceIds'}
          services={services.filter((service) => service.id !== item?.id || !isService)}
          selected={selected}
          onChange={setSelected}
          label={isService ? 'Depends on these services' : 'Services in this collection'}
        />
        {isService && (
          <CollectionField
            collections={collections}
            value={collectionIds}
            onChange={setCollectionIds}
            disabled={busy}
          />
        )}
        {isService && (
          <p className="field-hint">
            A dependency outage affects this service's current status. Cycles are not allowed.
          </p>
        )}
      </StaticRecordFields>
      {!readOnly && (
        <RecordActions>
          <CancelButton onCancel={onCancel} to={`/${kind}`} disabled={busy} />
          <CreateButton className="btn-primary" disabled={busy}>
            {item ? 'Save' : 'Create'}
          </CreateButton>
        </RecordActions>
      )}
    </ValidatedForm>
  );
}

/** Dedicated create/edit page, preserving unsaved form values during ordinary rerenders. */
export function CatalogFormPage({ kind = 'services' }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data, error } = useCatalog({ includeMonitors: false });
  const item = data?.[kind].find((entry) => entry.id === id);
  const noun = kind === 'services' ? 'service' : 'collection';
  if (id) return <Navigate replace to={`/${kind}/${id}`} />;
  return (
    <FormPage title={`Create ${noun.charAt(0).toUpperCase()}${noun.slice(1)}`}>
      {error && (
        <p role="alert" className="text-rose-700 dark:text-rose-400">
          {error}
        </p>
      )}
      {!data ? (
        error ? (
          <p>Could not load the editor.</p>
        ) : (
          <FormSkeleton
            fields={(kind === 'services'
              ? [
                  'name',
                  'description',
                  'ownerIds',
                  'ownerGroupIds',
                  'primaryContactId',
                  'dependencyIds',
                  'collectionIds',
                ]
              : ['name', 'serviceIds']
            ).map((id) => ({ id }))}
          />
        )
      ) : id && !item ? (
        <p role="alert">
          This {noun} no longer exists.{' '}
          <Link className="underline" to={`/${kind}`}>
            Return to {kind}
          </Link>
          .
        </p>
      ) : (
        <CatalogForm
          key={`${kind}-${id ?? 'new'}`}
          kind={kind}
          item={item}
          services={data.services}
          collections={data.collections}
          members={data.members}
          groups={data.groups}
          onSaved={(saved) => navigate(`/${kind}/${saved.id}`, { state: { createdRecord: !id } })}
          onCancel={() => navigate(id ? `/${kind}/${id}` : `/${kind}`)}
        />
      )}
    </FormPage>
  );
}
