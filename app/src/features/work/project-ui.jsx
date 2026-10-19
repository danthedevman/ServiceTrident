import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRightIcon, FolderIcon } from '@heroicons/react/24/outline';
import { ReferenceField } from '../../components/forms/reference-field.jsx';

/** Project-specific navigation and summaries share one visual vocabulary across the hub. */
export function ProjectScopeBar({ value, onChange, description, disabled }) {
  return (
    <div className="project-scope-bar panel flex min-w-0 flex-wrap items-center justify-between gap-4 p-4">
      <div className="min-w-0 flex-1">
        <p className="text-sm text-slate-500">{description}</p>
      </div>
      <div className="w-full min-w-0 sm:w-72 sm:shrink-0">
        <ReferenceField
          referenceType="projects"
          disabled={disabled}
          label="Project"
          placeholder="All Projects"
          value={value}
          onChange={onChange}
        />
      </div>
    </div>
  );
}
export function ProjectMetric({ title, value, tone = 'blue', to }) {
  const tones = {
    blue: 'text-blue-700 dark:text-blue-300',
    amber: 'text-amber-700 dark:text-amber-300',
    rose: 'text-rose-700 dark:text-rose-300',
  };
  const content = (
    <>
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-medium text-slate-500">{title}</h2>
        {to && <ArrowUpRightIcon aria-hidden="true" className="h-4 w-4 text-slate-500" />}
      </div>
      <strong className={`block text-3xl tabular-nums ${tones[tone]}`}>{value}</strong>
    </>
  );
  return to ? (
    <Link to={to} className="panel min-w-0 space-y-3 p-5 hover:ring-1 hover:ring-blue-500">
      {content}
    </Link>
  ) : (
    <section className="panel min-w-0 space-y-3 p-5">{content}</section>
  );
}
export function ProjectPanel({ title, note, children, action }) {
  return (
    <section className="panel min-w-0 space-y-4 p-5">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold">{title}</h2>
        {action}
      </header>
      {note && <p className="text-xs text-slate-500">{note}</p>}
      {children}
    </section>
  );
}
export function ProjectEmptyState({ children }) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-dashed border-slate-300 p-4 text-sm text-slate-500 dark:border-slate-700">
      <FolderIcon className="h-5 w-5 shrink-0" aria-hidden="true" />
      <p>{children}</p>
    </div>
  );
}
