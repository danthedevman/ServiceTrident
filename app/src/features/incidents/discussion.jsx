import { ValidatedForm } from '../../components/forms/validated-form.jsx';
import { DateTime } from '../../preferences/date-time.jsx';
import { Select } from '../../components/forms/select.jsx';
import React, { useState } from 'react';
import {
  ChatBubbleLeftRightIcon,
  LockClosedIcon,
  TableCellsIcon,
} from '@heroicons/react/24/outline';
import { useSave } from '../../data/use-save.js';
import { Field, Notice } from '../../components/forms/fields.jsx';
import { AutoTextarea } from '../../components/forms/auto-textarea.jsx';
import { DataTable } from '../../components/data-table.jsx';

/** Public comments notify participants; internal notes are returned only to authorized staff. */
export function IncidentDiscussion({ incidentId, comments, role }) {
  const save = useSave(),
    [body, setBody] = useState(''),
    [kind, setKind] = useState('comment'),
    [filter, setFilter] = useState('all'),
    [table, setTable] = useState(false),
    [limit, setLimit] = useState(10);
  const staff = ['admin', 'responder'].includes(role);
  const visible = comments
    .filter(
      (entry) =>
        (staff || entry.kind !== 'work_note') && (filter === 'all' || entry.kind === filter),
    )
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  return (
    <section className="min-w-0 space-y-5 p-4 sm:p-5">
      {role !== 'viewer' && (
        <ValidatedForm
          className="space-y-4 border-b border-slate-200 pb-5 dark:border-slate-700"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            save.run(`/incidents/${incidentId}/comments`, 'POST', { body, kind }, () =>
              setBody(''),
            );
          }}
        >
          <h2 className="text-lg font-semibold">
            Add {kind === 'work_note' ? 'work note' : 'comment'}
          </h2>
          <Notice error={save.error} />
          {staff && (
            <div className="flex flex-wrap gap-2" role="group" aria-label="Message type">
              {[
                ['comment', 'Comment', ChatBubbleLeftRightIcon],
                ['work_note', 'Work note', LockClosedIcon],
              ].map(([value, label, Icon]) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={kind === value}
                  disabled={save.busy}
                  className={kind === value ? 'btn-primary' : 'btn-secondary'}
                  onClick={() => setKind(value)}
                >
                  <Icon className="h-4 w-4" aria-hidden="true" />
                  {label}
                </button>
              ))}
            </div>
          )}
          <p id="discussion-visibility" className="text-sm font-medium">
            {kind === 'work_note'
              ? 'Private · Responders and admins only'
              : 'Shared · Visible to everyone who can read this incident'}
          </p>
          <Field
            name="body"
            label={kind === 'work_note' ? 'Internal work note' : 'Comment'}
            errors={save.fields}
          >
            <AutoTextarea
              className="discussion-composer"
              aria-describedby="discussion-visibility"
              placeholder={
                kind === 'work_note'
                  ? 'Document investigation steps, findings, or a handoff…'
                  : 'Share an update or ask a question…'
              }
              disabled={save.busy}
              value={body}
              onChange={(event) => setBody(event.target.value)}
              maxLength={5000}
            />
          </Field>
          <p className="text-sm text-slate-500">
            {kind === 'work_note'
              ? 'Internal notes never send end-user notifications.'
              : 'Comments email the person who opened the incident and the person it was opened for, excluding you. Email delivery requires configured SMTP.'}
          </p>
          <div className="form-actions">
            <button className="btn-primary" disabled={save.busy || !body.trim()}>
              {save.busy ? 'Posting…' : kind === 'work_note' ? 'Add Work Note' : 'Post comment'}
            </button>
          </div>
        </ValidatedForm>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-semibold">
          Conversation{' '}
          <span className="text-sm font-normal text-slate-500">({visible.length})</span>
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          {staff && (
            <label className="flex items-center gap-2 text-sm">
              <span className="sr-only">Conversation filter</span>
              <Select
                className="!mt-0 !h-9 !py-0"
                aria-label="Conversation filter"
                value={filter}
                onChange={(event) => {
                  setFilter(event.target.value);
                  setLimit(10);
                }}
              >
                <option value="all">All messages</option>
                <option value="comment">Comments</option>
                <option value="work_note">Work notes</option>
              </Select>
            </label>
          )}
          <button
            type="button"
            className="btn-secondary !h-9 !w-9 !p-0"
            aria-label={table ? 'Conversation view' : 'Table view'}
            title={table ? 'Conversation view' : 'Table view'}
            aria-pressed={table}
            onClick={() => setTable(!table)}
          >
            {table ? (
              <ChatBubbleLeftRightIcon className="h-4 w-4" aria-hidden="true" />
            ) : (
              <TableCellsIcon className="h-4 w-4" aria-hidden="true" />
            )}
          </button>
        </div>
      </div>
      {!table ? (
        <>
          <p className="text-xs text-slate-500">Newest first · Latest 200 messages</p>
          {!visible.length && (
            <p className="py-6 text-sm text-slate-500">
              {comments.length
                ? 'No messages match this filter.'
                : 'No messages yet. Updates will appear here.'}
            </p>
          )}
          <ol className="divide-y divide-slate-200 dark:divide-slate-800">
            {visible.slice(0, limit).map((entry) => {
              const internal = entry.kind === 'work_note';
              const Icon = internal ? LockClosedIcon : ChatBubbleLeftRightIcon;
              return (
                <li key={entry.id} className="flex gap-3 py-5">
                  <span
                    className={`mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border ${internal ? 'border-amber-300 text-amber-700 dark:border-amber-700 dark:text-amber-300' : 'border-blue-200 text-blue-700 dark:border-blue-800 dark:text-blue-300'}`}
                  >
                    <Icon className="h-4 w-4" aria-hidden="true" />
                  </span>
                  <article className="min-w-0 flex-1 space-y-2">
                    <header className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <span className="break-words text-sm font-semibold">
                        {entry.author || 'Workspace member'}
                      </span>
                      <span
                        className={`text-xs font-medium ${internal ? 'text-amber-700 dark:text-amber-300' : 'text-slate-500'}`}
                      >
                        {internal ? 'Work note · Internal' : 'Comment · Shared'}
                      </span>
                      <time
                        className="text-xs text-slate-500 sm:ml-auto"
                        dateTime={entry.createdAt}
                      >
                        {<DateTime value={entry.createdAt} />}
                      </time>
                    </header>
                    <p className="whitespace-pre-wrap text-sm leading-7 [overflow-wrap:anywhere]">
                      {entry.body}
                    </p>
                  </article>
                </li>
              );
            })}
          </ol>
          {visible.length > limit && (
            <button type="button" className="btn-secondary" onClick={() => setLimit(limit + 10)}>
              Show older messages
            </button>
          )}
        </>
      ) : (
        <DataTable
          source={`comments?recordId=${incidentId}`}
          title="Comments and Notes"
          rows={visible}
          rowKey={(row) => row.id}
          filename="incident-comments.csv"
          defaultSort="createdAt:desc"
          dateColumn="createdAt"
          columns={[
            { key: 'createdAt', label: 'Time', value: (row) => row.createdAt },
            { key: 'author', label: 'Author', value: (row) => row.author },
            {
              key: 'kind',
              label: 'Type',
              value: (row) => (row.kind === 'work_note' ? 'Internal work note' : 'Comment'),
            },
            {
              key: 'body',
              label: 'Message',
              value: (row) => row.body,
              render: (row) => <p className="whitespace-pre-wrap break-words">{row.body}</p>,
            },
          ]}
        />
      )}
    </section>
  );
}
