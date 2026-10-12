import { PageTitle } from '../../components/page-title.jsx';
import { FormPage } from '../../components/forms/form-page.jsx';
import { Select } from '../../components/forms/select.jsx';
import { Toggle } from '../../components/forms/toggle.jsx';
import { RecordActions } from '../../components/record-actions.jsx';
import { CancelButton } from '../../components/forms/cancel-button.jsx';
import { ReferenceField } from '../../components/forms/reference-field.jsx';

import { writeApi } from '../../data/query-client.js';
import { useResource } from '../../data/use-resource.js';

import React, { useState } from 'react';

import { Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom';

import { ValidatedForm } from '../../components/forms/validated-form.jsx';

import { ErrorNotice } from '../../components/feedback.jsx';

/** Load existing settings once; editing must not be overwritten by polling. */
export function EditMonitor() {
  const { id } = useParams();
  return <Navigate replace to={`/monitors/${id}`} />;
}

/** Create or edit validated monitor settings.
 * @param {{monitor?: object}} props
 */
export function MonitorForm({ monitor, onReset }) {
  const preferences = useResource(monitor ? null : '/settings/workspace');
  if (!monitor && !preferences.data)
    return (
      <div className="form-page">
        <PageTitle>Create Monitor</PageTitle>
        <ErrorNotice>{preferences.error}</ErrorNotice>
        {!preferences.error && (
          <p role="status" className="sr-only">
            Loading monitor defaults…
          </p>
        )}
      </div>
    );
  return (
    <MonitorEditor monitor={monitor} onReset={onReset} defaults={preferences.data?.settings} />
  );
}

/** Apply defaults once, retaining a user's draft during background updates. */
function MonitorEditor({ monitor, onReset, defaults }) {
  const [searchParams] = useSearchParams();
  const serviceState = useResource('/services', 0);
  const [serviceId, setServiceId] = useState(
    monitor?.serviceId ?? searchParams.get('serviceId') ?? '',
  );
  const navigate = useNavigate();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (event, reportErrors) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    const form = new FormData(event.currentTarget);
    try {
      const { monitor: saved } = await writeApi(monitor ? `/monitors/${monitor.id}` : '/monitors', {
        method: monitor ? 'PATCH' : 'POST',
        body: {
          serviceId: serviceId || null,
          component: serviceId ? form.get('component') : '',
          name: form.get('name'),
          url: form.get('url'),
          intervalMinutes: Number(form.get('intervalMinutes')),
          method: form.get('method'),
          followRedirects: form.get('followRedirects') === 'true',
        },
      });
      if (onReset) onReset();
      else navigate(`/monitors/${saved.id}`, { state: { createdRecord: !monitor } });
    } catch (error) {
      setError(error.message);
      reportErrors?.(error.fields);
    } finally {
      setBusy(false);
    }
  };
  return (
    <FormPage title={monitor ? 'Monitor' : 'Create Monitor'}>
      <ValidatedForm
        kind={monitor ? 'monitor' : 'monitor-create'}
        onSubmit={submit}
        className="form-body"
      >
        <ErrorNotice>{error}</ErrorNotice>
        <label className="field-label">
          Monitor name *
          <input
            name="name"
            required
            maxLength={80}
            placeholder="Service health endpoint"
            defaultValue={monitor?.name ?? ''}
            autoFocus
          />
        </label>
        <ErrorNotice>{serviceState.error}</ErrorNotice>
        <ReferenceField
          referenceType="services"
          label={monitor ? 'Service' : 'Service *'}
          name="serviceId"
          required={!monitor}
          options={(serviceState.data?.services ?? []).map((service) => ({
            id: service.id,
            label: service.name,
          }))}
          value={serviceId}
          onChange={setServiceId}
          disabled={serviceState.loading || !!serviceState.error}
        />

        {serviceId && (
          <label className="field-label">
            Component / subservice
            <input
              name="component"
              maxLength={80}
              defaultValue={monitor?.component ?? ''}
              placeholder="API, Checkout, or Frontend"
            />
            <span className="field-hint">
              Optional. Monitors with the same component name are grouped together.
            </span>
          </label>
        )}
        <label className="field-label">
          Endpoint URL *
          <input
            name="url"
            type="url"
            required
            maxLength={2048}
            placeholder="https://example.com"
            defaultValue={monitor?.url ?? ''}
          />
          <span className="field-hint">
            Public HTTP or HTTPS endpoints on their standard ports.
          </span>
        </label>
        <label className="field-label">
          Request type
          <Select name="method" defaultValue={monitor?.method ?? defaults?.defaultMethod ?? 'GET'}>
            <option value="HEAD">HEAD — headers only</option>
            <option value="GET">GET — headers and response body</option>
          </Select>
          <span className="field-hint">
            HEAD is a lightweight availability check. GET also saves a text body preview (up to 16
            KiB). Some endpoints do not support HEAD.
          </span>
        </label>
        <label className="field-label">
          Follow redirects
          <Toggle
            name="followRedirects"
            value="true"
            defaultChecked={(monitor?.followRedirects ?? defaults?.defaultFollowRedirects) === true}
            className="mt-2 block"
          />
          <span className="field-hint">
            Enable for HTTP-to-HTTPS upgrades, redirects to a www hostname, or moved pages when you
            want to check the destination too. Up to 3 redirects are allowed; every destination must
            pass public-network validation.
          </span>
          <span className="field-hint">
            When disabled, a 3xx response counts as up for the original URL only. The destination is
            recorded but is not checked.
          </span>
        </label>
        <label className="field-label">
          Check every *
          <div className="flex items-center gap-3">
            <input
              className="max-w-32"
              name="intervalMinutes"
              type="number"
              min="1"
              max="1440"
              step="1"
              defaultValue={monitor?.intervalMinutes ?? defaults?.defaultIntervalMinutes ?? 5}
              required
            />
            <span className="text-sm font-normal text-slate-500 dark:text-slate-400">minutes</span>
          </div>
          <span className="field-hint">Minimum 1 minute. Maximum 1 day (1,440 minutes).</span>
        </label>
        <div className="rounded-xl bg-blue-50 dark:bg-blue-950 px-4 py-3 text-sm leading-6 text-blue-800 dark:text-blue-300">
          {monitor
            ? 'Changes keep your existing history. Changing the URL or request type resets the current status until the next check. Checks remain at least one minute apart.'
            : 'Your first check will start shortly after creation. Each check records the HTTP result and response time.'}
        </div>
        <RecordActions>
          <CancelButton onCancel={onReset} to="/monitors" disabled={busy} />
          <button className="btn-primary" disabled={busy}>
            {busy ? 'Saving…' : monitor ? 'Save' : 'Create Monitor'}
          </button>
        </RecordActions>
      </ValidatedForm>
    </FormPage>
  );
}
