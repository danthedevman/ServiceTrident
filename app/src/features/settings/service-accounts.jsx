import React, { useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import {
  SERVICE_ACCOUNT_SCOPES,
  serviceAccountInput,
} from '../../../../shared/domain/service-account.js';
import { useResource } from '../../data/use-resource.js';
import { writeApi } from '../../data/query-client.js';
import { PageTitle } from '../../components/page-title.jsx';
import { ValidatedForm } from '../../components/forms/validated-form.jsx';
import { Field, Notice } from '../../components/forms/fields.jsx';
import { Toggle } from '../../components/forms/toggle.jsx';
import { AutoTextarea } from '../../components/forms/auto-textarea.jsx';
import { ReferenceField } from '../../components/forms/reference-field.jsx';
import { ConfirmDeleteButton } from '../../components/confirm-delete-button.jsx';
import { Modal } from '../../components/modal.jsx';
import { Skeleton } from '../../components/skeleton.jsx';
import { RecordWorkspace, RecordMetadata } from '../../components/record-workspace.jsx';
import { DateTime } from '../../preferences/date-time.jsx';

const empty = {
  name: '',
  description: '',
  enabled: true,
  scopes: [],
  serviceIds: [],
  apiKeyEnabled: true,
  oauthEnabled: false,
  expiresInDays: 90,
};

/** Credentials exist only in component memory until dismissed; never cache or persist them. */
function CredentialReveal({ result, onClose }) {
  const [error, setError] = useState('');
  if (!result) return null;
  return (
    <section className="panel space-y-4 p-6" aria-label="New credentials">
      <h2 className="text-lg font-semibold">Save Your Credentials</h2>
      <p>
        Store these values in your integration’s secret manager. They are shown once. Dismiss this
        panel after copying them.
      </p>
      {result.item.clientId && result.credentials.clientSecret && (
        <Field label="OAuth Client ID">
          <input readOnly value={result.item.clientId} />
        </Field>
      )}
      {Object.entries(result.credentials).map(([key, value]) => (
        <div className="space-y-2" key={key}>
          <Field label={key === 'apiKey' ? 'API Key' : 'OAuth Client Secret'}>
            <input type="password" readOnly autoComplete="off" value={value} />
          </Field>
          <button
            className="btn-secondary"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(value);
                setError('');
              } catch {
                setError(
                  'Copy is unavailable. Use a browser with secure clipboard access, or generate credentials through the admin API and store its one-time response securely.',
                );
              }
            }}
          >
            Copy {key === 'apiKey' ? 'API Key' : 'OAuth Client Secret'}
          </button>
        </div>
      ))}
      <Notice error={error} />
      <button className="btn-secondary" onClick={onClose}>
        Dismiss Credentials
      </button>
    </section>
  );
}

function AccountForm({ item, onCancel, onSaved }) {
  const [draft, setDraft] = useState(
    item
      ? {
          name: item.name,
          description: item.description,
          enabled: item.enabled,
          scopes: item.scopes,
          serviceIds: item.serviceIds,
          revision: item.revision,
        }
      : { ...empty },
  );
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [fields, setFields] = useState({});
  const services = useResource('/services');
  const change = (event) =>
    setDraft((value) => ({ ...value, [event.target.name]: event.target.value }));
  async function submit() {
    if (busy) return;
    setBusy(true);
    setError('');
    setFields({});
    try {
      serviceAccountInput(draft, !item);
      const result = await writeApi(`/settings/service-accounts${item ? `/${item.id}` : ''}`, {
        method: item ? 'PUT' : 'POST',
        body: draft,
      });
      onSaved(result);
    } catch (failure) {
      setError(failure.message);
      setFields(failure.fields ?? {});
    } finally {
      setBusy(false);
    }
  }
  return (
    <ValidatedForm
      className="panel form-body p-6"
      aria-label={item ? 'Edit Service Account' : 'Add Service Account'}
      onSubmit={submit}
      aria-busy={busy}
    >
      <h2 className="text-lg font-semibold">
        {item ? 'Edit Service Account' : 'Add Service Account'}
      </h2>
      <Notice error={error} />
      <Field label="Name" name="name" errors={fields}>
        <input name="name" required maxLength={100} value={draft.name} onChange={change} />
      </Field>
      <Field label="Description" name="description" errors={fields}>
        <AutoTextarea
          name="description"
          maxLength={1000}
          value={draft.description}
          onChange={change}
        />
      </Field>
      <label className="field-label flex items-center gap-3">
        <Toggle
          checked={draft.enabled}
          onChange={(event) => setDraft({ ...draft, enabled: event.target.checked })}
        />
        Enabled
      </label>
      <fieldset
        className="space-y-3"
        aria-describedby={fields.scopes ? 'account-scopes-error' : undefined}
      >
        <legend className="field-label mb-3">Allowed Scopes</legend>
        {SERVICE_ACCOUNT_SCOPES.map((scope) => (
          <label className="flex items-center gap-3 text-sm" key={scope.value}>
            <input
              type="checkbox"
              checked={draft.scopes.includes(scope.value)}
              onChange={(event) =>
                setDraft({
                  ...draft,
                  scopes: event.target.checked
                    ? [...draft.scopes, scope.value]
                    : draft.scopes.filter((value) => value !== scope.value),
                })
              }
            />
            {scope.label}
          </label>
        ))}
        {fields.scopes && (
          <p id="account-scopes-error" className="text-sm text-rose-700 dark:text-rose-300">
            {fields.scopes}
          </p>
        )}
      </fieldset>
      <fieldset className="space-y-3">
        <legend className="field-label mb-3">Service Access</legend>
        <label className="field-label flex items-center gap-3">
          <Toggle
            checked={draft.serviceIds === null}
            onChange={(event) =>
              setDraft({ ...draft, serviceIds: event.target.checked ? null : [] })
            }
          />
          Allow all workspace services and unassigned records
        </label>
        {draft.serviceIds !== null && (
          <ReferenceField
            label="Permitted Services"
            name="serviceIds"
            referenceType="services"
            multiple
            required
            options={(services.data?.services ?? []).map((service) => ({
              id: service.id,
              label: service.name,
            }))}
            value={draft.serviceIds}
            onChange={(serviceIds) => setDraft({ ...draft, serviceIds })}
            error={fields.serviceIds}
          />
        )}
      </fieldset>
      {!item && (
        <fieldset className="space-y-3">
          <legend className="field-label mb-3">Authentication</legend>
          <label className="field-label flex items-center gap-3">
            <Toggle
              checked={draft.apiKeyEnabled}
              onChange={(event) => setDraft({ ...draft, apiKeyEnabled: event.target.checked })}
            />
            API Key
          </label>
          <label className="field-label flex items-center gap-3">
            <Toggle
              checked={draft.oauthEnabled}
              onChange={(event) => setDraft({ ...draft, oauthEnabled: event.target.checked })}
            />
            OAuth Client Credentials
          </label>
          {fields.apiKeyEnabled && (
            <p className="text-sm text-rose-700 dark:text-rose-300">{fields.apiKeyEnabled}</p>
          )}
          <Field label="Credential Lifetime (days)" name="expiresInDays" errors={fields}>
            <input
              name="expiresInDays"
              type="number"
              min={1}
              max={365}
              required
              value={draft.expiresInDays}
              onChange={(event) =>
                setDraft({ ...draft, expiresInDays: Number(event.target.value) })
              }
            />
          </Field>
        </fieldset>
      )}
      <div className="form-actions">
        <button type="button" className="btn-secondary" disabled={busy} onClick={onCancel}>
          Cancel
        </button>
        <button className="btn-primary" disabled={busy}>
          {item ? 'Save' : 'Create Service Account'}
        </button>
      </div>
    </ValidatedForm>
  );
}

function AccountRecord({ id }) {
  const resource = useResource(`/settings/service-accounts/${id}`),
    navigate = useNavigate();
  const [editing, setEditing] = useState(false),
    [revealed, setRevealed] = useState(null),
    [rotate, setRotate] = useState(null),
    [days, setDays] = useState(90),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const services = useResource('/services');
  const item = resource.data?.item;
  async function issue() {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const result = await writeApi(`/settings/service-accounts/${id}/credentials/${rotate}`, {
        method: 'POST',
        body: { revision: item.revision, expiresInDays: Number(days) },
      });
      setRevealed(result);
      setRotate(null);
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusy(false);
    }
  }
  if (!item)
    return (
      <>
        <Notice error={resource.error} />
        {!resource.error && <Skeleton className="h-64" />}
      </>
    );
  return (
    <>
      <Notice error={resource.error} />
      <RecordWorkspace
        item={item}
        kind="serviceAccounts"
        onEdit={
          !editing
            ? () => {
                setRevealed(null);
                setEditing(true);
              }
            : undefined
        }
        status={item.enabled ? 'enabled' : 'disabled'}
        sidebar={<RecordMetadata item={item} />}
        secondaryActions={
          !editing && (
            <ConfirmDeleteButton
              title="Delete Service Account?"
              confirmation={`Delete ${item.name}? All its credentials and access tokens will immediately stop working.`}
              onConfirm={async () => {
                await writeApi(`/settings/service-accounts/${id}`, {
                  method: 'DELETE',
                  body: { revision: item.revision },
                });
                navigate('/settings/service-accounts');
              }}
            >
              Delete Service Account
            </ConfirmDeleteButton>
          )
        }
      >
        {editing ? (
          <AccountForm
            item={item}
            onCancel={() => setEditing(false)}
            onSaved={() => setEditing(false)}
          />
        ) : (
          <div className="space-y-5">
            <div className="panel space-y-4 p-6">
              <h1 className="text-xl font-semibold">{item.name}</h1>
              {item.description && <p>{item.description}</p>}
              <h2 className="font-semibold">Allowed Scopes</h2>
              <ul className="space-y-2">
                {item.scopes.map((scope) => (
                  <li key={scope}>
                    {SERVICE_ACCOUNT_SCOPES.find((value) => value.value === scope)?.label}
                  </li>
                ))}
              </ul>
              <h2 className="font-semibold">Service Access</h2>
              <p>
                {item.serviceIds === null
                  ? 'All workspace services and unassigned records'
                  : item.serviceIds
                      .map(
                        (value) =>
                          services.data?.services?.find((service) => service.id === value)?.name ||
                          'Unavailable service',
                      )
                      .join(', ')}
              </p>
            </div>
            <CredentialReveal result={revealed} onClose={() => setRevealed(null)} />
            {['api-key', 'oauth'].map((method) => {
              const configured =
                method === 'api-key' ? item.apiKeyConfigured : item.oauthConfigured;
              const expiry = method === 'api-key' ? item.apiKeyExpiresAt : item.oauthExpiresAt;
              return (
                <section className="panel space-y-4 p-6" key={method}>
                  <h2 className="text-lg font-semibold">
                    {method === 'api-key' ? 'API Key' : 'OAuth Client Credentials'}
                  </h2>
                  <p>
                    {configured ? (
                      <>
                        Expires <DateTime value={expiry} />
                      </>
                    ) : (
                      'No active credential.'
                    )}
                  </p>
                  {method === 'oauth' && item.clientId && (
                    <Field label="OAuth Client ID">
                      <input readOnly value={item.clientId} />
                    </Field>
                  )}
                  <div className="flex flex-wrap gap-3">
                    <button
                      className="btn-secondary"
                      onClick={() => {
                        setRevealed(null);
                        setError('');
                        setDays(90);
                        setRotate(method);
                      }}
                    >
                      {configured ? 'Rotate Credential' : 'Generate Credential'}
                    </button>
                    {configured && (
                      <ConfirmDeleteButton
                        title="Revoke Credential?"
                        confirmLabel="Revoke Credential"
                        confirmation={
                          method === 'oauth'
                            ? 'Revoke this OAuth secret and all access tokens issued with it?'
                            : 'Revoke this API key immediately?'
                        }
                        onConfirm={async () => {
                          await writeApi(`/settings/service-accounts/${id}/credentials/${method}`, {
                            method: 'DELETE',
                            body: { revision: item.revision },
                          });
                          setRevealed(null);
                        }}
                      >
                        Revoke Credential
                      </ConfirmDeleteButton>
                    )}
                  </div>
                </section>
              );
            })}
            <p className="text-sm">
              Use HTTPS. See{' '}
              <Link
                className="text-blue-700 underline dark:text-blue-300"
                to="/help?topic=service-accounts"
              >
                Service Accounts and External API
              </Link>{' '}
              for token and record endpoints.
            </p>
          </div>
        )}
      </RecordWorkspace>
      {rotate && (
        <Modal title="Generate or Rotate Credential?" onClose={() => setRotate(null)} busy={busy}>
          <ValidatedForm onSubmit={issue} className="space-y-4" aria-busy={busy}>
            <p>
              Continuing replaces the previous credential immediately. Rotating OAuth also
              invalidates existing access tokens.
            </p>
            <Notice error={error} />
            <Field label="Credential Lifetime (days)">
              <input
                name="expiresInDays"
                type="number"
                required
                min={1}
                max={365}
                value={days}
                onChange={(event) => setDays(event.target.value)}
              />
            </Field>
            <div className="form-actions">
              <button
                type="button"
                className="btn-secondary"
                disabled={busy}
                onClick={() => setRotate(null)}
              >
                Cancel
              </button>
              <button className="btn-primary" disabled={busy}>
                Generate Credential
              </button>
            </div>
          </ValidatedForm>
        </Modal>
      )}
    </>
  );
}

export function ServiceAccountsPage() {
  const { id } = useParams();
  const resource = useResource(id ? null : '/settings/service-accounts');
  const [adding, setAdding] = useState(false),
    [revealed, setRevealed] = useState(null);
  if (id) return <AccountRecord key={id} id={id} />;
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <PageTitle>Service Accounts</PageTitle>
        {!adding && (
          <button
            className="btn-primary"
            onClick={() => {
              setRevealed(null);
              setAdding(true);
            }}
          >
            Add Service Account
          </button>
        )}
      </div>
      <p>Give external integrations only the record scopes and service access they need.</p>
      <Notice error={resource.error} />
      <CredentialReveal result={revealed} onClose={() => setRevealed(null)} />
      {adding && (
        <AccountForm
          onCancel={() => setAdding(false)}
          onSaved={(result) => {
            setRevealed(result);
            setAdding(false);
          }}
        />
      )}
      {!resource.data && !resource.error ? (
        <Skeleton className="h-40" />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {resource.data?.items.map((item) => (
            <Link
              key={item.id}
              to={`/settings/service-accounts/${item.id}`}
              className="panel space-y-2 p-5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600"
            >
              <h2 className="font-semibold">{item.name}</h2>
              <p className="text-sm">
                {item.enabled ? 'Enabled' : 'Disabled'} · {item.scopes.length} scopes
              </p>
              {item.description && <p className="text-sm">{item.description}</p>}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
