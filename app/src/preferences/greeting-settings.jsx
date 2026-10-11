import { ValidatedForm } from '../components/forms/validated-form.jsx';
import React, { useContext, useEffect, useState } from 'react';
import { useUiPreferences } from './ui-preferences.jsx';
import { AuthContext } from '../auth/auth-context.js';
import { dashboardGreeting as greeting } from '../../../shared/domain/dashboard-greeting.js';

export function GreetingSettings() {
  const { dashboardGreeting, setPreference, ready, error } = useUiPreferences();
  const { user } = useContext(AuthContext);
  const [draft, setDraft] = useState(dashboardGreeting);
  useEffect(() => setDraft(dashboardGreeting), [dashboardGreeting]);
  return (
    <section className="space-y-4" aria-labelledby="greeting-settings-title">
      <h2 id="greeting-settings-title" className="text-lg font-semibold">
        Dashboard Greeting
      </h2>
      <ValidatedForm
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          setPreference('dashboardGreeting', draft.trim());
        }}
      >
        <label className="field-label block">
          Greeting
          <input
            aria-label="Greeting"
            value={draft}
            maxLength={120}
            required
            disabled={!ready}
            aria-describedby="greeting-hint"
            onChange={(event) => setDraft(event.target.value)}
          />
          <span id="greeting-hint" className="field-hint">
            Use {'{firstName}'} to include your first name. Up to 120 characters.
          </span>
        </label>
        <p className="text-sm text-slate-500">Preview: {greeting(draft, user?.displayName)}</p>
        {error && <p role="alert">{error}</p>}
        <div className="flex justify-end gap-3">
          <button
            type="button"
            className="btn-secondary"
            disabled={!ready}
            onClick={() => {
              setPreference('dashboardGreeting', 'Welcome, {firstName}');
              setDraft('Welcome, {firstName}');
            }}
          >
            Reset Greeting
          </button>
          <button
            className="btn-primary"
            disabled={!ready || !draft.trim() || draft.trim() === dashboardGreeting}
          >
            Save Greeting
          </button>
        </div>
      </ValidatedForm>
    </section>
  );
}
