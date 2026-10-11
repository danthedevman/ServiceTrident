import { ValidatedForm } from '../../components/forms/validated-form.jsx';
import { PageTitle } from '../../components/page-title.jsx';
import { AutoTextarea } from '../../components/forms/auto-textarea.jsx';
import { RecordHeader } from '../../components/record-actions.jsx';
import { Modal } from '../../components/modal.jsx';
import { AIAssistant } from '../ai/ai.jsx';
import { PlusIcon } from '@heroicons/react/24/outline';
import { Select } from '../../components/forms/select.jsx';
import { ReferenceField } from '../../components/forms/reference-field.jsx';
import { writeApi } from '../../data/query-client.js';
import React, { useContext, useState, useRef } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { AuthContext } from '../../auth/auth-context.js';
import { Skeleton } from '../../components/skeleton.jsx';
import { Field, Notice } from '../../components/forms/fields.jsx';
import { useResource, useInfiniteResource } from '../../data/use-resource.js';
import { useSave } from '../../data/use-save.js';
import { RecordWorkspace, RecordMetadata } from '../../components/record-workspace.jsx';
import { RecordActions } from '../../components/record-actions.jsx';
import { WorkTable } from './work.jsx';

/** Search stays server-side while cards present each base as a home for its articles. */
export function KnowledgeBasesPage() {
  const { user } = useContext(AuthContext);
  const [search, setSearch] = useState('');
  const resource = useInfiniteResource(
    `/knowledge-bases?${new URLSearchParams({ search, pageSize: 25, sortBy: 'title', order: 'asc' })}`,
  );
  const items = resource.data?.pages.flatMap((page) => page.items) ?? [];
  return (
    <div className="space-y-6 p-6">
      <RecordHeader>
        <header className="flex items-center justify-end gap-3">
          <PageTitle>Knowledge Bases</PageTitle>
          <div className="flex flex-wrap gap-2">
            <Link className="btn-secondary" to="/knowledge/articles">
              All Articles
            </Link>
            {['admin', 'responder'].includes(user?.role) && (
              <Link className="btn-primary" to="/knowledge/bases/new">
                <PlusIcon className="h-5 w-5 shrink-0" aria-hidden="true" />
                Create
              </Link>
            )}
          </div>
        </header>
      </RecordHeader>
      <label className="field-label block max-w-md">
        <span className="sr-only">Search Knowledge Bases</span>
        <input
          type="search"
          placeholder="Search Knowledge Bases"
          maxLength={100}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </label>
      <Notice error={resource.error} />
      <AIAssistant action="answer" />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {!resource.data &&
          resource.pending &&
          [1, 2, 3, 4, 5, 6].map((key) => <Skeleton key={key} className="h-32 w-full" />)}
        {items.map((item) => (
          <Link
            key={item.id}
            to={`/knowledge/bases/${item.id}`}
            className="panel block p-5 hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500 dark:hover:bg-slate-800"
          >
            <h2 className="text-lg font-semibold text-blue-700 dark:text-blue-300">{item.title}</h2>
            <p className="mt-2 line-clamp-3 text-sm text-slate-600 dark:text-slate-300">
              {item.description || 'Open this knowledge base to view its articles.'}
            </p>
          </Link>
        ))}
      </div>
      {resource.pending && <p role="status">Loading knowledge bases…</p>}
      {resource.data && !items.length && (
        <p>
          {search
            ? 'No knowledge bases match your search.'
            : 'Create a knowledge base to organize your articles.'}
        </p>
      )}
      {resource.hasMore && (
        <button className="btn-secondary" disabled={resource.pending} onClick={resource.loadMore}>
          Load More Knowledge Bases
        </button>
      )}
    </div>
  );
}

export function KnowledgeBasePage({ create = false }) {
  const { id } = useParams(),
    navigate = useNavigate(),
    { user } = useContext(AuthContext);
  const resource = useResource(create ? null : `/knowledge-bases/${id}`);
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const item = resource.data?.item;
  if (create)
    return (
      <div className="form-page">
        <KnowledgeBaseForm onClose={() => navigate('/knowledge')} />
      </div>
    );
  return (
    <div className="space-y-6">
      <Notice error={resource.error} />
      {deleting && item && (
        <DeleteKnowledgeBase
          item={item}
          onClose={() => setDeleting(false)}
          onDeleted={() => navigate('/knowledge')}
          refresh={resource.refresh}
        />
      )}
      {item ? (
        <RecordWorkspace
          kind="knowledgeBases"
          item={item}
          onEdit={
            !editing && ['admin', 'responder'].includes(user?.role)
              ? () => setEditing(true)
              : undefined
          }
          secondaryActions={
            user?.role === 'admin' &&
            !editing && (
              <button className="btn-danger" onClick={() => setDeleting(true)}>
                Delete Knowledge Base
              </button>
            )
          }
          sidebar={<RecordMetadata item={item} />}
        >
          {editing ? (
            <KnowledgeBaseForm key={id} item={item} onClose={() => setEditing(false)} />
          ) : (
            <div className="record-details space-y-6">
              <PageTitle>{item.title}</PageTitle>
              <div>
                <h2 className="field-label">Description</h2>
                <p>{item.description || 'No description'}</p>
              </div>
              <WorkTable kind="knowledge" initialKnowledgeBaseId={id} />
              <AIAssistant key={id} action="answer" knowledgeBaseId={id} />
            </div>
          )}
        </RecordWorkspace>
      ) : (
        <p role="status">Loading knowledge base…</p>
      )}
    </div>
  );
}

function KnowledgeBaseForm({ item, onClose }) {
  const [title, setTitle] = useState(item?.title ?? ''),
    [description, setDescription] = useState(item?.description ?? '');
  const save = useSave(),
    navigate = useNavigate();
  return (
    <ValidatedForm
      className="form-body"
      onSubmit={(event) => {
        event.preventDefault();
        save.run(
          item ? `/knowledge-bases/${item.id}` : '/knowledge-bases',
          item ? 'PATCH' : 'POST',
          { title, description, ...(item ? { revision: item.revision } : {}) },
          (result) => {
            if (item) onClose();
            else navigate(`/knowledge/bases/${result.item.id}`, { state: { createdRecord: true } });
          },
        );
      }}
    >
      <PageTitle>{item ? 'Edit Knowledge Base' : 'Create Knowledge Base'}</PageTitle>
      <Notice error={save.error} />
      <Field label="Name" name="title" errors={save.fields}>
        <input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          required
          maxLength={160}
        />
      </Field>
      <Field label="Description" name="description" errors={save.fields}>
        <AutoTextarea
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          maxLength={2000}
        />
      </Field>
      <RecordActions>
        <button type="button" className="btn-secondary" disabled={save.busy} onClick={onClose}>
          Cancel
        </button>
        <button className="btn-primary" disabled={save.busy}>
          {item ? 'Save Changes' : 'Create Knowledge Base'}
        </button>
      </RecordActions>
    </ValidatedForm>
  );
}

function DeleteKnowledgeBase({ item, onClose, onDeleted, refresh }) {
  const [mode, setMode] = useState(item.deleting?.mode ?? 'move');
  const [targetId, setTarget] = useState(item.deleting?.targetId ?? '');
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const cancel = useRef(null);
  async function confirm() {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await writeApi(`/knowledge-bases/${item.id}`, {
        method: 'DELETE',
        body: {
          mode,
          ...(mode === 'move' ? { targetId } : {}),
          revision: item.revision,
          articleCount: item.articleCount,
        },
      });
      onDeleted();
    } catch (failure) {
      setError(failure.message);
      await refresh();
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title="Delete Knowledge Base"
      busy={busy}
      onClose={onClose}
      initialFocusRef={cancel}
      footer={
        <>
          <button ref={cancel} className="btn-secondary" disabled={busy} onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn-danger"
            disabled={busy || (mode === 'move' && (!targetId || targetId === item.id))}
            onClick={confirm}
          >
            {busy
              ? 'Deleting…'
              : mode === 'move'
                ? 'Move Articles and Delete Base'
                : 'Delete Base and Articles'}
          </button>
        </>
      }
    >
      <p>
        Delete “{item.title}”? This base contains {item.articleCount} article
        {item.articleCount === 1 ? '' : 's'}, including drafts and archived articles.
      </p>
      <label className="field-label mt-4 block">
        Content Action
        <Select
          aria-label="Content Action"
          value={mode}
          disabled={busy || !!item.deleting}
          onChange={(event) => setMode(event.target.value)}
        >
          <option value="move">Move articles to another knowledge base</option>
          <option value="delete">Delete articles with this knowledge base</option>
        </Select>
      </label>
      {mode === 'move' ? (
        <div className="mt-4">
          <ReferenceField
            label="Destination Knowledge Base"
            referenceType="knowledgeBases"
            excludeId={item.id}
            value={targetId}
            onChange={setTarget}
            disabled={busy || !!item.deleting}
            required
          />
          <p className="mt-2 text-sm">
            Articles, attachments, and incident links will be retained in the destination base.
          </p>
        </div>
      ) : (
        <p className="mt-4 text-sm">
          All articles and their attachments will be permanently deleted. Their incident links will
          be removed. This cannot be undone.
        </p>
      )}
      <Notice error={error} />
    </Modal>
  );
}
