import { useValidationError } from './forms/validation-context.js';
import React, { useEffect, useId, useRef, useState } from 'react';
import { Modal } from './modal.jsx';
import { SearchInput } from './forms/search-input.jsx';
import { useResource, useInfiniteResource } from '../data/use-resource.js';
import { ErrorNotice } from './feedback.jsx';

/** Confirm a relationship draft before changing the record or its parent form. */
export function ArticleLinkDialog({ value = [], articles = [], onApply, onClose }) {
  const [selected, setSelected] = useState(value);
  const [pickedLabels, setPickedLabels] = useState({});
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const input = useRef(null);
  const [search, setSearch] = useState(''),
    [query, setQuery] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => setQuery(search.trim()), 250);
    return () => clearTimeout(timer);
  }, [search]);
  const resource = useInfiniteResource(
    `/references/knowledge?${new URLSearchParams({ q: query })}`,
  );
  const saved = useResource(
    value.length
      ? `/references/knowledge?${new URLSearchParams({ selected: value.join(',') })}`
      : null,
  );
  const options = [
    ...new Map(
      (resource.data?.pages || []).flatMap((page) => page.options).map((row) => [row.id, row]),
    ).values(),
  ];
  const labels = new Map(
    [
      ...articles.map((row) => ({ id: row.id, label: row.title })),
      ...(saved.data?.selected || []),
      ...options,
    ].map((row) => [row.id, row.label]),
  );
  for (const [id, label] of Object.entries(pickedLabels))
    if (!labels.has(id)) labels.set(id, label);
  function toggle(id, label) {
    if (label) setPickedLabels((old) => ({ ...old, [id]: label }));
    if (!selected.includes(id) && selected.length >= 50) {
      setError('Select up to 50 articles.');
      return;
    }
    setError('');
    setSelected((old) => (old.includes(id) ? old.filter((value) => value !== id) : [...old, id]));
  }
  return (
    <Modal
      title="Link Articles"
      initialFocusRef={input}
      onClose={onClose}
      busy={busy}
      footer={
        <>
          <button type="button" className="btn-secondary" disabled={busy} onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn-primary"
            disabled={busy}
            onClick={async () => {
              if (selected.length > 50) {
                setError('Select up to 50 articles.');
                return;
              }
              setBusy(true);
              setError('');
              try {
                await onApply(selected);
                onClose();
              } catch (error) {
                setError(error.message);
              } finally {
                setBusy(false);
              }
            }}
          >
            Link Articles
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <ErrorNotice>{error}</ErrorNotice>
        <label className="field-label">
          <span className="sr-only">Search Articles</span>
          <SearchInput
            ref={input}
            value={search}
            maxLength={100}
            placeholder="Search articles"
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
        <ErrorNotice>{resource.error || saved.error}</ErrorNotice>
        <p className="text-sm text-slate-500">{selected.length} selected</p>
        {selected.some((id) => labels.has(id)) && (
          <ul className="flex flex-wrap gap-2" aria-label="Selected Articles">
            {selected
              .filter((id) => labels.has(id))
              .map((id) => (
                <li key={id}>
                  <button
                    type="button"
                    className="btn-secondary"
                    disabled={busy}
                    aria-label={`Remove ${labels.get(id)}`}
                    onClick={() => toggle(id)}
                  >
                    {labels.get(id)} ×
                  </button>
                </li>
              ))}
          </ul>
        )}
        <ul
          className="divide-y divide-slate-200 dark:divide-slate-700"
          aria-label="Articles"
          aria-busy={resource.pending}
        >
          {options.map((row) => (
            <li key={row.id}>
              <label className="flex cursor-pointer items-start gap-3 py-3">
                <input
                  type="checkbox"
                  checked={selected.includes(row.id)}
                  disabled={busy}
                  onChange={() => toggle(row.id, row.label)}
                />
                <span className="min-w-0 break-words">{row.label}</span>
              </label>
            </li>
          ))}
        </ul>
        {!resource.data && resource.pending && (
          <div
            className="h-24 animate-pulse rounded bg-slate-200 dark:bg-slate-800"
            aria-hidden="true"
          />
        )}
        {resource.data && !resource.pending && !options.length && (
          <p role="status" className="text-sm text-slate-500">
            No matching articles.
          </p>
        )}
        {resource.hasMore && (
          <button
            type="button"
            className="btn-secondary"
            disabled={resource.pending || busy}
            onClick={resource.loadMore}
          >
            Load More
          </button>
        )}
      </div>
    </Modal>
  );
}

export function ArticleLinkPicker({
  value,
  articles,
  label,
  helpText,
  error: suppliedError,
  onChange,
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const error = useValidationError(suppliedError, value, value.length > 0, 'knowledgeIds');
  return (
    <div className="space-y-2">
      <div id={`${id}-label`} className="field-label">
        {label}
      </div>
      {helpText && <p className="text-sm text-slate-500">{helpText}</p>}
      <button
        type="button"
        className="btn-secondary"
        data-validation-key="knowledgeIds"
        aria-labelledby={`${id}-label ${id}-action`}
        aria-describedby={error ? `${id}-error` : undefined}
        id={`${id}-action`}
        aria-invalid={!!error}
        onClick={() => setOpen(true)}
      >
        Link Articles
      </button>
      <p className="text-sm text-slate-500">{value.length} linked</p>
      {error && (
        <div id={`${id}-error`}>
          <ErrorNotice>{error}</ErrorNotice>
        </div>
      )}
      {open && (
        <ArticleLinkDialog
          value={value}
          articles={articles}
          onApply={onChange}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  );
}
