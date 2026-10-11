import { ValidatedForm } from '../../components/forms/validated-form.jsx';
import { Modal } from '../../components/modal.jsx';
import React, { useEffect, useId, useState } from 'react';
import { api } from '../../data/api.js';
import { Toggle } from '../../components/forms/toggle.jsx';

/** Keep email bearer tokens out of URLs after opening; require an explicit confirmation action. */
function readAction() {
  const match = /^#(confirm|unsubscribe)=([a-f\d]{64})$/.exec(window.location.hash);
  return match ? { kind: match[1], token: match[2] } : null;
}

/** Public opt-in controls work without a session, including unsubscribe on a private page. */
export function StatusSubscriptions({ token, capabilities }) {
  const formId = useId();
  const [channel, setChannel] = useState('');
  const [action, setAction] = useState(readAction);
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    const capture = () => {
      const next = readAction();
      if (next) {
        setAction(next);
        window.history.replaceState(
          window.history.state,
          '',
          window.location.pathname + window.location.search,
        );
      }
    };
    capture();
    window.addEventListener('hashchange', capture);
    return () => window.removeEventListener('hashchange', capture);
  }, []);
  useEffect(() => {
    if (!capabilities?.rssPath) return;
    const link = document.createElement('link');
    link.rel = 'alternate';
    link.type = 'application/rss+xml';
    link.title = 'Service status updates';
    link.href = capabilities.rssPath;
    document.head.append(link);
    return () => link.remove();
  }, [capabilities?.rssPath]);
  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const result = await api(
        `/public/status/${token}/subscriptions${action ? `/${action.kind}` : ''}`,
        {
          method: 'POST',
          body: action ? { token: action.token } : { email, consent },
        },
      );
      setMessage(result.message);
      setAction(null);
      setOpen(false);
      setEmail('');
      setConsent(false);
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusy(false);
    }
  }
  const emailAvailable = capabilities?.enabled && capabilities?.emailEnabled;
  const rssAvailable = capabilities?.enabled && capabilities?.rssEnabled && capabilities?.rssPath;
  const close = () => {
    setOpen(false);
    setAction(null);
    setChannel('');
    setError('');
  };
  const emailForm = action || (channel === 'email' && emailAvailable);
  return (
    <section aria-label="Status subscriptions" className="min-w-0 space-y-3">
      {capabilities?.visible && (
        <button
          type="button"
          className="btn-primary"
          aria-haspopup="dialog"
          disabled={!capabilities.enabled || (!emailAvailable && !rssAvailable)}
          onClick={() => {
            setOpen(true);
            setChannel('');
            setError('');
            setMessage('');
          }}
        >
          Subscribe to updates
        </button>
      )}
      {(open || action) && (
        <Modal
          title={
            action?.kind === 'unsubscribe' ? 'Unsubscribe from updates' : 'Subscribe to updates'
          }
          busy={busy}
          onClose={close}
          footer={
            <>
              <button type="button" className="btn-secondary" disabled={busy} onClick={close}>
                Close
              </button>
              {emailForm && (
                <button
                  type="submit"
                  form={formId}
                  className="btn-primary"
                  disabled={busy || (!action && !consent)}
                >
                  {busy
                    ? 'Saving…'
                    : action?.kind === 'unsubscribe'
                      ? 'Unsubscribe'
                      : action
                        ? 'Confirm subscription'
                        : 'Subscribe by email'}
                </button>
              )}
            </>
          }
        >
          <div className="space-y-5">
            {!action && (
              <div className="flex flex-wrap gap-3" role="group" aria-label="Subscription channel">
                {emailAvailable && (
                  <button
                    type="button"
                    className={channel === 'email' ? 'btn-primary' : 'btn-secondary'}
                    aria-pressed={channel === 'email'}
                    onClick={() => setChannel('email')}
                  >
                    Email
                  </button>
                )}
                {rssAvailable && (
                  <button
                    type="button"
                    className={channel === 'rss' ? 'btn-primary' : 'btn-secondary'}
                    aria-pressed={channel === 'rss'}
                    onClick={() => setChannel('rss')}
                  >
                    RSS
                  </button>
                )}
              </div>
            )}
            {!action && !channel && (
              <p>Choose how you want to receive service health changes and public announcements.</p>
            )}
            {!action && !emailAvailable && !rssAvailable && (
              <p>Subscriptions are currently unavailable.</p>
            )}
            {!action && channel === 'rss' && rssAvailable && (
              <div className="space-y-3">
                <p>Add this feed URL to your RSS reader.</p>
                <label className="field-label">
                  RSS feed URL
                  <input
                    readOnly
                    value={new URL(capabilities.rssPath, window.location.origin).href}
                    onFocus={(event) => event.target.select()}
                  />
                </label>
                <a
                  className="btn-secondary"
                  href={capabilities.rssPath}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Open RSS feed
                </a>
              </div>
            )}
            {emailForm && (
              <ValidatedForm id={formId} onSubmit={submit} className="form-body">
                {action ? (
                  <p>
                    {action.kind === 'confirm'
                      ? 'Confirm your email subscription to public status updates.'
                      : 'Stop receiving email updates from this status page.'}
                  </p>
                ) : (
                  <>
                    <label className="field-label">
                      Email address
                      <input
                        type="email"
                        autoComplete="email"
                        required
                        maxLength={254}
                        value={email}
                        onChange={(event) => setEmail(event.target.value)}
                      />
                    </label>
                    <label className="flex items-center gap-3 text-sm">
                      <Toggle
                        checked={consent}
                        onChange={(event) => setConsent(event.target.checked)}
                      />
                      Send me service health changes and public announcements
                    </label>
                    <p className="text-sm text-slate-500">
                      Confirm your address using the email we send. You can unsubscribe at any time.
                    </p>
                  </>
                )}
              </ValidatedForm>
            )}
            {error && (
              <p role="alert" className="text-rose-700 dark:text-rose-400">
                {error}
              </p>
            )}
          </div>
        </Modal>
      )}
      {message && <p role="status">{message}</p>}
    </section>
  );
}
