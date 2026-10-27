import { CreateButton } from '../../components/create-button.jsx';
import { ValidatedForm } from '../../components/forms/validated-form.jsx';
import React, { useState } from 'react';
import { IDENTITY_PROVIDERS } from '../../../../shared/domain/identity-provider-options.js';
import { useResource } from '../../data/use-resource.js';
import { writeApi } from '../../data/query-client.js';
import { ErrorNotice } from '../../components/feedback.jsx';
import { Select } from '../../components/forms/select.jsx';
import { Toggle } from '../../components/forms/toggle.jsx';
import { ConfirmDeleteButton } from '../../components/confirm-delete-button.jsx';
import { Skeleton } from '../../components/skeleton.jsx';

const empty = {
  name: '',
  provider: 'auth0',
  issuer: '',
  clientId: '',
  clientSecret: '',
  authMethod: 'client_secret_post',
  enabled: true,
};

function ProviderForm({ item, onClose, onSaved }) {
  const [draft, setDraft] = useState({ ...(item || empty), clientSecret: '' });
  const [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  const change = (event) =>
    setDraft((value) => ({ ...value, [event.target.name]: event.target.value }));
  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await writeApi(`/settings/identity-providers${item ? `/${item.id}` : ''}`, {
        method: item ? 'PUT' : 'POST',
        body: draft,
      });
      await onSaved();
      onClose();
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusy(false);
    }
  }
  const provider = IDENTITY_PROVIDERS.find((p) => p.id === draft.provider);
  return (
    <ValidatedForm
      className="panel form-body space-y-5 p-6"
      onSubmit={submit}
      aria-label={item ? 'Edit Identity Provider' : 'Add Identity Provider'}
      aria-busy={busy}
    >
      <h2 className="text-lg font-semibold">
        {item ? 'Edit Identity Provider' : 'Add Identity Provider'}
      </h2>
      <ErrorNotice>{error}</ErrorNotice>
      <div className="grid gap-5 sm:grid-cols-2">
        <label className="field-label">
          Provider
          <Select name="provider" value={draft.provider} onChange={change}>
            {IDENTITY_PROVIDERS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </Select>
        </label>
        <label className="field-label">
          Display Name
          <input
            name="name"
            value={draft.name}
            onChange={change}
            required
            maxLength={80}
            placeholder="Work account"
          />
        </label>
        <label className="field-label sm:col-span-2">
          Issuer URL
          <input
            name="issuer"
            value={draft.issuer}
            onChange={change}
            type="url"
            required
            maxLength={2048}
            placeholder={provider.example}
          />
          <span className="field-hint">
            Use the exact issuer from your provider’s discovery document, including any trailing
            slash. Entra ID requires a specific tenant.
          </span>
        </label>
        <label className="field-label">
          Client ID
          <input
            name="clientId"
            value={draft.clientId}
            onChange={change}
            required
            maxLength={512}
            autoComplete="off"
          />
        </label>
        <label className="field-label">
          Client Secret
          <input
            name="clientSecret"
            value={draft.clientSecret}
            onChange={change}
            type="password"
            required={!item}
            maxLength={4096}
            autoComplete="new-password"
          />
          <span className="field-hint">
            {item
              ? 'Leave blank to keep the saved secret.'
              : 'Stored encrypted; never returned by the API.'}
          </span>
        </label>
        <label className="field-label">
          Client Authentication
          <Select name="authMethod" value={draft.authMethod} onChange={change}>
            <option value="client_secret_post">Client Secret Post</option>
            <option value="client_secret_basic">Client Secret Basic</option>
          </Select>
        </label>
        <label className="flex items-center justify-between gap-4 self-center">
          Enabled
          <Toggle
            checked={draft.enabled}
            onChange={(e) => setDraft((v) => ({ ...v, enabled: e.target.checked }))}
          />
        </label>
      </div>
      <div className="flex justify-end gap-3">
        <button type="button" className="btn-secondary" disabled={busy} onClick={onClose}>
          Cancel
        </button>
        <CreateButton disabled={busy}>{item ? 'Save' : 'Create'}</CreateButton>
      </div>
    </ValidatedForm>
  );
}

export function IdentityProvidersPage() {
  const resource = useResource('/settings/identity-providers');
  const [editing, setEditing] = useState(null),
    [error, setError] = useState(''),
    [message, setMessage] = useState(''),
    [testing, setTesting] = useState(null);
  async function test(item) {
    setTesting(item.id);
    setError('');
    setMessage('');
    try {
      const result = await writeApi(`/settings/identity-providers/${item.id}/test`, {
        method: 'POST',
        body: {},
      });
      setMessage(result.message);
    } catch (failure) {
      setError(failure.message);
    } finally {
      setTesting(null);
    }
  }
  return (
    <div className="space-y-6">
      <section className="panel space-y-4 p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">Identity Providers</h2>
          <CreateButton
            className="btn-primary"
            disabled={!resource.data || resource.data.providers.length >= 10}
            onClick={() => {
              setEditing(empty);
              setMessage('');
            }}
          >
            Create
          </CreateButton>
        </div>
        <p>
          Connect OpenID Connect providers for workspace sign-in. Register a confidential web
          application with authorization code flow. Users connect their existing account in Profile
          before signing in with a provider.
        </p>
        <ErrorNotice>{resource.error || error}</ErrorNotice>
        {message && <p role="status">{message}</p>}
        {resource.data ? (
          <div className="grid gap-4">
            <label className="field-label">
              Callback URL
              <input
                readOnly
                value={resource.data.callbackUrl}
                onFocus={(e) => e.target.select()}
              />
              <span className="field-hint">
                Register this exact redirect URI with each provider.
              </span>
            </label>
            {resource.data.signInUrl && (
              <label className="field-label">
                Workspace Sign-in Link
                <input
                  readOnly
                  value={resource.data.signInUrl}
                  onFocus={(e) => e.target.select()}
                />
                <span className="field-hint">
                  Share this link with workspace members after they connect their accounts.
                </span>
              </label>
            )}
          </div>
        ) : (
          <Skeleton className="h-24" />
        )}
      </section>
      {editing && (
        <ProviderForm
          key={editing.id || 'new'}
          item={editing.id ? editing : null}
          onClose={() => setEditing(null)}
          onSaved={resource.refresh}
        />
      )}
      {resource.data && (
        <div className="grid gap-4">
          {resource.data.providers.length ? (
            resource.data.providers.map((item) => (
              <section className="panel space-y-3 p-6" key={item.id}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="font-semibold">{item.name}</h2>
                    <p className="text-sm text-slate-500">
                      {IDENTITY_PROVIDERS.find((p) => p.id === item.provider)?.label} ·{' '}
                      {item.enabled ? 'Enabled' : 'Disabled'}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      className="btn-secondary"
                      disabled={!!testing}
                      onClick={() => test(item)}
                      aria-label={`Test Discovery for ${item.name}`}
                    >
                      Test Discovery
                    </button>
                    <button
                      className="btn-secondary"
                      onClick={() => setEditing(item)}
                      aria-label={`Configure ${item.name}`}
                    >
                      Configure
                    </button>
                    <ConfirmDeleteButton
                      className="btn-danger"
                      confirmation="Remove this provider and its account connections? Existing sessions and password sign-in remain available."
                      onConfirm={async () => {
                        await writeApi(`/settings/identity-providers/${item.id}`, {
                          method: 'DELETE',
                          body: { revision: item.revision },
                        });
                        if (editing?.id === item.id) setEditing(null);
                        await resource.refresh();
                      }}
                    >
                      Delete
                    </ConfirmDeleteButton>
                  </div>
                </div>
                <p className="break-all text-sm">Issuer: {item.issuer}</p>
              </section>
            ))
          ) : (
            <p>No identity providers configured.</p>
          )}
        </div>
      )}
    </div>
  );
}
