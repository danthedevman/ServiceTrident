import { WorkTable } from './work.jsx';
import { TaskBoard } from './task-board.jsx';
import { ProjectScopeBar, ProjectMetric, ProjectPanel, ProjectEmptyState } from './project-ui.jsx';
import React, { useContext, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { AuthContext } from '../../auth/auth-context.js';
import { PageTitleRow } from '../../components/page-title.jsx';
import { DataTable } from '../../components/data-table.jsx';
import { RecordWorkspace } from '../../components/record-workspace.jsx';
import { RecordTabs } from '../../components/record-tabs.jsx';
import { StaticRecordFields } from '../../components/forms/record-field-layout.jsx';
import { CancelButton } from '../../components/forms/cancel-button.jsx';
import { RecordActions } from '../../components/record-actions.jsx';
import { Field, Notice } from '../../components/forms/fields.jsx';
import { Select } from '../../components/forms/select.jsx';
import { AutoTextarea } from '../../components/forms/auto-textarea.jsx';
import { ReferenceField } from '../../components/forms/reference-field.jsx';
import { ReferenceValues } from '../../components/reference-value.jsx';
import { ValidatedForm } from '../../components/forms/validated-form.jsx';
import { Skeleton } from '../../components/skeleton.jsx';
import { DateTime } from '../../preferences/date-time.jsx';
import { useResource } from '../../data/use-resource.js';
import { useSave } from '../../data/use-save.js';
import { ProjectPicker } from './project-picker.jsx';
import { displayValue } from '../../lib/display-value.js';
const link = 'text-blue-700 hover:underline dark:text-blue-300';
const canWrite = (user) => ['admin', 'responder'].includes(user?.role);
function ProjectFilter({
  value,
  onChange,
  description = 'Focus this view on one project, or clear the selection to see all projects.',
}) {
  return <ProjectScopeBar value={value} onChange={onChange} description={description} />;
}
export function ProjectsPage() {
  const navigate = useNavigate();
  return (
    <DataTable
      fullPage
      title="Projects"
      source="projects"
      defaultSort="name:asc"
      rowHref={(r) => `/projects/${r.id}`}
      columns={[
        {
          key: 'name',
          label: 'Project',
          render: (r) => (
            <Link className={link} to={`/projects/${r.id}`}>
              {r.name}
            </Link>
          ),
        },
        { key: 'description', label: 'Description' },
        { key: 'owners', label: 'Owners' },
        { key: 'groups', label: 'Owning Groups' },
        { key: 'total', label: 'Tasks' },
        { key: 'done', label: 'Completed' },
        { key: 'progress', label: 'Progress', render: (r) => `${r.progress}%` },
      ]}
      actions={
        <ProjectPicker
          showSelector={false}
          showEdit={false}
          actionLabel="Create"
          value=""
          onChange={(id) => id && navigate(`/projects/${id}`)}
        />
      }
      description="Projects bring together owners, milestones, and delivery work. Select a project to open its workspace."
    />
  );
}
export function ProjectOverviewPage({ projectId: fixed }) {
  const [params, setParams] = useSearchParams();
  const projectId = fixed ?? params.get('projectId') ?? '';
  const data = useResource(`/project-overview?${new URLSearchParams({ projectId })}`, 30000);
  return (
    <div className="space-y-5">
      {!fixed && (
        <>
          <PageTitleRow
            title="Project Overview"
            actions={
              <Link className="btn-secondary" to={`/tasks?projectId=${projectId}`}>
                View Tasks
              </Link>
            }
          />
          <ProjectFilter
            value={projectId}
            onChange={(id) => setParams(id ? { projectId: id } : {})}
          />
        </>
      )}
      <Notice error={data.error} />
      {!data.data ? (
        !data.error && <Skeleton className="h-48 w-full" />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <ProjectMetric
              title="Open Tasks"
              value={data.data.total - data.data.done}
              to={`/tasks?projectId=${projectId}`}
            />
            <ProjectMetric title="Overdue Tasks" value={data.data.overdue} tone="amber" />
            <ProjectMetric
              title="Blocked Milestones"
              value={data.data.blocked}
              tone="rose"
              to={`/projects/milestones?projectId=${projectId}&status=blocked`}
            />
          </div>
          <div className="grid gap-5 lg:grid-cols-2">
            <ProjectPanel title="Upcoming Milestones">
              {data.data.upcoming.length ? (
                data.data.upcoming.map((m) => (
                  <Link
                    key={m.id}
                    className={`flex justify-between gap-3 ${link}`}
                    to={`/project-milestones/${m.id}`}
                  >
                    <span className="truncate">{m.title}</span>
                    <span className="shrink-0">
                      {m.targetDate} · {displayValue(m.status)}
                    </span>
                  </Link>
                ))
              ) : (
                <ProjectEmptyState>No upcoming milestones.</ProjectEmptyState>
              )}
            </ProjectPanel>
            <ProjectPanel title="Overdue Work">
              {data.data.overdueTasks.length ? (
                data.data.overdueTasks.map((t) => (
                  <Link
                    key={t.id}
                    className={`flex justify-between gap-3 ${link}`}
                    to={`/tasks/${t.id}`}
                  >
                    <span className="truncate">{t.title}</span>
                    <span className="shrink-0">{t.dueDate}</span>
                  </Link>
                ))
              ) : (
                <ProjectEmptyState>No overdue tasks.</ProjectEmptyState>
              )}
            </ProjectPanel>
            <ProjectPanel title="Team Workload">
              <p className="text-xs text-slate-500">Open tasks by assignee · top 10</p>
              {data.data.workload.map((r) => (
                <div className="flex justify-between gap-3" key={r.name}>
                  <span>{r.name}</span>
                  <strong>{r.count}</strong>
                </div>
              ))}
              {!data.data.workload.length && <ProjectEmptyState>No open tasks.</ProjectEmptyState>}
            </ProjectPanel>
            <ProjectPanel title="Project Progress">
              <p className="text-xs text-slate-500">Completed tasks / all non-archived tasks</p>
              {data.data.projects.map((p) => (
                <Link key={p.id} to={`/projects/${p.id}`} className="block space-y-1">
                  <span className="flex justify-between gap-2">
                    <span className="truncate">{p.name}</span>
                    <span>
                      {p.done}/{p.total}
                    </span>
                  </span>
                  <progress
                    aria-label={`${p.name} progress`}
                    max={100}
                    value={p.progress}
                    className="h-2 w-full accent-blue-600"
                  />
                </Link>
              ))}
            </ProjectPanel>
          </div>
        </>
      )}
    </div>
  );
}
export function ProjectPage() {
  const { id } = useParams();
  const data = useResource(`/projects/${id}`, 30000),
    navigate = useNavigate();
  return (
    <div className="space-y-5">
      <Notice error={data.error} />
      {data.data ? (
        <RecordWorkspace
          kind="projects"
          item={data.data.item}
          actions={
            <ProjectPicker
              showSelector={false}
              showCreate={false}
              showEdit
              actionLabel="Edit"
              value={id}
              onChange={(next) => next && navigate(`/projects/${next}`)}
            />
          }
        >
          <RecordTabs
            related
            lazy
            tabs={[
              { id: 'tasks', label: 'Tasks', content: <ProjectTasks projectId={id} /> },
              {
                id: 'overview',
                label: 'Overview',
                content: (
                  <div className="space-y-5">
                    <ProjectPanel title="About This Project">
                      <p className="whitespace-pre-wrap">
                        {data.data.item.description || 'No description.'}
                      </p>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div>
                          <h3 className="text-sm text-slate-500">Owners</h3>
                          <ReferenceValues
                            type="members"
                            ids={data.data.item.ownerIds || []}
                            getLabel={(id) => data.data.owners?.find((r) => r.id === id)?.label}
                          />
                        </div>
                        <div>
                          <h3 className="text-sm text-slate-500">Owning Groups</h3>
                          <ReferenceValues
                            type="groups"
                            ids={data.data.item.ownerGroupIds || []}
                            getLabel={(id) => data.data.groups?.find((r) => r.id === id)?.label}
                          />
                        </div>
                      </div>
                    </ProjectPanel>
                    <ProjectOverviewPage projectId={id} />
                  </div>
                ),
              },
              { id: 'milestones', label: 'Milestones', content: <MilestonesPage projectId={id} /> },
              {
                id: 'activity',
                label: 'Activity',
                content: <ProjectActivityPage projectId={id} />,
              },
            ]}
          />
        </RecordWorkspace>
      ) : (
        !data.error && <Skeleton className="h-64 w-full" />
      )}
    </div>
  );
}
function ProjectTasks({ projectId }) {
  const [params, setParams] = useSearchParams(),
    { user } = useContext(AuthContext);
  const view = params.get('taskView') === 'list' ? 'list' : 'board';
  return (
    <section className="project-task-workspace space-y-4" aria-label="Project Tasks">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Task View">
          {[
            ['board', 'Board'],
            ['list', 'List'],
          ].map(([value, label]) => (
            <button
              key={value}
              type="button"
              aria-pressed={view === value}
              className={`btn-secondary ${view === value ? '!border-blue-500 !text-blue-700 dark:!text-blue-300' : ''}`}
              onClick={() => {
                const next = new URLSearchParams(params);
                next.set('taskView', value);
                setParams(next);
              }}
            >
              {label}
            </button>
          ))}
        </div>
        {canWrite(user) && (
          <Link className="btn-primary" to={`/tasks/new?${new URLSearchParams({ projectId })}`}>
            Create Task
          </Link>
        )}
      </div>
      {view === 'board' ? (
        <TaskBoard embedded projectId={projectId} serviceId="" incidentId="" />
      ) : (
        <WorkTable embedded kind="tasks" projectId={projectId} />
      )}
    </section>
  );
}
export function MilestonesPage({ projectId: fixed }) {
  const [params, setParams] = useSearchParams();
  const projectId = fixed ?? params.get('projectId') ?? '';
  const status = params.get('status') || '';
  const { user } = useContext(AuthContext);
  return (
    <DataTable
      title="Milestones"
      fullPage={!fixed}
      source={`project-milestones?${new URLSearchParams({ projectId, status })}`}
      defaultSort="targetDate:asc"
      rowHref={(r) => `/project-milestones/${r.id}`}
      columns={[
        {
          key: 'title',
          label: 'Milestone',
          render: (r) => (
            <Link className={link} to={`/project-milestones/${r.id}`}>
              {r.title}
            </Link>
          ),
        },
        {
          key: 'projectName',
          label: 'Project',
          render: (r) => (
            <Link className={link} to={`/projects/${r.projectId}`}>
              {r.projectName}
            </Link>
          ),
        },
        { key: 'targetDate', label: 'Target Date' },
        { key: 'status', label: 'Status', render: (r) => displayValue(r.status) },
      ]}
      actions={
        canWrite(user) && (
          <Link
            className="btn-primary"
            to={`/project-milestones/new?${new URLSearchParams({ projectId })}`}
          >
            Create
          </Link>
        )
      }
      toolbar={
        !fixed && (
          <ProjectFilter
            value={projectId}
            onChange={(id) => setParams({ ...Object.fromEntries(params), projectId: id })}
            description="Group project tasks around a deliverable and target date."
          />
        )
      }
      filters={
        <label className="field-label">
          Status
          <Select
            aria-label="Milestone Status"
            value={status}
            onChange={(e) => setParams({ ...Object.fromEntries(params), status: e.target.value })}
          >
            <option value="">All Statuses</option>
            {['planned', 'in_progress', 'blocked', 'completed', 'archived'].map((v) => (
              <option key={v} value={v}>
                {displayValue(v)}
              </option>
            ))}
          </Select>
        </label>
      }
    />
  );
}
function MilestoneForm({ item, projectId, readOnly, onClose, onSaved }) {
  const [value, setValue] = useState({
    title: item?.title || '',
    description: item?.description || '',
    projectId: item?.projectId || projectId || '',
    status: item?.status || 'planned',
    targetDate: item?.targetDate || '',
    taskIds: item?.taskIds || [],
  });
  const save = useSave();
  const set = (key, v) => setValue((old) => ({ ...old, [key]: v }));
  return (
    <ValidatedForm
      className="form-body space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        if (readOnly || save.busy) return;
        save.run(
          item ? `/project-milestones/${item.id}` : '/project-milestones',
          item ? 'PATCH' : 'POST',
          { ...value, ...(item ? { revision: item.revision } : {}) },
          onSaved,
        );
      }}
    >
      <Notice error={save.error} />
      <StaticRecordFields readOnly={readOnly}>
        <div className="grid gap-4 md:grid-cols-2">
          <Field name="title" label="Title" errors={save.fields}>
            <input
              name="title"
              required
              maxLength={160}
              value={value.title}
              onChange={(e) => set('title', e.target.value)}
            />
          </Field>
          <ReferenceField
            label="Project"
            name="projectId"
            required
            referenceType="projects"
            value={value.projectId}
            onChange={(id) => setValue({ ...value, projectId: id, taskIds: [] })}
            error={save.fields.projectId}
          />
          <Field name="targetDate" label="Target Date" errors={save.fields}>
            <input
              name="targetDate"
              type="date"
              required
              value={value.targetDate}
              onChange={(e) => set('targetDate', e.target.value)}
            />
          </Field>
          <Field name="status" label="Status">
            <Select
              name="status"
              value={value.status}
              onChange={(e) => set('status', e.target.value)}
            >
              {['planned', 'in_progress', 'blocked', 'completed', 'archived'].map((v) => (
                <option key={v} value={v}>
                  {displayValue(v)}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <Field name="description" label="Description" errors={save.fields}>
          <AutoTextarea
            name="description"
            maxLength={2000}
            value={value.description}
            onChange={(e) => set('description', e.target.value)}
          />
        </Field>
        <ReferenceField
          name="taskIds"
          referenceType="tasks"
          projectId={value.projectId}
          disabled={!value.projectId}
          label="Tasks"
          multiple
          value={value.taskIds}
          onChange={(v) => set('taskIds', v)}
          error={save.fields.taskIds}
        />
      </StaticRecordFields>
      {!readOnly && (
        <>
          <p className="text-xs text-slate-500">
            Choose tasks from this project. Milestone status is managed separately from task
            completion.
          </p>
          <RecordActions>
            <CancelButton onCancel={onClose} disabled={save.busy} />
            <button type="submit" className="btn-primary" disabled={save.busy}>
              Save
            </button>
          </RecordActions>
        </>
      )}
    </ValidatedForm>
  );
}
export function MilestonePage() {
  const { id } = useParams(),
    [params] = useSearchParams(),
    navigate = useNavigate();
  const create = id === 'new';
  const resource = useResource(create ? null : `/project-milestones/${id}`, 30000),
    { user } = useContext(AuthContext),
    [editing, setEditing] = useState(false);
  const item = resource.data?.item;
  if (!user) return <Skeleton className="h-64 w-full" />;
  if (create && !canWrite(user))
    return <Notice error="A responder or administrator can create milestones." />;
  return (
    <div className="space-y-5">
      <PageTitleRow title={create ? 'Create Milestone' : 'Milestone'} />
      <Notice error={resource.error} />
      {create || item ? (
        <RecordWorkspace
          kind="project-milestones"
          item={item}
          onEdit={!create && !editing && canWrite(user) ? () => setEditing(true) : undefined}
        >
          <MilestoneForm
            key={`${id}:${editing ? 'edit' : item?.revision || 0}`}
            item={item}
            projectId={params.get('projectId')}
            readOnly={!create && !editing}
            onClose={() =>
              create
                ? navigate(`/projects/milestones?projectId=${params.get('projectId') || ''}`)
                : setEditing(false)
            }
            onSaved={(r) => {
              setEditing(false);
              if (create)
                navigate(`/project-milestones/${r.item.id}`, { state: { createdRecord: true } });
              else void resource.refresh();
            }}
          />
        </RecordWorkspace>
      ) : (
        !resource.error && <Skeleton className="h-64 w-full" />
      )}
    </div>
  );
}
export function ProjectActivityPage({ projectId: fixed }) {
  const [params, setParams] = useSearchParams();
  const projectId = fixed ?? params.get('projectId') ?? '';
  const { user } = useContext(AuthContext);
  const [body, setBody] = useState(''),
    [composing, setComposing] = useState(false);
  const save = useSave();
  return (
    <div className="space-y-5">
      <PageTitleRow
        title="Project Activity"
        actions={
          canWrite(user) && !composing ? (
            <button
              type="button"
              className="btn-primary"
              disabled={!projectId}
              onClick={() => setComposing(true)}
            >
              Add Comment
            </button>
          ) : undefined
        }
      />
      {!fixed && (
        <ProjectScopeBar
          value={projectId}
          disabled={composing}
          onChange={(id) => setParams(id ? { projectId: id } : {})}
          description="Review project changes and conversations. Choose a project to add a comment."
        />
      )}
      {projectId && canWrite(user) && composing && (
        <ValidatedForm
          className="panel space-y-3 p-4"
          onSubmit={(e) => {
            e.preventDefault();
            save.run(`/projects/${projectId}/comments`, 'POST', { body }, () => {
              setBody('');
              setComposing(false);
            });
          }}
        >
          <Notice error={save.error} />
          <Field name="body" label="Comment" errors={save.fields}>
            <AutoTextarea
              required
              name="body"
              maxLength={2000}
              value={body}
              onChange={(e) => setBody(e.target.value)}
            />
          </Field>
          <RecordActions>
            <CancelButton
              disabled={save.busy}
              onCancel={() => {
                setBody('');
                setComposing(false);
              }}
            />
            <button type="submit" className="btn-primary" disabled={save.busy}>
              Save
            </button>
          </RecordActions>
        </ValidatedForm>
      )}
      <DataTable
        title="Activity"
        source={`project-activity?${new URLSearchParams({ projectId })}`}
        defaultSort="createdAt:desc"
        columns={[
          { key: 'createdAt', label: 'When', render: (r) => <DateTime value={r.createdAt} /> },
          { key: 'actor', label: 'By' },
          { key: 'action', label: 'Action' },
          { key: 'body', label: 'Comment' },
          {
            key: 'taskId',
            label: 'Task',
            render: (r) =>
              r.taskId ? (
                <Link className={link} to={`/tasks/${r.taskId}`}>
                  {r.taskTitle || 'View Task'}
                </Link>
              ) : (
                '—'
              ),
          },
        ]}
      />
    </div>
  );
}
