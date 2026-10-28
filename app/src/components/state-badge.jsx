import React from 'react';
import { displayValue } from '../lib/display-value.js';

const tones = {
  green: 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200',
  blue: 'bg-blue-50 text-blue-800 dark:bg-blue-950 dark:text-blue-200',
  amber: 'bg-amber-50 text-amber-900 dark:bg-amber-950 dark:text-amber-200',
  red: 'bg-rose-50 text-rose-800 dark:bg-rose-950 dark:text-rose-200',
  gray: 'bg-slate-50 text-slate-700 dark:bg-slate-900 dark:text-slate-300',
};
const states = {
  up: 'green',
  resolved: 'green',
  done: 'green',
  published: 'green',
  active: 'green',
  enabled: 'green',
  sent: 'green',
  delivered: 'green',
  acknowledged: 'blue',
  in_progress: 'blue',
  sending: 'blue',
  low: 'blue',
  open: 'amber',
  pending: 'amber',
  queued: 'amber',
  medium: 'amber',
  down: 'red',
  degraded: 'amber',
  blocked: 'red',
  failed: 'red',
  high: 'red',
  critical: 'red',
};

/** Color uses canonical state; custom labels stay intact and text never relies on color alone. */
export function StateBadge({ status, label }) {
  const text =
    label || { up: 'Operational', todo: 'To do' }[status] || displayValue(status || 'unknown');
  return (
    <span
      className={`state-badge inline-flex max-w-full items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium leading-4 ${tones[states[status] || 'gray']}`}
    >
      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-current" aria-hidden="true" />
      <span className="min-w-0 truncate">{text}</span>
    </span>
  );
}
