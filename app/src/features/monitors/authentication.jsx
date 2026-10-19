import { StaticRecordFields } from '../../components/forms/record-field-layout.jsx';
import React from 'react';
import { Select } from '../../components/forms/select.jsx';
import { MONITOR_AUTH_FIELDS } from '../../../../shared/domain/monitor-auth.js';

export function MonitorAuthentication({ value, onChange, configured }) {
  const change = (key) => (event) => onChange({ ...value, [key]: event.target.value });
  const fields = MONITOR_AUTH_FIELDS[value.mode] || [];
  const labels = {
    username: 'Username',
    password: 'Password',
    token: 'Bearer Token',
    tokenUrl: 'Token Endpoint URL',
    clientId: 'Client ID',
    clientSecret: 'Client Secret',
    scope: 'Scope (optional)',
    audience: 'Audience (optional)',
  };
  return (
    <section className="space-y-4">
      <StaticRecordFields>
        <h2 className="font-semibold">Authentication</h2>
        <label className="field-label block">
          Method
          <Select
            name="authentication.mode"
            aria-label="Authentication Method"
            value={value.mode}
            onChange={change('mode')}
          >
            <option value="none">None</option>
            <option value="basic">Basic Auth</option>
            <option value="bearer">Bearer Token</option>
            <option value="oauth">OAuth Client Credentials</option>
          </Select>
        </label>
        {value.mode !== 'none' && (
          <>
            <p className="text-sm text-slate-500">
              Use a least-privilege account for a public HTTPS API endpoint. Authenticated checks
              require 2xx responses, do not follow redirects, and do not capture response bodies or
              headers. Interactive browser sign-in is not supported.
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              {fields.map((key) =>
                key === 'authMethod' ? (
                  <label key={key} className="field-label block">
                    Client Authentication
                    <Select
                      name="authentication.authMethod"
                      value={value.authMethod || 'client_secret_basic'}
                      onChange={change(key)}
                    >
                      <option value="client_secret_basic">Basic header</option>
                      <option value="client_secret_post">Request body</option>
                    </Select>
                  </label>
                ) : (
                  <label key={key} className="field-label block">
                    {labels[key]}
                    <input
                      name={`authentication.${key}`}
                      type={
                        ['password', 'token', 'clientSecret'].includes(key)
                          ? 'password'
                          : key === 'tokenUrl'
                            ? 'url'
                            : 'text'
                      }
                      value={value[key] || ''}
                      onChange={change(key)}
                      autoComplete={
                        ['password', 'token', 'clientSecret'].includes(key) ? 'new-password' : 'off'
                      }
                      required={
                        !['scope', 'audience'].includes(key) &&
                        (!['password', 'token', 'clientSecret'].includes(key) || !configured)
                      }
                      maxLength={
                        key === 'token'
                          ? 8192
                          : key === 'tokenUrl' || key === 'audience'
                            ? 2048
                            : key === 'scope'
                              ? 2000
                              : key === 'username' || key === 'clientId'
                                ? 200
                                : 1000
                      }
                      placeholder={
                        ['password', 'token', 'clientSecret'].includes(key) && configured
                          ? 'Leave blank to keep the saved secret'
                          : undefined
                      }
                    />
                  </label>
                ),
              )}
            </div>
            <p className="text-xs text-slate-500">
              Secrets are encrypted and never displayed after saving. Choose None and Save to remove
              authentication.
            </p>
          </>
        )}
      </StaticRecordFields>
    </section>
  );
}
