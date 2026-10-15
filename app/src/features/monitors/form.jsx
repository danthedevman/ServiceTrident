import {
  monitorIntervalMinutes,
  convertMonitorInterval,
} from '../../../../shared/validation/monitor-interval.js';
import { MonitorAuthentication } from './authentication.jsx';
import { MONITOR_AUTH_FIELDS, monitorAuthErrors } from '../../../../shared/domain/monitor-auth.js';
import { PageTitle } from '../../components/page-title.jsx';
import { FormPage } from '../../components/forms/form-page.jsx';
import { Select } from '../../components/forms/select.jsx';
import { Toggle } from '../../components/forms/toggle.jsx';
import { RecordActions } from '../../components/record-actions.jsx';
import { CancelButton } from '../../components/forms/cancel-button.jsx';
import { ReferenceField } from '../../components/forms/reference-field.jsx';

import { writeApi } from '../../data/query-client.js';
import { useResource } from '../../data/use-resource.js';

import React, { useState, useId } from 'react';

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
  const [authentication, setAuthentication] = useState({
    ...(monitor?.authentication || { mode: 'none' }),
    authMethod: monitor?.authentication?.authMethod || 'client_secret_basic',
  });
  const [followRedirects, setFollowRedirects] = useState(
    (monitor?.followRedirects ?? defaults?.defaultFollowRedirects) === true,
  );
  const initialMinutes = monitor?.intervalMinutes ?? defaults?.defaultIntervalMinutes ?? 5;
  const [intervalUnit, setIntervalUnit] = useState(initialMinutes % 60 === 0 ? 'hours' : 'minutes');
  const [intervalValue, setIntervalValue] = useState(
    String(initialMinutes % 60 === 0 ? initialMinutes / 60 : initialMinutes),
  );
  const intervalId = useId();
  const navigate = useNavigate();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (event, reportErrors) => {
    event.preventDefault();
    setError('');
    const form = new FormData(event.currentTarget);
    const auth = {
      mode: authentication.mode,
      ...Object.fromEntries(
        (MONITOR_AUTH_FIELDS[authentication.mode] || []).map((key) => [
          key,
          authentication[key] || (key === 'authMethod' ? 'client_secret_basic' : ''),
        ]),
      ),
    };
    const authErrors = monitorAuthErrors(auth, {
      url: form.get('url'),
      followRedirects: form.get('followRedirects') === 'true',
      configured: monitor?.authenticationConfigured,
      current: monitor?.authentication,
      previousUrl: monitor?.url,
    });
    if (Object.keys(authErrors).length) {
      setError('Check authentication settings.');
      reportErrors?.(authErrors);
      return;
    }
    setBusy(true);
    try {
      const { monitor: saved } = await writeApi(monitor ? `/monitors/${monitor.id}` : '/monitors', {
        method: monitor ? 'PATCH' : 'POST',
        body: {
          authentication: auth,
          serviceId: serviceId || null,
          component: serviceId ? form.get('component') : '',
          name: form.get('name'),
          url: form.get('url'),
          intervalMinutes: monitorIntervalMinutes(form.get('intervalMinutes'), intervalUnit),
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
            HEAD is a lightweight availability check. Unauthenticated GET checks also save a text
            body preview (up to 16 KiB). Some endpoints do not support HEAD.
          </span>
        </label>
        <label className="field-label">
          Follow redirects
          <Toggle
            name="followRedirects"
            value="true"
            checked={followRedirects && authentication.mode === 'none'}
            disabled={authentication.mode !== 'none'}
            onChange={(event) => setFollowRedirects(event.target.checked)}
            className="mt-2 block"
          />
          {authentication.mode !== 'none' ? (
            <span className="field-hint">
              Authenticated checks do not follow redirects and require a 2xx response. Use the final
              protected HTTPS endpoint.
            </span>
          ) : (
            <>
              <span className="field-hint">
                Enable for HTTP-to-HTTPS upgrades, redirects to a www hostname, or moved pages when
                you want to check the destination too. Up to 3 redirects are allowed; every
                destination must pass public-network validation.
              </span>
              <span className="field-hint">
                When disabled, a 3xx response counts as up for the original URL only. The
                destination is recorded but is not checked.
              </span>
            </>
          )}
        </label>
        <div className="space-y-2">
          <label className="field-label" htmlFor={intervalId}>
            Check every *
          </label>
          <div className="flex flex-wrap items-center gap-3">
            <input
              id={intervalId}
              className="max-w-32"
              name="intervalMinutes"
              type="number"
              min={intervalUnit === 'hours' ? 1 / 60 : 1}
              max={intervalUnit === 'hours' ? 24 : 1440}
              step={intervalUnit === 'hours' ? 'any' : 1}
              value={intervalValue}
              onChange={(event) => setIntervalValue(event.target.value)}
              required
            />
            <div className="w-36">
              <Select
                aria-label="Interval unit"
                name="intervalUnit"
                value={intervalUnit}
                onChange={(event) => {
                  setIntervalValue(
                    convertMonitorInterval(intervalValue, intervalUnit, event.target.value),
                  );
                  setIntervalUnit(event.target.value);
                }}
              >
                <option value="minutes">Minutes</option>
                <option value="hours">Hours</option>
              </Select>
            </div>
          </div>
          <p className="field-hint">
            Use 1 minute to 24 hours, in whole-minute increments. For example, 1.5 hours is 90
            minutes.
          </p>
        </div>
        <div className="rounded-xl bg-blue-50 dark:bg-blue-950 px-4 py-3 text-sm leading-6 text-blue-800 dark:text-blue-300">
          {monitor
            ? 'Changes keep your existing history. Changing the URL or request type resets the current status until the next check. Checks remain at least one minute apart.'
            : 'Your first check will start shortly after creation. Each check records the HTTP result and response time.'}
        </div>
        <MonitorAuthentication
          value={authentication}
          onChange={setAuthentication}
          configured={
            monitor?.authenticationConfigured &&
            authentication.mode === monitor?.authentication?.mode
          }
        />
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
