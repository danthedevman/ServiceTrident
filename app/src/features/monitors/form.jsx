import { CreateButton } from '../../components/create-button.jsx';
import { StaticRecordFields } from '../../components/forms/record-field-layout.jsx';
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
export function MonitorForm({ monitor, onReset, readOnly = false }) {
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
    <MonitorEditor
      monitor={monitor}
      readOnly={readOnly}
      onReset={onReset}
      defaults={preferences.data?.settings}
    />
  );
}

/** Apply defaults once, retaining a user's draft during background updates. */
function MonitorEditor({ monitor, onReset, defaults, readOnly }) {
  const [searchParams] = useSearchParams();
  const serviceState = useResource('/services', 0);
  const probes = useResource(readOnly ? null : '/monitor-probes');
  const [serviceId, setServiceId] = useState(
    monitor?.serviceId ?? searchParams.get('serviceId') ?? '',
  );
  const [componentId, setComponentId] = useState(
    monitor?.componentId || searchParams.get('componentId') || undefined,
  );
  const selectedService = serviceState.data?.services?.find((service) => service.id === serviceId);
  const selectedComponent =
    componentId === undefined
      ? serviceId === monitor?.serviceId
        ? selectedService?.components?.find((row) => row.name === monitor?.component)?.id || ''
        : ''
      : componentId;
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
          confirmationProbeId: form.get('confirmationProbeId') || null,
          keyword: form.get('keywordText')?.trim()
            ? {
                text: form.get('keywordText'),
                condition: form.get('keywordCondition'),
                caseSensitive: form.get('keywordCaseSensitive') === 'true',
              }
            : null,
          serviceId: serviceId || null,
          componentId: serviceId ? selectedComponent || null : null,
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
        <StaticRecordFields readOnly={readOnly}>
          <label className="field-label">
            Monitor name *
            <input
              name="name"
              required
              maxLength={80}
              placeholder="Service health endpoint"
              defaultValue={monitor?.name ?? ''}
              autoFocus={!readOnly}
            />
          </label>
          <ErrorNotice>{serviceState.error}</ErrorNotice>
          <ReferenceField
            referenceType="services"
            label={monitor ? 'Service' : 'Service *'}
            name="serviceId"
            required={!monitor}
            options={(serviceState.data?.services ?? [])
              .filter(
                (service) =>
                  !searchParams.get('componentId') ||
                  (service.componentIds || []).includes(searchParams.get('componentId')),
              )
              .map((service) => ({
                id: service.id,
                label: service.name,
              }))}
            value={serviceId}
            onChange={(value) => {
              setServiceId(value);
              setComponentId(
                searchParams.get('componentId') &&
                  serviceState.data?.services
                    .find((service) => service.id === value)
                    ?.componentIds?.includes(searchParams.get('componentId'))
                  ? searchParams.get('componentId')
                  : '',
              );
            }}
            disabled={serviceState.loading || !!serviceState.error}
          />

          {serviceId && (
            <ReferenceField
              label="Component"
              referenceType="components"
              serviceId={serviceId}
              name="componentId"
              options={(selectedService?.components || []).map((row) => ({
                id: row.id,
                label: row.name,
              }))}
              value={selectedComponent}
              onChange={setComponentId}
              disabled={!selectedService || serviceState.loading}
            />
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
            <Select
              name="method"
              defaultValue={monitor?.method ?? defaults?.defaultMethod ?? 'GET'}
            >
              <option value="HEAD">HEAD — headers only</option>
              <option value="GET">GET — headers and response body</option>
            </Select>
            <span className="field-hint">
              HEAD is a lightweight availability check. Unauthenticated GET checks also save a text
              body preview (up to 16 KiB). Some endpoints do not support HEAD.
            </span>
          </label>
          <label className="field-label">
            Confirmation probe
            <Select
              aria-label="Confirmation probe"
              name="confirmationProbeId"
              defaultValue={monitor?.confirmationProbeId || ''}
            >
              <option value="">Primary location only</option>
              {(probes.data?.probes || [])
                .filter((probe) => probe.enabled)
                .map((probe) => (
                  <option key={probe.id} value={probe.id}>
                    {probe.name} · {probe.region}
                  </option>
                ))}
            </Select>
            <span className="field-hint">
              An independent agent must run on another host. Matching fresh results confirm health;
              disagreement is degraded and missing results remain unknown. Authenticated monitors
              cannot share checks with agents.
            </span>
          </label>
          <fieldset className="space-y-4">
            <legend className="font-semibold">Keyword trigger</legend>
            <label className="field-label">
              Keyword
              <input
                className="input"
                name="keywordText"
                maxLength={200}
                defaultValue={monitor?.keyword?.text ?? ''}
              />
            </label>
            <label className="field-label">
              Trigger when
              <Select
                aria-label="Trigger when"
                name="keywordCondition"
                defaultValue={monitor?.keyword?.condition ?? 'missing'}
              >
                <option value="missing">Keyword is missing</option>
                <option value="contains">Keyword is found</option>
              </Select>
            </label>
            <label className="field-label">
              Case sensitive
              <Toggle
                name="keywordCaseSensitive"
                value="true"
                defaultChecked={monitor?.keyword?.caseSensitive === true}
              />
            </label>
            <p className="field-hint">
              Optional literal text match in the first 16 KiB of an unauthenticated GET response. A
              triggered condition counts as a failed check and follows the existing alert and
              incident policy. Leave Keyword empty to disable. Unreadable or inconclusive bodies
              fail the check.
            </p>
          </fieldset>
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
                Authenticated checks do not follow redirects and require a 2xx response. Use the
                final protected HTTPS endpoint.
              </span>
            ) : (
              <>
                <span className="field-hint">
                  Enable for HTTP-to-HTTPS upgrades, redirects to a www hostname, or moved pages
                  when you want to check the destination too. Up to 3 redirects are allowed; every
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
        </StaticRecordFields>
        {!readOnly && (
          <RecordActions>
            <CancelButton onCancel={onReset} to="/monitors" disabled={busy} />
            <CreateButton className="btn-primary" disabled={busy}>
              {monitor ? 'Save' : 'Create'}
            </CreateButton>
          </RecordActions>
        )}
      </ValidatedForm>
    </FormPage>
  );
}
