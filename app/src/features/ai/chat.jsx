import React, { useContext, useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import {
  ChatBubbleLeftRightIcon,
  XMarkIcon,
  PaperAirplaneIcon,
  ArrowPathIcon,
} from '@heroicons/react/24/outline';
import { RecordLink } from '../../components/record-navigation.jsx';
import { AuthContext } from '../../auth/auth-context.js';
import { useResource } from '../../data/use-resource.js';
import { api } from '../../data/api.js';
import { writeApi } from '../../data/query-client.js';
import { useUiPreferences } from '../../preferences/ui-preferences.jsx';
import { AutoTextarea } from '../../components/forms/auto-textarea.jsx';
import { ValidatedForm } from '../../components/forms/validated-form.jsx';
import { Select } from '../../components/forms/select.jsx';
import { Toggle } from '../../components/forms/toggle.jsx';
import { Notice } from '../../components/forms/fields.jsx';
import { ConfirmDeleteButton } from '../../components/confirm-delete-button.jsx';
import { AI_DEMO_EXAMPLES } from '../../../../shared/domain/ai-chat.js';

/** Workspace controls are separate from write-only provider credentials, so Demo AI needs no key. */
export function AIChatSettings({ data, refresh }) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [checked, setChecked] = useState({
    chatEnabled: data.chatEnabled,
    demoEnabled: data.demoEnabled,
  });
  useEffect(
    () => setChecked({ chatEnabled: data.chatEnabled, demoEnabled: data.demoEnabled }),
    [data.chatEnabled, data.demoEnabled],
  );
  async function change(key, value) {
    setBusy(true);
    setError('');
    setChecked((current) => ({ ...current, [key]: value }));
    try {
      await writeApi('/ai/features', {
        method: 'PUT',
        body: {
          revision: data.revision,
          chatEnabled: data.chatEnabled,
          demoEnabled: data.demoEnabled,
          [key]: value,
        },
      });
      await refresh();
    } catch (failure) {
      setError(failure.message);
      setChecked({ chatEnabled: data.chatEnabled, demoEnabled: data.demoEnabled });
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel space-y-4 p-6" aria-label="AI Chat Settings">
      <h2 className="font-semibold">AI Chat</h2>
      <label className="field-label flex items-center justify-between gap-3">
        Enable AI Chat
        <Toggle
          disabled={busy || !data.provider?.configured}
          checked={checked.chatEnabled}
          onChange={(event) => change('chatEnabled', event.target.checked)}
        />
      </label>
      <label className="field-label flex items-center justify-between gap-3">
        Enable Demo AI
        <Toggle
          disabled={busy || !data.demoAvailable}
          checked={checked.demoEnabled}
          onChange={(event) => change('demoEnabled', event.target.checked)}
        />
      </label>
      <p className="text-sm text-slate-500">
        Demo AI is available while a demo dataset is active. Six predefined examples use fictional
        output, need no provider, and simulate actions without changing records.
      </p>
      <Notice error={error} />
    </section>
  );
}
function contextFor(path) {
  const match = path.match(/^\/(incidents|tasks|knowledge)\/([a-f\d]{24})\/?$/i);
  if (match) return { kind: match[1], id: match[2] };
  const event = path.match(/^\/monitors\/[a-f\d]{24}\/events\/([a-f\d]{24})\/?$/i);
  return event ? { kind: 'events', id: event[1] } : undefined;
}
/** Conversation and action tokens live only in memory, scoped by Layout's signed-in identity/role. */
function ResponseText({ text, records = [] }) {
  return text.split(/(\[\d{1,2}\])/g).map((part, index) => {
    const match = part.match(/^\[(\d{1,2})\]$/);
    const record = match ? records[Number(match[1]) - 1] : null;
    return record?.href ? (
      <RecordLink
        key={index}
        to={record.href}
        recordLabel={record.title}
        title={record.title}
        className="underline"
        aria-label={`View ${record.title}`}
      >
        {part}
      </RecordLink>
    ) : (
      <React.Fragment key={index}>{part}</React.Fragment>
    );
  });
}
export function FloatingAIChat() {
  const { user } = useContext(AuthContext);
  const preferences = useUiPreferences();
  const settings = useResource(user?.role !== 'user' ? '/ai/settings' : null, 30000);
  const location = useLocation();
  const [open, setOpen] = useState(false),
    [mode, setMode] = useState('live');
  const [phase, setPhase] = useState(null);
  const [prompt, setPrompt] = useState(''),
    [messages, setMessages] = useState([]);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const input = useRef(null),
    transcript = useRef(null),
    trigger = useRef(null);
  const available = settings.data;
  const enabled = preferences.aiChat && (available?.chatEnabled || available?.demoEnabled);
  const demo = mode === 'demo' || !available?.chatEnabled;
  useEffect(() => {
    if (open) input.current?.focus();
  }, [open]);
  useEffect(() => {
    if (open && transcript.current) transcript.current.scrollTop = transcript.current.scrollHeight;
  }, [messages, busy, open]);
  if (!enabled || user?.role === 'user') return null;
  async function send(message, exampleId) {
    if (busy || !message.trim()) return;
    setBusy(true);
    setError('');
    setPrompt('');
    setPhase(demo ? 'thinking' : 'working');
    setMessages((rows) => [...rows.slice(-18), { role: 'user', text: message }]);
    try {
      const reply = await api('/ai/chat', {
        method: 'POST',
        toast: false,
        body: {
          message,
          demo,
          exampleId,
          context: demo ? undefined : contextFor(location.pathname),
          history: demo
            ? undefined
            : messages.slice(-6).map((row) => ({ role: row.role, text: row.text.slice(0, 2000) })),
        },
      });
      if (demo) {
        // Deliberate demo-only simulation requested by the user; live replies have no added delay.
        await new Promise((resolve) => setTimeout(resolve, 500));
        setPhase('retrieving');
        await new Promise((resolve) => setTimeout(resolve, 700));
      }
      setMessages((rows) => [...rows, { role: 'assistant', ...reply }]);
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusy(false);
      setPhase(null);
      input.current?.focus();
    }
  }
  function updateMessage(index, patch) {
    setMessages((rows) => rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }
  return (
    <>
      <button
        ref={trigger}
        type="button"
        className="ai-chat-launch btn-primary"
        aria-label={open ? 'Close AI Chat' : 'Open AI Chat'}
        aria-expanded={open}
        aria-controls="ai-chat-panel"
        onClick={() => setOpen(!open)}
      >
        {open ? (
          <XMarkIcon className="h-7 w-7" aria-hidden="true" />
        ) : (
          <ChatBubbleLeftRightIcon className="h-7 w-7" aria-hidden="true" />
        )}
      </button>
      {open && (
        <section
          id="ai-chat-panel"
          className="ai-chat-panel panel"
          aria-label="AI Chat"
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              setOpen(false);
              trigger.current?.focus();
            }
          }}
        >
          <header className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-200 p-4 dark:border-slate-700">
            <h2 className="font-semibold">AI Chat</h2>
            <button
              type="button"
              className="icon-action"
              aria-label="Close AI Chat"
              onClick={() => {
                setOpen(false);
                trigger.current?.focus();
              }}
            >
              <XMarkIcon className="h-5 w-5" />
            </button>
          </header>
          <div className="shrink-0 space-y-2 border-b border-slate-200 p-3 dark:border-slate-700">
            {available.chatEnabled && available.demoEnabled && (
              <label className="field-label">
                Mode
                <Select
                  aria-label="Mode"
                  value={mode}
                  disabled={busy}
                  onChange={(event) => {
                    setMode(event.target.value);
                    setMessages([]);
                    setError('');
                  }}
                >
                  <option value="live">Workspace AI</option>
                  <option value="demo">Demo AI</option>
                </Select>
              </label>
            )}
            <p className="text-xs text-slate-500">
              {demo
                ? 'Demo AI · fictional output and simulated actions.'
                : 'Uses authorized workspace context. Review cited evidence and confirm any record changes.'}
            </p>
            <button
              type="button"
              className="text-sm underline"
              disabled={busy}
              onClick={() => {
                setMessages([]);
                setError('');
              }}
            >
              New Conversation
            </button>
          </div>
          <div
            ref={transcript}
            className="ai-chat-transcript space-y-4 p-4"
            aria-live="polite"
            aria-busy={busy}
          >
            {!messages.length && (
              <p className="text-sm">
                {demo
                  ? 'Choose an example below to explore the assistant.'
                  : 'Ask about incidents, assigned work, failed checks, runbooks, or a postmortem. Open a record to include its context.'}
              </p>
            )}
            {messages.map((message, index) => (
              <article
                key={index}
                className="space-y-2 rounded-lg border border-slate-200 p-3 dark:border-slate-700"
              >
                <h3 className="text-sm font-semibold">
                  {message.role === 'user' ? 'You' : message.demo ? 'Demo Assistant' : 'Assistant'}
                </h3>
                <p className="whitespace-pre-wrap break-words text-sm">
                  <ResponseText text={message.text} records={message.records} />
                </p>
                {message.filters && (
                  <p className="text-xs text-slate-500">
                    Search: {message.filters.kind} · {message.filters.search || 'Recent records'}
                    {message.filters.status ? ` · ${message.filters.status}` : ''}
                    {message.filters.assignedToMe ? ' · Assigned to you' : ''} · Up to{' '}
                    {message.filters.limit} matches
                  </p>
                )}
                {message.records?.length > 0 && (
                  <ol className="space-y-2 text-sm">
                    {message.records.map((row, i) => (
                      <li
                        key={row.id ?? i}
                        className="rounded-md bg-slate-50 p-2 dark:bg-slate-800"
                      >
                        {row.href ? (
                          <RecordLink className="underline" to={row.href}>
                            [{i + 1}] {row.number ? `${row.number} · ` : ''}
                            {row.title}
                          </RecordLink>
                        ) : (
                          <strong>{row.title}</strong>
                        )}
                        <p className="text-xs text-slate-500">
                          {row.type ?? row.kind} · {row.status ?? 'Recorded'}
                          {row.detail ? ` · ${row.detail}` : ''}
                        </p>
                      </li>
                    ))}
                  </ol>
                )}
                {(message.action || message.demoAction) && !message.applied && (
                  <div className="space-y-2 border-t border-slate-200 pt-2 dark:border-slate-700">
                    <h4 className="text-sm font-semibold">Proposed Changes</h4>
                    <p className="text-sm">
                      {message.action
                        ? `${message.action.operation} · ${message.action.title}`
                        : message.demoAction.label}
                    </p>
                    <dl className="space-y-1 text-sm">
                      {Object.entries((message.action ?? message.demoAction).changes).map(
                        ([key, value]) => (
                          <div key={key}>
                            <dt className="font-medium">
                              {{
                                title: 'Title',
                                description: 'Description',
                                summary: 'Summary',
                                content: 'Content',
                                status: 'Status',
                                priority: 'Priority',
                                severity: 'Severity',
                                resolutionNotes: 'Resolution Notes',
                                assigneeId: 'Assigned To',
                                serviceId: 'Service',
                              }[key] ?? key}
                            </dt>
                            <dd className="whitespace-pre-wrap break-words">
                              {key === 'assigneeId' ? (
                                user.displayName || 'Your account'
                              ) : key === 'serviceId' ? (
                                <RecordLink className="underline" to={`/services/${value}`}>
                                  View Service
                                </RecordLink>
                              ) : (
                                value
                              )}
                            </dd>
                          </div>
                        ),
                      )}
                    </dl>
                    <ConfirmDeleteButton
                      className="btn-primary"
                      title="Confirm AI Action"
                      busyLabel="Applying…"
                      confirmLabel={message.demo ? 'Simulate Action' : 'Apply Changes'}
                      confirmClassName="btn-primary"
                      confirmation={
                        message.demo
                          ? 'Simulate this action? No workspace record will be changed.'
                          : `Apply these reviewed changes to “${message.action.title}”? This may trigger configured notifications. Unsaved edits in your form are preserved and may need reconciliation.`
                      }
                      onConfirm={async () => {
                        let result;
                        if (!message.demo)
                          result = await writeApi('/ai/actions', {
                            method: 'POST',
                            body: { token: message.action.token, confirm: true },
                          });
                        const record = result?.item ?? result?.incident;
                        updateMessage(index, {
                          applied: true,
                          action: null,
                          demoAction: null,
                          ...(message.demo
                            ? {
                                records: message.records.map((row) =>
                                  row.type === 'Incident'
                                    ? {
                                        ...row,
                                        status: 'Resolved',
                                        detail: 'Recovery verified by successful checks',
                                      }
                                    : row,
                                ),
                              }
                            : {}),
                          ...(record
                            ? {
                                records: [
                                  {
                                    ...record,
                                    kind: message.action.kind,
                                    href: `/${message.action.kind}/${record.id}`,
                                  },
                                ],
                              }
                            : {}),
                        });
                      }}
                    >
                      {message.demo ? 'Simulate Action' : 'Review and Apply'}
                    </ConfirmDeleteButton>
                  </div>
                )}
                {message.applied && (
                  <p role="status" className="text-sm">
                    {message.demo
                      ? 'Simulated: incident resolved. No record was changed.'
                      : 'Changes saved. Open records and lists have refreshed.'}
                  </p>
                )}
              </article>
            ))}
            {busy && phase && (
              <div
                role="status"
                className="ai-chat-progress flex items-center gap-3 rounded-lg border border-slate-200 p-3 text-sm dark:border-slate-700"
              >
                <ArrowPathIcon
                  className="h-4 w-4 shrink-0 motion-safe:animate-spin"
                  aria-hidden="true"
                />
                <div>
                  <p className="font-medium">
                    {phase === 'thinking'
                      ? 'Thinking'
                      : phase === 'retrieving'
                        ? 'Retrieving Example Data'
                        : 'Thinking and Retrieving Authorized Context'}
                  </p>
                  {demo && (
                    <p className="text-xs text-slate-500">
                      Demo simulation · links use the active demo dataset.
                    </p>
                  )}
                </div>
              </div>
            )}
            <Notice error={error} />
          </div>
          {demo ? (
            <div className="ai-chat-examples shrink-0 border-t border-slate-200 p-3 dark:border-slate-700">
              <h3 className="mb-2 text-sm font-semibold">Six Common Searches</h3>
              <div className="grid grid-cols-2 gap-2">
                {AI_DEMO_EXAMPLES.map((example) => (
                  <button
                    type="button"
                    className="btn-secondary text-left text-xs"
                    disabled={busy}
                    key={example.id}
                    onClick={() => send(example.prompt, example.id)}
                  >
                    {example.label}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <ValidatedForm
              className="shrink-0 space-y-2 border-t border-slate-200 p-3 dark:border-slate-700"
              onSubmit={(event) => {
                event.preventDefault();
                send(prompt);
              }}
            >
              <label className="field-label">
                Message
                <AutoTextarea
                  ref={input}
                  rows={2}
                  maxLength={2000}
                  required
                  value={prompt}
                  onChange={(event) => setPrompt(event.target.value)}
                />
              </label>
              <button className="btn-primary" disabled={busy || !prompt.trim()} aria-busy={busy}>
                <PaperAirplaneIcon className="h-4 w-4" aria-hidden="true" />
                Send
              </button>
            </ValidatedForm>
          )}
        </section>
      )}
    </>
  );
}
