import { CreateButton } from '../../components/create-button.jsx';
import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ValidatedForm } from '../../components/forms/validated-form.jsx';
import { Field, Notice } from '../../components/forms/fields.jsx';
import { ReferenceField } from '../../components/forms/reference-field.jsx';
import { Select } from '../../components/forms/select.jsx';
import { useSave } from '../../data/use-save.js';
import { writeApi } from '../../data/query-client.js';
import { useResource } from '../../data/use-resource.js';
const steps = ['Service', 'Monitor', 'Notifications (optional)', 'On Call (optional)', 'Complete'];
const newId = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(12)), (v) =>
    v.toString(16).padStart(2, '0'),
  ).join('');

/** Each explicit save uses native record APIs; completed steps survive only as saved records. */
export function QuickStartPage() {
  const location = useLocation();
  return <SetupWizard key={location.key} />;
}
function SetupWizard() {
  const [step, setStep] = useState(0),
    [service, setService] = useState(null),
    [monitor, setMonitor] = useState(null);
  const [name, setName] = useState(''),
    [url, setUrl] = useState(''),
    [interval, setInterval] = useState('5');
  const [provider, setProvider] = useState('slack'),
    [destination, setDestination] = useState(''),
    [integration, setIntegration] = useState(false);
  const [responder, setResponder] = useState(''),
    [start, setStart] = useState(''),
    [end, setEnd] = useState(''),
    [coverage, setCoverage] = useState(false);
  const [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  const save = useSave();
  const onCall = useResource(step === 3 ? '/on-call' : null);
  const integrations = useResource(step === 2 ? '/integrations' : null);
  const pending = save.busy || busy;
  async function optional(event, report) {
    event.preventDefault();
    if (pending) return;
    setBusy(true);
    setError('');
    try {
      if (step === 2) {
        if (!integrations.data) return;
        await writeApi(`/integrations/${newId()}`, {
          method: 'PUT',
          body: {
            revision: integrations.data.revision,
            name: `${service.name} notifications`.slice(0, 80),
            type: provider,
            url: destination,
            enabled: true,
            recovery: true,
            onCall: false,
            serviceIds: [service.id],
          },
        });
        setDestination('');
        setIntegration(true);
      } else {
        if (!onCall.data) return;
        if (!responder) {
          report({ userId: 'Choose a responder.' });
          return;
        }
        if (!start || !end || new Date(`${end}Z`) <= new Date(`${start}Z`)) {
          report({ end: 'Choose an end after the start.' });
          return;
        }
        await writeApi('/on-call', {
          method: 'PUT',
          body: {
            revision: onCall.data.revision,
            shifts: [
              ...onCall.data.shifts,
              {
                id: newId(),
                userId: responder,
                serviceIds: [service.id],
                start: new Date(`${start}Z`).toISOString(),
                end: new Date(`${end}Z`).toISOString(),
              },
            ],
          },
        });
        setCoverage(true);
      }
      setStep((value) => value + 1);
    } catch (failure) {
      setError(failure.message);
      report(failure.fields || {});
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 p-4 sm:p-6">
      <div>
        <h1 className="text-xl font-semibold">Quick Setup</h1>
        <p className="mt-2 text-sm text-slate-500">
          Create a service and monitor. Notifications and on-call coverage are optional. Each saved
          step creates a record immediately; leaving keeps saved records and discards unfinished
          input.
        </p>
      </div>
      <ol aria-label="Setup progress" className="flex flex-wrap gap-3 text-sm">
        {steps.map((label, index) => (
          <li
            key={label}
            aria-current={index === step ? 'step' : undefined}
            className={
              index === step ? 'font-semibold text-blue-600 dark:text-blue-300' : 'text-slate-500'
            }
          >
            {index + 1}. {label}
          </li>
        ))}
      </ol>
      <section
        className="panel space-y-4 p-5"
        aria-labelledby="setup-step-heading"
        aria-busy={pending}
      >
        <h2 id="setup-step-heading" className="font-semibold">
          {steps[step]}
        </h2>
        <Notice error={save.error || error || integrations.error || onCall.error} />
        {step === 0 && (
          <ValidatedForm
            noValidate
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              save.run('/services', 'POST', { name, description: '' }, (data) => {
                setService(data.item);
                setName('');
                setStep(1);
              });
            }}
          >
            <Field name="name" label="Service Name" errors={save.fields}>
              <input
                name="name"
                required
                maxLength={120}
                autoFocus
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </Field>
            <div className="flex justify-end">
              <CreateButton className="btn-primary" disabled={pending}>
                Create
              </CreateButton>
            </div>
          </ValidatedForm>
        )}
        {step === 1 && (
          <ValidatedForm
            noValidate
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              save.run(
                '/monitors',
                'POST',
                {
                  name: name || service.name,
                  url,
                  intervalMinutes: Number(interval),
                  serviceId: service.id,
                  method: 'GET',
                  followRedirects: false,
                },
                (data) => {
                  setMonitor(data.monitor);
                  setStep(2);
                },
              );
            }}
          >
            <p className="text-sm">Service: {service.name}</p>
            <Field name="name" label="Monitor Name" errors={save.fields}>
              <input
                name="name"
                required
                maxLength={120}
                value={name || service.name}
                onChange={(event) => setName(event.target.value)}
              />
            </Field>
            <Field name="url" label="Endpoint URL" errors={save.fields}>
              <input
                name="url"
                type="url"
                required
                maxLength={2048}
                placeholder="https://example.com/health"
                autoFocus
                value={url}
                onChange={(event) => setUrl(event.target.value)}
              />
            </Field>
            <Field name="intervalMinutes" label="Interval (minutes)" errors={save.fields}>
              <input
                name="intervalMinutes"
                type="number"
                required
                min={1}
                max={1440}
                step={1}
                value={interval}
                onChange={(event) => setInterval(event.target.value)}
              />
            </Field>
            <div className="flex justify-end">
              <CreateButton className="btn-primary" disabled={pending}>
                Create
              </CreateButton>
            </div>
          </ValidatedForm>
        )}
        {step === 2 && (
          <ValidatedForm noValidate className="space-y-4" onSubmit={optional}>
            <p className="text-sm">
              Connect an incoming webhook for this service, or skip and configure another provider
              later in Integrations. This saves an enabled destination; it does not test delivery.
            </p>
            <Field name="type" label="Provider">
              <Select value={provider} onChange={(event) => setProvider(event.target.value)}>
                <option value="slack">Slack</option>
                <option value="teams">Microsoft Teams</option>
                <option value="discord">Discord</option>
              </Select>
            </Field>
            <Field name="url" label="Webhook URL">
              <input
                name="url"
                type="password"
                autoComplete="new-password"
                required
                maxLength={2048}
                value={destination}
                onChange={(event) => setDestination(event.target.value)}
              />
            </Field>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                className="btn-secondary"
                disabled={pending}
                onClick={() => setStep(3)}
              >
                Skip
              </button>
              <button className="btn-primary" disabled={pending || !integrations.data}>
                Save
              </button>
            </div>
          </ValidatedForm>
        )}
        {step === 3 && (
          <ValidatedForm noValidate className="space-y-4" onSubmit={optional}>
            <p className="text-sm">
              Add coverage for {service.name}. Enter times in UTC. Coverage does not enable
              escalation; configure an Escalation Policy separately.
            </p>
            <ReferenceField
              referenceType="members"
              name="userId"
              label="Responder"
              value={responder}
              onChange={setResponder}
              required
            />
            <Field name="start" label="Start (UTC)">
              <input
                name="start"
                type="datetime-local"
                required
                value={start}
                onChange={(event) => setStart(event.target.value)}
              />
            </Field>
            <Field name="end" label="End (UTC)">
              <input
                name="end"
                type="datetime-local"
                required
                value={end}
                onChange={(event) => setEnd(event.target.value)}
              />
            </Field>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                className="btn-secondary"
                disabled={pending}
                onClick={() => setStep(4)}
              >
                Skip
              </button>
              <button className="btn-primary" disabled={pending || !onCall.data}>
                Save
              </button>
            </div>
          </ValidatedForm>
        )}
        {step === 4 && (
          <div className="space-y-4">
            <p>Your service and monitor are saved.</p>
            <ul className="space-y-2">
              <li>
                <Link
                  className="text-blue-600 hover:underline dark:text-blue-300"
                  to={`/services/${service.id}`}
                >
                  {service.name}
                </Link>
              </li>
              <li>
                <Link
                  className="text-blue-600 hover:underline dark:text-blue-300"
                  to={`/monitors/${monitor.id}`}
                >
                  {monitor.name || 'View Monitor'}
                </Link>
              </li>
              <li>Notifications: {integration ? 'Configured' : 'Skipped'}</li>
              <li>On-call coverage: {coverage ? 'Configured' : 'Skipped'}</li>
            </ul>
            <Link className="btn-primary" to="/">
              Go to Dashboard
            </Link>
          </div>
        )}
      </section>
    </div>
  );
}
