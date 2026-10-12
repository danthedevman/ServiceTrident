import { ValidatedForm } from '../../components/forms/validated-form.jsx';
import { AutoTextarea } from '../../components/forms/auto-textarea.jsx';
import { RecordActions } from '../../components/record-actions.jsx';
import React, { useContext, useState } from 'react';
import { Link } from 'react-router-dom';
import { AuthContext } from '../../auth/auth-context.js';
import { useResource } from '../../data/use-resource.js';
import { api } from '../../data/api.js';
import { writeApi } from '../../data/query-client.js';
import { useUiPreferences } from '../../preferences/ui-preferences.jsx';
import { Field, Notice } from '../../components/forms/fields.jsx';
import { Select } from '../../components/forms/select.jsx';
import { Toggle } from '../../components/forms/toggle.jsx';
import { ConfirmDeleteButton } from '../../components/confirm-delete-button.jsx';

function useAI() {
  const { user } = useContext(AuthContext);
  const settings = useResource(user?.role !== 'user' ? '/ai/settings' : null, 30000);
  const preferences = useUiPreferences();
  return { available: !!settings.data?.provider?.configured, settings, preferences, user };
}

/** Provider credentials are write-only and never persisted in browser storage. */
export function AIProviderPage() {
  const { settings, user } = useAI();
  if (user?.role !== 'admin') return <Notice error="Workspace admin access is required." />;
  if (!settings.data) return <Notice error={settings.error} />;
  return (
    <ProviderForm
      key={`${settings.data.revision}:${settings.data.provider?.type}`}
      data={settings.data}
      refresh={settings.refresh}
    />
  );
}
function ProviderForm({ data, refresh }) {
  const [type, setType] = useState(data.provider?.type ?? 'openai');
  const [model, setModel] = useState(data.provider?.model ?? '');
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [message, setMessage] = useState('');
  return (
    <ValidatedForm
      className="form-page form-body"
      onSubmit={async (event) => {
        event.preventDefault();
        setBusy(true);
        setError('');
        try {
          await writeApi('/ai/settings', {
            method: 'PUT',
            body: { type, model, apiKey: key, revision: data.revision },
          });
          setKey('');
          await refresh();
        } catch (failure) {
          setError(failure.message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <p>
        Connect a workspace AI provider to enable summaries, knowledge drafting, and answers. Each
        user can turn features off in Profile settings. Selected record text and prompts are sent to
        your provider; generated content requires review.
      </p>
      <Field label="Provider" name="aiProvider">
        <Select
          value={type}
          onChange={(event) => {
            setType(event.target.value);
            setKey('');
          }}
        >
          <option value="openai">OpenAI</option>
          <option value="claude">Claude (Anthropic)</option>
        </Select>
      </Field>
      <Field
        label="Model"
        name="aiModel"
        helpText="Enter a model identifier available to your provider API account."
      >
        <input
          required
          maxLength={120}
          value={model}
          onChange={(event) => setModel(event.target.value)}
          placeholder="Model identifier"
        />
      </Field>
      <Field
        label="API Key"
        name="aiKey"
        helpText={
          data.provider?.configured
            ? 'A key is saved. Leave blank to keep it for the same provider.'
            : 'Use a provider API key. It is encrypted on the server and never returned.'
        }
      >
        <input
          type="password"
          autoComplete="new-password"
          required={!data.provider?.configured || type !== data.provider.type}
          maxLength={1000}
          value={key}
          onChange={(event) => setKey(event.target.value)}
        />
      </Field>
      <p className="text-sm text-slate-500">
        Limits: 10 requests per user per minute and 1,000 requests per workspace per UTC day.
        Provider charges and quotas also apply. No AI action automatically changes records.
      </p>
      <Notice error={error} />
      {message && <p role="status">{message}</p>}
      <RecordActions>
        {data.provider?.configured && (
          <>
            <ConfirmDeleteButton
              disabled={busy}
              className="btn-danger"
              confirmation="Remove the AI provider? All AI features will become unavailable to workspace users."
              onConfirm={async () => {
                await writeApi('/ai/settings', {
                  method: 'DELETE',
                  body: { revision: data.revision },
                });
                await refresh();
              }}
            >
              Remove Provider
            </ConfirmDeleteButton>
            <button
              className="btn-secondary"
              type="button"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                setError('');
                setMessage('');
                try {
                  await api('/ai/test', { method: 'POST', body: {} });
                  setMessage('Provider connection succeeded.');
                } catch (failure) {
                  setError(failure.message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              Test Connection
            </button>
          </>
        )}
        <Link className="btn-secondary" to="/integrations">
          Cancel
        </Link>
        <button className="btn-primary" disabled={busy}>
          {busy ? 'Saving…' : 'Save'}
        </button>
      </RecordActions>
    </ValidatedForm>
  );
}

export function AIFeatureSettings() {
  const { available, preferences } = useAI();
  if (!available) return null;
  return (
    <section className="space-y-4" aria-labelledby="ai-feature-title">
      <h2 id="ai-feature-title" className="text-lg font-semibold">
        AI Features
      </h2>
      <p className="text-sm text-slate-500">
        Enabled by default when a workspace provider is added. Choose the features you want to use.
        Requests send selected content to the configured provider.
      </p>
      {[
        ['aiSummaries', 'Task and Incident Summaries'],
        ['aiDrafting', 'Article and Runbook Drafting'],
        ['aiKnowledgeAnswers', 'Knowledge Answers'],
      ].map(([key, label]) => (
        <label key={key} className="field-label flex items-center justify-between gap-3">
          {label}
          <Toggle
            checked={preferences[key]}
            onChange={(event) => preferences.setPreference(key, event.target.checked)}
          />
        </label>
      ))}
      <Notice error={preferences.error} />
    </section>
  );
}

/** AI output is rendered as text, with real authorized source links, never interpreted as markup. */
export function AIAssistant({
  action,
  kind,
  id,
  knowledgeBaseId,
  articleType = 'article',
  onDraft,
}) {
  const { available, preferences, user } = useAI();
  const feature = { summary: 'aiSummaries', draft: 'aiDrafting', answer: 'aiKnowledgeAnswers' }[
    action
  ];
  const [prompt, setPrompt] = useState(''),
    [result, setResult] = useState(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  if (
    !available ||
    !preferences[feature] ||
    (action === 'draft' && !['admin', 'responder'].includes(user?.role))
  )
    return null;
  const title = { summary: 'AI Summary', draft: 'Draft with AI', answer: 'Ask Knowledge' }[action];
  async function generate() {
    if (busy) return;
    setBusy(true);
    setError('');
    setResult(null);
    try {
      setResult(
        await api('/ai/generate', {
          method: 'POST',
          body: { action, kind, id, knowledgeBaseId, articleType, prompt, question: prompt },
        }),
      );
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel space-y-3 p-4" aria-label={title}>
      <h2 className="font-semibold">{title}</h2>
      {action !== 'summary' && (
        <Field
          name={`ai-${action}-prompt`}
          label={action === 'draft' ? 'Describe the article or process' : 'Question'}
        >
          <AutoTextarea
            rows={3}
            maxLength={action === 'draft' ? 4000 : 2000}
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
          />
        </Field>
      )}
      <p className="text-xs text-slate-500">
        Selected text is sent to your workspace AI provider. Review answers and drafts before
        relying on them.
      </p>
      <button
        type="button"
        className="btn-secondary"
        disabled={busy || (action !== 'summary' && !prompt.trim())}
        onClick={generate}
      >
        {busy
          ? 'Generating…'
          : action === 'summary'
            ? 'Summarize'
            : action === 'draft'
              ? 'Generate Draft'
              : 'Ask'}
      </button>
      <Notice error={error} />
      {result && (
        <div className="space-y-3" aria-live="polite">
          <div className="whitespace-pre-wrap text-sm">
            {result.text ??
              `${result.draft.title}\n\n${result.draft.summary}\n\n${result.draft.content}\n\n${result.draft.steps.map((step, index) => `${index + 1}. ${step.title}\n${step.instructions}`).join('\n\n')}`}
          </div>
          {result.sources?.length > 0 && (
            <ul className="space-y-1">
              {result.sources.map((source) => (
                <li key={source.id}>
                  <Link className="text-blue-700 dark:text-blue-300" to={`/knowledge/${source.id}`}>
                    [{source.number}] {source.title}
                  </Link>
                </li>
              ))}
            </ul>
          )}
          {result.draft && onDraft && (
            <ConfirmDeleteButton
              title="Use AI Draft"
              confirmation="Replace the form's title, summary, content, and steps with this draft? Review the form before saving."
              confirmLabel="Use Draft"
              confirmClassName="btn-primary"
              className="btn-secondary"
              onConfirm={() => onDraft(result.draft)}
            >
              Use Draft in Form
            </ConfirmDeleteButton>
          )}
        </div>
      )}
    </section>
  );
}
