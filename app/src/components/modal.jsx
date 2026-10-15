import React, { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { XMarkIcon } from '@heroicons/react/24/outline';

/** Accessible native modal centered in the main content area using the shell's rail offsets.
 * Mount only while open; keep unsaved inputs on refresh.
 * @param {{title: string, onClose: Function, busy?: boolean, children: React.ReactNode, footer?: React.ReactNode, initialFocusRef?: object}} props
 */
export function Modal({
  title,
  onClose,
  busy = false,
  children,
  footer,
  footerBorder = true,
  initialFocusRef,
  className = '',
}) {
  const ref = useRef(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = ref.current;
    const trigger = document.activeElement;
    const overflow = document.body.style.overflow;
    dialog.showModal();
    initialFocusRef?.current?.focus({ preventScroll: true });
    document.body.style.overflow = 'hidden';
    return () => {
      dialog.close();
      document.body.style.overflow = overflow;
      if (trigger?.isConnected) trigger.focus();
    };
  }, []);
  return createPortal(
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      className={`modal-frame overflow-hidden rounded-2xl border border-slate-200 bg-white p-0 text-slate-800 shadow-xl backdrop:bg-slate-950/50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 ${className}`}
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
      onClick={(event) => {
        if (busy || event.target !== event.currentTarget) return;
        const bounds = event.currentTarget.getBoundingClientRect();
        if (
          event.clientX < bounds.left ||
          event.clientX > bounds.right ||
          event.clientY < bounds.top ||
          event.clientY > bounds.bottom
        )
          onClose();
      }}
    >
      <header className="shrink-0 flex items-center justify-between gap-4 border-b border-slate-200 bg-white px-6 py-4 dark:border-slate-700 dark:bg-slate-900">
        <h2 id={titleId} title={title} className="min-w-0 truncate text-xl font-semibold">
          {title}
        </h2>
        <button
          type="button"
          disabled={busy}
          onClick={onClose}
          className="shrink-0 rounded-lg p-2 hover:bg-slate-100 dark:hover:bg-slate-800"
          aria-label={`Close ${title.toLowerCase()}`}
        >
          <XMarkIcon className="h-5 w-5" aria-hidden="true" />
        </button>
      </header>
      <div className="min-h-0 overflow-y-auto overscroll-contain p-6">{children}</div>
      <footer
        className={`flex shrink-0 flex-wrap items-center justify-end gap-3 px-6 py-4 ${footerBorder ? 'border-t border-slate-200 dark:border-slate-700' : ''}`}
      >
        {footer ?? (
          <button type="button" className="btn-secondary" disabled={busy} onClick={onClose}>
            Close
          </button>
        )}
      </footer>
    </dialog>,
    document.body,
  );
}
