import { SearchInput } from '../../components/forms/search-input.jsx';
import { Select } from '../../components/forms/select.jsx';
import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Modal } from '../../components/modal.jsx';
import { useResource } from '../../data/use-resource.js';

/** Debounced global search keeps private responses in the account-scoped query cache. */
export function GlobalSearch({ role, onClose }) {
  const inputRef = useRef(null);
  const [input, setInput] = useState(''),
    [query, setQuery] = useState(''),
    [type, setType] = useState('all');
  useEffect(() => {
    const timer = setTimeout(() => setQuery(input.trim()), 250);
    return () => clearTimeout(timer);
  }, [input]);
  const resource = useResource(
    query.length >= 2 ? `/search?${new URLSearchParams({ q: query, type })}` : null,
  );
  const waiting = input.trim() !== query || resource.loading;
  const options =
    role === 'user'
      ? [
          ['incidents', 'Incidents'],
          ['users', 'Users'],
        ]
      : [
          ['incidents', 'Incidents'],
          ['tasks', 'Tasks'],
          ['rcas', 'RCAs'],
          ['knowledge', 'Knowledge'],
          ['services', 'Services'],
          ['collections', 'Collections'],
          ['monitors', 'Monitors'],
          ['groups', 'Groups'],
          ['users', 'Users'],
        ];
  return (
    <Modal
      className="global-search-modal"
      title="Search Workspace"
      onClose={onClose}
      initialFocusRef={inputRef}
    >
      <div className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-[1fr_180px]">
          <label className="field-label">
            Search
            <SearchInput
              ref={inputRef}
              autoFocus
              type="search"
              value={input}
              maxLength={100}
              placeholder="Search names, titles, or content"
              onChange={(event) => setInput(event.target.value)}
            />
          </label>
          <label className="field-label">
            Type
            <Select value={type} onChange={(event) => setType(event.target.value)}>
              <option value="all">All types</option>
              {options.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          </label>
        </div>
        <div role="status" className="text-sm text-slate-500" hidden={input.trim().length < 2}>
          {input.trim().length < 2
            ? ''
            : waiting
              ? 'Searching…'
              : resource.error
                ? ''
                : resource.data?.results.length
                  ? 'Up to 6 matches per type. Refine your search for more specific results.'
                  : 'No matching records.'}
        </div>
        {resource.error && (
          <p role="alert" className="text-rose-700 dark:text-rose-300">
            {resource.error}
          </p>
        )}
        {!waiting && query.length >= 2 && (
          <ul className="divide-y divide-slate-200 dark:divide-slate-700">
            {resource.data?.results.map((result) => (
              <li key={`${result.type}-${result.id}`}>
                {result.href ? (
                  <Link
                    className="block rounded-lg p-3 hover:bg-blue-50 dark:hover:bg-slate-800"
                    to={result.href}
                    onClick={onClose}
                  >
                    <span className="block break-words font-medium">{result.title}</span>
                    <span className="text-xs text-slate-500">
                      {result.label}
                      {result.description ? ` · ${result.description}` : ''}
                    </span>
                  </Link>
                ) : (
                  <div className="p-3">
                    <span className="block break-words font-medium">{result.title}</span>
                    <span className="text-xs text-slate-500">
                      {result.label} · {result.description}
                    </span>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </Modal>
  );
}
