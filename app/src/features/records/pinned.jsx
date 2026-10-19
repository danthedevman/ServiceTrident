import React, { useState } from 'react';
import { MapPinIcon, ArrowUpIcon, ArrowDownIcon } from '@heroicons/react/24/outline';
import { useLocation } from 'react-router-dom';
import { pinPath, PIN_SCOPE_KEYS } from '../../../../shared/domain/pins.js';
import { useResource } from '../../data/use-resource.js';
import { useSave } from '../../data/use-save.js';
import { RecordLink } from '../../components/record-navigation.jsx';
import { PageTitleRow } from '../../components/page-title.jsx';
import { Modal } from '../../components/modal.jsx';
import { ConfirmDeleteButton } from '../../components/confirm-delete-button.jsx';
import { Select } from '../../components/forms/select.jsx';
import { Field, Notice } from '../../components/forms/fields.jsx';
import { ValidatedForm } from '../../components/forms/validated-form.jsx';
import { Skeleton } from '../../components/skeleton.jsx';
import { newId } from '../../lib/identifiers.js';
const pinTypes = {
  incidents: 'Incident',
  tasks: 'Task',
  knowledge: 'Article',
  rcas: 'RCA',
  services: 'Service',
  collections: 'Collection',
  groups: 'Group',
  workspace: 'User',
  integrations: 'Integration',
  monitors: 'Monitor',
  events: 'Event',
  alerts: 'Alert',
  'on-call': 'On Call',
  records: 'Record',
};
function PinDetails({ item }) {
  const path = item.path.split('?')[0];
  const type = path.startsWith('/knowledge/bases/')
    ? 'Knowledge Base'
    : /\/monitors\/[^/]+\/events\//.test(path)
      ? 'Event'
      : path.startsWith('/settings/service-accounts/')
        ? 'Service Account'
        : pinTypes[path.split('/')[1]] || 'Record';
  return (
    <p className="text-xs text-slate-500 dark:text-slate-400">
      <span>{type}</span>
      {item.number && <span> · {item.number}</span>}
      {item.context && <span className="mt-1 block break-words">{item.context}</span>}
    </p>
  );
}
const safePinText = (value) =>
  String(value || '')
    .split('')
    .map((c) => (c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127 ? ' ' : c))
    .join('')
    .trim()
    .slice(0, 160);
export function PinRecordAction({ item, kind, to }) {
  const location = useLocation();
  const scope = new URLSearchParams(location.search);
  for (const key of [...scope.keys()]) if (!PIN_SCOPE_KEYS.includes(key)) scope.delete(key);
  const pathname =
    to ||
    location.pathname +
      (location.pathname.startsWith('/records/') && scope.size ? `?${scope}` : '');
  const state = useResource(pinPath(pathname) ? '/pins' : null);
  const [open, setOpen] = useState(false),
    [group, setGroup] = useState('general'),
    [name, setName] = useState('');
  const save = useSave();
  const number = item?.number || item?.recordNumber;
  const context = item?.serviceName
    ? `Service: ${item.serviceName}`
    : item?.knowledgeBaseTitle
      ? `Knowledge Base: ${item.knowledgeBaseTitle}`
      : item?.incidentTitle
        ? `Incident: ${item.incidentTitle}`
        : '';
  const details = {
    path: pathname,
    ...(/^[A-Z]{1,12}\d{7,16}$/.test(number || '') ? { number } : {}),
    ...(context ? { context: safePinText(context) } : {}),
  };
  if (!pinPath(pathname)) return null;
  const pinned = state.data?.items.some((p) => p.path === pathname);
  return (
    <>
      <button
        type="button"
        disabled={!state.data || pinned}
        onClick={() => {
          setGroup(state.data.groups[0].id);
          setOpen(true);
        }}
      >
        <MapPinIcon className="h-5 w-5" aria-hidden="true" />
        {pinned ? 'Pinned' : 'Pin Record'}
      </button>
      {open && (
        <Modal
          title="Pin Record"
          busy={save.busy}
          onClose={() => setOpen(false)}
          footer={
            <>
              <button type="button" className="btn-secondary" onClick={() => setOpen(false)}>
                Cancel
              </button>
              <button
                type="submit"
                form="pin-record-form"
                className="btn-primary"
                disabled={save.busy}
              >
                Pin
              </button>
            </>
          }
        >
          <ValidatedForm
            id="pin-record-form"
            className="space-y-4"
            onSubmit={(e, report) => {
              e.preventDefault();
              if (group === 'new' && !name.trim()) {
                report({ groupName: 'Enter a group name.' });
                return;
              }
              const groupId = group === 'new' ? newId() : group;
              save.run(
                '/pins',
                'PUT',
                {
                  revision: state.data.revision,
                  groups:
                    group === 'new'
                      ? [...state.data.groups, { id: groupId, name }]
                      : state.data.groups,
                  items: [
                    ...state.data.items,
                    {
                      ...details,
                      label: (
                        item?.title ||
                        item?.name ||
                        item?.displayName ||
                        item?.number ||
                        item?.action ||
                        kind ||
                        'Record'
                      ).slice(0, 160),
                      groupId,
                    },
                  ],
                },
                () => {
                  setOpen(false);
                  void state.refresh();
                },
              );
            }}
          >
            <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-700">
              <p className="mb-1 break-words font-medium">
                {safePinText(
                  item?.title || item?.name || item?.displayName || item?.number || 'Record',
                )}
              </p>
              <PinDetails item={details} />
            </div>
            <Notice error={save.error} />
            <Field label="Group">
              <Select value={group} onChange={(e) => setGroup(e.target.value)}>
                {state.data.groups.map((g) => (
                  <option value={g.id} key={g.id}>
                    {g.name}
                  </option>
                ))}
                {state.data.groups.length < 20 && <option value="new">New Group</option>}
              </Select>
            </Field>
            {group === 'new' && (
              <Field name="groupName" label="Group Name">
                <input
                  name="groupName"
                  required
                  maxLength={80}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </Field>
            )}
          </ValidatedForm>
        </Modal>
      )}
    </>
  );
}
export function PinnedPage() {
  const state = useResource('/pins', 30000),
    save = useSave();
  const update = (items) =>
    save.run('/pins', 'PUT', { ...state.data, items }, () => void state.refresh());
  const move = (item, offset) => {
    const items = [...state.data.items],
      siblings = items.filter((r) => r.groupId === item.groupId);
    const other = siblings[siblings.indexOf(item) + offset];
    if (!other) return;
    const a = items.indexOf(item),
      b = items.indexOf(other);
    [items[a], items[b]] = [items[b], items[a]];
    update(items);
  };
  return (
    <div className="space-y-5">
      <PageTitleRow title="Pinned" />
      <p className="text-sm text-slate-500">
        Your saved record links. Open a record’s actions to pin it to a group. Record permissions
        still apply.
      </p>
      <Notice error={state.error || save.error} />
      {!state.data
        ? !state.error && <Skeleton className="h-48 w-full" />
        : state.data.groups.map((group) => {
            const items = state.data.items.filter((r) => r.groupId === group.id);
            return (
              <section className="panel space-y-3 p-5" key={group.id} aria-label={group.name}>
                <h2 className="font-semibold">{group.name}</h2>
                {!items.length ? (
                  <p className="text-sm text-slate-500">No pinned records in this group.</p>
                ) : (
                  <ol className="space-y-2">
                    {items.map((item, index) => (
                      <li
                        key={item.path}
                        className="flex min-w-0 flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 p-3 dark:border-slate-700"
                      >
                        <div className="min-w-0 flex-1 space-y-1">
                          <RecordLink
                            className="block truncate font-medium text-blue-700 dark:text-blue-300"
                            title={item.label}
                            to={item.path}
                          >
                            {item.label}
                          </RecordLink>
                          <PinDetails item={item} />
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <button
                            type="button"
                            className="p-1"
                            disabled={save.busy || index === 0}
                            aria-label={`Move ${item.label} up`}
                            onClick={() => move(item, -1)}
                          >
                            <ArrowUpIcon className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            className="p-1"
                            disabled={save.busy || index === items.length - 1}
                            aria-label={`Move ${item.label} down`}
                            onClick={() => move(item, 1)}
                          >
                            <ArrowDownIcon className="h-4 w-4" />
                          </button>
                          <ConfirmDeleteButton
                            className="text-sm"
                            confirmLabel="Unpin"
                            title="Unpin Record?"
                            confirmation={`Unpin “${item.label}”? The record will remain available.`}
                            onConfirm={() =>
                              update(state.data.items.filter((p) => p.path !== item.path))
                            }
                          >
                            Unpin
                          </ConfirmDeleteButton>
                        </div>
                      </li>
                    ))}
                  </ol>
                )}
              </section>
            );
          })}
    </div>
  );
}
