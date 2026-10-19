import { PageTitleRow } from '../../components/page-title.jsx';
import React, { useId, useState } from 'react';
import { useResource } from '../../data/use-resource.js';
import { writeApi } from '../../data/query-client.js';
import { ValidatedForm } from '../../components/forms/validated-form.jsx';
import { Select } from '../../components/forms/select.jsx';
import { Toggle } from '../../components/forms/toggle.jsx';
import { ReferenceField } from '../../components/forms/reference-field.jsx';
import { ConfirmDeleteButton } from '../../components/confirm-delete-button.jsx';
import { ErrorNotice } from '../../components/feedback.jsx';
import { DateTime } from '../../preferences/date-time.jsx';
import { notify } from '../../data/toast.js';
const titles = {
  eventRules: 'Event Rules',
  escalationPolicies: 'Escalation Policies',
  maintenanceWindows: 'Maintenance Windows',
};
const newId = () =>
  [...crypto.getRandomValues(new Uint8Array(12))]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
const condition = () => ({ field: 'sourceType', operator: 'equals', value: 'external' });
const step = (afterMinutes = 0) => ({
  afterMinutes,
  target: 'on_call',
  userId: null,
  integrationIds: [],
});
const initial = (kind) => ({
  id: newId(),
  name: '',
  enabled: false,
  ...(kind === 'eventRules'
    ? {
        match: 'all',
        conditions: [condition()],
        actions: { suppress: false, createIncident: false },
      }
    : {
        serviceIds: [],
        ...(kind === 'escalationPolicies'
          ? { steps: [step(), step(5)] }
          : {
              startsAt: new Date().toISOString(),
              endsAt: new Date(Date.now() + 3600000).toISOString(),
              reason: '',
            }),
      }),
});
export function AutomationSettings({ kind }) {
  const formId = useId();
  const state = useResource('/operational-automation');
  const [draft, setDraft] = useState(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState(null),
    [sample, setSample] = useState(
      JSON.stringify(
        {
          externalId: 'preview-1',
          correlationKey: 'api-errors',
          title: 'API error rate exceeded',
          severity: 'high',
          signal: 'firing',
          payload: { errorRate: 12 },
        },
        null,
        2,
      ),
    );
  const change = (patch) => {
    setDraft((value) => ({ ...value, ...patch }));
    setPreview(null);
  };
  const changeAction = (patch) => change({ actions: { ...draft.actions, ...patch } });
  async function save(event, report) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await writeApi(`/operational-automation/${kind}/${draft.id}`, {
        method: 'PUT',
        body: {
          revision: state.data.revision,
          configuration: draft,
          previewToken: preview?.previewToken,
        },
      });
      setDraft(null);
      await state.refresh();
      notify('Settings saved.');
    } catch (failure) {
      setError(failure.message);
      report?.(failure.fields);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="space-y-5">
      <PageTitleRow
        title={titles[kind]}
        actions={
          draft ? (
            <>
              <button
                type="button"
                form={formId}
                className="btn-secondary"
                disabled={busy}
                onClick={() => setDraft(null)}
              >
                Cancel
              </button>
              <button
                type="submit"
                form={formId}
                className="btn-primary"
                disabled={busy || (kind === 'eventRules' && draft.enabled && !preview)}
              >
                Save
              </button>
            </>
          ) : (
            <button
              type="button"
              className="btn-primary"
              disabled={busy || !state.data}
              onClick={() => {
                setDraft(initial(kind));
                setError('');
                setPreview(null);
              }}
            >
              Create
            </button>
          )
        }
      />
      <ErrorNotice>{state.error || error}</ErrorNotice>
      {!draft ? (
        <ul className="space-y-3">
          {(state.data?.[kind] || []).map((item) => (
            <li
              key={item.id}
              className="panel flex flex-wrap items-center justify-between gap-3 p-4"
            >
              <div className="min-w-0">
                <strong className="break-words">{item.name}</strong>
                <p className="text-sm text-slate-500">
                  {item.enabled ? 'Enabled' : 'Disabled'}
                  {kind === 'maintenanceWindows' && (
                    <>
                      {' '}
                      · <DateTime value={item.startsAt} /> — <DateTime value={item.endsAt} />
                    </>
                  )}
                </p>
              </div>
              <div className="flex gap-3">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => {
                    setDraft(
                      Object.fromEntries(
                        Object.entries(structuredClone(item)).filter(([key]) =>
                          [
                            'id',
                            'name',
                            'enabled',
                            'match',
                            'conditions',
                            'actions',
                            'serviceIds',
                            'steps',
                            'startsAt',
                            'endsAt',
                            'reason',
                          ].includes(key),
                        ),
                      ),
                    );
                    setPreview(null);
                  }}
                >
                  Edit
                </button>
                <ConfirmDeleteButton
                  className="btn-secondary"
                  onConfirm={async () => {
                    await writeApi(`/operational-automation/${kind}/${item.id}`, {
                      method: 'DELETE',
                      body: { revision: state.data.revision },
                    });
                    await state.refresh();
                  }}
                >
                  Delete
                </ConfirmDeleteButton>
              </div>
            </li>
          ))}
          {state.data && !state.data[kind]?.length && (
            <li className="panel p-5 text-sm">No configurations yet.</li>
          )}
        </ul>
      ) : (
        <ValidatedForm
          id={formId}
          kind="automation"
          onSubmit={save}
          className="panel space-y-5 p-5"
        >
          <label className="field-label">
            Name
            <input
              name="name"
              required
              maxLength={80}
              value={draft.name}
              onChange={(event) => change({ name: event.target.value })}
            />
          </label>
          <label className="flex items-center gap-3">
            <Toggle
              checked={draft.enabled}
              onChange={(event) => setDraft({ ...draft, enabled: event.target.checked })}
            />
            Enabled
          </label>
          {kind === 'eventRules' ? (
            <>
              <label className="field-label">
                Match
                <Select
                  aria-label="Match conditions"
                  value={draft.match}
                  onChange={(event) => change({ match: event.target.value })}
                >
                  <option value="all">All conditions</option>
                  <option value="any">Any condition</option>
                </Select>
              </label>
              <fieldset className="space-y-3">
                <legend className="mb-2 font-semibold">Conditions</legend>
                {draft.conditions.map((item, index) => (
                  <div
                    key={index}
                    className="grid gap-3 rounded-lg border border-slate-300 p-3 dark:border-slate-700 sm:grid-cols-3"
                  >
                    <label className="field-label">
                      Field
                      <input
                        aria-label={`Condition ${index + 1} field`}
                        value={item.field}
                        maxLength={100}
                        onChange={(event) =>
                          change({
                            conditions: draft.conditions.map((row, i) =>
                              i === index ? { ...row, field: event.target.value } : row,
                            ),
                          })
                        }
                      />
                    </label>
                    <label className="field-label">
                      Operator
                      <Select
                        aria-label={`Condition ${index + 1} operator`}
                        value={item.operator}
                        onChange={(event) =>
                          change({
                            conditions: draft.conditions.map((row, i) =>
                              i === index ? { ...row, operator: event.target.value } : row,
                            ),
                          })
                        }
                      >
                        {['equals', 'contains', 'greater_than', 'less_than', 'exists'].map((op) => (
                          <option key={op} value={op}>
                            {op.replaceAll('_', ' ')}
                          </option>
                        ))}
                      </Select>
                    </label>
                    {item.operator !== 'exists' && (
                      <label className="field-label">
                        Value
                        <input
                          aria-label={`Condition ${index + 1} value`}
                          value={item.value}
                          maxLength={200}
                          onChange={(event) =>
                            change({
                              conditions: draft.conditions.map((row, i) =>
                                i === index ? { ...row, value: event.target.value } : row,
                              ),
                            })
                          }
                        />
                      </label>
                    )}
                    {draft.conditions.length > 1 && (
                      <button
                        type="button"
                        className="text-sm"
                        onClick={() =>
                          change({ conditions: draft.conditions.filter((_, i) => i !== index) })
                        }
                      >
                        Remove condition
                      </button>
                    )}
                  </div>
                ))}
                <button
                  type="button"
                  className="btn-secondary"
                  disabled={draft.conditions.length >= 10}
                  onClick={() => change({ conditions: [...draft.conditions, condition()] })}
                >
                  Add condition
                </button>
              </fieldset>
              <p className="text-sm text-slate-500">
                Match event fields such as sourceType, severity, title, statusCode, or
                payload.errorRate. Rules run in the displayed order; later matching rules replace
                routing values. Suppression takes precedence.
              </p>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="field-label">
                  Severity
                  <Select
                    aria-label="Rule severity"
                    value={draft.actions.severity || ''}
                    onChange={(event) => changeAction({ severity: event.target.value })}
                  >
                    <option value="">Keep received severity</option>
                    {['critical', 'high', 'medium', 'low', 'info'].map((value) => (
                      <option key={value}>{value}</option>
                    ))}
                  </Select>
                </label>
                <ReferenceField
                  label="Route to service"
                  referenceType="services"
                  value={draft.actions.serviceId || ''}
                  onChange={(serviceId) => changeAction({ serviceId })}
                />
                <ReferenceField
                  label="Assignment group"
                  referenceType="groups"
                  value={draft.actions.assignmentGroupId || ''}
                  onChange={(assignmentGroupId) => changeAction({ assignmentGroupId })}
                />
                <label className="field-label">
                  Escalation policy
                  <Select
                    aria-label="Rule escalation policy"
                    value={draft.actions.escalationPolicyId || ''}
                    onChange={(event) => changeAction({ escalationPolicyId: event.target.value })}
                  >
                    <option value="">Service default</option>
                    {(state.data.escalationPolicies || [])
                      .filter((row) => row.enabled)
                      .map((row) => (
                        <option key={row.id} value={row.id}>
                          {row.name}
                        </option>
                      ))}
                  </Select>
                </label>
              </div>
              <label className="flex items-center gap-3">
                <Toggle
                  checked={draft.actions.suppress}
                  onChange={(event) =>
                    changeAction({
                      suppress: event.target.checked,
                      ...(event.target.checked ? { createIncident: false } : {}),
                    })
                  }
                />
                Suppress notifications and incident actions
              </label>
              <label className="flex items-center gap-3">
                <Toggle
                  checked={draft.actions.createIncident}
                  disabled={draft.actions.suppress}
                  onChange={(event) => changeAction({ createIncident: event.target.checked })}
                />
                Create an incident for firing alerts
              </label>
              <label className="field-label">
                Preview event
                <textarea
                  name="previewEvent"
                  rows={6}
                  value={sample}
                  maxLength={32768}
                  onChange={(event) => {
                    setSample(event.target.value);
                    setPreview(null);
                  }}
                />
              </label>
              <button
                type="button"
                className="btn-secondary"
                disabled={busy}
                onClick={async () => {
                  setError('');
                  try {
                    const value = await writeApi('/operational-automation/preview', {
                      method: 'POST',
                      body: { rule: draft, event: JSON.parse(sample) },
                    });
                    setPreview(value);
                  } catch (failure) {
                    setError(failure.message);
                  }
                }}
              >
                Preview rule
              </button>
              {preview && (
                <div role="status" className="space-y-2 text-sm">
                  <strong>
                    {preview.matched
                      ? 'Rule matches this event.'
                      : 'Rule does not match this event.'}
                  </strong>
                  {preview.matched && (
                    <pre className="whitespace-pre-wrap break-words">
                      {JSON.stringify(preview.actions, null, 2)}
                    </pre>
                  )}
                  <p>Preview permits enabling this exact rule for 10 minutes.</p>
                </div>
              )}
            </>
          ) : (
            <>
              <ReferenceField
                label="Services (empty means all)"
                referenceType="services"
                multiple
                value={draft.serviceIds}
                onChange={(serviceIds) => change({ serviceIds })}
              />
              {kind === 'maintenanceWindows' ? (
                <>
                  <label className="field-label">
                    Starts at
                    <input
                      name="startsAt"
                      required
                      type="datetime-local"
                      value={draft.startsAt.slice(0, 16)}
                      onChange={(event) =>
                        change({
                          startsAt: event.target.value ? `${event.target.value}:00.000Z` : '',
                        })
                      }
                    />
                  </label>
                  <label className="field-label">
                    Ends at
                    <input
                      name="endsAt"
                      required
                      type="datetime-local"
                      value={draft.endsAt.slice(0, 16)}
                      onChange={(event) =>
                        change({
                          endsAt: event.target.value ? `${event.target.value}:00.000Z` : '',
                        })
                      }
                    />
                  </label>
                  <p className="text-sm text-slate-500">
                    Window times are entered in UTC. Saved times display using your profile
                    preferences. Events are retained; notifications are suppressed until the end.
                  </p>
                  <label className="field-label">
                    Reason
                    <textarea
                      name="reason"
                      value={draft.reason}
                      maxLength={500}
                      onChange={(event) => change({ reason: event.target.value })}
                    />
                  </label>
                </>
              ) : (
                <fieldset className="space-y-4">
                  <legend className="font-semibold">Escalation steps</legend>
                  {draft.steps.map((item, index) => (
                    <div
                      key={index}
                      className="space-y-3 rounded-lg border border-slate-300 p-4 dark:border-slate-700"
                    >
                      <label className="field-label">
                        After minutes
                        <input
                          name={`delay${index}`}
                          type="number"
                          min={0}
                          max={1440}
                          required
                          value={item.afterMinutes}
                          onChange={(event) =>
                            change({
                              steps: draft.steps.map((row, i) =>
                                i === index
                                  ? { ...row, afterMinutes: Number(event.target.value) }
                                  : row,
                              ),
                            })
                          }
                        />
                      </label>
                      <label className="field-label">
                        Responder
                        <Select
                          aria-label={`Step ${index + 1} responder`}
                          value={item.target}
                          onChange={(event) =>
                            change({
                              steps: draft.steps.map((row, i) =>
                                i === index ? { ...row, target: event.target.value } : row,
                              ),
                            })
                          }
                        >
                          <option value="on_call">Current on-call responder</option>
                          <option value="user">Specific responder</option>
                        </Select>
                      </label>
                      {item.target === 'user' && (
                        <ReferenceField
                          label={`Step ${index + 1} user`}
                          referenceType="members"
                          value={item.userId || ''}
                          onChange={(userId) =>
                            change({
                              steps: draft.steps.map((row, i) =>
                                i === index ? { ...row, userId } : row,
                              ),
                            })
                          }
                        />
                      )}
                      <ReferenceField
                        referenceType="notificationIntegrations"
                        name={`steps.${index}.integrationIds`}
                        label="Notification integrations"
                        multiple
                        required
                        value={item.integrationIds}
                        onChange={(integrationIds) =>
                          change({
                            steps: draft.steps.map((row, i) =>
                              i === index ? { ...row, integrationIds } : row,
                            ),
                          })
                        }
                      />
                      {index > 0 && (
                        <button
                          type="button"
                          className="text-sm"
                          onClick={() =>
                            change({ steps: draft.steps.filter((_, i) => i !== index) })
                          }
                        >
                          Remove step
                        </button>
                      )}
                    </div>
                  ))}
                  <button
                    type="button"
                    className="btn-secondary"
                    disabled={draft.steps.length >= 5}
                    onClick={() =>
                      change({
                        steps: [
                          ...draft.steps,
                          step(Math.min(1440, draft.steps.at(-1).afterMinutes + 5)),
                        ],
                      })
                    }
                  >
                    Add step
                  </button>
                </fieldset>
              )}
            </>
          )}
        </ValidatedForm>
      )}
    </section>
  );
}
export function ProbeSettings() {
  const formId = useId();
  const state = useResource('/monitor-probes');
  const [token, setToken] = useState(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  return (
    <section className="space-y-5">
      <PageTitleRow
        title="Probe Agents"
        actions={
          <button
            type="submit"
            form={formId}
            className="btn-primary"
            disabled={busy || !state.data}
          >
            Create
          </button>
        }
      />
      <p className="text-sm">
        Run an agent on another host or region, then select it as a monitor’s Confirmation probe.
        Credentials expire after 90 days. Revoke and create a replacement to rotate them.
      </p>
      <ErrorNotice>{state.error || error}</ErrorNotice>
      {token && (
        <div className="panel space-y-3 p-4">
          <p>Copy this credential now. It is shown once and is not saved in your browser.</p>
          <code className="block break-all select-all">{token}</code>
          <button className="btn-secondary" onClick={() => setToken(null)}>
            Dismiss credential
          </button>
        </div>
      )}
      <ValidatedForm
        id={formId}
        kind="probe"
        className="panel space-y-4 p-5"
        onSubmit={async (event, report) => {
          event.preventDefault();
          if (busy || !state.data) return;
          const form = new FormData(event.currentTarget);
          setBusy(true);
          setError('');
          try {
            const result = await writeApi('/monitor-probes', {
              method: 'POST',
              body: {
                name: form.get('name'),
                region: form.get('region'),
                revision: state.data.revision,
              },
            });
            setToken(result.token);
            await state.refresh();
          } catch (failure) {
            setError(failure.message);
            report?.(failure.fields);
          } finally {
            setBusy(false);
          }
        }}
      >
        <label className="field-label">
          Name
          <input name="name" required maxLength={80} />
        </label>
        <label className="field-label">
          Region
          <input name="region" required maxLength={80} />
        </label>
      </ValidatedForm>
      <ul className="space-y-3">
        {(state.data?.probes || []).map((probe) => (
          <li key={probe.id} className="panel space-y-2 p-4">
            <strong>{probe.name}</strong>
            <p className="text-sm">
              {probe.region} · Expires <DateTime value={probe.expiresAt} />
            </p>
            <p className="text-sm break-all">Agent ID: {probe.id}</p>
            <ConfirmDeleteButton
              className="btn-secondary"
              confirmation="Revoke this agent? Monitors using it will await confirmation until another probe is selected."
              onConfirm={async () => {
                await writeApi(`/monitor-probes/${probe.id}`, {
                  method: 'DELETE',
                  body: { revision: state.data.revision },
                });
                await state.refresh();
              }}
            >
              Revoke
            </ConfirmDeleteButton>
          </li>
        ))}
      </ul>
    </section>
  );
}
