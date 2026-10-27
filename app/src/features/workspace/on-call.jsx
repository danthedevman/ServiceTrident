import { CreateButton } from '../../components/create-button.jsx';
import {
  StaticRecordFields,
  RecordFieldEditing,
} from '../../components/forms/record-field-layout.jsx';
import { onCallLabel } from '../../lib/on-call-label.js';
import { useRecordTabLabel } from '../../components/record-navigation.jsx';
import { ValidatedForm } from '../../components/forms/validated-form.jsx';
import { PageTitle } from '../../components/page-title.jsx';
import { RecordHeader } from '../../components/record-actions.jsx';
import { ConfirmDeleteButton } from '../../components/confirm-delete-button.jsx';
import { Toggle } from '../../components/forms/toggle.jsx';
import { RecordWorkspace, RecordMetadata } from '../../components/record-workspace.jsx';
import { FormPage } from '../../components/forms/form-page.jsx';
import { useNavigate, useParams } from 'react-router-dom';
import { ReferenceField } from '../../components/forms/reference-field.jsx';
import { Modal } from '../../components/modal.jsx';
import React, { useContext, useId, useState } from 'react';
import { ChevronLeftIcon, ChevronRightIcon, PlusIcon } from '@heroicons/react/24/outline';
import { AuthContext } from '../../auth/auth-context.js';
import { useResource } from '../../data/use-resource.js';
import { DataTable } from '../../components/data-table.jsx';
import { Field, Notice, ServicePills } from '../../components/forms/fields.jsx';
import { newId } from '../../lib/identifiers.js';
import { useSave } from '../../data/use-save.js';
import { coverageTimeInput as utcInput } from '../../lib/coverage-time.js';

/** A month calendar with actual saved coverage, service filtering, and editable shifts. */
export function OnCallPage({ form = false }) {
  const { id } = useParams();
  const [formVersion, setFormVersion] = useState(0);
  const { user } = useContext(AuthContext),
    schedule = useResource('/on-call', 30000),
    members = useResource('/members'),
    services = useResource('/services');
  return (
    <div className="space-y-6">
      {!form && !id && <PageTitle>On Call</PageTitle>}
      <Notice error={schedule.error || members.error || services.error} />
      {schedule.data && members.data && services.data ? (
        <Calendar
          key={`${id || (form ? 'new' : 'calendar')}-${formVersion}`}
          onReset={() => setFormVersion((value) => value + 1)}
          form={form}
          id={id}
          schedule={schedule.data}
          members={members.data.members}
          services={services.data.services}
          admin={user?.role === 'admin'}
        />
      ) : (
        <p role="status" className="sr-only">
          Loading coverage…
        </p>
      )}
    </div>
  );
}
/** Generate concrete shifts from an ordered rotation; the API rejects overlapping coverage atomically. */
function Calendar({ schedule, members, services, admin, form, id, onReset }) {
  const navigate = useNavigate(),
    formId = useId();
  const [quickDate, setQuickDate] = useState(null);
  const [viewedShift, setViewedShift] = useState(null);
  const existing = schedule.shifts.find((shift) => shift.id === id);
  const coverageTitle = existing ? onCallLabel(existing, members, services) : undefined;
  useRecordTabLabel(coverageTitle);
  const [month, setMonth] = useState(
      () => new Date(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1),
    ),
    [serviceId, setService] = useState(''),
    [editor, setEditor] = useState(() =>
      form
        ? existing
          ? {
              ...existing,
              start: utcInput(existing.start),
              end: utcInput(existing.end),
              revision: schedule.revision,
            }
          : {
              id: newId(),
              userId: members.find((member) => !member.disabled)?.id ?? '',
              serviceIds: [],
              start: utcInput(Date.now()),
              end: utcInput(Date.now() + 86400000),
              revision: schedule.revision,
            }
        : null,
    ),
    [rotation, setRotation] = useState(false),
    [participants, setParticipants] = useState([]),
    [days, setDays] = useState(7),
    [count, setCount] = useState(4),
    [error, setError] = useState('');
  const save = useSave();
  const start = new Date(Date.UTC(month.getFullYear(), month.getMonth(), 1)),
    offset = (start.getUTCDay() + 6) % 7;
  const cells = Array.from({ length: 42 }, (_, i) => new Date(+start + (i - offset) * 86400000));
  const filtered = schedule.shifts.filter(
    (s) => !serviceId || !s.serviceIds.length || s.serviceIds.includes(serviceId),
  );
  const name = (id) => {
    const m = members.find((m) => m.id === id);
    return m
      ? `${m.displayName || m.email}${m.disabled ? ' (disabled)' : ''}`
      : 'Unavailable teammate';
  };
  const active = members.filter((m) => !m.disabled);
  const edit = (shift) => setViewedShift(shift);
  const editViewed = () => {
    setQuickDate(viewedShift.start.slice(0, 10));
    setEditor({
      ...viewedShift,
      start: utcInput(viewedShift.start),
      end: utcInput(viewedShift.end),
      revision: schedule.revision,
    });
    setRotation(false);
    setError('');
    setViewedShift(null);
  };
  const fresh = (day = new Date()) => {
    const start = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate()));
    setRotation(false);
    setError('');
    setQuickDate(start.toISOString().slice(0, 10));
    setEditor({
      id: newId(),
      userId: active[0]?.id ?? '',
      serviceIds: serviceId ? [serviceId] : [],
      start: utcInput(start),
      end: utcInput(+start + 86400000),
      revision: schedule.revision,
    });
  };
  const closeEditor = () => {
    if (quickDate) {
      setQuickDate(null);
      setEditor(null);
    } else if (id) {
      setEditor(null);
      if (form) navigate(`/on-call/${id}`, { replace: true });
    } else navigate('/on-call');
  };
  const apply = (shifts, selectedId = editor?.id) =>
    save.run('/on-call', 'PUT', { revision: editor?.revision ?? schedule.revision, shifts }, () => {
      if (quickDate) {
        setQuickDate(null);
        setEditor(null);
      } else {
        onReset();
        navigate(
          shifts.some((shift) => shift.id === selectedId) ? `/on-call/${selectedId}` : '/on-call',
          !id && form ? { state: { createdRecord: true } } : undefined,
        );
      }
    });
  const submit = (e) => {
    e.preventDefault();
    setError('');
    const first = new Date(`${editor.start}Z`),
      last = new Date(`${editor.end}Z`);
    if (!Number.isFinite(+first) || (!rotation && !Number.isFinite(+last))) {
      setError('Enter a valid UTC start and end.');
      return;
    }
    let added;
    if (rotation) {
      if (
        !participants.length ||
        !Number.isInteger(days) ||
        days < 1 ||
        days > 30 ||
        !Number.isInteger(count) ||
        count < 1 ||
        count > 100 ||
        days * count > 366
      ) {
        setError(
          'Choose responders in order, 1–30 days per shift, and 1–100 shifts within one year.',
        );
        return;
      }
      added = Array.from({ length: count }, (_, i) => ({
        id: newId(),
        userId: participants[i % participants.length],
        serviceIds: editor.serviceIds,
        start: new Date(+first + i * days * 86400000).toISOString(),
        end: new Date(+first + (i + 1) * days * 86400000).toISOString(),
      }));
    } else
      added = [
        {
          id: editor.id,
          userId: editor.userId,
          serviceIds: editor.serviceIds,
          start: first.toISOString(),
          end: last.toISOString(),
        },
      ];
    apply(
      [...schedule.shifts.filter((s) => rotation || s.id !== editor.id), ...added],
      added[0].id,
    );
  };
  if (id && !editor)
    return existing ? (
      <RecordWorkspace
        onEdit={
          admin
            ? () =>
                setEditor({
                  ...existing,
                  start: utcInput(existing.start),
                  end: utcInput(existing.end),
                  revision: schedule.revision,
                })
            : undefined
        }
        item={{ ...existing, title: coverageTitle }}
        kind="on-call"
        sidebar={
          <>
            <RecordMetadata item={existing} />
          </>
        }
      >
        <CoverageFields
          readOnly
          value={{ ...existing, start: utcInput(existing.start), end: utcInput(existing.end) }}
          services={services}
          people={active}
          name={name}
          onChange={() => {}}
        />
      </RecordWorkspace>
    ) : (
      <p role="alert">Coverage not found.</p>
    );
  const editorActions = editor ? (
    <div className="flex flex-wrap justify-end gap-3">
      {schedule.shifts.some((s) => s.id === editor.id) && (
        <ConfirmDeleteButton
          disabled={save.busy}
          className="btn-danger"
          confirmation={`Remove the on-call shift for ${name(editor.userId)}? This removes their coverage for this time period.`}
          confirmLabel="Remove shift"
          onConfirm={() => apply(schedule.shifts.filter((s) => s.id !== editor.id))}
        >
          Remove shift
        </ConfirmDeleteButton>
      )}
      <button type="button" disabled={save.busy} className="btn-secondary" onClick={closeEditor}>
        Cancel
      </button>
      <CreateButton type="submit" form={formId} disabled={save.busy}>
        {schedule.shifts.some((shift) => shift.id === editor.id) ? 'Save' : 'Create'}
      </CreateButton>
    </div>
  ) : null;
  const editorForm = editor ? (
    <ValidatedForm id={formId} noValidate className="form-body" onSubmit={submit}>
      <Notice error={save.error || error} />
      {!schedule.shifts.some((s) => s.id === editor.id) && (
        <label className="flex items-center gap-2">
          <Toggle checked={rotation} onChange={(e) => setRotation(e.target.checked)} />
          Generate a rotation
        </label>
      )}
      {rotation ? (
        <>
          <p className="text-sm">
            Select teammates in rotation order. Click a selected teammate to remove them.
          </p>
          <ReferenceField
            referenceType="members"
            label="Rotation teammates (selection order)"
            multiple
            options={active.map((member) => ({ id: member.id, label: name(member.id) }))}
            value={participants}
            onChange={setParticipants}
          />
          <Field name="days" label="Days per shift">
            <input
              type="number"
              min={1}
              max={30}
              value={days}
              onChange={(e) => setDays(Number(e.target.value))}
            />
          </Field>
          <Field name="count" label="Number of shifts">
            <input
              type="number"
              min={1}
              max={100}
              value={count}
              onChange={(e) => setCount(Number(e.target.value))}
            />
          </Field>
        </>
      ) : null}
      <CoverageFields
        value={editor}
        services={services}
        people={active}
        name={name}
        omitPerson={rotation}
        omitEnd={rotation}
        onChange={(patch) => setEditor({ ...editor, ...patch })}
        errors={save.fields}
      />
    </ValidatedForm>
  ) : null;
  if (id && admin)
    return existing ? (
      <RecordWorkspace
        item={{ ...existing, title: coverageTitle }}
        kind="on-call"
        actions={editorActions}
        sidebar={<RecordMetadata item={existing} />}
      >
        <FormPage title="Coverage">{editorForm}</FormPage>
      </RecordWorkspace>
    ) : (
      <p role="alert">Coverage not found.</p>
    );
  if (form)
    return !admin ? (
      <p>Admin access is required.</p>
    ) : id && !existing ? (
      <p role="alert">Coverage not found.</p>
    ) : (
      <FormPage title={existing ? 'Edit Coverage' : 'Add Coverage'}>
        {editorForm}
        <RecordHeader>{editorActions}</RecordHeader>
      </FormPage>
    );
  return (
    <>
      {viewedShift && (
        <Modal
          title="Coverage"
          className="coverage-modal"
          onClose={() => setViewedShift(null)}
          footer={
            <>
              <button type="button" className="btn-secondary" onClick={() => setViewedShift(null)}>
                Close
              </button>
              {admin && (
                <button type="button" className="btn-primary" onClick={editViewed}>
                  Edit Coverage
                </button>
              )}
            </>
          }
        >
          <RecordFieldEditing onEdit={admin ? editViewed : undefined}>
            <CoverageFields
              readOnly
              value={{
                ...viewedShift,
                start: utcInput(viewedShift.start),
                end: utcInput(viewedShift.end),
              }}
              services={services}
              people={active}
              name={name}
              onChange={() => {}}
            />
          </RecordFieldEditing>
        </Modal>
      )}
      {quickDate && admin && (
        <Modal
          title={
            schedule.shifts.some((shift) => shift.id === editor?.id)
              ? `Edit coverage · ${quickDate}`
              : `Add coverage · ${quickDate}`
          }
          className="coverage-modal"
          onClose={closeEditor}
          busy={save.busy}
          footer={editorActions}
        >
          {editorForm}
        </Modal>
      )}
      <RecordHeader>
        <div className="flex items-center gap-3">
          {admin && (
            <button className="btn-primary gap-2" onClick={() => fresh()}>
              <PlusIcon className="h-5 w-5" />
              Add Coverage
            </button>
          )}
        </div>
      </RecordHeader>
      <Notice error={!editor ? save.error || error : ''} />
      <section className="panel p-4" data-on-call-calendar>
        <div
          className="mb-3 flex flex-wrap items-center justify-between gap-3"
          data-calendar-controls
        >
          <div className="w-full sm:w-80">
            <ReferenceField
              referenceType="services"
              label="Service"
              hideLabel
              placeholder="All services"
              value={serviceId}
              onChange={setService}
            />
          </div>
          <div className="flex items-center gap-3">
            <button
              className="btn-secondary"
              aria-label="Previous month"
              onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}
            >
              <ChevronLeftIcon className="h-5 w-5" />
            </button>
            <h2 className="font-semibold">
              {month.toLocaleDateString('en', { month: 'long', year: 'numeric' })}
            </h2>
            <button
              className="btn-secondary"
              aria-label="Next month"
              onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}
            >
              <ChevronRightIcon className="h-5 w-5" />
            </button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <div className="grid min-w-[630px] grid-cols-7" data-calendar-grid>
            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
              <div key={d} className="p-2 text-center text-xs font-semibold">
                {d}
              </div>
            ))}
            {cells.map((day) => {
              const key = day.toISOString(),
                end = new Date(+day + 86400000).toISOString(),
                shifts = filtered.filter((s) => s.start < end && s.end > key);
              return (
                <div
                  key={key}
                  onClick={(event) => {
                    if (admin && !event.target.closest('button')) fresh(day);
                  }}
                  className={`min-h-28 border border-slate-200 p-2 dark:border-slate-700 ${day.getUTCMonth() !== start.getUTCMonth() ? 'opacity-50' : ''}`}
                >
                  <button
                    type="button"
                    disabled={!admin}
                    className="block w-full rounded p-1 text-left text-xs font-semibold hover:bg-blue-50 focus-visible:outline-2 dark:hover:bg-blue-950"
                    aria-label={`Add coverage for ${key.slice(0, 10)} (UTC)`}
                    onClick={() => fresh(day)}
                  >
                    <time dateTime={key.slice(0, 10)}>{day.getUTCDate()}</time>
                    <span className="sr-only"> Add coverage</span>
                  </button>
                  {shifts.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => edit(s)}
                      title={`${name(s.userId)}: ${s.start} – ${s.end}`}
                      className="mt-1 block w-full truncate rounded bg-blue-100 px-2 py-1 text-left text-xs text-blue-900 dark:bg-blue-950 dark:text-blue-200"
                    >
                      {name(s.userId)}
                    </button>
                  ))}
                  {!shifts.length && <p className="mt-2 text-xs text-slate-400">No coverage</p>}
                </div>
              );
            })}
          </div>
        </div>
      </section>
      <DataTable
        source={`coverage?serviceId=${serviceId}`}
        deletePath="/on-call"
        onRefresh={schedule.refresh}
        title="Scheduled Coverage"
        rows={filtered}
        rowKey={(r) => r.id}
        defaultSort="start:asc"
        dateColumn="start"
        filename="on-call.csv"
        columns={[
          { key: 'person', label: 'Teammate', value: (r) => name(r.userId) },
          {
            key: 'services',
            label: 'Services',
            value: (r) =>
              r.serviceIds.length
                ? r.serviceIds
                    .map((id) => services.find((s) => s.id === id)?.name ?? 'Deleted service')
                    .join(', ')
                : 'All services',
          },
          { key: 'start', label: 'Start', value: (r) => r.start },
          { key: 'end', label: 'End', value: (r) => r.end },
          ...(admin
            ? [
                {
                  key: 'actions',
                  label: 'Actions',
                  sortable: false,
                  value: () => '',
                  render: (r) => (
                    <button className="btn-secondary" onClick={() => edit(r)}>
                      Edit
                    </button>
                  ),
                },
              ]
            : []),
        ]}
      />
    </>
  );
}

function CoverageFields({
  value,
  onChange,
  services,
  people,
  name,
  readOnly,
  omitPerson,
  omitEnd,
  errors = {},
}) {
  return (
    <StaticRecordFields readOnly={readOnly}>
      {!omitPerson && (
        <ReferenceField
          referenceType="members"
          name="userId"
          label="On-call teammate"
          options={people.map((member) => ({ id: member.id, label: name(member.id) }))}
          value={value.userId}
          onChange={(userId) => onChange({ userId })}
          error={errors.userId}
        />
      )}
      <ServicePills
        services={services}
        value={value.serviceIds}
        onChange={(serviceIds) => onChange({ serviceIds })}
      />
      <Field name="start" label="Start" helpText="UTC" errors={errors}>
        <input
          name="start"
          type="datetime-local"
          step="0.001"
          value={value.start}
          onChange={(event) => onChange({ start: event.target.value })}
        />
      </Field>
      {!omitEnd && (
        <Field name="end" label="End" helpText="UTC" errors={errors}>
          <input
            name="end"
            type="datetime-local"
            step="0.001"
            value={value.end}
            onChange={(event) => onChange({ end: event.target.value })}
          />
        </Field>
      )}
    </StaticRecordFields>
  );
}
