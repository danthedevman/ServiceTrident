import React, { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useResource } from '../data/use-resource.js';
import { writeApi } from '../data/query-client.js';
import { ErrorNotice } from '../components/feedback.jsx';
import { ConfirmDeleteButton } from '../components/confirm-delete-button.jsx';

/** Explicit password-confirmed linking prevents verified-email auto-linking and keeps workspace roles intact. */
export function IdentityConnections() {
  const resource = useResource('/auth/identity-providers');
  const [password, setPassword] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const connected = new URLSearchParams(useLocation().search).get('ssoConnected') === '1';
  async function connect(id) {
    setBusy(true);
    setError('');
    try {
      const result = await writeApi(`/auth/identity-providers/${id}/connect`, {
        method: 'POST',
        body: { currentPassword: password },
      });
      setPassword('');
      window.location.assign(result.url);
    } catch (failure) {
      setError(failure.message);
      setBusy(false);
    }
  }
  if (!resource.data?.providers.length)
    return resource.error ? <ErrorNotice>{resource.error}</ErrorNotice> : null;
  return (
    <section className="panel space-y-4 p-6" aria-busy={busy}>
      <h2 className="text-lg font-semibold">Identity Provider Connections</h2>
      <p>
        Confirm your current password, then authenticate with your work identity to connect this
        account. Use your workspace sign-in link for future sign-ins.
      </p>
      <ErrorNotice>{error || resource.error}</ErrorNotice>
      {connected && <p role="status">Identity provider connected.</p>}
      <label className="field-label">
        Confirm Password to Connect
        <input
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          maxLength={128}
        />
      </label>
      {resource.data.providers.map((provider) => (
        <div className="flex flex-wrap items-center justify-between gap-3" key={provider.id}>
          <span>
            {provider.name}
            {provider.connected ? ' · Connected' : ''}
          </span>
          {provider.connected ? (
            <ConfirmDeleteButton
              className="btn-secondary"
              confirmation="Disconnect this identity provider from your account? Password sign-in remains available."
              onConfirm={async () => {
                await writeApi(`/auth/identity-providers/${provider.id}/connect`, {
                  method: 'DELETE',
                  body: {},
                });
                await resource.refresh();
              }}
            >
              Disconnect
            </ConfirmDeleteButton>
          ) : (
            <button
              type="button"
              className="btn-secondary"
              disabled={busy || !password}
              onClick={() => connect(provider.id)}
            >
              Connect {provider.name}
            </button>
          )}
        </div>
      ))}
    </section>
  );
}
