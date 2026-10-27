import { CreateButton } from '../../components/create-button.jsx';
import { StaticRecordFields } from '../../components/forms/record-field-layout.jsx';
import { writeApi } from '../../data/query-client.js';
import { ValidatedForm } from '../../components/forms/validated-form.jsx';
import { providerFields } from '../../../../shared/integrations/provider-fields.js';
import { notify } from '../../data/toast.js';
import { ConfirmDeleteButton } from '../../components/confirm-delete-button.jsx';
import { Select } from '../../components/forms/select.jsx';
import { Toggle } from '../../components/forms/toggle.jsx';
import { RecordActions } from '../../components/record-actions.jsx';
import { CancelButton } from '../../components/forms/cancel-button.jsx';
import React, { useState } from 'react';
import { FormPage } from '../../components/forms/form-page.jsx';
import { Field, Notice, ServicePills } from '../../components/forms/fields.jsx';
import { useSave } from '../../data/use-save.js';
import { integrationErrors } from '../../../../shared/integrations/integration-validation.js';
import { providers } from '../../../../shared/integrations/providers.js';

const help = {
  sendgrid:
    'Use smtp.sendgrid.net, username apikey, and your SendGrid API key as the SMTP password. Verify the sender in SendGrid.',
  ses: 'Set the SMTP host for your AWS region and use region-specific SES SMTP credentials, not AWS access keys. Verify your sender; sandbox accounts can only send to verified recipients.',
  discord:
    'Paste a Discord channel webhook URL. Messages suppress mentions to avoid unintended pings.',
  pagerduty:
    'Use an Events API v2 routing key. Impact triggers an alert; recovery resolves the matching alert.',
  github:
    'Use https://api.github.com/repos/OWNER/REPO and a fine-grained token with Issues read/write access. Recovery adds a comment; it does not close the issue.',
  jira: 'Use your https://TEAM.atlassian.net root URL, account email and API token, project key and issue type ID. Grant browse, create issue and comment permissions. Recovery adds a comment.',
  webhook:
    'Send labeled JSON to a public HTTPS endpoint. An optional bearer token authenticates delivery. Receivers should deduplicate using the delivery ID.',
  email:
    'Use SMTP credentials from your email provider. Port 465 uses TLS; port 587 requires STARTTLS.',
  slack: 'Create a Slack incoming webhook and paste its hooks.slack.com URL.',
  teams:
    'Create a Teams Workflow with an externally accessible webhook trigger and a channel-post action. Assign a co-owner for continuity.',
  servicenow:
    'Use your instance root URL and Basic Auth or OAuth client credentials with Incident API access. Recovery adds a work note; your ServiceNow workflow controls closure.',
};
/** Configure an adapter through the UI; blank secret fields preserve encrypted credentials. */
export function IntegrationEditor({
  initial,
  services,
  close,
  onSaved,
  onDeleted,
  readOnly = false,
}) {
  const [value, setValue] = useState(initial),
    [errors, setErrors] = useState({}),
    [editSmtp, setEditSmtp] = useState(!initial.smtpConfigured),
    save = useSave();
  const [testing, setTesting] = useState(false),
    [testMessage, setTestMessage] = useState(''),
    [testError, setTestError] = useState('');
  const set = (key, input) => setValue((current) => ({ ...current, [key]: input })),
    fields = { ...errors, ...save.fields };
  const input = (key, label, type = 'text', maxLength = 1000) => (
    <Field key={key} name={key} label={label} errors={fields}>
      <input
        type={type}
        autoComplete={type === 'password' ? 'new-password' : 'off'}
        maxLength={maxLength}
        value={value[key] ?? ''}
        placeholder={
          initial.configured &&
          key !== 'name' &&
          key !== 'recipients' &&
          !(key === 'url' && initial.type === 'servicenow')
            ? 'Saved — leave blank to retain'
            : ''
        }
        onChange={(event) => set(key, event.target.value)}
      />
    </Field>
  );
  return (
    <FormPage title={initial.existing ? 'Configure Integration' : 'New Integration'}>
      <ValidatedForm
        noValidate
        className="form-body"
        onSubmit={(event) => {
          event.preventDefault();
          if (readOnly) return;
          const next = integrationErrors(value, {
            configured:
              initial.configured &&
              (value.type !== 'servicenow' || value.authType === initial.authType),
            smtpConfigured: initial.smtpConfigured,
          });
          setErrors(next);
          if (Object.keys(next).length) {
            notify('Please correct the highlighted fields.', 'error');
            return;
          }
          save.run(`/integrations/${value.id}`, 'PUT', value, () => onSaved(value.id));
        }}
      >
        <StaticRecordFields readOnly={readOnly}>
          <Notice error={save.error} />
          {input('name', 'Name', 'text', 80)}
          <Field name="type" label="Provider" errors={fields}>
            <Select
              disabled={initial.existing}
              value={value.type}
              onChange={(event) =>
                setValue((current) => ({
                  ...current,
                  type: event.target.value,
                  preset: undefined,
                  url:
                    event.target.value === 'pagerduty'
                      ? 'https://events.pagerduty.com/v2/enqueue'
                      : '',
                  token: '',
                  username: '',
                  password: '',
                  projectKey: '',
                  issueTypeId: '',
                  smtpHost: '',
                  smtpUser: '',
                  smtpPassword: '',
                }))
              }
            >
              {providers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </Field>
          <p className="text-sm text-slate-500">{help[value.preset || value.type]}</p>
          {value.type === 'email' ? (
            <>
              {initial.smtpConfigured && (
                <label className="flex items-center gap-2">
                  <Toggle
                    checked={editSmtp}
                    onChange={(event) => {
                      setEditSmtp(event.target.checked);
                      if (!event.target.checked)
                        setValue((current) => ({
                          ...current,
                          smtpHost: '',
                          smtpFrom: '',
                          smtpUser: '',
                          smtpPassword: '',
                        }));
                    }}
                  />
                  Replace saved SMTP settings
                </label>
              )}
              {editSmtp && (
                <>
                  {input('smtpHost', 'SMTP host', 'text', 253)}
                  <Field name="smtpPort" label="Encryption / port" errors={fields}>
                    <Select
                      value={value.smtpPort ?? 587}
                      onChange={(event) => set('smtpPort', Number(event.target.value))}
                    >
                      <option value={587}>STARTTLS — 587</option>
                      <option value={465}>TLS — 465</option>
                    </Select>
                  </Field>
                  {input('smtpFrom', 'Sender email', 'email', 254)}
                  {input('smtpUser', 'SMTP username', 'text', 200)}
                  {input('smtpPassword', 'SMTP password', 'password')}
                </>
              )}
              {input('recipients', 'Fallback recipients (comma-separated)', 'text', 2500)}
              <label className="flex items-center gap-2">
                <Toggle
                  checked={value.onCall}
                  onChange={(event) => set('onCall', event.target.checked)}
                />
                Notify the on-call responder when covered
              </label>
              <label className="flex items-center gap-2">
                <Toggle
                  checked={value.commentNotifications ?? false}
                  onChange={(event) => set('commentNotifications', event.target.checked)}
                />
                Send customer-facing incident comment emails
              </label>
              <Notice error={fields.commentNotifications} />
            </>
          ) : (
            <>
              {input(
                'url',
                ['servicenow', 'jira'].includes(value.type)
                  ? 'Instance Root URL'
                  : value.type === 'github'
                    ? 'Repository API URL'
                    : value.type === 'pagerduty'
                      ? 'Events API URL'
                      : 'Webhook URL',
                value.type === 'servicenow' ? 'url' : 'password',
                4096,
              )}
              {(providerFields[value.type] || []).map((field) =>
                input(field.key, field.label, field.secret ? 'password' : 'text', field.max),
              )}
              {value.type === 'servicenow' && (
                <>
                  <Field name="authType" label="Authentication" errors={fields}>
                    <Select
                      value={value.authType || 'basic'}
                      onChange={(event) => set('authType', event.target.value)}
                    >
                      <option value="basic">Basic Auth</option>
                      <option value="oauth">OAuth · Client Credentials</option>
                    </Select>
                  </Field>
                  {value.authType === 'oauth' ? (
                    <>
                      {input('clientId', 'Client ID', 'text', 512)}
                      {input('clientSecret', 'Client Secret', 'password', 4096)}
                      {input('scope', 'OAuth Scope (optional)', 'text', 1000)}
                      <p className="field-hint">
                        Configure an inbound OAuth client credentials integration in ServiceNow with
                        Incident API permissions. Tokens are obtained from your instance’s
                        /oauth_token.do endpoint.
                      </p>
                    </>
                  ) : (
                    <>
                      {input('username', 'Integration username', 'text', 200)}
                      {input('password', 'Integration password', 'password')}
                    </>
                  )}
                  {initial.existing && (
                    <div className="space-y-3">
                      <button
                        type="button"
                        className="btn-secondary"
                        disabled={testing || save.busy}
                        onClick={async () => {
                          setTesting(true);
                          setTestError('');
                          setTestMessage('');
                          try {
                            const result = await writeApi(`/integrations/${initial.id}/test`, {
                              method: 'POST',
                              body: {},
                            });
                            setTestMessage(result.message);
                          } catch (error) {
                            setTestError(error.message);
                          } finally {
                            setTesting(false);
                          }
                        }}
                      >
                        Test Saved Connection
                      </button>
                      <p className="field-hint">
                        Save any changes before testing. The test checks read access without
                        creating an incident.
                      </p>
                      <Notice error={testError} />
                      {testMessage && (
                        <p role="status" className="text-sm text-emerald-700 dark:text-emerald-300">
                          {testMessage}
                        </p>
                      )}
                    </div>
                  )}
                </>
              )}
            </>
          )}
          <ServicePills
            services={services}
            value={value.serviceIds}
            onChange={(ids) => set('serviceIds', ids)}
          />
          <label className="flex items-center gap-2">
            <Toggle
              checked={value.recovery}
              onChange={(event) => set('recovery', event.target.checked)}
            />
            Notify on recovery
          </label>
          <label className="flex items-center gap-2">
            <Toggle
              disabled={!!initial.demoBatchId}
              checked={value.enabled}
              onChange={(event) => set('enabled', event.target.checked)}
            />
            Enable delivery
          </label>
          <Notice error={fields.enabled} />
        </StaticRecordFields>
        {!readOnly && (
          <RecordActions>
            {initial.existing && (
              <ConfirmDeleteButton
                confirmation="Delete this integration? Future notifications will no longer use it."
                confirmLabel="Remove"
                type="button"
                className="btn-danger"
                disabled={save.busy}
                onConfirm={() =>
                  save.run(
                    `/integrations/${value.id}`,
                    'DELETE',
                    { revision: value.revision },
                    onDeleted,
                  )
                }
              >
                Remove integration
              </ConfirmDeleteButton>
            )}
            <CancelButton onCancel={close} to="/integrations" disabled={save.busy} />
            <CreateButton disabled={save.busy}>{initial.existing ? 'Save' : 'Create'}</CreateButton>
          </RecordActions>
        )}
      </ValidatedForm>
    </FormPage>
  );
}
