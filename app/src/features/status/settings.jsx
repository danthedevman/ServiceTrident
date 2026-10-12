import { AutoTextarea } from '../../components/forms/auto-textarea.jsx';
import { RecordActions } from '../../components/record-actions.jsx';
import { ConfirmDeleteButton } from '../../components/confirm-delete-button.jsx';
import { Select } from '../../components/forms/select.jsx';
import { Toggle } from '../../components/forms/toggle.jsx';
import { StatusIconUpload } from './icon-upload.jsx';
import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { FormPage } from '../../components/forms/form-page.jsx';
import { ActionMenu } from '../../components/action-menu.jsx';
import { ValidatedForm } from '../../components/forms/validated-form.jsx';
import { ReferenceField } from '../../components/forms/reference-field.jsx';
import { useResource } from '../../data/use-resource.js';
import { writeApi } from '../../data/query-client.js';
import { displayValue } from '../../lib/display-value.js';
import { statusMessage, STATUS_MESSAGE_LEVELS } from '../../../../shared/domain/status-messages.js';
import { StatusMessage } from './message.jsx';

const emptyMessage = () => ({ enabled: false, level: 'info', text: '' });

/** Admin settings retain drafts while background queries refresh. */
export function StatusSettings({ page = false }) {
  const settings = useResource('/status-settings');
  const integrations = useResource(page ? '/integrations' : null);
  const services = useResource(page ? '/services' : null);
  if (!page)
    return (
      <ActionMenu label="Status page actions">
        <Link to="/status/settings">
          Status page settings · {settings.data ? displayValue(settings.data.visibility) : ''}
        </Link>
      </ActionMenu>
    );
  return (
    <FormPage title="Status Page Settings">
      {(settings.error || services.error) && <p role="alert">{settings.error || services.error}</p>}
      {settings.data && services.data ? (
        <StatusEditor
          settings={settings.data}
          services={services.data.services}
          integrations={integrations.data?.integrations ?? []}
        />
      ) : (
        <p role="status" className="sr-only">
          Loading status settings…
        </p>
      )}
    </FormPage>
  );
}

/** Publish explicitly, validating messages before sending the same bounded server payload. */
function StatusEditor({ settings, services, integrations }) {
  const navigate = useNavigate();
  const [subscriptionButtonVisible, setSubscriptionButtonVisible] = useState(
    settings.subscriptionButtonVisible ?? true,
  );
  const [rssSubscriptions, setRssSubscriptions] = useState(settings.rssSubscriptions ?? true);
  const [emailSubscriptions, setEmailSubscriptions] = useState(
    settings.emailSubscriptions ?? false,
  );
  const [subscriptionIntegrationId, setSubscriptionIntegrationId] = useState(
    settings.subscriptionIntegrationId ?? '',
  );
  const [publicOrigin, setPublicOrigin] = useState(settings.publicOrigin ?? '');
  const [statusTheme, setStatusTheme] = useState(settings.statusTheme || 'light');
  const [initial] = useState(settings);
  const [visibility, setVisibility] = useState(settings.visibility);
  const [banner, setBanner] = useState(settings.banner ?? emptyMessage());
  const [messages, setMessages] = useState(() =>
    (settings.serviceMessages ?? []).filter((message) =>
      services.some((service) => service.id === message.serviceId),
    ),
  );
  const [serviceId, setServiceId] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function save(event, reportErrors) {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      const body = {
        visibility,
        statusTheme,
        subscriptionButtonVisible,
        rssSubscriptions,
        emailSubscriptions,
        subscriptionIntegrationId,
        publicOrigin,
        revision: initial.revision,
        banner: statusMessage(banner),
        serviceMessages: messages.map((message) => ({
          serviceId: message.serviceId,
          ...statusMessage(message, `service-${message.serviceId}`),
        })),
      };
      await writeApi('/status-settings', { method: 'PATCH', body });
      navigate('/status');
    } catch (failure) {
      setError(failure.message);
      reportErrors?.(failure.fields);
    } finally {
      setBusy(false);
    }
  }
  return (
    <ValidatedForm kind="status" className="space-y-8" onSubmit={save}>
      {error && (
        <p role="alert" className="text-rose-700 dark:text-rose-400">
          {error}
        </p>
      )}
      <section className="space-y-3">
        <label className="field-label">
          Visibility
          <Select
            name="visibility"
            value={visibility}
            onChange={(event) => setVisibility(event.target.value)}
          >
            <option value="private">Private — signed-in workspace members</option>
            <option value="public">Public — anyone with the link</option>
          </Select>
        </label>
        <p className="text-sm leading-6 text-slate-500 dark:text-slate-400">
          Public pages share service details, dependencies, history, and published messages. Check
          URLs and response details stay private.
        </p>
        {initial.visibility === 'public' && (
          <a
            className="break-all text-sm text-blue-700 underline dark:text-blue-300"
            href={initial.publicPath}
            target="_blank"
            rel="noopener noreferrer"
          >
            View public status page ↗
          </a>
        )}
      </section>
      <section className="space-y-4 border-t border-slate-200 pt-6 dark:border-slate-700">
        <h2 className="font-semibold">Subscriptions</h2>
        <label className="flex items-center gap-3 text-sm">
          <Toggle
            checked={subscriptionButtonVisible}
            onChange={(event) => setSubscriptionButtonVisible(event.target.checked)}
          />
          Show Subscribe to updates button
        </label>
        <p className="text-sm text-slate-500">
          Hiding subscriptions stops new signups, email updates, and RSS access. Unsubscribe links
          still work.
        </p>
        <label className="flex items-center gap-3 text-sm">
          <Toggle
            checked={rssSubscriptions}
            onChange={(event) => setRssSubscriptions(event.target.checked)}
          />
          RSS updates
        </label>

        <p className="text-sm text-slate-500">
          Public pages include an RSS feed. Enable email updates with a configured email
          integration.
        </p>
        <label className="field-label">
          Public origin
          <input
            name="publicOrigin"
            type="url"
            required
            value={publicOrigin}
            onChange={(event) => setPublicOrigin(event.target.value)}
          />
        </label>
        <p className="text-sm text-slate-500">
          The HTTPS origin used in subscription links, such as https://status.example.com.
        </p>
        <label className="flex items-center gap-3 text-sm">
          <Toggle
            checked={emailSubscriptions}
            onChange={(event) => setEmailSubscriptions(event.target.checked)}
          />
          Email updates
        </label>
        {emailSubscriptions && (
          <label className="field-label">
            Email integration
            <Select
              name="subscriptionIntegrationId"
              required={subscriptionButtonVisible}
              value={subscriptionIntegrationId}
              onChange={(event) => setSubscriptionIntegrationId(event.target.value)}
            >
              <option value="">Select an email integration</option>
              {integrations
                .filter((item) => item.type === 'email' && item.enabled && item.smtpConfigured)
                .map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
            </Select>
          </label>
        )}
        <Link className="text-sm text-blue-700 underline dark:text-blue-300" to="/integrations">
          Configure email integrations
        </Link>
      </section>
      <div className="border-t border-slate-200 pt-6 dark:border-slate-700">
        <StatusIconUpload hasIcon={initial.hasStatusIcon} />
      </div>
      <div className="border-t border-slate-200 pt-6 dark:border-slate-700">
        <MessageEditor title="Global Banner" value={banner} onChange={setBanner} />
      </div>
      <section className="space-y-5 border-t border-slate-200 pt-6 dark:border-slate-700">
        <div className="space-y-1">
          <h2 className="font-semibold">Service Messages</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Messages add context without changing measured health.
          </p>
        </div>
        <ReferenceField
          referenceType="services"
          label="Add a Service Message"
          value={serviceId}
          options={services
            .filter((service) => !messages.some((message) => message.serviceId === service.id))
            .map((service) => ({ id: service.id, label: service.name }))}
          onChange={(id) => {
            setServiceId('');
            if (id)
              setMessages((current) => [
                ...current,
                { serviceId: id, ...emptyMessage(), enabled: true },
              ]);
          }}
        />
        {messages.map((message) => (
          <div
            key={message.serviceId}
            className="space-y-4 rounded-xl border border-slate-200 p-4 sm:p-5 dark:border-slate-700"
          >
            <MessageEditor
              title={
                services.find((service) => service.id === message.serviceId)?.name || 'Service'
              }
              value={message}
              onChange={(next) =>
                setMessages((current) =>
                  current.map((item) =>
                    item.serviceId === message.serviceId
                      ? { ...next, serviceId: item.serviceId }
                      : item,
                  ),
                )
              }
            />
            <ConfirmDeleteButton
              confirmation="Remove this service message? Save status settings to apply the change."
              confirmLabel="Remove"
              type="button"
              className="btn-danger text-sm"
              onConfirm={() =>
                setMessages((current) =>
                  current.filter((item) => item.serviceId !== message.serviceId),
                )
              }
            >
              Remove message
            </ConfirmDeleteButton>
          </div>
        ))}
      </section>
      <details className="border-t border-slate-200 pt-6 text-sm dark:border-slate-700">
        <summary className="cursor-pointer font-semibold">Custom domain setup</summary>
        <div className="mt-3 space-y-2 leading-6 text-slate-500 dark:text-slate-400">
          <p>
            Use an HTTPS reverse proxy to serve this public page on your domain. See the README for
            configuration.
          </p>
          <p>
            Public path: <code className="break-all">{initial.publicPath}</code>
          </p>
        </div>
      </details>
      <section className="space-y-3 border-t border-slate-200 pt-6 dark:border-slate-700">
        <label className="field-label block max-w-xs">
          Appearance
          <Select
            aria-label="Status Page Appearance"
            value={statusTheme}
            onChange={(event) => setStatusTheme(event.target.value)}
          >
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </Select>
        </label>
        <p className="text-sm text-slate-500">
          Applies to private and public status pages. Personal theme preferences do not change this
          page.
        </p>
      </section>
      <RecordActions>
        <button
          type="button"
          className="btn-secondary"
          disabled={busy}
          onClick={() => navigate('/status')}
        >
          Cancel
        </button>
        <button className="btn-primary" disabled={busy}>
          {busy ? 'Saving…' : 'Save'}
        </button>
      </RecordActions>
    </ValidatedForm>
  );
}

/** Consistent announcement controls and a live preview; never render administrator HTML. */
function MessageEditor({ title, value, onChange }) {
  return (
    <fieldset className="min-w-0">
      <legend className="mb-4 font-semibold">{title}</legend>
      <div className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2 sm:items-end">
          <label className="flex min-h-12 items-center gap-3 text-sm">
            <Toggle
              checked={value.enabled}
              onChange={(event) => onChange({ ...value, enabled: event.target.checked })}
            />
            Display message
          </label>
          <label className="field-label">
            Criticality
            <Select
              value={value.level}
              onChange={(event) => onChange({ ...value, level: event.target.value })}
            >
              {STATUS_MESSAGE_LEVELS.map((level) => (
                <option key={level} value={level}>
                  {displayValue(level)}
                </option>
              ))}
            </Select>
          </label>
        </div>
        <label className="field-label">
          Message{value.enabled ? ' *' : ''}
          <AutoTextarea
            rows={3}
            maxLength={1000}
            required={value.enabled}
            value={value.text}
            onChange={(event) => onChange({ ...value, text: event.target.value })}
          />
        </label>
        <StatusMessage message={value} compact />
      </div>
    </fieldset>
  );
}
