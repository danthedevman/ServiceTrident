import { createPortal } from 'react-dom';
import React, { useContext, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  ChatBubbleLeftRightIcon,
  XMarkIcon,
  PaperAirplaneIcon,
  ArrowPathIcon,
  PlusIcon,
  ClockIcon,
  ArrowsPointingOutIcon,
  ArrowsPointingInIcon,
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
import { Field, Notice } from '../../components/forms/fields.jsx';
import { ConfirmDeleteButton } from '../../components/confirm-delete-button.jsx';
import { AI_DEMO_EXAMPLES } from '../../../../shared/domain/ai-chat.js';

/** Feature and assistant writes keep their own endpoints; Demo AI needs no provider key. */
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
    <section className="ai-chat-settings space-y-4" aria-label="AI Chat Settings">
      <header className="ai-settings-heading">
        <span className="ai-settings-icon">
          <ChatBubbleLeftRightIcon className="h-5 w-5" aria-hidden="true" />
        </span>
        <div>
          <h2 className="font-semibold">Athena</h2>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Configure your workspace chatbot.
          </p>
        </div>
      </header>
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
      <AthenaSettings key={data.revision} data={data} refresh={refresh} />
    </section>
  );
}

function AthenaSettings({ data, refresh }) {
  const [style, setStyle] = useState(data.assistant?.responseStyle ?? 'balanced');
  const [instructions, setInstructions] = useState(data.assistant?.instructions ?? '');
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  return (
    <ValidatedForm
      className="space-y-4"
      onSubmit={async (event) => {
        event.preventDefault();
        setBusy(true);
        setError('');
        try {
          await writeApi('/ai/assistant', {
            method: 'PUT',
            body: { revision: data.revision, responseStyle: style, instructions },
          });
          await refresh();
        } catch (failure) {
          setError(failure.message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <Field label="Response Style" name="responseStyle">
        <Select value={style} onChange={(event) => setStyle(event.target.value)}>
          <option value="concise">Concise</option>
          <option value="balanced">Balanced</option>
          <option value="detailed">Detailed</option>
        </Select>
      </Field>
      <Field label="Workspace Instructions" name="assistantInstructions">
        <AutoTextarea
          rows={3}
          maxLength={2000}
          value={instructions}
          onChange={(event) => setInstructions(event.target.value)}
        />
      </Field>
      <Notice error={error} />
      <div className="flex justify-end">
        <button className="btn-primary gap-2" disabled={busy} aria-busy={busy}>
          <ChatBubbleLeftRightIcon className="h-4 w-4" aria-hidden="true" />
          Save Athena Settings
        </button>
      </div>
    </ValidatedForm>
  );
}

function contextFor(path) {
  const match = path.match(/^\/(incidents|tasks|knowledge|rcas)\/([a-f\d]{24})\/?$/i);
  if (match) return { kind: match[1], id: match[2] };
  const directEvent = path.match(/^\/events\/([a-f\d]{24})\/?$/i);
  if (directEvent) return { kind: 'events', id: directEvent[1] };
  const event = path.match(/^\/monitors\/[a-f\d]{24}\/events\/([a-f\d]{24})\/?$/i);
  return event ? { kind: 'events', id: event[1] } : undefined;
}
/** Action tokens remain in memory; saved transcripts are fetched through owner-scoped APIs. */
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
  const [fullView, setFullView] = useState(false),
    [historyOpen, setHistoryOpen] = useState(false),
    [conversations, setConversations] = useState([]),
    [scrollRequest, setScrollRequest] = useState(0);
  const savedScroll = useRef(0),
    retainedContext = useRef(null);
  useEffect(() => setFullView(false), [location.key]);
  const previousFullView = useRef(false);
  const conversationId = useRef(crypto.randomUUID());

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
    if (!busy || demo) return;
    let step = 0;
    const phases = ['thinking', 'working', 'preparing'];
    const timer = setInterval(() => {
      step = (step + 1) % phases.length;
      setPhase(phases[step]);
    }, 3000);
    return () => clearInterval(timer);
  }, [busy, demo]);
  useEffect(() => {
    if (open && !historyOpen) input.current?.focus({ preventScroll: true });
  }, [open, historyOpen]);
  useLayoutEffect(() => {
    if (open && previousFullView.current !== fullView)
      document
        .getElementById('ai-chat-panel')
        ?.querySelector(fullView ? '[aria-label="Exit Full View"]' : '[aria-label="Full View"]')
        ?.focus({ preventScroll: true });
    previousFullView.current = fullView;
  }, [fullView, open]);
  useLayoutEffect(() => {
    if (transcript.current) transcript.current.scrollTop = savedScroll.current;
  }, [fullView, open, historyOpen]);
  useLayoutEffect(() => {
    if (!scrollRequest) return;
    const root = transcript.current;
    const latest = root?.querySelector('[data-message-role="user"]:last-of-type');
    if (root && latest)
      root.scrollTop += latest.getBoundingClientRect().top - root.getBoundingClientRect().top;
  }, [scrollRequest]);
  useEffect(() => {
    if (!open || !fullView || !enabled) return;
    const main = document.getElementById('main');
    const nodes = [...main.children].filter((node) => node.id !== 'ai-chat-panel');
    const previous = nodes.map((node) => node.inert);
    nodes.forEach((node) => {
      node.inert = true;
    });
    return () =>
      nodes.forEach((node, index) => {
        node.inert = previous[index];
      });
  }, [open, fullView, enabled, location.pathname]);
  async function refreshHistory() {
    const result = await api('/ai/conversations', { toast: false });
    setConversations(result.items);
  }
  useEffect(() => {
    if (!open || !enabled) return;
    let active = true;
    api('/ai/conversations', { toast: false })
      .then((result) => {
        if (active) setConversations(result.items);
      })
      .catch((failure) => {
        if (active) setError(failure.message);
      });
    return () => {
      active = false;
    };
  }, [open, enabled]);
  function archiveCurrent() {
    if (!messages.length) return;
    // Keep the current view available while refreshed server summaries arrive; never retain tokens in history.
    const entry = {
      id: conversationId.current,
      title: messages.find((row) => row.role === 'user')?.text.slice(0, 100) || 'Conversation',
      mode: demo ? 'demo' : 'live',
      context: retainedContext.current,
      messages: messages.slice(-20).map(({ action, demoAction, ...row }) => ({
        ...row,
        ...(action
          ? {
              action: {
                kind: action.kind,
                operation: action.operation,
                title: action.title,
                changes: action.changes,
              },
            }
          : {}),
        ...(demoAction
          ? { demoAction: { label: demoAction.label, changes: demoAction.changes } }
          : {}),
        previousProposal: !!(action || demoAction) || row.previousProposal,
      })),
    };
    setConversations((rows) => [entry, ...rows.filter((row) => row.id !== entry.id)].slice(0, 20));
  }
  function newConversation(nextMode = mode) {
    if (busy) return;
    archiveCurrent();
    conversationId.current = crypto.randomUUID();
    setMessages([]);
    retainedContext.current = null;
    setPrompt('');
    setError('');
    setMode(nextMode);
    setHistoryOpen(false);
    savedScroll.current = 0;
    if (transcript.current) transcript.current.scrollTop = 0;
  }
  async function selectConversation(entry) {
    if (busy) return;
    if (entry.current) {
      setHistoryOpen(false);
      return;
    }
    setBusy(true);
    setError('');
    try {
      const { item } = await api(`/ai/conversations/${entry.id}`, { toast: false });
      archiveCurrent();
      conversationId.current = item.id;
      setMessages(item.messages);
      retainedContext.current = null;
      setMode(item.mode);
      setPrompt('');
      savedScroll.current = 0;
      setHistoryOpen(false);
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusy(false);
    }
  }
  if (!enabled || user?.role === 'user') return null;
  async function send(message, exampleId) {
    if (busy || !message.trim()) return;
    setBusy(true);
    setError('');
    setPrompt('');
    setPhase('thinking');
    setScrollRequest((value) => value + 1);
    setMessages((rows) => [...rows.slice(-18), { role: 'user', text: message }]);
    try {
      const context = contextFor(location.pathname) || retainedContext.current;
      retainedContext.current = context;
      const references = [
        ...new Map(
          messages
            .flatMap((row) => row.records ?? [])
            .filter(
              (row) =>
                ['incidents', 'tasks', 'knowledge', 'events', 'rcas'].includes(row.kind) &&
                /^[a-f\d]{24}$/i.test(row.id || ''),
            )
            .map((row) => [`${row.kind}:${row.id}`, { kind: row.kind, id: row.id }]),
        ).values(),
      ].slice(-8);
      const reply = await api('/ai/chat', {
        method: 'POST',
        toast: false,
        body: {
          message,
          conversationId: conversationId.current,
          demo,
          exampleId,
          context: demo ? undefined : context,
          references: demo ? undefined : references,
          history: demo
            ? undefined
            : messages.slice(-20).map((row) => ({
                role: row.role,
                text: `${row.applied ? (row.demo ? 'Action result: simulation only. ' : 'Action result: changes saved after user confirmation. ') : ''}${row.text}`.slice(
                  0,
                  2000,
                ),
              })),
        },
      });
      if (demo) {
        // Deliberate demo-only simulation requested by the user; live replies have no added delay.
        await new Promise((resolve) => setTimeout(resolve, 500));
        setPhase('retrieving');
        await new Promise((resolve) => setTimeout(resolve, 700));
      }
      setMessages((rows) => [...rows, { role: 'assistant', ...reply }]);
      await refreshHistory();
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusy(false);
      setPhase(null);
    }
  }
  function updateMessage(index, patch) {
    setMessages((rows) => rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }
  const historyEntries = [
    ...(messages.length
      ? [
          {
            id: conversationId.current,
            title:
              messages.find((row) => row.role === 'user')?.text.slice(0, 100) || 'Conversation',
            mode: demo ? 'demo' : 'live',
            current: true,
            messageCount: messages.length,
          },
        ]
      : []),
    ...conversations.filter((entry) => entry.id !== conversationId.current),
  ];
  const chatPanel = (
    <section
      id="ai-chat-panel"
      className={`ai-chat-panel panel${fullView ? ' ai-chat-full-view' : ''}`}
      aria-label="AI Chat"
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          setOpen(false);
          trigger.current?.focus();
        }
      }}
    >
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-200 p-4 dark:border-slate-700">
        <h2 className="font-semibold">Athena</h2>
        <div className="flex items-center gap-1">
          <button
            type="button"
            className="icon-action"
            aria-label="New Conversation"
            title="New Conversation"
            disabled={busy}
            onClick={() => newConversation()}
          >
            <PlusIcon className="h-5 w-5" aria-hidden="true" />
          </button>
          <button
            type="button"
            className="icon-action"
            aria-label="Conversation History"
            title="Conversation History"
            aria-expanded={historyOpen}
            disabled={busy}
            onClick={() => setHistoryOpen(!historyOpen)}
          >
            <ClockIcon className="h-5 w-5" aria-hidden="true" />
          </button>
          <button
            type="button"
            className="icon-action"
            aria-label={fullView ? 'Exit Full View' : 'Full View'}
            title={fullView ? 'Exit Full View' : 'Full View'}
            onClick={() => setFullView(!fullView)}
          >
            {fullView ? (
              <ArrowsPointingInIcon className="h-5 w-5" aria-hidden="true" />
            ) : (
              <ArrowsPointingOutIcon className="h-5 w-5" aria-hidden="true" />
            )}
          </button>
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
        </div>
      </header>
      {available.chatEnabled && available.demoEnabled && (
        <div className="shrink-0 border-b border-slate-200 p-3 dark:border-slate-700">
          <label className="field-label">
            Mode
            <Select
              aria-label="Mode"
              value={mode}
              disabled={busy}
              onChange={(event) => {
                newConversation(event.target.value);
              }}
            >
              <option value="live">Workspace AI</option>
              <option value="demo">Demo AI</option>
            </Select>
          </label>
        </div>
      )}
      {historyOpen ? (
        <div className="ai-chat-transcript space-y-2 p-4" aria-label="Conversations">
          <h3 className="font-semibold">Conversations</h3>
          <p className="text-xs text-slate-500">
            Up to 20 recent conversations are saved to your account across reloads and sign-ins.
            Previous action proposals cannot be applied.
          </p>
          {historyEntries.length === 0 && <p className="text-sm">No conversations yet.</p>}
          {historyEntries.map((entry) => (
            <div key={entry.id} className="flex items-center gap-2">
              <button
                type="button"
                disabled={busy}
                className="ai-conversation-entry min-w-0 flex-1"
                aria-current={entry.current ? 'true' : undefined}
                onClick={() => selectConversation(entry)}
              >
                <span className="block truncate font-medium" title={entry.title}>
                  {entry.title}
                </span>
                <span className="text-xs text-slate-500">
                  {entry.current ? 'Current · ' : ''}
                  {entry.mode === 'demo' ? 'Demo AI' : 'Workspace AI'} ·{' '}
                  {entry.messageCount ?? entry.messages?.length ?? 0} messages
                </span>
              </button>
              <ConfirmDeleteButton
                title="Delete Conversation"
                confirmation={`Delete “${entry.title}” from your conversation history?`}
                className="btn-secondary shrink-0"
                disabled={busy || !conversations.some((row) => row.id === entry.id)}
                onConfirm={async () => {
                  await api(`/ai/conversations/${entry.id}`, { method: 'DELETE', toast: false });
                  if (entry.id === conversationId.current) {
                    conversationId.current = crypto.randomUUID();
                    setMessages([]);
                    retainedContext.current = null;
                  }
                  await refreshHistory();
                }}
              >
                Delete
              </ConfirmDeleteButton>
            </div>
          ))}
          <Notice error={error} />
        </div>
      ) : (
        <>
          <div
            ref={transcript}
            onScroll={(event) => {
              savedScroll.current = event.currentTarget.scrollTop;
            }}
            className="ai-chat-transcript space-y-4 p-4"
            aria-live="polite"
            aria-busy={busy}
          >
            {!messages.length && (
              <p className="text-sm">
                {demo
                  ? 'Choose an example below to explore the assistant.'
                  : 'Hi, I’m Athena. How can I help?'}
              </p>
            )}
            {messages.map((message, index) => (
              <article
                key={index}
                data-message-role={message.role}
                className="space-y-2 rounded-lg border border-slate-200 p-3 dark:border-slate-700"
              >
                <h3 className="text-sm font-semibold">
                  {message.role === 'user' ? 'You' : message.demo ? 'Athena · Demo' : 'Athena'}
                </h3>
                <p className="whitespace-pre-wrap break-words text-sm">
                  <ResponseText text={message.text} records={message.records} />
                </p>
                {message.navigation?.length > 0 && (
                  <nav aria-label="Athena suggestions" className="flex flex-wrap gap-2">
                    {message.navigation.map((destination) => (
                      <Link
                        key={destination.id}
                        to={destination.href}
                        className="btn-secondary text-sm"
                        onClick={() => setOpen(false)}
                      >
                        {destination.label}
                      </Link>
                    ))}
                  </nav>
                )}
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
                {message.previousProposal && !message.applied && (
                  <p className="text-xs text-slate-500">
                    Previous action proposal. Ask again to review a fresh action.
                  </p>
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
                                impact: 'Impact',
                                timeline: 'Timeline',
                                rootCause: 'Root Cause',
                                contributingFactors: 'Contributing Factors',
                                correctiveActions: 'Corrective Actions',
                                lessonsLearned: 'Lessons Learned',
                                incidentIds: 'Related Incidents',
                                taskIds: 'Related Tasks',
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
                              {Array.isArray(value) ? (
                                value.map((id, index) => (
                                  <React.Fragment key={id}>
                                    {index > 0 && ', '}
                                    <RecordLink
                                      className="underline"
                                      to={`/${key === 'incidentIds' ? 'incidents' : 'tasks'}/${id}`}
                                    >
                                      {messages
                                        .flatMap((row) => row.records ?? [])
                                        .find((row) => row.id === id)?.title ||
                                        (key === 'incidentIds' ? 'Incident' : 'Task')}
                                    </RecordLink>
                                  </React.Fragment>
                                ))
                              ) : key === 'assigneeId' ? (
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
                    {!message.previousProposal && (
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
                    )}
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
                  className="h-5 w-5 shrink-0 text-blue-700 motion-safe:animate-spin dark:text-blue-400"
                  aria-hidden="true"
                />
                <div>
                  <p className="font-medium">
                    {phase === 'thinking'
                      ? 'Thinking'
                      : phase === 'retrieving'
                        ? 'Retrieving Example Data'
                        : phase === 'preparing'
                          ? 'Preparing a response'
                          : 'Working on your request'}
                  </p>
                </div>
              </div>
            )}
            <Notice error={error} />
          </div>
          {demo ? (
            <div className="ai-chat-examples shrink-0 border-t border-slate-200 p-3 dark:border-slate-700">
              <h3 className="mb-2 text-sm font-semibold">Common Searches</h3>
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
        </>
      )}
    </section>
  );
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
      {open && (fullView ? createPortal(chatPanel, document.getElementById('main')) : chatPanel)}
    </>
  );
}
