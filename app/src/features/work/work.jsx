import { SearchInput } from '../../components/forms/search-input.jsx';
import {
  RecordFieldLayout,
  RecordFieldsReadOnly,
} from '../../components/forms/record-field-layout.jsx';
import { TaskBoard } from './task-board.jsx';
import { ColumnFilter } from '../../components/column-filter.jsx';
import { useListFilter } from '../../data/use-list-filter.js';
import { RcaList } from './rcas.jsx';
import { TaskDetails } from './task-details.jsx';
import { ValidatedForm } from '../../components/forms/validated-form.jsx';
import { PageTitleRow } from '../../components/page-title.jsx';
import { ConfirmDeleteButton } from '../../components/confirm-delete-button.jsx';
import { DateTime } from '../../preferences/date-time.jsx';
import { notify } from '../../data/toast.js';
import { FormSkeleton, Skeleton } from '../../components/skeleton.jsx';
import { Select } from '../../components/forms/select.jsx';
import { TableSearch } from '../../components/table-search.jsx';
import { StateBadge } from '../../components/state-badge.jsx';
import { mandatoryErrors } from '../../../../shared/forms/schema.js';
import { RecordActions } from '../../components/record-actions.jsx';
import { RecordTabs } from '../../components/record-tabs.jsx';
import { CancelButton } from '../../components/forms/cancel-button.jsx';
import {
  RecordWorkspace,
  RecordSection,
  RecordMetadata,
} from '../../components/record-workspace.jsx';
import { ActionMenu } from '../../components/action-menu.jsx';
import {
  AttachmentLinks,
  AttachmentPanel,
  AttachmentPicker,
  useAttachmentDraft,
} from '../files/attachments.jsx';

import {
  textDocument,
  embeddedImageIds,
  validateRichContent,
} from '../../../../shared/files/rich-content.js';
import { AIAssistant } from '../ai/ai.jsx';
import { ReferenceField } from '../../components/forms/reference-field.jsx';
import { fieldChoices, recordFields } from '../../../../shared/forms/form-options.js';
import { displayValue } from '../../lib/display-value.js';
import React, { useContext, useEffect, useLayoutEffect, useState, lazy, Suspense } from 'react';
import { Link, Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  PlusIcon,
  ArrowUpTrayIcon,
  ArrowDownTrayIcon,
  ArchiveBoxIcon,
} from '@heroicons/react/24/outline';
import { writeApi } from '../../data/query-client.js';
import { TASK_STATUSES, ARTICLE_STATUSES } from '../../../../shared/forms/work-options.js';
import { useResource } from '../../data/use-resource.js';
import { AuthContext } from '../../auth/auth-context.js';
import { DataTable } from '../../components/data-table.jsx';
import { downloadCsv } from '../../lib/csv-download.js';
import { AutoTextarea } from '../../components/forms/auto-textarea.jsx';
import { Field, CustomField, Notice } from '../../components/forms/fields.jsx';
import { useSave } from '../../data/use-save.js';
import { ReferenceValue } from '../../components/reference-value.jsx';

const RichEditor = lazy(() =>
  import('../files/rich-editor.jsx').then((module) => ({ default: module.RichEditor })),
);
const ArticleContent = lazy(() =>
  import('../files/rich-editor.jsx').then((module) => ({ default: module.ArticleContent })),
);

/** Friendly labels keep stored values stable for filtering and CSV reports. */
const label = displayValue;

/** Workspace indexes link to dedicated, bookmarkable creation forms. */
export function WorkPage({ kind = 'tasks' }) {
  const [params] = useSearchParams();
  if (params.get('create') === '1') {
    const next = new URLSearchParams(params);
    next.delete('create');
    return <Navigate replace to={`/${kind}/new?${next}`} />;
  }
  if (kind === 'tasks' && !['list', 'archived'].includes(params.get('view')))
    return (
      <TaskBoard
        serviceId={params.get('serviceId') || ''}
        incidentId={params.get('incidentId') || ''}
      />
    );
  return (
    <WorkTable
      fullPage
      kind={kind}
      archived={kind === 'tasks' && params.get('view') === 'archived'}
      projectId=""
      initialServiceId={params.get('serviceId') ?? ''}
      initialIncidentId={params.get('incidentId') ?? ''}
    />
  );
}
/** Standalone create page shares the same centered form layout as incidents. */
export function WorkCreatePage({ kind = 'tasks' }) {
  const [params] = useSearchParams(),
    navigate = useNavigate(),
    { user } = useContext(AuthContext);
  return (
    <div className="form-page">
      <PageTitleRow
        title={`Create ${kind === 'tasks' ? 'Task' : 'Knowledge Article'}`}
        actions={
          user?.role === 'admin' ? (
            <ActionMenu label="Form actions">
              <Link className="btn-secondary" to={`/${kind}/fields`}>
                Form builder
              </Link>
            </ActionMenu>
          ) : null
        }
      />
      <WorkEditor
        page
        kind={kind}
        initialServiceId={params.get('serviceId') ?? ''}
        initialIncidentId={params.get('incidentId') ?? ''}
        onClose={() => navigate(`/${kind}`)}
      />
    </div>
  );
}

/** Shared remote tables paginate, filter, sort, refresh, and export the same server query. */
export function WorkTable({
  fullPage = false,
  kind = 'tasks',
  initialServiceId = '',
  projectId = '',
  initialIncidentId = '',
  initialKnowledgeBaseId = '',
  simpleArticles = false,
  create = false,
  onCreateClose,
  related = false,
  archived = false,
  embedded = false,
}) {
  const navigate = useNavigate();
  const { user } = useContext(AuthContext),
    canEdit = ['admin', 'responder'].includes(user?.role);
  const task = kind === 'tasks';
  const [columnSearch, setColumnSearch] = useListFilter('columnSearch', '', kind);
  const [searchColumn, setSearchColumn] = useListFilter('searchColumn', '', kind);
  const [search, setSearch] = useListFilter('search', '', kind),
    [status, setStatus] = useListFilter('status', '', kind);
  const [serviceId, setService] = useListFilter('serviceId', initialServiceId, kind),
    [page, setPage] = useState(1),
    [pageSize, setSize] = useListFilter('pageSize', 10, kind),
    [sort, setSort] = useListFilter('sort', 'updatedAt:desc', kind);
  useEffect(() => {
    setPage(1);
  }, [initialServiceId, initialIncidentId, projectId]);
  const [sortBy, order] = sort.split(':');
  const query = new URLSearchParams({
    searchColumn,
    columnSearch,
    search,
    status: archived ? 'archived' : status,
    serviceId,
    incidentId: initialIncidentId,
    projectId: task ? projectId : '',
    knowledgeBaseId: initialKnowledgeBaseId,
    page,
    pageSize,
    sortBy,
    order,
  });
  const resource = useResource(`/${kind}?${query}`, 30000),
    services = useResource('/services');
  useEffect(() => {
    if (resource.data)
      setPage((p) => Math.min(p, Math.max(1, Math.ceil(resource.data.total / pageSize))));
  }, [resource.data, pageSize]);
  const change = (setter) => (event) => {
    setter(event.target.value);
    setPage(1);
  };
  const columns = [
    {
      key: 'title',
      label: task ? 'Task' : 'Article',
      value: (r) => r.title,
      render: (r) => (
        <Link className="text-blue-700 hover:underline dark:text-blue-300" to={`/${kind}/${r.id}`}>
          {r.title}
        </Link>
      ),
    },
    {
      key: 'status',
      label: 'Status',
      value: (r) => r.statusLabel || label(r.status),
      render: (r) => <StateBadge status={r.status} label={r.statusLabel} />,
    },
    ...(task
      ? [
          {
            key: 'priority',
            label: 'Priority',
            value: (r) => r.priorityLabel || displayValue(r.priority),
            render: (r) => <StateBadge status={r.priority} label={r.priorityLabel} />,
          },
          { key: 'dueDate', label: 'Due date', value: (r) => r.dueDate },
        ]
      : []),
    ...(!task
      ? [
          {
            key: 'knowledgeBaseTitle',
            label: 'Knowledge Base',
            sortable: false,
            value: (row) => row.knowledgeBaseTitle || 'Unassigned',
            render: (row) => (
              <ReferenceValue
                type="knowledgeBases"
                id={row.knowledgeBaseId}
                label={row.knowledgeBaseTitle}
              />
            ),
          },
        ]
      : []),
    {
      key: 'service',
      label: 'Service',
      sortable: false,
      value: (r) => r.serviceName || 'Unassigned',
    },
    ...(task
      ? [
          {
            key: 'assignmentGroupName',
            label: 'Assignment group',
            value: (r) => r.assignmentGroupName || 'Unassigned',
          },
          {
            key: 'assignee',
            label: 'Assigned to',
            sortable: false,
            value: (r) => r.assigneeName || 'Unassigned',
          },
        ]
      : []),
    {
      key: 'updatedAt',
      label: 'Updated',
      value: (r) => r.updatedAt,
      render: (r) => <DateTime value={r.updatedAt} />,
    },
  ];
  const displayedColumns = simpleArticles
    ? [
        { ...columns[0], label: 'Title' },
        {
          key: 'createdBy',
          label: 'Author',
          sortable: false,
          value: (row) => row.createdBy || 'Not recorded',
        },
        { ...columns.find((column) => column.key === 'updatedAt'), label: 'Last Updated' },
      ]
    : columns;
  return (
    <div className={fullPage ? 'list-page' : 'space-y-4'}>
      <Notice error={resource.error || services.error} />
      <DataTable
        deletePath={`/${kind}`}
        fullPage={fullPage}
        secondaryActions={
          task &&
          fullPage &&
          !embedded && (
            <>
              <Link className="btn-secondary" to="/tasks">
                Board View
              </Link>
              <Link
                className="btn-secondary"
                to={`/tasks?${new URLSearchParams({ serviceId, projectId, incidentId: initialIncidentId, view: archived ? 'list' : 'archived' })}`}
              >
                {archived ? 'Active Tasks' : 'Archived Tasks'}
              </Link>
            </>
          )
        }
        actions={
          canEdit &&
          !embedded && (
            <button
              className="btn-primary gap-2"
              onClick={() =>
                navigate(
                  `/${kind}/new?${new URLSearchParams({ serviceId, projectId, incidentId: initialIncidentId, knowledgeBaseId: initialKnowledgeBaseId })}`,
                )
              }
            >
              <PlusIcon className="h-5 w-5" aria-hidden="true" />
              Create
            </button>
          )
        }
        title={
          simpleArticles ? 'Articles' : task ? (archived ? 'Archived Tasks' : 'Tasks') : 'Knowledge'
        }
        rows={resource.data?.items ?? []}
        columns={displayedColumns}
        rowKey={(r) => r.id}
        remote={{
          filtersActive: Boolean(
            search || columnSearch || status || serviceId !== initialServiceId,
          ),
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
          onSort: (value) => {
            setSort(value);
            setPage(1);
          },
          onRefresh: resource.refresh,
          onExport: (signal) => downloadCsv(`/${kind}/export?${query}`, `${kind}.csv`, signal),
        }}
        toolbar={
          simpleArticles ? (
            <label className="field-label block px-3 pb-3">
              <span className="sr-only">Search Articles</span>
              <SearchInput
                type="search"
                placeholder="Search articles"
                maxLength={100}
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setPage(1);
                }}
              />
            </label>
          ) : (
            <div className="table-search-toolbar shrink-0 space-y-3 px-4 py-3">
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
            </div>
          )
        }
        filters={
          <div className="table-filter-fields">
            {!simpleArticles && (
              <ColumnFilter
                columns={columns}
                column={searchColumn}
                value={columnSearch}
                onColumn={setSearchColumn}
                onValue={(value) => {
                  setColumnSearch(value);
                  setPage(1);
                }}
              />
            )}
            {!archived && (
              <label className="field-label">
                Status
                <Select aria-label="Status" value={status} onChange={change(setStatus)}>
                  <option value="">All active statuses</option>
                  {(task && fullPage
                    ? TASK_STATUSES.filter((v) => v !== 'archived')
                    : task
                      ? TASK_STATUSES
                      : ARTICLE_STATUSES
                  ).map((v) => (
                    <option key={v} value={v}>
                      {label(v)}
                    </option>
                  ))}
                </Select>
              </label>
            )}
            {!related && (
              <label className="field-label">
                Service
                <Select value={serviceId} onChange={change(setService)}>
                  <option value="">All services</option>
                  {services.data?.services.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </Select>
              </label>
            )}
            {(search ||
              columnSearch ||
              status ||
              serviceId !== initialServiceId ||
              sort !== 'updatedAt:desc') && (
              <button
                className="btn-secondary"
                onClick={() => {
                  setSearch('');
                  setColumnSearch('');
                  setSearchColumn('');
                  setStatus('');
                  setService(initialServiceId);
                  setSort('updatedAt:desc');
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

/** Authorized readers edit records in place; read-only roles retain the safe article renderer. */
export function WorkDetail({ kind = 'tasks' }) {
  const { user } = useContext(AuthContext),
    canEdit = ['admin', 'responder'].includes(user?.role);
  const { id } = useParams(),
    resource = useResource(`/${kind}/${id}`);
  const task = kind === 'tasks';
  const item = resource.data?.item;
  const publish = useSave();
  const articleSchema = useResource(task ? '/task-fields' : '/knowledge-fields');
  const visibleFields =
    articleSchema.data && item
      ? recordFields(articleSchema.data.fields, item.fields).filter((field) => !field.archived)
      : [];
  const publishedOption = articleSchema.data
    ? fieldChoices(
        'knowledge',
        articleSchema.data.fields.find((field) => field.id === 'status'),
      ).find((option) => !option.hidden && option.base === 'published')
    : null;
  const articleStatuses = articleSchema.data
    ? fieldChoices(
        'knowledge',
        articleSchema.data.fields.find((field) => field.id === 'status'),
      )
    : [];
  const draftOption = articleStatuses.find((option) => !option.hidden && option.base === 'draft');
  const archiveOption = articleStatuses.find(
    (option) => !option.hidden && option.base === 'archived',
  );
  const changeArticleStatus = (option) =>
    writeApi(`/knowledge/${item.id}`, {
      method: 'PATCH',
      body: { revision: item.revision, statusOption: option.value },
    });
  const [formVersion, setFormVersion] = useState(0);
  const [editingId, setEditingId] = useState(null);
  const editing = editingId === useParams().id;
  const resetForm = () => {
    setEditingId(null);
    setFormVersion((value) => value + 1);
  };
  return (
    <div className="space-y-6">
      <Notice error={resource.error || publish.error} />
      {!item ? (
        <p role="status" className={resource.error ? undefined : 'sr-only'}>
          {resource.error ? 'Record unavailable.' : 'Loading details…'}
        </p>
      ) : (
        <>
          <RecordWorkspace
            item={item}
            kind={kind}
            identityExtra={
              task && item.status === 'archived' ? (
                <StateBadge status="archived" label="Archived" />
              ) : undefined
            }
            secondaryActions={
              !task && canEdit && !editing && item.status !== 'archived' && archiveOption ? (
                <ConfirmDeleteButton
                  title="Archive Article?"
                  confirmLabel="Archive Article"
                  confirmation={`Archive “${item.title}”? It will leave the active article list. Its content and history will be retained.`}
                  disabled={publish.busy}
                  onConfirm={() => changeArticleStatus(archiveOption)}
                >
                  <ArchiveBoxIcon className="h-5 w-5" aria-hidden="true" />
                  Archive Article
                </ConfirmDeleteButton>
              ) : undefined
            }
            actions={
              !task && canEdit && !editing && item.status === 'published' && draftOption ? (
                <ConfirmDeleteButton
                  className="btn-secondary"
                  title="Unpublish Article?"
                  confirmLabel="Unpublish Article"
                  confirmClassName="btn-primary"
                  confirmation={`Unpublish “${item.title}” and return it to Draft? Its content will be retained.`}
                  disabled={publish.busy}
                  onConfirm={() => changeArticleStatus(draftOption)}
                >
                  <ArrowDownTrayIcon className="h-4 w-4" aria-hidden="true" />
                  Unpublish
                </ConfirmDeleteButton>
              ) : !task && canEdit && !editing && item.status !== 'published' && publishedOption ? (
                <button
                  type="button"
                  className="btn-primary"
                  disabled={publish.busy}
                  aria-busy={publish.busy}
                  onClick={() =>
                    publish.run(`/knowledge/${item.id}`, 'PATCH', {
                      revision: item.revision,
                      statusOption: publishedOption.value,
                    })
                  }
                >
                  <ArrowUpTrayIcon className="h-4 w-4" aria-hidden="true" />
                  Publish
                </button>
              ) : undefined
            }
            onEdit={canEdit && !editing ? () => setEditingId(id) : undefined}
            sidebar={
              <>
                <RecordMetadata
                  item={item}
                  extra={[
                    ['Status', item.statusLabel || label(item.status)],
                    ...(task
                      ? [['Priority', item.priorityLabel || displayValue(item.priority)]]
                      : []),
                  ]}
                />
                {!task && (
                  <RecordSection title="Attachments">
                    <AttachmentPanel
                      compact
                      kind={kind}
                      recordId={item.id}
                      imageIds={embeddedImageIds(item.contentDocument)}
                    />
                  </RecordSection>
                )}
              </>
            }
          >
            {task && item.status === 'archived' && (
              <div className="panel flex items-start gap-3 p-4" role="status">
                <ArchiveBoxIcon className="h-5 w-5 shrink-0" aria-hidden="true" />
                <div className="space-y-1">
                  <p className="font-semibold">Archived Task</p>
                  <p className="text-sm">
                    This task is excluded from the active task list and board.{' '}
                    {canEdit ? 'Edit its status to restore it.' : 'A responder can restore it.'}
                  </p>
                  <Link
                    className="text-sm text-blue-700 hover:underline dark:text-blue-300"
                    to="/tasks?view=archived"
                  >
                    View Archived Tasks
                  </Link>
                </div>
              </div>
            )}
            {task && <AttachmentLinks kind="tasks" recordId={item.id} />}
            {task && <AIAssistant action="summary" kind="tasks" id={item.id} />}
            {canEdit && editing ? (
              <WorkEditor
                key={`${id}-${formVersion}`}
                kind={kind}
                item={item}
                onClose={resetForm}
              />
            ) : !task ? (
              <KnowledgeReader
                item={item}
                fields={visibleFields}
                schema={articleSchema.data?.fields}
                layout={articleSchema.data?.layout}
              />
            ) : (
              <TaskDetails
                item={item}
                visibleFields={visibleFields}
                schema={articleSchema.data?.fields}
                layout={articleSchema.data?.layout}
              />
            )}
            {task && (
              <RecordTabs
                related
                tabs={[
                  {
                    id: 'attachments',
                    label: 'Attachments',
                    content: <AttachmentPanel kind="tasks" recordId={item.id} />,
                  },
                  { id: 'rcas', label: 'RCAs', content: <RcaList related taskId={item.id} /> },
                ]}
              />
            )}
          </RecordWorkspace>
        </>
      )}
    </div>
  );
}

/** Preserve legacy edit URLs while keeping a single record workspace. */
export function WorkEditPage({ kind = 'tasks' }) {
  const { id } = useParams();
  return <Navigate replace to={`/${kind}/${id}`} />;
}

/** Load choices without replacing the form during background refreshes. */
export function WorkEditor({
  page = false,
  kind,
  item,
  initialServiceId = '',
  initialIncidentId = '',
  onClose,
  onSaved,
  onBusyChange,
  onDirtyChange,
  focusTitle = false,
}) {
  const services = useResource('/services'),
    members = useResource(kind === 'tasks' ? '/members' : null),
    save = useSave();
  const schema = useResource(kind === 'tasks' ? '/task-fields' : '/knowledge-fields');
  const ready = services.data && schema.data && (kind !== 'tasks' || members.data);
  const content = (
    <>
      {ready ? (
        <WorkForm
          layoutConfig={schema.data.layout}
          schema={schema.data.fields}
          save={save}
          kind={kind}
          item={item}
          services={services.data.services}
          members={members.data?.members ?? []}
          initialServiceId={initialServiceId}
          initialIncidentId={initialIncidentId}
          onClose={onClose}
          onSaved={onSaved}
          onBusyChange={onBusyChange}
          onDirtyChange={onDirtyChange}
          focusTitle={focusTitle}
        />
      ) : (
        <>
          <Notice error={schema.error || services.error || members.error} />
          {!(schema.error || services.error || members.error) && (
            <FormSkeleton
              fields={
                schema.data?.fields ??
                (kind === 'tasks'
                  ? [
                      'title',
                      'description',
                      'status',
                      'priority',
                      'serviceId',
                      'incidentId',
                      'assigneeId',
                    ]
                  : ['title', 'content', 'status', 'serviceId']
                ).map((id) => ({ id }))
              }
            />
          )}
        </>
      )}
    </>
  );
  return <section className="record-details space-y-6">{content}</section>;
}

/** Schema-driven forms preserve stable types and map custom choices to canonical workflow values. */
function WorkForm({
  kind,
  item,
  services,
  members,
  initialServiceId,
  initialIncidentId,
  onClose,
  onSaved,
  onBusyChange,
  onDirtyChange,
  focusTitle = false,
  save,
  schema,
  layoutConfig,
}) {
  const [params] = useSearchParams();
  const [clientErrors, setClientErrors] = useState({});
  const [contentVersion, setContentVersion] = useState(0);
  const errors = { ...save.fields, ...clientErrors };
  const task = kind === 'tasks',
    navigate = useNavigate();
  const draft = useAttachmentDraft(kind, item?.id, item?.attachmentIds ?? []);
  const choiceDefault = (field) => {
    const options = fieldChoices(
      kind,
      schema.find((row) => row.id === field),
    );
    return (
      options.find(
        (row) =>
          !row.hidden &&
          row.base ===
            (field === 'status'
              ? task
                ? 'todo'
                : 'draft'
              : field === 'articleType'
                ? 'article'
                : 'medium'),
      )?.value ||
      options.find((row) => !row.hidden)?.value ||
      ''
    );
  };
  const [value, setValue] = useState(() => ({
    title: item?.title ?? '',
    statusOption: item?.statusOption ?? item?.status ?? choiceDefault('status'),
    serviceId: item?.serviceId ?? initialServiceId,
    custom: item?.custom ?? {},
    ...(task
      ? {
          projectId: item ? (item.projectId ?? '') : '',
          description: item?.description ?? '',
          priorityOption: item?.priorityOption ?? item?.priority ?? choiceDefault('priority'),
          assignmentGroupId: item?.assignmentGroupId ?? '',
          assigneeId: item?.assigneeId ?? '',
          dueDate: item?.dueDate ?? '',
          incidentId: item?.incidentId ?? initialIncidentId,
        }
      : {
          articleTypeOption: item?.articleTypeOption ?? item?.articleType ?? 'article',
          steps: item?.steps ?? [],
          knowledgeBaseId: item?.knowledgeBaseId ?? params.get('knowledgeBaseId') ?? '',
          summary: item?.summary ?? '',
          contentDocument: item?.contentDocument ?? textDocument(item?.content ?? ''),
        }),
  }));
  const [initialValue] = useState(() => JSON.stringify({ value, attachmentIds: draft.ids }));
  const dirty = JSON.stringify({ value, attachmentIds: draft.ids }) !== initialValue;
  useLayoutEffect(() => {
    onBusyChange?.(save.busy || draft.busy);
  }, [save.busy, draft.busy, onBusyChange]);
  useLayoutEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);
  useEffect(
    () => () => {
      onBusyChange?.(false);
      onDirtyChange?.(false);
    },
    [onBusyChange, onDirtyChange],
  );
  const runbook =
    !task &&
    fieldChoices(
      'knowledge',
      schema.find((field) => field.id === 'articleType') ?? { id: 'articleType' },
    ).find((option) => option.value === value.articleTypeOption)?.base === 'runbook';
  const [revision] = useState(item?.revision),
    [incidentSearch, setIncidentSearch] = useState('');
  const choices = useResource(
    task
      ? `/incidents?${new URLSearchParams({ search: incidentSearch, pageSize: '50', ...(value.serviceId ? { serviceId: value.serviceId } : {}) })}`
      : null,
  );
  const selected = useResource(task && value.incidentId ? `/incidents/${value.incidentId}` : null),
    incident = selected.data?.incident;
  const set = (name, next) => setValue((old) => ({ ...old, [name]: next }));
  const references = (field, options, selectedValue, change, extra = {}) => (
    <ReferenceField
      assignToMe={field.id === 'assigneeId'}
      groupId={field.id === 'assigneeId' ? value.assignmentGroupId : undefined}
      referenceType={
        field.id === 'serviceId' ? 'services' : field.id === 'incidentId' ? 'incidents' : 'members'
      }
      key={field.id}
      label={field.label + (field.required ? ' *' : '')}
      helpText={field.helpText}
      options={options}
      value={selectedValue}
      onChange={change}
      error={errors[field.id]}
      {...extra}
    />
  );
  const custom = recordFields(schema, item?.fields);
  const layout = [
    ...schema.filter((field) => field.type === 'builtin' || !field.archived),
    ...custom.filter((field) => !schema.some((row) => row.id === field.id) && !field.archived),
  ];
  const control = (field) => {
    const name = field.id;
    if (field.type !== 'builtin')
      return (
        <CustomField
          key={name}
          field={field}
          value={value.custom[name]}
          errors={errors}
          onChange={(next) => set('custom', { ...value.custom, [name]: next })}
        />
      );
    if (name === 'knowledgeBaseId')
      return (
        <ReferenceField
          key={name}
          name={name}
          referenceType="knowledgeBases"
          label={field.label}
          value={value.knowledgeBaseId}
          onChange={(next) => set(name, next)}
          helpText={field.helpText}
          required={field.required}
          error={errors[name]}
        />
      );
    if (name === 'projectId') return null;
    if (name === 'serviceId')
      return references(
        field,
        services.map((row) => ({ id: row.id, label: row.name })),
        incident?.serviceId ?? value.serviceId,
        (next) => set(name, next),
        { disabled: task && !!value.incidentId },
      );
    if (name === 'assignmentGroupId')
      return (
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
    if (name === 'assigneeId')
      return references(
        field,
        members
          .filter((row) => !row.disabled || row.id === value.assigneeId)
          .map((row) => ({ id: row.id, label: row.displayName || row.email })),
        value.assigneeId,
        (next) => set(name, next),
      );
    if (name === 'incidentId') {
      const list = choices.data?.incidents ?? [];
      return references(
        field,
        [
          ...(incident && !list.some((row) => row.id === incident.id) ? [incident] : []),
          ...list,
        ].map((row) => ({ id: row.id, label: row.title })),
        value.incidentId,
        (next) => {
          const found = list.find((row) => row.id === next);
          setValue((old) => ({
            ...old,
            incidentId: next,
            serviceId: found?.serviceId ?? old.serviceId,
          }));
        },
        { onSearch: setIncidentSearch },
      );
    }
    if (name === 'content')
      return (
        <section key={name} className="space-y-2">
          <h2 className="field-label">
            {runbook ? 'Introduction (optional)' : field.label}
            {!runbook && field.required ? ' *' : ''}
          </h2>
          <Suspense
            fallback={
              <span role="status" aria-label="Loading editor…">
                <Skeleton className="h-[300px] w-full" />
              </span>
            }
          >
            <RichEditor
              key={contentVersion}
              label={field.label}
              helpText={field.helpText}
              value={value.contentDocument}
              onChange={(document) => set('contentDocument', document)}
              uploadImage={(file) => draft.upload(file, { inline: true })}
              busy={draft.busy}
              error={errors.content}
            />
          </Suspense>
        </section>
      );
    let input;
    if (name === 'status' || name === 'priority' || name === 'articleType') {
      const options = fieldChoices(kind, field),
        key = `${name}Option`,
        chosen = value[key];
      input = (
        <Select value={chosen} onChange={(event) => set(key, event.target.value)}>
          {chosen && !options.some((row) => row.value === chosen && !row.hidden) && (
            <option value={chosen}>
              {item?.[`${name}Label`] || label(item?.[name] || chosen)} (saved)
            </option>
          )}
          {options
            .filter((row) => !row.hidden)
            .map((row) => (
              <option key={row.value} value={row.value}>
                {row.label}
              </option>
            ))}
        </Select>
      );
    } else if (['description', 'summary', 'content'].includes(name))
      input = (
        <AutoTextarea
          minHeight={name === 'content' ? 220 : 96}
          maxHeight={name === 'content' ? 480 : 320}
          maxLength={name === 'content' ? 30000 : name === 'summary' ? 500 : 5000}
          value={value[name]}
          onChange={(event) => set(name, event.target.value)}
        />
      );
    else
      input = (
        <input
          autoFocus={focusTitle && name === 'title'}
          type={name === 'dueDate' ? 'date' : 'text'}
          maxLength={160}
          value={value[name] ?? ''}
          onChange={(event) => set(name, event.target.value)}
        />
      );
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
  return (
    <ValidatedForm
      confirmDiscard={!onDirtyChange}
      dirty={dirty}
      noValidate
      className="form-body"
      onSubmit={(event) => {
        event.preventDefault();
        let content;
        try {
          content = !task
            ? validateRichContent(value.contentDocument, { required: false }).text
            : undefined;
        } catch (error) {
          setClientErrors(error.fields || { content: error.message });
          notify(error.message, 'error');
          return;
        }
        if (
          runbook &&
          (!value.steps.length ||
            value.steps.some((step) => !step.title.trim() || !step.instructions.trim()))
        ) {
          setClientErrors({ steps: 'Add a title and instructions to at least one runbook step.' });
          return;
        }
        const required = mandatoryErrors(schema, {
          ...value,
          content: runbook
            ? [content, ...value.steps.map((step) => `${step.title} ${step.instructions}`)].join(
                '\n',
              )
            : content,
          articleType: value.articleTypeOption,
          status: value.statusOption,
          priority: value.priorityOption,
        });
        setClientErrors(required);
        if (Object.keys(required).length) {
          notify('Please correct the highlighted fields.', 'error');
          return;
        }
        save.run(
          item ? `/${kind}/${item.id}` : `/${kind}`,
          item ? 'PATCH' : 'POST',
          {
            ...value,
            attachmentIds: draft.ids,
            ...(task && incident ? { serviceId: incident.serviceId } : {}),
            ...(item ? { revision } : {}),
          },
          (result) => {
            if (item) (onSaved ?? onClose)();
            else navigate(`/${kind}/${result.item.id}`, { state: { createdRecord: true } });
          },
        );
      }}
    >
      <Notice
        error={
          Object.keys(clientErrors).length
            ? 'Complete the required fields before saving.'
            : save.error || choices.error || selected.error
        }
      />

      <RecordFieldLayout
        fields={layout}
        layout={layoutConfig}
        renderField={control}
        editing={!!item}
      />
      {!task && (
        <AIAssistant
          action="draft"
          articleType={runbook ? 'runbook' : 'article'}
          onDraft={(generated) => {
            setContentVersion((version) => version + 1);
            setValue((old) => ({
              ...old,
              title: generated.title,
              summary: generated.summary,
              contentDocument: textDocument(generated.content),
              steps: generated.steps,
            }));
          }}
        />
      )}
      {runbook && (
        <section className="space-y-4" aria-label="Runbook steps">
          <h2 className="text-lg font-semibold">Runbook Steps</h2>
          {errors.steps && (
            <p role="alert" className="text-rose-700 dark:text-rose-400">
              {errors.steps}
            </p>
          )}
          {value.steps.map((step, index) => (
            <fieldset key={index} className="panel space-y-3 p-4">
              <legend className="font-semibold">Step {index + 1}</legend>
              <label className="field-label block">
                Step Title
                <input
                  required
                  maxLength={160}
                  value={step.title}
                  onChange={(event) =>
                    set(
                      'steps',
                      value.steps.map((old, at) =>
                        at === index ? { ...old, title: event.target.value } : old,
                      ),
                    )
                  }
                />
              </label>
              <label className="field-label block">
                Instructions
                <AutoTextarea
                  aria-label="Instructions"
                  required
                  maxLength={5000}
                  value={step.instructions}
                  onChange={(event) =>
                    set(
                      'steps',
                      value.steps.map((old, at) =>
                        at === index ? { ...old, instructions: event.target.value } : old,
                      ),
                    )
                  }
                />
              </label>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="btn-secondary"
                  disabled={index === 0}
                  onClick={() => {
                    const steps = [...value.steps];
                    [steps[index - 1], steps[index]] = [steps[index], steps[index - 1]];
                    set('steps', steps);
                  }}
                >
                  Move Step Up
                </button>
                <button
                  type="button"
                  className="btn-secondary"
                  disabled={index === value.steps.length - 1}
                  onClick={() => {
                    const steps = [...value.steps];
                    [steps[index + 1], steps[index]] = [steps[index], steps[index + 1]];
                    set('steps', steps);
                  }}
                >
                  Move Step Down
                </button>
                <ConfirmDeleteButton
                  className="btn-danger"
                  confirmation={`Remove step “${step.title || `Step ${index + 1}`}” and its instructions?`}
                  onConfirm={() =>
                    set(
                      'steps',
                      value.steps.filter((_, at) => at !== index),
                    )
                  }
                >
                  Remove Step
                </ConfirmDeleteButton>
              </div>
            </fieldset>
          ))}
          <button
            type="button"
            className="btn-secondary"
            disabled={value.steps.length >= 30}
            onClick={() => set('steps', [...value.steps, { title: '', instructions: '' }])}
          >
            Add Step
          </button>
        </section>
      )}

      {!item && (
        <AttachmentPicker draft={draft} imageIds={embeddedImageIds(value.contentDocument)} />
      )}
      <RecordActions>
        <CancelButton onCancel={onClose} to={`/${kind}`} disabled={save.busy} />
        <button
          className="btn-primary"
          disabled={save.busy || draft.busy || (task && !!value.incidentId && !incident)}
        >
          {item ? 'Save' : `Create ${task ? 'Task' : 'Article'}`}
        </button>
      </RecordActions>
    </ValidatedForm>
  );
}

/** Reading layout keeps article typography and numbered process steps separate from edit controls. */
function KnowledgeReader({ item, fields, schema, layout }) {
  const runbook = item.articleType === 'runbook';
  return (
    <article className="knowledge-reader">
      <RecordFieldsReadOnly
        fields={schema || fields}
        layout={layout}
        item={item}
        renderValue={(field) =>
          field.id === 'content' ? (
            <Suspense fallback={<div className="h-20" aria-busy="true" />}>
              <ArticleContent document={item.contentDocument} text={runbook ? '' : item.content} />
            </Suspense>
          ) : undefined
        }
      />
      <div className="knowledge-reading-content">
        {runbook && (
          <section aria-label="Runbook process">
            <h2>Step-by-Step Process</h2>
            <ol className="runbook-process">
              {item.steps?.map((step, index) => (
                <li key={index}>
                  <span className="runbook-step-number" aria-hidden="true">
                    {index + 1}
                  </span>
                  <div>
                    <h3>{step.title}</h3>
                    <p className="whitespace-pre-wrap">{step.instructions}</p>
                  </div>
                </li>
              ))}
            </ol>
          </section>
        )}
      </div>
    </article>
  );
}
