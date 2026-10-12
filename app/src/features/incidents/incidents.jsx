import { Modal } from '../../components/modal.jsx';
import { ValidatedForm } from '../../components/forms/validated-form.jsx';
import { PageTitle } from '../../components/page-title.jsx';
import { notify } from '../../data/toast.js';
import { AIAssistant } from '../ai/ai.jsx';
import { writeApi } from '../../data/query-client.js';
import { ConfirmDeleteButton } from '../../components/confirm-delete-button.jsx';
import { PlusIcon } from '@heroicons/react/24/outline';
import { FormSkeleton } from '../../components/skeleton.jsx';
import { Select } from '../../components/forms/select.jsx';
import { TableSearch } from '../../components/table-search.jsx';
import { StateBadge } from '../../components/state-badge.jsx';
import { mandatoryErrors } from '../../../../shared/forms/schema.js';
import { RecordActions, RecordHeader } from '../../components/record-actions.jsx';
import { IncidentDiscussion } from './discussion.jsx';
import { CancelButton } from '../../components/forms/cancel-button.jsx';
import { RecordWorkspace, RecordMetadata } from '../../components/record-workspace.jsx';
import { ActionMenu } from '../../components/action-menu.jsx';
import {
  AttachmentLinks,
  AttachmentPanel,
  AttachmentPicker,
  useAttachmentDraft,
} from '../files/attachments.jsx';
import { RecordTabs } from '../../components/record-tabs.jsx';
import { ReferenceField } from '../../components/forms/reference-field.jsx';
import { fieldChoices, recordFields } from '../../../../shared/forms/form-options.js';
import { displayValue } from '../../lib/display-value.js';
import { WorkTable } from '../work/work.jsx';
import { AutoTextarea } from '../../components/forms/auto-textarea.jsx';
import React, { useContext, useEffect, useState, useRef } from 'react';
import { Link, Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { AuthContext } from '../../auth/auth-context.js';
import { useResource } from '../../data/use-resource.js';
import { DataTable } from '../../components/data-table.jsx';
import { downloadCsv } from '../../lib/csv-download.js';
import { CustomField, Field, Notice } from '../../components/forms/fields.jsx';
import { useSave } from '../../data/use-save.js';
import { ReferenceValue } from '../../components/reference-value.jsx';
import { DateTime } from '../../preferences/date-time.jsx';

/** Paginated incident reporting with identical server filters for CSV exports. */
export function IncidentsPage({ initialServiceId = '', related = false }) {
  const { user } = useContext(AuthContext);
  const [searchColumn, setSearchColumn] = useState('');
  const [search, setSearch] = useState(''),
    [status, setStatus] = useState(''),
    [serviceId, setService] = useState(initialServiceId),
    [page, setPage] = useState(1),
    [pageSize, setSize] = useState(10),
    [sort, setSort] = useState('createdAt:desc');
  const [sortBy, order] = sort.split(':');
  const query = new URLSearchParams({
    searchColumn,
    search,
    status,
    serviceId,
    page,
    pageSize,
    sortBy,
    order,
  });
  const resource = useResource(`/incidents?${query}`, 30000),
    services = useResource('/services');
  useEffect(() => {
    if (resource.data) {
      const lastPage = Math.max(1, Math.ceil(resource.data.total / pageSize));
      if (page > lastPage) setPage(lastPage);
    }
  }, [resource.data, page, pageSize]);
  const update = (setter) => (e) => {
    setter(e.target.value);
    setPage(1);
  };
  const columns = [
    {
      key: 'title',
      label: 'Incident',
      value: (r) => r.title,
      render: (r) => (
        <Link
          className="text-blue-700 hover:underline dark:text-blue-300"
          to={`/incidents/${r.id}`}
        >
          {r.title}
        </Link>
      ),
    },
    {
      key: 'assignmentGroupName',
      label: 'Assignment group',
      value: (r) => r.assignmentGroupName || 'Unassigned',
    },
    { key: 'serviceName', label: 'Service', value: (r) => r.serviceName },
    {
      key: 'severity',
      label: 'Severity',
      value: (r) => r.severityLabel || displayValue(r.severity),
      render: (r) => <StateBadge status={r.severity} label={r.severityLabel} />,
    },
    {
      key: 'status',
      label: 'Status',
      value: (r) => r.statusLabel || displayValue(r.status),
      render: (r) => <StateBadge status={r.status} label={r.statusLabel} />,
    },
    {
      key: 'createdAt',
      label: 'Created',
      value: (r) => r.createdAt,
      render: (r) => <DateTime value={r.createdAt} />,
    },
  ];
  return (
    <div className={related ? 'space-y-4' : 'list-page'}>
      <Notice error={resource.error} />
      <DataTable
        deletePath="/incidents"
        fullPage={!related}
        actions={
          ['admin', 'responder', 'user'].includes(user?.role) && (
            <Link
              className="btn-primary"
              to={`/incidents/new${initialServiceId ? `?serviceId=${initialServiceId}` : ''}`}
            >
              <PlusIcon className="h-5 w-5 shrink-0" aria-hidden="true" />
              Create
            </Link>
          )
        }
        title={user?.role === 'user' ? 'My incidents' : 'Incidents'}
        columns={columns}
        rows={resource.data?.incidents ?? []}
        rowKey={(r) => r.id}
        remote={{
          filtersActive: Boolean(search || status || serviceId !== initialServiceId),
          page,
          pageSize,
          total: resource.data?.total ?? 0,
          sort,
          pending: resource.pending,
          loading: resource.loading,
          onPage: setPage,
          onPageSize: (n) => {
            setSize(n);
            setPage(1);
          },
          onSort: (s) => {
            setSort(s);
            setPage(1);
          },
          onRefresh: resource.refresh,
          onExport: (signal) => downloadCsv(`/incidents/export?${query}`, 'incidents.csv', signal),
        }}
        filters={
          <div className="flex flex-wrap items-end gap-4">
            <TableSearch
              columns={columns}
              search={search}
              column={searchColumn}
              onSearch={(value) => {
                setSearch(value);
                setPage(1);
              }}
              onColumn={(value) => {
                setSearchColumn(value);
                setPage(1);
              }}
            />
            <label className="field-label">
              Status
              <Select value={status} onChange={update(setStatus)}>
                <option value="">All statuses</option>
                {['open', 'acknowledged', 'resolved'].map((s) => (
                  <option key={s} value={s}>
                    {displayValue(s)}
                  </option>
                ))}
              </Select>
            </label>
            {!related && (
              <label className="field-label">
                Service
                <Select value={serviceId} onChange={update(setService)}>
                  <option value="">All services</option>
                  {services.data?.services.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </Select>
              </label>
            )}
            {(search || status || serviceId !== initialServiceId || sort !== 'createdAt:desc') && (
              <button
                className="btn-secondary"
                onClick={() => {
                  setSearch('');
                  setSearchColumn('');
                  setStatus('');
                  setService(initialServiceId);
                  setSort('createdAt:desc');
                  setPage(1);
                }}
              >
                Reset filters and sorting
              </button>
            )}
          </div>
        }
      />
    </div>
  );
}
/** Read-only details are shared by all allowed roles; edit forms open on a dedicated page. */
export function IncidentPage({ edit = false }) {
  const [params] = useSearchParams();
  const { id } = useParams(),
    { user } = useContext(AuthContext);
  const [formVersion, setFormVersion] = useState(0);
  const [editingId, setEditingId] = useState(null);
  const [resolving, setResolving] = useState(false);
  const editing = editingId === useParams().id;
  const incident = useResource(id ? `/incidents/${id}` : null),
    schema = useResource('/incident-fields'),
    services = useResource('/services'),
    members = useResource('/members');
  const loading = schema.loading || services.loading || members.loading || (id && incident.loading);
  const error = incident.error || schema.error || services.error || members.error;
  const item = incident.data?.incident,
    canEdit = ['admin', 'responder'].includes(user?.role);
  const memberName = (memberId) =>
    members.data?.members.find((m) => m.id === memberId)?.displayName ||
    members.data?.members.find((m) => m.id === memberId)?.email ||
    (memberId ? 'Workspace member' : 'Unassigned');
  if (edit) return <Navigate replace to={`/incidents/${id}`} />;
  return (
    <div className={id ? 'space-y-6' : 'form-page'}>
      {resolving && item && canEdit && (
        <ResolveIncidentDialog
          key={id}
          item={item}
          schema={schema.data.fields}
          onClose={() => setResolving(false)}
        />
      )}
      {!id && (
        <div className="flex items-center justify-between gap-3">
          {!id && <PageTitle>Create Incident</PageTitle>}
          {!id && user?.role === 'admin' && (
            <RecordHeader>
              <ActionMenu label="Form actions">
                <Link className="btn-secondary" to="/incidents/fields">
                  Form builder
                </Link>
              </ActionMenu>
            </RecordHeader>
          )}
        </div>
      )}
      <Notice error={error} />
      {loading ? (
        <FormSkeleton
          fields={(
            schema.data?.fields ?? [
              { id: 'title' },
              { id: 'serviceId' },
              { id: 'severity' },
              { id: 'status' },
              { id: 'assigneeId' },
              { id: 'openedForId' },
              { id: 'description' },
              { id: 'knowledgeIds' },
            ]
          ).filter((field) => field.id !== 'resolutionNotes')}
          label="Loading incident…"
        />
      ) : (
        !error &&
        (!id ? (
          <IncidentEditor
            initialServiceId={params.get('serviceId') ?? ''}
            schema={schema.data.fields}
            services={services.data.services}
            members={members.data.members}
          />
        ) : (
          item && (
            <>
              <RecordWorkspace
                item={item}
                kind={'incidents'}
                onEdit={
                  canEdit && !editing
                    ? () => {
                        setResolving(false);
                        setEditingId(id);
                      }
                    : undefined
                }
                actions={
                  canEdit && !editing ? (
                    item.status === 'resolved' ? (
                      <ConfirmDeleteButton
                        className="btn-primary"
                        title="Reopen Incident"
                        confirmation={`Reopen “${item.title}”? This returns the incident to Open and may notify responders. Monitor-created incidents will require manual resolution after reopening.`}
                        confirmLabel="Reopen"
                        busyLabel="Reopening…"
                        confirmClassName="btn-primary"
                        onConfirm={async () => {
                          const option = fieldChoices(
                            'incidents',
                            schema.data.fields.find((field) => field.id === 'status'),
                          ).find((entry) => !entry.hidden && entry.base === 'open');
                          await writeApi(`/incidents/${id}`, {
                            method: 'PATCH',
                            body: {
                              revision: item.revision,
                              statusOption: option?.value || 'open',
                            },
                          });
                        }}
                      >
                        Reopen
                      </ConfirmDeleteButton>
                    ) : (
                      <button
                        type="button"
                        className="btn-primary"
                        onClick={() => {
                          setResolving(true);
                        }}
                      >
                        Resolve
                      </button>
                    )
                  ) : undefined
                }
                sidebar={
                  <>
                    <RecordMetadata
                      item={item}
                      extra={[
                        ['Status', item.statusLabel || displayValue(item.status)],
                        ['Severity', item.severityLabel || displayValue(item.severity)],
                        ['Source', displayValue(item.source)],
                        [
                          'Opened by',
                          <ReferenceValue
                            key="opened-by"
                            type="members"
                            id={item.createdById}
                            label={memberName(item.createdById)}
                          />,
                        ],
                      ]}
                    />
                  </>
                }
              >
                <AttachmentLinks kind="incidents" recordId={item.id} />
                {!editing && (
                  <AIAssistant key={item.id} action="summary" kind="incidents" id={item.id} />
                )}
                {canEdit && editing ? (
                  <IncidentEditor
                    key={`${id}-${formVersion}`}
                    incident={item}
                    resolving={resolving}
                    linkedArticles={incident.data.knowledge ?? []}
                    schema={schema.data.fields}
                    services={services.data.services}
                    members={members.data.members}
                    onClose={() => {
                      setEditingId(null);
                      setFormVersion((value) => value + 1);
                    }}
                  />
                ) : (
                  <section className="record-details space-y-6">
                    <dl>
                      <div>
                        <dt>Title</dt>
                        <dd>{item.title}</dd>
                      </div>
                    </dl>
                    <dl className="grid gap-4 text-sm sm:grid-cols-2">
                      <div>
                        <dt className="font-medium">Service</dt>
                        <dd>
                          <ReferenceValue
                            type="services"
                            id={item.serviceId}
                            label={item.serviceName}
                          />
                        </dd>
                      </div>
                      <div>
                        <dt className="font-medium">Status</dt>
                        <dd>
                          <StateBadge status={item.status} label={item.statusLabel} />
                        </dd>
                      </div>
                      <div>
                        <dt>Severity</dt>
                        <dd>
                          <StateBadge status={item.severity} label={item.severityLabel} />
                        </dd>
                      </div>
                      <div>
                        <dt className="font-medium">Assignment group</dt>
                        <dd>
                          <ReferenceValue
                            type="groups"
                            id={item.assignmentGroupId}
                            label={item.assignmentGroupName}
                          />
                        </dd>
                      </div>
                      <div>
                        <dt className="font-medium">Assigned to</dt>
                        <dd>
                          <ReferenceValue
                            type="members"
                            id={item.assigneeId}
                            label={memberName(item.assigneeId)}
                          />
                        </dd>
                      </div>
                      <div>
                        <dt className="font-medium">Opened for</dt>
                        <dd>
                          <ReferenceValue
                            type="members"
                            id={item.openedForId}
                            label={memberName(item.openedForId)}
                          />
                        </dd>
                      </div>
                    </dl>
                    <dl>
                      <div>
                        <dt>Description</dt>
                        <dd className="whitespace-pre-wrap break-words">
                          {item.description || 'No description.'}
                        </dd>
                      </div>
                    </dl>
                    {(item.resolutionNotes || item.status === 'resolved') && (
                      <dl>
                        <div>
                          <dt>
                            {schema.data.fields.find((field) => field.id === 'resolutionNotes')
                              ?.label || 'Resolution notes'}
                          </dt>
                          <dd className="whitespace-pre-wrap">{item.resolutionNotes || '—'}</dd>
                        </div>
                      </dl>
                    )}
                    {recordFields(schema.data.fields, item.fields).some(
                      (field) => !field.archived,
                    ) && (
                      <dl className="grid gap-4 sm:grid-cols-2">
                        {recordFields(schema.data.fields, item.fields)
                          .filter((field) => !field.archived)
                          .map((field) => (
                            <div key={field.id}>
                              <dt className="text-sm font-medium">{field.label}</dt>
                              <dd className="whitespace-pre-wrap break-words text-sm">
                                {String(item.custom[field.id] ?? '—')}
                              </dd>
                            </div>
                          ))}
                      </dl>
                    )}
                  </section>
                )}
                <RecordTabs
                  related
                  lazy
                  tabs={[
                    {
                      id: 'discussion',
                      label: canEdit ? 'Comments and work notes' : 'Comments',
                      content: (
                        <IncidentDiscussion
                          key={item.id}
                          incidentId={item.id}
                          comments={incident.data.comments ?? []}
                          role={user?.role}
                        />
                      ),
                    },
                    {
                      id: 'attachments',
                      label: 'Attachments',
                      content: <AttachmentPanel kind="incidents" recordId={item.id} />,
                    },
                    {
                      id: 'activity',
                      label: 'Activity',
                      content: (
                        <DataTable
                          source={`activity?recordId=${item.id}`}
                          title="Incident Activity"
                          rows={[...item.timeline].reverse()}
                          columns={[
                            { key: 'at', label: 'Time', value: (row) => row.at },
                            { key: 'by', label: 'Updated by', value: (row) => row.by },
                            {
                              key: 'status',
                              label: 'Status',
                              value: (row) => displayValue(row.status),
                              render: (row) => (
                                <StateBadge status={row.status} label={row.statusLabel} />
                              ),
                            },
                            {
                              key: 'note',
                              label: 'Note',
                              value: (row) =>
                                row.previousResolutionNotes
                                  ? `${row.note} — Previous resolution: ${row.previousResolutionNotes}`
                                  : row.note,
                            },
                          ]}
                          filename="incident-activity.csv"
                          defaultSort="at:desc"
                          dateColumn="at"
                        />
                      ),
                    },
                    ...(user?.role !== 'user'
                      ? [
                          ...(item.source === 'monitor' &&
                          (!item.monitorTriggersRecorded || item.hasMonitorEvents)
                            ? [
                                {
                                  id: 'monitor-events',
                                  label: 'Monitor Events',
                                  content: (
                                    <>
                                      <p className="px-4 py-3 text-sm text-slate-500 dark:text-slate-400">
                                        {item.monitorTriggersRecorded
                                          ? 'Checks recorded when this incident opened · Last 30 days · Includes dependency monitors'
                                          : 'Triggering checks were not recorded for this older incident.'}
                                      </p>
                                      <DataTable
                                        source={`incident-monitor-events?recordId=${item.id}`}
                                        title="Monitor Events"
                                        rowHref={(row) =>
                                          `/monitors/${row.monitorId}/events/${row.id}`
                                        }
                                        rowKey={(row) => row.id}
                                        filename="incident-monitor-events.csv"
                                        defaultSort="checkedAt:desc"
                                        dateColumn="checkedAt"
                                        columns={[
                                          {
                                            key: 'checkedAt',
                                            label: 'Checked At',
                                            value: (row) => row.checkedAt,
                                            render: (row) => (
                                              <Link
                                                className="text-blue-700 hover:underline dark:text-blue-300"
                                                to={`/monitors/${row.monitorId}/events/${row.id}`}
                                              >
                                                <DateTime value={row.checkedAt} />
                                              </Link>
                                            ),
                                          },
                                          {
                                            key: 'monitorName',
                                            label: 'Monitor',
                                            value: (row) => row.monitorName,
                                          },
                                          {
                                            key: 'serviceName',
                                            label: 'Service',
                                            value: (row) => row.serviceName,
                                          },
                                          {
                                            key: 'status',
                                            label: 'Status',
                                            value: (row) => row.status,
                                            render: (row) => <StateBadge status={row.status} />,
                                          },
                                          {
                                            key: 'statusCode',
                                            label: 'HTTP Status',
                                            value: (row) => row.statusCode ?? 'No response',
                                          },
                                          {
                                            key: 'durationMs',
                                            label: 'Duration',
                                            value: (row) => row.durationMs,
                                            render: (row) =>
                                              Number.isFinite(row.durationMs)
                                                ? `${row.durationMs} ms`
                                                : '—',
                                          },
                                          {
                                            key: 'error',
                                            label: 'Error',
                                            value: (row) => row.error || '—',
                                          },
                                        ]}
                                      />
                                    </>
                                  ),
                                },
                              ]
                            : []),
                          {
                            id: 'tasks',
                            label: 'Tasks',
                            content: (
                              <WorkTable
                                related
                                initialIncidentId={item.id}
                                initialServiceId={item.serviceId}
                              />
                            ),
                          },
                          {
                            id: 'knowledge',
                            label: 'Knowledge',
                            content: (
                              <DataTable
                                source={`incident-knowledge?recordId=${item.id}`}
                                title="Knowledge"
                                rows={incident.data.knowledge ?? []}
                                rowKey={(row) => row.id}
                                filename="incident-knowledge.csv"
                                columns={[
                                  {
                                    key: 'title',
                                    label: 'Title',
                                    value: (row) => row.title,
                                    render: (row) => (
                                      <Link
                                        className="text-blue-700 dark:text-blue-300"
                                        to={`/knowledge/${row.id}`}
                                      >
                                        {row.title || 'Untitled article'}
                                      </Link>
                                    ),
                                  },
                                  {
                                    key: 'summary',
                                    label: 'Summary',
                                    value: (row) => row.summary || '',
                                  },
                                  {
                                    key: 'status',
                                    label: 'Status',
                                    value: (row) => displayValue(row.status),
                                    render: (row) => (
                                      <StateBadge status={row.status} label={row.statusLabel} />
                                    ),
                                  },
                                ]}
                                actions={
                                  canEdit && !editing ? (
                                    <button
                                      type="button"
                                      className="btn-secondary"
                                      onClick={() => {
                                        setResolving(false);
                                        setEditingId(id);
                                      }}
                                    >
                                      Link articles
                                    </button>
                                  ) : undefined
                                }
                              />
                            ),
                          },
                        ]
                      : []),
                  ]}
                />
              </RecordWorkspace>
            </>
          )
        ))
      )}
    </div>
  );
}
/** Built-in layout follows admin labels/order; custom values use an immutable schema snapshot. */
function IncidentEditor({
  incident,
  schema,
  services,
  members,
  onClose,
  resolving = false,
  initialServiceId = '',
  linkedArticles = [],
}) {
  const navigate = useNavigate(),
    save = useSave(),
    { user } = useContext(AuthContext);
  const [current] = useState(incident);
  const formRef = useRef(null);
  const [confirmResolution, setConfirmResolution] = useState(false);
  const resolutionCancel = useRef(null);
  const [clientErrors, setClientErrors] = useState({});
  const errors = { ...save.fields, ...clientErrors };
  const [articleSearch, setArticleSearch] = useState('');
  const articles = useResource(
    user.role !== 'user'
      ? `/knowledge?${new URLSearchParams({ search: articleSearch, pageSize: '50' })}`
      : null,
  );
  const draft = useAttachmentDraft('incidents', incident?.id, incident?.attachmentIds ?? []);
  const initialChoice = (name, base) =>
    fieldChoices(
      'incidents',
      schema.find((field) => field.id === name),
    ).find((option) => !option.hidden && option.base === base)?.value ||
    fieldChoices(
      'incidents',
      schema.find((field) => field.id === name),
    ).find((option) => !option.hidden)?.value ||
    base;
  const [value, setValue] = useState({
    ...incident,
    title: incident?.title ?? '',
    description: incident?.description ?? '',
    resolutionNotes: incident?.resolutionNotes ?? '',
    knowledgeIds: incident?.knowledgeIds ?? [],
    serviceId: incident?.serviceId ?? initialServiceId,
    assignmentGroupId: incident?.assignmentGroupId ?? '',
    assigneeId: incident?.assigneeId ?? '',
    openedForId: incident?.openedForId ?? user.id,
    custom: incident?.custom ?? {},
    statusOption: resolving
      ? fieldChoices(
          'incidents',
          schema.find((field) => field.id === 'status'),
        ).find((option) => !option.hidden && option.base === 'resolved')?.value || 'resolved'
      : (incident?.statusOption ?? incident?.status ?? initialChoice('status', 'open')),
    severityOption:
      incident?.severityOption ?? incident?.severity ?? initialChoice('severity', 'medium'),
  });
  const [note, setNote] = useState('');
  const custom = recordFields(schema, current?.fields).filter((field) => !field.archived);
  const layout = [
    ...schema
      .filter((f) => f.type === 'builtin' || custom.some((c) => c.id === f.id))
      .map((f) => (f.type === 'builtin' ? f : custom.find((c) => c.id === f.id))),
    ...custom.filter((f) => !schema.some((s) => s.id === f.id)),
  ];
  const set = (name, v) => setValue((old) => ({ ...old, [name]: v }));
  const selectedStatus =
    fieldChoices(
      'incidents',
      schema.find((field) => field.id === 'status'),
    ).find((option) => option.value === value.statusOption)?.base ??
    current?.status ??
    'open';
  const control = (field) => {
    const name = field.id,
      props = { value: value[name] ?? '', onChange: (e) => set(name, e.target.value) };
    if (field.type !== 'builtin')
      return (
        <CustomField
          key={name}
          field={field}
          value={value.custom[name]}
          errors={errors}
          onChange={(v) => set('custom', { ...value.custom, [name]: v })}
        />
      );
    if (name === 'knowledgeIds')
      return user.role === 'user' ? null : (
        <ReferenceField
          key={name}
          multiple
          referenceType="knowledge"
          label={field.label + (field.required ? ' *' : '')}
          helpText={field.helpText}
          value={value.knowledgeIds}
          options={[
            ...new Map(
              [...linkedArticles, ...(articles.data?.items ?? [])].map((article) => [
                article.id,
                { id: article.id, label: article.title || 'Untitled article' },
              ]),
            ).values(),
          ]}
          onChange={(next) => set(name, next)}
          onSearch={setArticleSearch}
          error={errors[name] || articles.error}
        />
      );
    if (name === 'resolutionNotes' && selectedStatus !== 'resolved') return null;
    if (name === 'assignmentGroupId')
      return user.role === 'user' ? null : (
        <ReferenceField
          key={name}
          referenceType="groups"
          label={field.label + (field.required ? ' *' : '')}
          helpText={field.helpText}
          value={value.assignmentGroupId}
          onChange={(next) =>
            setValue((old) => ({ ...old, assignmentGroupId: next, assigneeId: '' }))
          }
          error={errors[name]}
        />
      );
    if (['serviceId', 'assigneeId', 'openedForId'].includes(name))
      return (
        <ReferenceField
          assignToMe={name === 'assigneeId'}
          groupId={name === 'assigneeId' ? value.assignmentGroupId : undefined}
          referenceType={name === 'serviceId' ? 'services' : 'members'}
          key={name}
          label={field.label + (field.required ? ' *' : '')}
          helpText={field.helpText}
          options={(name === 'serviceId'
            ? services
            : members.filter((member) => !member.disabled || member.id === value[name])
          ).map((row) => ({ id: row.id, label: row.name || row.displayName || row.email }))}
          value={value[name]}
          onChange={(next) => set(name, next)}
          disabled={name === 'serviceId' ? !!current : user.role === 'user'}
          error={errors[name]}
        />
      );
    let input;
    if (['description', 'resolutionNotes'].includes(name))
      input = (
        <AutoTextarea
          {...props}
          maxLength={5000}
          autoFocus={resolving && name === 'resolutionNotes' && field.required}
        />
      );
    else if (name === 'title') input = <input {...props} maxLength={160} />;
    else {
      const options = fieldChoices('incidents', field),
        key = `${name}Option`,
        chosen = value[key];
      input = (
        <Select
          value={chosen}
          onChange={(event) => set(key, event.target.value)}
          disabled={name === 'status' && (user.role === 'user' || resolving)}
        >
          {chosen && !options.some((option) => option.value === chosen && !option.hidden) && (
            <option value={chosen}>
              {current?.[`${name}Label`] || displayValue(current?.[name] || chosen)} (saved)
            </option>
          )}
          {options
            .filter((option) => !option.hidden)
            .map((option) => (
              <option
                key={option.value}
                value={option.value}
                disabled={name === 'status' && !current && option.base !== 'open'}
              >
                {option.label}
              </option>
            ))}
        </Select>
      );
    }
    return (
      <Field
        key={name}
        name={name}
        label={field.label + (field.required ? ' *' : '')}
        helpText={field.helpText}
        errors={errors}
      >
        {input}
      </Field>
    );
  };
  function commit() {
    return save.run(
      current ? `/incidents/${current.id}` : '/incidents',
      current ? 'PATCH' : 'POST',
      { ...value, attachmentIds: draft.ids, revision: current?.revision, note },
      (result) => {
        if (current) onClose();
        else navigate(`/incidents/${result.incident.id}`, { state: { createdRecord: true } });
      },
    );
  }
  const form = (
    <ValidatedForm
      ref={formRef}
      className="form-body"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        const required = mandatoryErrors(schema, {
          ...value,
          status: selectedStatus,
          severity: value.severityOption,
        });
        setClientErrors(required);
        if (Object.keys(required).length) {
          notify('Please correct the highlighted fields.', 'error');
          return;
        }
        if (current?.status !== 'resolved' && selectedStatus === 'resolved') {
          setConfirmResolution(true);
          return;
        }
        commit();
      }}
    >
      <Notice
        error={
          Object.keys(clientErrors).length
            ? 'Complete the required fields before saving.'
            : save.error
        }
      />
      {current?.source === 'monitor' && (
        <p className="text-sm text-slate-500">
          {current.reopenedAt && !current.activeAutomatic
            ? 'This incident was manually reopened and requires manual resolution. Monitoring can create a separate incident for a new failure.'
            : 'Created from monitor health. It resolves automatically after recovery. Resolving while the service is still down can create a new monitoring incident.'}
        </p>
      )}
      {layout.map(control)}
      {current && (
        <Field name="note" label="Internal work note (responders and admins only)" errors={errors}>
          <AutoTextarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={2000} />
        </Field>
      )}
      {!incident && <AttachmentPicker draft={draft} />}
      <RecordActions>
        <CancelButton onCancel={onClose} to={'/incidents'} disabled={save.busy} />
        {current?.status === 'resolved' && selectedStatus !== 'resolved' ? (
          <ConfirmDeleteButton
            className="btn-primary"
            disabled={save.busy || draft.busy}
            title="Reopen Incident"
            confirmation={`Save changes and reopen “${current.title}”? This returns the incident to an active status and may notify responders.`}
            confirmLabel="Save"
            busyLabel="Saving…"
            confirmClassName="btn-primary"
            onConfirm={() => formRef.current.requestSubmit()}
          >
            Save
          </ConfirmDeleteButton>
        ) : (
          <button className="btn-primary" disabled={save.busy || draft.busy}>
            {save.busy
              ? 'Saving…'
              : resolving
                ? 'Resolve incident'
                : current
                  ? 'Save'
                  : 'Create Incident'}
          </button>
        )}
      </RecordActions>
    </ValidatedForm>
  );
  return (
    <section className="record-details space-y-6">
      {form}
      {confirmResolution && (
        <Modal
          title="Resolve Incident"
          busy={save.busy}
          initialFocusRef={resolutionCancel}
          onClose={() => setConfirmResolution(false)}
          footer={
            <>
              <button
                ref={resolutionCancel}
                type="button"
                className="btn-secondary"
                disabled={save.busy}
                onClick={() => setConfirmResolution(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn-primary"
                disabled={save.busy || draft.busy}
                onClick={commit}
              >
                Resolve Incident
              </button>
            </>
          }
        >
          <p>
            Resolve “{value.title}”? This marks the incident resolved and may notify subscribers.
          </p>
          {save.error && (
            <p role="alert" className="mt-3 text-rose-700 dark:text-rose-400">
              {save.error}
            </p>
          )}
        </Modal>
      )}
    </section>
  );
}

/** Resolve from the read-only record without mounting or submitting the full editor. */
function ResolveIncidentDialog({ item, schema, onClose }) {
  const save = useSave();
  const cancel = useRef(null);
  const [notes, setNotes] = useState(item.resolutionNotes || '');
  const field = schema.find((row) => row.id === 'resolutionNotes');
  const option = fieldChoices(
    'incidents',
    schema.find((row) => row.id === 'status'),
  ).find((choice) => !choice.hidden && choice.base === 'resolved');
  return (
    <Modal
      title="Resolve Incident"
      busy={save.busy}
      initialFocusRef={cancel}
      onClose={onClose}
      footer={
        <>
          <button
            ref={cancel}
            type="button"
            className="btn-secondary"
            disabled={save.busy}
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            type="submit"
            form="resolve-incident-form"
            className="btn-primary"
            disabled={save.busy || !option}
          >
            Resolve Incident
          </button>
        </>
      }
    >
      <ValidatedForm
        id="resolve-incident-form"
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          save.run(
            `/incidents/${item.id}`,
            'PATCH',
            { revision: item.revision, statusOption: option.value, resolutionNotes: notes },
            onClose,
          );
        }}
      >
        <p>Resolve “{item.title}”? This marks the incident resolved and may notify subscribers.</p>
        {item.source === 'monitor' && (
          <p className="text-sm text-slate-500">
            Resolving while the service is still down can create a new monitoring incident.
          </p>
        )}
        <Notice error={save.error} />
        <Field
          name="resolutionNotes"
          label={field?.label || 'Resolution notes'}
          errors={save.fields}
        >
          <AutoTextarea
            name="resolutionNotes"
            aria-label={field?.label || 'Resolution notes'}
            required={!!field?.required}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            maxLength={2000}
          />
        </Field>
      </ValidatedForm>
    </Modal>
  );
}
