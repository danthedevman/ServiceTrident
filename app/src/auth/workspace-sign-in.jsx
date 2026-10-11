import { ValidatedForm } from '../components/forms/validated-form.jsx';
import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useLocation } from 'react-router-dom';
import { api } from '../data/api.js';
import { ErrorNotice } from '../components/feedback.jsx';

export function WorkspaceSignIn() {
  const params = new URLSearchParams(useLocation().search);
  const [key, setKey] = useState(params.get('workspace') || ''),
    [input, setInput] = useState(''),
    [error, setError] = useState('');
  const valid = /^[a-f\d]{48}$/.test(key);
  const resource = useQuery({
    queryKey: ['public', 'identity-providers', key],
    enabled: valid,
    retry: false,
    queryFn: ({ signal }) => api(`/public/identity-providers/${key}`, { signal }),
  });
  function submit(event) {
    event.preventDefault();
    setError('');
    let value = input.trim();
    try {
      value = new URL(value).searchParams.get('workspace') || value;
    } catch {
      /* A workspace code is also accepted. */
    }
    if (!/^[a-f\d]{48}$/.test(value))
      return setError('Paste the workspace sign-in link supplied by your admin.');
    setKey(value);
  }
  const failure = {
    provider: 'Could not reach your identity provider. Contact your workspace admin.',
    failed: 'Identity sign-in failed or expired. Try again, or sign in with your password.',
    unlinked: 'Sign in with your password and connect this provider in Profile first.',
  }[params.get('ssoError')];
  return (
    <section className="mt-6 space-y-3 border-t border-slate-200 pt-5 dark:border-slate-700">
      <h3 className="font-semibold">Workspace Sign-in</h3>
      <ErrorNotice>{failure || error || resource.error?.message}</ErrorNotice>
      {valid ? (
        <>
          <div className="grid gap-2">
            {resource.data?.providers.map((p) => (
              <a
                key={p.id}
                className="btn-secondary justify-center"
                href={`/api/auth/sso/${p.id}/start?workspace=${encodeURIComponent(key)}`}
              >
                Sign in with {p.name}
              </a>
            ))}
          </div>
          {resource.data && !resource.data.providers.length && (
            <p className="text-sm">No enabled identity providers for this workspace.</p>
          )}
          <button
            className="text-sm text-blue-700 dark:text-blue-300"
            type="button"
            onClick={() => setKey('')}
          >
            Use Another Workspace
          </button>
        </>
      ) : (
        <ValidatedForm className="space-y-3" onSubmit={submit}>
          <label className="field-label">
            Workspace Sign-in Link
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              maxLength={2048}
              required
              placeholder="Paste the link from your admin"
            />
          </label>
          <button className="btn-secondary w-full">Continue with Workspace</button>
        </ValidatedForm>
      )}
    </section>
  );
}
