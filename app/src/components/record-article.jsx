import React from 'react';
import { formSections } from '../../../shared/forms/layout.js';
import { DateTime } from '../preferences/date-time.jsx';
import { ReferenceValue } from './reference-value.jsx';
import { StateBadge } from './state-badge.jsx';

const references = {
  serviceId: ['services', 'serviceName'],
  knowledgeBaseId: ['knowledgeBases', 'knowledgeBaseTitle'],
};
/** Read documents as prose; schema visibility and ordering still govern their published fields. */
export function RecordArticle({ item, fields, layout, className = '', renderValue, children }) {
  const visible = formSections(fields, layout).flatMap((section) => section.fields);
  const shown = (id) => visible.some((field) => field.id === id);
  const rawValue = (field) => (field.type === 'builtin' ? item[field.id] : item.custom?.[field.id]);
  const value = (field) => {
    const custom = renderValue?.(field);
    if (custom !== undefined) return custom;
    const raw = rawValue(field);
    if (references[field.id])
      return (
        <ReferenceValue
          type={references[field.id][0]}
          id={raw}
          label={item[references[field.id][1]]}
        />
      );
    return typeof raw === 'boolean'
      ? raw
        ? 'Yes'
        : 'No'
      : Array.isArray(raw)
        ? raw.join(', ')
        : String(raw ?? '');
  };
  return (
    <article className={`knowledge-reader document-reader ${className}`}>
      <header className="knowledge-reader-header">
        <div className="flex flex-wrap items-center gap-3 text-sm text-slate-500">
          {shown('status') && (
            <span data-record-field="status">
              <StateBadge status={item.status} label={item.statusLabel} />
            </span>
          )}
          {item.updatedAt && (
            <span>
              Updated <DateTime value={item.updatedAt} />
            </span>
          )}
          {item.createdBy && <span>By {item.createdBy}</span>}
        </div>
        {shown('title') && <h1 data-record-field="title">{item.title}</h1>}
        {shown('summary') && item.summary && (
          <p className="knowledge-summary whitespace-pre-wrap" data-record-field="summary">
            {item.summary}
          </p>
        )}
        {visible
          .filter((field) => references[field.id] && rawValue(field))
          .map((field) => (
            <div key={field.id} data-record-field={field.id} className="mt-2 text-sm">
              <span className="text-slate-500">{field.label}: </span>
              {value(field)}
            </div>
          ))}
      </header>
      <div className="knowledge-reading-content space-y-8">
        {visible
          .filter(
            (field) =>
              !['title', 'summary', 'status', ...Object.keys(references)].includes(field.id),
          )
          .map((field) => {
            const content = value(field);
            if (
              content === '' ||
              content == null ||
              (Array.isArray(rawValue(field)) && !rawValue(field).length)
            )
              return null;
            return (
              <section key={field.id} data-record-field={field.id} data-field-label={field.label}>
                {field.id !== 'content' && <h2>{field.label}</h2>}
                <div className="whitespace-pre-wrap break-words">{content}</div>
              </section>
            );
          })}
        {children}
      </div>
    </article>
  );
}
