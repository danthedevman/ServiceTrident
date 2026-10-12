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
        {/* Three upward points represent coordinated service response; a single stem anchors the mark. */}
        <path
          d="M16 5 12.5 9H14.8V18.6L9.2 15.4V11H11.5L8 7 4.5 11H6.8V16.8L14.8 21.4V27H17.2V21.4L25.2 16.8V11H27.5L24 7 20.5 11H22.8V15.4L17.2 18.6V9H19.5Z"
          fill="#fff"
          stroke="#fff"
          strokeWidth="0.25"
          strokeLinejoin="round"
        />
      </svg>
      {!compact && (
        <span>
          Service<span className="text-blue-700 dark:text-blue-400">Trident</span>
        </span>
      )}
    </span>
  );
}
