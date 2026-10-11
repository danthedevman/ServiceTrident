import React from 'react';

/** Keep the same brand icon in compact mode, hiding only the wordmark.
 * @param {{className?: string, compact?: boolean}} props
 */
export function Logo({ className = '', compact = false }) {
  return (
    <span
      className={`inline-flex items-center gap-2 text-base font-bold tracking-tight ${className}`}
    >
      <svg
        data-brand-mark
        viewBox="0 0 32 32"
        width="36"
        height="36"
        className="h-9 w-9 shrink-0"
        role={compact ? 'img' : undefined}
        aria-label={compact ? 'ServiceTrident' : undefined}
        aria-hidden={compact ? undefined : true}
      >
        <rect width="32" height="32" rx="8" className="fill-blue-700 dark:fill-blue-600" />
        <g
          fill="none"
          stroke="#fff"
          strokeWidth="1.45"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          {/* Connected service nodes converge into a response stem; the center carries a health pulse. */}
          <circle cx="8" cy="9" r="2" />
          <circle cx="16" cy="7" r="2" />
          <circle cx="24" cy="9" r="2" />
          <path d="M8 11v4a8 8 0 0 0 16 0v-4M16 9v5l-2 2 4 2-2 2v6M13 26h6" />
        </g>
      </svg>
      {!compact && (
        <span>
          Service<span className="text-blue-700 dark:text-blue-400">Trident</span>
        </span>
      )}
    </span>
  );
}
