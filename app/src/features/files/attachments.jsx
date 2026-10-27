import { AttachmentDropzone } from './attachment-dropzone.jsx';
import { ConfirmDeleteButton } from '../../components/confirm-delete-button.jsx';
import { DateTime } from '../../preferences/date-time.jsx';
import { ActionMenu } from '../../components/action-menu.jsx';
import React, { useContext, useEffect, useRef, useState } from 'react';
import { PaperClipIcon, ArrowDownTrayIcon, TrashIcon } from '@heroicons/react/24/outline';
import { AuthContext } from '../../auth/auth-context.js';
import { useResource } from '../../data/use-resource.js';
import { writeApi } from '../../data/query-client.js';
import { DataTable } from '../../components/data-table.jsx';
import { Notice } from '../../components/forms/fields.jsx';

export const fileAccept =
  '.pdf,.txt,.csv,.log,.json,.md,.png,.jpg,.jpeg,.gif,.webp,.zip,.docx,.xlsx,.pptx';

/** Show saved attachment downloads using the same authorized, cached record query as the list. */
export function AttachmentLinks({ kind, recordId, imageIds = [], title }) {
  const resource = useResource(`/attachments/${kind}/${recordId}`);
  const files = (resource.data?.attachments ?? []).filter((file) => !imageIds.includes(file.id));
  if (!files.length) return null;
  const links = (
    <ul aria-label="Attached files" className="flex flex-wrap gap-x-4 gap-y-2">
      {files.map((file) => (
        <li key={file.id} className="min-w-0 max-w-full">
          <a
            href={file.downloadUrl}
            download
            className="inline-flex max-w-full items-center gap-2 py-1 text-sm text-blue-700 underline underline-offset-2 dark:text-blue-300"
          >
            <PaperClipIcon className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span className="break-all">{file.name}</span>
          </a>
        </li>
      ))}
    </ul>
  );
  return title ? (
    <section aria-label={title}>
      <h2>{title}</h2>
      {links}
    </section>
  ) : (
    links
  );
}
/** Stage private uploads until the parent record is saved; aborted drafts are cleaned by workers. */
export function useAttachmentDraft(kind, recordId, initialIds = []) {
  const existing = useResource(recordId ? `/attachments/${kind}/${recordId}` : null);
  const [inlineIds, setInlineIds] = useState([]);
  const [ids, setIds] = useState(initialIds),
    [files, setFiles] = useState([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const active = useRef(false),
    controller = useRef(null),
    currentIds = useRef(ids);
  useEffect(() => {
    currentIds.current = ids;
  }, [ids]);
  useEffect(() => () => controller.current?.abort(), []);
  /** Upload one file; callers linking it immediately defer feedback until the link succeeds. */
  async function upload(file, { inline = false, toast = true } = {}) {
    if (active.current) throw new Error('Wait for the current upload to finish.');
    if (!file || !file.size || file.size > 5 * 1024 * 1024)
      throw new Error('Choose a nonempty file no larger than 5 MB.');
    if (currentIds.current.length >= 20) throw new Error('A record supports up to 20 attachments.');
    active.current = true;
    setBusy(true);
    setError('');
    controller.current = new AbortController();
    try {
      const result = await writeApi(`/attachments/${kind}`, {
        method: 'POST',
        body: file,
        headers: { 'X-File-Name': encodeURIComponent(file.name) },
        signal: controller.current.signal,
        toast,
      });
      if (inline) setInlineIds((old) => [...old, result.attachment.id]);
      setFiles((old) => [...old, result.attachment]);
      currentIds.current = [...currentIds.current, result.attachment.id];
      setIds(currentIds.current);
      return result.attachment;
    } catch (error) {
      if (error.name !== 'AbortError') setError(error.message);
      throw error;
    } finally {
      active.current = false;
      setBusy(false);
    }
  }
  return {
    ids,
    setIds,
    inlineIds,
    files: [...(existing.data?.attachments ?? []), ...files],
    upload,
    busy,
    error,
    setError,
    loading: existing.loading,
  };
}
/** File controls used inside create/edit forms; removing here takes effect only on Save. */
export function AttachmentPicker({ draft, imageIds = [] }) {
  return (
    <section className="space-y-3">
      <h2 className="text-sm font-medium">Attachments</h2>
      <AttachmentDropzone
        accept={fileAccept}
        disabled={draft.busy}
        onUpload={draft.upload}
        onError={draft.setError}
      />
      <p className="text-xs text-slate-500">
        Up to 20 files including embedded images, 5 MB each. Files are attached when you save the
        record.
      </p>
      <Notice error={draft.error} />
      {draft.busy && <p role="status">Uploading…</p>}
      <ul className="space-y-2">
        {draft.ids
          .filter((id) => !imageIds.includes(id) && !draft.inlineIds.includes(id))
          .map((id) => {
            const file = draft.files.find((row) => row.id === id);
            return (
              <li key={id} className="flex items-center justify-between gap-3 text-sm">
                <span className="break-all">{file?.name ?? 'Attached file'}</span>
                <ConfirmDeleteButton
                  confirmation="Remove this attachment from the draft?"
                  confirmLabel="Remove"
                  type="button"
                  className="btn-danger"
                  disabled={draft.busy}
                  title="Remove Attachment"
                  onConfirm={() => draft.setIds(draft.ids.filter((value) => value !== id))}
                >
                  Remove
                </ConfirmDeleteButton>
              </li>
            );
          })}
      </ul>
    </section>
  );
}
/** Authorized users can download; only record editors can add or remove attachments. */
export function AttachmentPanel({ kind, recordId, compact = false, imageIds = [] }) {
  const { user } = useContext(AuthContext),
    path = `/attachments/${kind}/${recordId}`,
    resource = useResource(path),
    draft = useAttachmentDraft(kind, null);
  const canEdit =
    ['admin', 'responder'].includes(user?.role) || (kind === 'incidents' && user?.role === 'user');
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [confirm, setConfirm] = useState(null);
  const attachments = (resource.data?.attachments ?? []).filter(
    (file) => !imageIds.includes(file.id),
  );
  async function attach(ids) {
    setBusy(true);
    setError('');
    try {
      await writeApi(path, { method: 'POST', body: { attachmentIds: ids } });
      draft.setIds([]);
    } catch (error) {
      setError(error.message);
      throw error;
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="space-y-4">
      <Notice error={resource.error || draft.error || error} />
      {canEdit && (
        <div className="flex flex-wrap items-center gap-3">
          <AttachmentDropzone
            accept={fileAccept}
            disabled={busy || draft.busy}
            onError={setError}
            onUpload={async (file) => {
              const item = await draft.upload(file, { toast: false });
              await attach([item.id]);
            }}
          />
          {draft.ids.length > 0 && !draft.busy && !busy && (
            <button
              className="btn-secondary"
              onClick={() => {
                void attach(draft.ids).catch(() => {});
              }}
            >
              Retry attaching uploaded files
            </button>
          )}
        </div>
      )}
      {(busy || draft.busy) && <p role="status">Saving attachment…</p>}
      {confirm && (
        <div className="panel flex flex-wrap items-center gap-3 p-4">
          <span>Remove {confirm.name} from this record?</span>
          <button className="btn-secondary" disabled={busy} onClick={() => setConfirm(null)}>
            Cancel
          </button>
          <button
            className="btn-danger"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setError('');
              try {
                await writeApi(`${path}/${confirm.id}`, { method: 'DELETE', body: {} });
                setConfirm(null);
              } catch (error) {
                setError(error.message);
              } finally {
                setBusy(false);
              }
            }}
          >
            Remove attachment
          </button>
        </div>
      )}
      {!resource.data ? (
        <p role="status" className={resource.error ? undefined : 'sr-only'}>
          {resource.error ? 'Attachments unavailable.' : 'Loading attachments…'}
        </p>
      ) : compact ? (
        <ul className="divide-y divide-slate-200 dark:divide-slate-700">
          {attachments.length ? (
            attachments.map((file) => (
              <li key={file.id} className="flex items-start gap-2 py-3">
                <PaperClipIcon
                  className="mt-1 h-4 w-4 shrink-0 text-slate-400"
                  aria-hidden="true"
                />
                <div className="min-w-0 flex-1">
                  <a
                    className="break-words text-sm font-medium text-blue-700 [overflow-wrap:anywhere] hover:underline dark:text-blue-300"
                    href={file.downloadUrl}
                    download
                  >
                    {file.name}
                  </a>
                  <p className="mt-1 text-xs text-slate-500">
                    {Math.max(1, Math.ceil(file.size / 1024)).toLocaleString()} KB ·{' '}
                    {<DateTime value={file.createdAt} />}
                  </p>
                </div>
                <ActionMenu label={`Actions for ${file.name}`}>
                  <a href={file.downloadUrl} download>
                    Download
                  </a>
                  {canEdit && (
                    <button
                      className="btn-danger"
                      type="button"
                      disabled={busy}
                      onClick={() => setConfirm(file)}
                    >
                      Remove attachment
                    </button>
                  )}
                </ActionMenu>
              </li>
            ))
          ) : (
            <li className="py-3 text-sm text-slate-500">No attachments yet.</li>
          )}
        </ul>
      ) : (
        <DataTable
          source={`attachments?recordKind=${kind}&recordId=${recordId}`}
          title="Attachments"
          rows={attachments}
          rowKey={(row) => row.id}
          filename={`${kind}-attachments.csv`}
          columns={[
            { key: 'name', label: 'File', value: (row) => row.name },
            { key: 'size', label: 'Size (bytes)', value: (row) => row.size },
            { key: 'createdAt', label: 'Uploaded', value: (row) => row.createdAt },
            {
              key: 'actions',
              label: 'Actions',
              sortable: false,
              value: () => '',
              render: (row) => (
                <div className="flex gap-2">
                  <a className="btn-secondary gap-2" href={row.downloadUrl} download>
                    <ArrowDownTrayIcon className="h-4 w-4" />
                    Download
                  </a>
                  {canEdit && (
                    <button
                      className="btn-danger"
                      disabled={busy}
                      aria-label={`Remove ${row.name}`}
                      onClick={() => setConfirm(row)}
                    >
                      <TrashIcon className="h-4 w-4" />
                      Remove
                    </button>
                  )}
                </div>
              ),
            },
          ]}
        />
      )}
    </section>
  );
}
