import { IdentityConnections } from './identity-connections.jsx';
import { GreetingSettings } from '../preferences/greeting-settings.jsx';
import { DateTimeSettings } from '../preferences/date-time-settings.jsx';
import { AIFeatureSettings } from '../features/ai/ai.jsx';
import { ThemeSettings } from '../preferences/theme-settings.jsx';
import { PendingPage } from '../components/pending-page.jsx';
import { writeApi } from '../data/query-client.js';

import { AuthContext } from './auth-context.js';

import React, { useContext, useState } from 'react';

import { ValidatedForm } from '../components/forms/validated-form.jsx';

import { ErrorNotice } from '../components/feedback.jsx';

/** Update account details using password confirmation and shared field validation. */
export function PrivateProfileSettings({ member }) {
  const { user, setUser } = useContext(AuthContext);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  async function submit(event, showErrors) {
    const form = event.currentTarget;
    const body = Object.fromEntries(new FormData(form));
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const data = await writeApi('/auth/profile', { method: 'PATCH', body });
      setUser(data.user);
      form.elements.currentPassword.value = '';
      form.elements.newPassword.value = '';
      setMessage('Profile saved. Other sessions have been signed out.');
    } catch (error) {
      setError(error.message);
      showErrors(error.fields);
    } finally {
      setBusy(false);
    }
  }
  if (!user) return <PendingPage pathname="/profile" />;
  return (
    <div className="form-page">
      <IdentityConnections />
      <ThemeSettings />
      <GreetingSettings />
      <DateTimeSettings />
      <AIFeatureSettings />
      <h2 className="text-lg font-semibold">Private Account Settings</h2>
      <p className="text-sm text-slate-500">
        Only you can view these settings. Confirm your password to change your account email or
        password.
      </p>
      <ValidatedForm
        kind="profile"
        onSubmit={submit}
        className="private-profile-settings panel form-body p-6"
      >
        <ErrorNotice>{error}</ErrorNotice>
        {message && (
          <p role="status" className="text-sm text-blue-700 dark:text-blue-300">
            {message}
          </p>
        )}
        <input
          type="hidden"
          name="displayName"
          value={member?.displayName || user.displayName || ''}
        />
        <label className="field-label">
          Email address
          <input
            name="email"
            type="email"
            defaultValue={user.email}
            maxLength={254}
            autoComplete="email"
          />
        </label>
        <label className="field-label">
          Current password
          <input
            name="currentPassword"
            type="password"
            autoComplete="current-password"
            maxLength={128}
          />
          <span className="field-hint">Confirm your password to save changes.</span>
        </label>
        <label className="field-label">
          New password
          <input name="newPassword" type="password" autoComplete="new-password" maxLength={128} />
          <span className="field-hint">
            Optional. Use 12–128 characters; leave blank to keep your password.
          </span>
        </label>
        <div className="form-actions">
          <button className="btn-primary" disabled={busy}>
            {busy ? 'Saving…' : 'Save Profile'}
          </button>
        </div>
      </ValidatedForm>
    </div>
  );
}
