import { SearchInput } from '../../components/forms/search-input.jsx';
import { PinRecordAction } from '../records/pinned.jsx';
import { RecordFieldEditing } from '../../components/forms/record-field-layout.jsx';
import { useListFilter } from '../../data/use-list-filter.js';
import { RecordExportActions } from '../../components/record-export-actions.jsx';
import { useBoardDragScroll } from './use-board-drag-scroll.js';
import { PageTitle } from '../../components/page-title.jsx';
import {
  PlusIcon,
  ListBulletIcon,
  ArchiveBoxIcon,
  ArrowUpIcon,
  ArrowDownIcon,
  ArrowLeftIcon,
  ArrowRightIcon,
  ArrowPathIcon,
} from '@heroicons/react/24/outline';
import { ActionMenu } from '../../components/action-menu.jsx';
import { AdjustmentsHorizontalIcon } from '@heroicons/react/24/outline';
import {
  RecordHeaderContext,
  RecordActionContext,
  RecordHeader,
} from '../../components/record-actions.jsx';
import React, { useContext, useEffect, useRef, useState, lazy, Suspense } from 'react';
import { Link } from 'react-router-dom';
import { AuthContext } from '../../auth/auth-context.js';
import { Select } from '../../components/forms/select.jsx';
import { StateBadge } from '../../components/state-badge.jsx';
import { Skeleton } from '../../components/skeleton.jsx';
import { useResource, useInfiniteResource } from '../../data/use-resource.js';
import { queryClient, writeApi } from '../../data/query-client.js';
import { fieldChoices, optionLabel } from '../../../../shared/forms/form-options.js';
import { recordFields } from '../../../../shared/forms/form-options.js';
import { Modal } from '../../components/modal.jsx';
import { RecordLink } from '../../components/record-navigation.jsx';
import { TaskDetails } from './task-details.jsx';

const TaskEditor = lazy(() =>
  import('./work.jsx').then((module) => ({ default: module.WorkEditor })),
);

/** Lanes load continuously in bounded requests; writes use saved revisions. */
export function TaskBoard({ serviceId, incidentId, projectId = '', embedded = false }) {
  const { user } = useContext(AuthContext);
  const canEdit = ['admin', 'responder'].includes(user?.role);
  const boardSettings = useResource('/task-board-settings', 30000);
  const schema = useResource('/task-fields', 30000);
  const choices = fieldChoices(
    'tasks',
    schema.data?.fields.find((field) => field.id === 'status') ?? { id: 'status' },
  );
  const available = choices
    .filter((choice) => !choice.hidden && choice.base !== 'archived')
    .map((choice) => ({ id: choice.value, status: choice.base, choice }));
  const destinations = [
    ...(boardSettings.data?.order ?? [])
      .map((id) => available.find((lane) => lane.id === id))
      .filter(Boolean),
    ...available.filter((lane) => !(boardSettings.data?.order ?? []).includes(lane.id)),
  ];
  const [search, setSearch] = useListFilter('search', '', 'task-board');
  const [openedTask, setOpenedTask] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [announcement, setAnnouncement] = useState('');
  const [dragged, setDragged] = useState(null);
  const [draggedLane, setDraggedLane] = useState(null);
  const [focusTarget, setFocusTarget] = useState(null);
  const board = useRef(null);
  useBoardDragScroll(board, !!dragged || !!draggedLane);
  const locked = useRef(false);
  const scope = new URLSearchParams({ serviceId, incidentId, projectId });
  async function reorderLane(from, target, side = 'before') {
    if (user?.role !== 'admin' || from === target || locked.current || !boardSettings.data) return;
    const order = destinations.map((lane) => lane.id).filter((id) => id !== from);
    order.splice(order.indexOf(target) + (side === 'after' ? 1 : 0), 0, from);
    locked.current = true;
    setBusy(true);
    setError('');
    setDraggedLane(null);
    try {
      await writeApi('/task-board-settings', {
        method: 'PUT',
        body: { order, revision: boardSettings.data.revision },
      });
      setAnnouncement('Lane order saved for the workspace.');
    } catch (failure) {
      setError(failure.message);
      await boardSettings.refresh();
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }
  useEffect(() => {
    if (!focusTarget || busy) return;
    // Moving between lanes remounts the card; restore keyboard focus to its record link.
    board.current?.querySelector(`[data-task-id="${CSS.escape(focusTarget)}"] a`)?.focus();
    setFocusTarget(null);
  }, [focusTarget, busy]);

  async function move(item, destination, position) {
    const choice = destinations.find((lane) => lane.id === destination)?.choice;
    const source = item.statusOption ?? item.status;
    if (
      !canEdit ||
      locked.current ||
      !schema.data ||
      (!choice && source !== destination) ||
      (source === destination && !position)
    )
      return;
    locked.current = true;
    setBusy(true);
    setError('');
    setDragged(null);
    const restoreFocus = board.current
      ?.querySelector(`[data-task-id="${CSS.escape(item.id)}"]`)
      ?.contains(document.activeElement);
    try {
      await writeApi(`/tasks/${item.id}`, {
        method: 'PATCH',
        body: {
          ...(source !== destination ? { statusOption: choice.value } : {}),
          revision: item.revision,
          ...(position ? { boardPosition: position } : {}),
        },
      });
      setAnnouncement(
        `${item.title} ${position && source === destination ? 'reordered in' : 'moved to'} ${choice?.label || optionLabel(destination)}.`,
      );
    } catch (failure) {
      setError(failure.message);
      // Refresh revisions after a conflict so the next move uses the current record.
      await queryClient.invalidateQueries({ queryKey: ['private', user.email] });
    } finally {
      if (restoreFocus) setFocusTarget(item.id);
      locked.current = false;
      setBusy(false);
    }
  }

  return (
    <div className={`task-board-page ${embedded ? 'project-task-board' : ''}`}>
      <div className="task-board-toolbar">
        {!embedded && (
          <RecordHeader>
            <header className="flex items-center justify-end gap-3">
              <PageTitle>Tasks</PageTitle>
              <div className="flex flex-wrap gap-2">
                {user?.role === 'admin' && (
                  <ActionMenu label="Tasks actions">
                    <Link to="/tasks/fields">
                      <AdjustmentsHorizontalIcon className="h-5 w-5" aria-hidden="true" />
                      Form Builder
                    </Link>
                  </ActionMenu>
                )}
                <Link
                  className="btn-secondary !p-2.5"
                  aria-label="List View"
                  title="List View"
                  to={`/tasks?${scope}&view=list`}
                >
                  <ListBulletIcon className="h-5 w-5" aria-hidden="true" />
                </Link>
                <Link
                  className="btn-secondary !p-2.5"
                  aria-label="Archived Tasks"
                  title="Archived Tasks"
                  to={`/tasks?${scope}&view=archived`}
                >
                  <ArchiveBoxIcon className="h-5 w-5" aria-hidden="true" />
                </Link>
                {canEdit && (
                  <Link className="btn-primary" to={`/tasks/new?${scope}`}>
                    <PlusIcon className="h-4 w-4 shrink-0" aria-hidden="true" />
                    Create
                  </Link>
                )}
              </div>
            </header>
          </RecordHeader>
        )}
        <label className="field-label block max-w-md">
          <span className="sr-only">Search Tasks</span>
          <SearchInput
            type="search"
            placeholder="Search Tasks"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
        {(error || schema.error || boardSettings.error) && (
          <p role="alert" className="text-sm text-rose-700 dark:text-rose-400">
            {error || schema.error || boardSettings.error}
          </p>
        )}
        <p role="status" className="sr-only">
          {announcement}
        </p>
      </div>
      <div
        ref={board}
        style={{ '--task-lane-count': destinations.length || 4 }}
        className="task-board"
        aria-label="Task board"
        aria-busy={busy}
      >
        {destinations.map((lane, index) => (
          <TaskLane
            key={`${lane.id}:${projectId}:${serviceId}:${incidentId}:${search}`}
            lane={lane}
            destinations={destinations}
            projectId={projectId}
            serviceId={serviceId}
            incidentId={incidentId}
            search={search}
            canEdit={canEdit && !!schema.data}
            busy={busy}
            move={move}
            dragged={dragged}
            setDragged={setDragged}
            canReorderLanes={user?.role === 'admin' && !!boardSettings.data && !busy}
            laneIndex={index}
            draggedLane={draggedLane}
            setDraggedLane={setDraggedLane}
            reorderLane={reorderLane}
            onOpen={setOpenedTask}
          />
        ))}
      </div>
      {openedTask && (
        <TaskDialog
          id={openedTask}
          canEdit={canEdit}
          schema={schema.data}
          onClose={() => setOpenedTask(null)}
        />
      )}
    </div>
  );
}

/** Fetch only the selected task; closing keeps lane scroll, filters, and card state intact. */
function TaskDialog({ id, schema, canEdit, onClose }) {
  const resource = useResource(`/tasks/${id}`, 30000);
  const item = resource.data?.item;
  const [editing, setEditing] = useState(false),
    [busy, setBusy] = useState(false),
    [dirty, setDirty] = useState(false),
    [discardTo, setDiscardTo] = useState(null),
    [toolbar, setToolbar] = useState(null);
  const keepEditing = useRef(null);
  useEffect(() => {
    if (!canEdit) {
      setEditing(false);
      setDirty(false);
    }
  }, [canEdit]);
  const leave = (target) => {
    if (busy) return;
    if (editing && dirty) {
      setDiscardTo(target);
      return;
    }
    if (target === 'dialog') onClose();
    else {
      setEditing(false);
      void resource.refresh();
    }
  };
  const visibleFields =
    item && schema
      ? recordFields(schema.fields, item.fields).filter((field) => !field.archived)
      : [];
  return (
    <>
      <Modal
        title={item?.title || 'Task'}
        onClose={() => leave('dialog')}
        busy={busy}
        className="task-preview-modal"
        footerBorder={!editing}
        footer={
          editing ? (
            <div ref={setToolbar} />
          ) : (
            <>
              <button type="button" className="btn-secondary" onClick={onClose}>
                Close
              </button>
              {item && (
                <ActionMenu label="Task actions">
                  <PinRecordAction item={item} kind="tasks" to={`/tasks/${id}`} />
                  <RecordExportActions kind="tasks" item={item} />
                </ActionMenu>
              )}
              {item && canEdit && (
                <button type="button" className="btn-primary" onClick={() => setEditing(true)}>
                  Edit
                </button>
              )}
              {item && (
                <RecordLink
                  to={`/tasks/${id}`}
                  recordLabel={item.title}
                  className="btn-secondary"
                  onClick={onClose}
                >
                  Open Record
                </RecordLink>
              )}
            </>
          )
        }
      >
        <RecordFieldEditing onEdit={canEdit && !editing ? () => setEditing(true) : undefined}>
          {resource.error && (
            <p role="alert" className="text-rose-700 dark:text-rose-300">
              {resource.error}
            </p>
          )}
          {item ? (
            editing ? (
              <RecordHeaderContext.Provider value={null}>
                <RecordActionContext.Provider value={toolbar}>
                  <Suspense
                    fallback={
                      <div aria-busy="true">
                        <Skeleton className="h-64 w-full" />
                      </div>
                    }
                  >
                    <TaskEditor
                      kind="tasks"
                      focusTitle
                      item={item}
                      onClose={() => leave('view')}
                      onSaved={() => {
                        setEditing(false);
                        setDirty(false);
                      }}
                      onBusyChange={setBusy}
                      onDirtyChange={setDirty}
                    />
                  </Suspense>
                </RecordActionContext.Provider>
              </RecordHeaderContext.Provider>
            ) : (
              <TaskDetails
                item={item}
                visibleFields={visibleFields}
                schema={schema?.fields}
                layout={schema?.layout}
              />
            )
          ) : (
            !resource.error && (
              <div aria-busy="true" className="space-y-4">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-48 w-full" />
              </div>
            )
          )}
        </RecordFieldEditing>
      </Modal>
      {discardTo && (
        <Modal
          title="Discard Task Changes?"
          onClose={() => setDiscardTo(null)}
          initialFocusRef={keepEditing}
          footer={
            <>
              <button
                type="button"
                className="btn-primary"
                ref={keepEditing}
                onClick={() => setDiscardTo(null)}
              >
                Keep Editing
              </button>
              <button
                type="button"
                className="btn-danger"
                onClick={() => {
                  const target = discardTo;
                  setDiscardTo(null);
                  setDirty(false);
                  setEditing(false);
                  if (target === 'dialog') onClose();
                  else void resource.refresh();
                }}
              >
                Discard Changes
              </button>
            </>
          }
        >
          <p>Your unsaved task changes will be discarded.</p>
        </Modal>
      )}
    </>
  );
}

/** Drag targets accept only cards from this board; Select also supports keyboard and touch. */
function TaskLane({
  lane,
  destinations,
  serviceId,
  projectId,
  incidentId,
  search,
  canEdit,
  busy,
  move,
  dragged,
  setDragged,
  canReorderLanes,
  laneIndex,
  draggedLane,
  setDraggedLane,
  reorderLane,
  onOpen,
}) {
  const [over, setOver] = useState(false);
  const [dropTarget, setDropTarget] = useState(null);
  const [laneSide, setLaneSide] = useState('before');
  useEffect(() => {
    if (!dragged && !draggedLane) {
      setOver(false);
      setDropTarget(null);
    }
  }, [dragged, draggedLane]);
  const cards = useRef(null),
    sentinel = useRef(null);
  const query = new URLSearchParams({
    projectId,
    status: lane.status,
    statusOption: lane.id,
    serviceId,
    incidentId,
    search,
    pageSize: '25',
    sortBy: 'boardRank',
    order: 'asc',
  });
  const resource = useInfiniteResource(`/tasks?${query}`);
  const items = resource.data?.pages.flatMap((page) => page.items) ?? [];
  const total = resource.data?.pages[0]?.total ?? 0;
  useEffect(() => {
    if (!resource.hasMore || resource.pending || resource.error || !sentinel.current) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) void resource.loadMore();
      },
      { root: cards.current?.closest('.task-board-page'), rootMargin: '240px' },
    );
    observer.observe(sentinel.current);
    return () => observer.disconnect();
  }, [resource.hasMore, resource.pending, resource.error, resource.loadMore]);
  const allowed =
    canEdit &&
    !busy &&
    dragged &&
    (lane.choice || (dragged.statusOption ?? dragged.status) === lane.id);
  const heading = lane.choice?.label || optionLabel(lane.status);
  return (
    <section
      aria-label={`${heading} tasks`}
      className={`task-lane panel ${draggedLane === lane.id ? 'task-drag-source' : ''} ${allowed || (canReorderLanes && draggedLane && draggedLane !== lane.id) ? 'task-dropzone' : ''} ${over && allowed ? 'task-lane-over' : ''} ${over && draggedLane && draggedLane !== lane.id ? `task-lane-drop-${laneSide}` : ''}`}
      onDragOver={(event) => {
        if (allowed || (canReorderLanes && draggedLane)) {
          event.preventDefault();
          event.dataTransfer.dropEffect = 'move';
          setOver(true);
          if (draggedLane)
            setLaneSide(
              event.clientX <
                event.currentTarget.getBoundingClientRect().left +
                  event.currentTarget.offsetWidth / 2
                ? 'before'
                : 'after',
            );
          else if (!event.target.closest('[data-task-id]')) setDropTarget(null);
        }
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          setOver(false);
          setDropTarget(null);
        }
      }}
      onDrop={(event) => {
        event.preventDefault();
        setOver(false);
        setDropTarget(null);
        if (canReorderLanes && draggedLane) {
          reorderLane(
            draggedLane,
            lane.id,
            event.clientX <
              event.currentTarget.getBoundingClientRect().left + event.currentTarget.offsetWidth / 2
              ? 'before'
              : 'after',
          );
          return;
        }
        if (allowed) {
          const last = items.at(-1);
          if ((dragged.statusOption ?? dragged.status) === lane.id) {
            if (last && last.id !== dragged.id)
              void move(dragged, lane.id, { targetId: last.id, side: 'after' });
          } else void move(dragged, lane.id);
        }
      }}
    >
      {over && (allowed || (canReorderLanes && draggedLane !== lane.id && draggedLane)) && (
        <div className="task-drop-hint" aria-hidden="true">
          {draggedLane
            ? `Insert lane ${laneSide === 'before' ? 'before' : 'after'} ${heading}`
            : dropTarget
              ? `Insert task ${dropTarget.side}`
              : `Drop task in ${heading}`}
        </div>
      )}
      <header
        draggable={canReorderLanes}
        onDragStart={(event) => {
          event.stopPropagation();
          setDragged(null);
          setDraggedLane(lane.id);
          event.dataTransfer.effectAllowed = 'move';
          event.dataTransfer.setData('text/plain', lane.id);
        }}
        onDragEnd={() => setDraggedLane(null)}
        className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-2 border-b border-slate-300 p-3 dark:border-slate-700"
      >
        <h2 className="min-w-0 truncate font-semibold" title={heading}>
          {heading}
        </h2>
        <span className="text-sm text-slate-500">{total}</span>
        <div className="flex flex-nowrap items-center justify-end gap-1">
          {canReorderLanes && (
            <>
              <button
                className="task-icon-action"
                aria-label={`Move ${heading} lane left`}
                title="Move Lane Left"
                disabled={laneIndex === 0}
                onClick={() => reorderLane(lane.id, destinations[laneIndex - 1].id)}
              >
                <ArrowLeftIcon className="h-4 w-4" aria-hidden="true" />
              </button>
              <button
                className="task-icon-action"
                aria-label={`Move ${heading} lane right`}
                title="Move Lane Right"
                disabled={laneIndex === destinations.length - 1}
                onClick={() => reorderLane(lane.id, destinations[laneIndex + 1].id, 'after')}
              >
                <ArrowRightIcon className="h-4 w-4" aria-hidden="true" />
              </button>
            </>
          )}
          <button
            className="task-icon-action"
            aria-label={`Refresh ${heading} tasks`}
            title="Refresh Tasks"
            disabled={resource.pending}
            onClick={resource.refresh}
          >
            <ArrowPathIcon className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </header>
      <div
        className="task-lane-cards space-y-3 p-3"
        ref={cards}
        tabIndex={0}
        role="region"
        aria-label={`${heading} task cards`}
      >
        {resource.error && (
          <p role="alert" className="text-sm text-rose-700 dark:text-rose-400">
            {resource.error}
          </p>
        )}
        {!resource.data && resource.pending ? (
          <div role="status" aria-label={`Loading ${heading} tasks`} className="space-y-3">
            {[1, 2, 3].map((key) => (
              <Skeleton key={key} className="h-36 w-full" />
            ))}
          </div>
        ) : (
          items.map((item, index) => (
            <article
              key={item.id}
              data-task-id={item.id}
              onClick={(event) => {
                if (
                  event.defaultPrevented ||
                  event.button !== 0 ||
                  event.metaKey ||
                  event.ctrlKey ||
                  event.shiftKey ||
                  event.altKey ||
                  dragged ||
                  busy
                )
                  return;
                if (
                  event.target.closest(
                    'a,button,input,select,textarea,label,[role="button"],[role="combobox"],[role="menu"]',
                  )
                )
                  return;
                if (window.getSelection()?.toString()) return;
                onOpen(item.id);
              }}
              className={`task-card ${dragged?.id === item.id ? 'task-drag-source' : ''} ${dropTarget?.id === item.id ? `task-card-drop-${dropTarget.side}` : ''}`}
              onDragOver={(event) => {
                if (!allowed || dragged.id === item.id || draggedLane) return;
                event.preventDefault();
                setDropTarget({
                  id: item.id,
                  side:
                    event.clientY <
                    event.currentTarget.getBoundingClientRect().top +
                      event.currentTarget.offsetHeight / 2
                      ? 'before'
                      : 'after',
                });
              }}
              draggable={canEdit && !busy}
              onDrop={(event) => {
                if (draggedLane) return;
                event.preventDefault();
                event.stopPropagation();
                setOver(false);
                setDropTarget(null);
                if (allowed && dragged.id !== item.id)
                  void move(dragged, lane.id, {
                    targetId: item.id,
                    side:
                      event.clientY <
                      event.currentTarget.getBoundingClientRect().top +
                        event.currentTarget.offsetHeight / 2
                        ? 'before'
                        : 'after',
                  });
              }}
              onDragStart={(event) => {
                if (!canEdit || busy) {
                  event.preventDefault();
                  return;
                }
                setDraggedLane(null);
                setDragged(item);
                event.dataTransfer.effectAllowed = 'move';
                event.dataTransfer.setData('text/plain', item.id);
              }}
              onDragEnd={() => {
                setDragged(null);
                setOver(false);
              }}
            >
              <Link
                className="font-medium text-blue-700 hover:underline dark:text-blue-300"
                to={`/tasks/${item.id}`}
                onClick={(event) => {
                  if (
                    event.button !== 0 ||
                    event.metaKey ||
                    event.ctrlKey ||
                    event.shiftKey ||
                    event.altKey
                  )
                    return;
                  event.preventDefault();
                  onOpen(item.id);
                }}
              >
                {item.title}
              </Link>
              <div className="mt-2 flex flex-wrap gap-2">
                <StateBadge status={item.status} label={item.statusLabel} />
                <StateBadge status={item.priority} label={item.priorityLabel} />
              </div>
              <dl className="mt-3 space-y-1 text-xs text-slate-600 dark:text-slate-300">
                <div>
                  <dt className="inline font-medium">Service: </dt>
                  <dd className="inline">{item.serviceName || 'Unassigned'}</dd>
                </div>
                <div>
                  <dt className="inline font-medium">Assigned To: </dt>
                  <dd className="inline">{item.assigneeName || 'Unassigned'}</dd>
                </div>
                {item.dueDate && (
                  <div>
                    <dt className="inline font-medium">Due: </dt>
                    <dd className="inline">{item.dueDate}</dd>
                  </div>
                )}
              </dl>
              {canEdit && (
                <>
                  <label className="field-label mt-3 block text-xs">
                    Move To
                    <Select
                      aria-label={`Move ${item.title} to`}
                      value={item.statusOption ?? item.status}
                      disabled={busy}
                      onChange={(event) => void move(item, event.target.value)}
                    >
                      {destinations
                        .filter(
                          (target) =>
                            target.choice || target.id === (item.statusOption ?? item.status),
                        )
                        .map((target) => (
                          <option key={target.id} value={target.id}>
                            {target.choice?.label || optionLabel(target.status)}
                          </option>
                        ))}
                    </Select>
                  </label>
                  <div className="mt-1 flex gap-1">
                    <button
                      className="task-icon-action"
                      disabled={busy || index === 0}
                      aria-label={`Move ${item.title} up in ${heading}`}
                      title="Move Up"
                      onClick={() =>
                        void move(item, lane.id, {
                          targetId: items[index - 1].id,
                          side: 'before',
                        })
                      }
                    >
                      <ArrowUpIcon className="h-4 w-4" aria-hidden="true" />
                    </button>
                    <button
                      className="task-icon-action"
                      disabled={busy || index === items.length - 1}
                      aria-label={`Move ${item.title} down in ${heading}`}
                      title="Move Down"
                      onClick={() =>
                        void move(item, lane.id, {
                          targetId: items[index + 1].id,
                          side: 'after',
                        })
                      }
                    >
                      <ArrowDownIcon className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </div>
                </>
              )}
            </article>
          ))
        )}
        <div ref={sentinel} aria-hidden="true" className="h-px" />
        {resource.data && resource.pending && (
          <div aria-busy="true">
            <Skeleton className="h-20 w-full" />
          </div>
        )}
        {resource.error && resource.hasMore && (
          <button className="btn-secondary" onClick={resource.loadMore}>
            Retry Loading Tasks
          </button>
        )}
        {resource.data && !total && (
          <p className="py-6 text-center text-sm text-slate-500">No tasks</p>
        )}
      </div>
    </section>
  );
}
