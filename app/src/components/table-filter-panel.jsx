import React, { useEffect, useId, useRef } from 'react';
import { XMarkIcon } from '@heroicons/react/24/outline';

/** Non-modal top-layer panel keeps live table results visible and interactive. */
export function TableFilterPanel({ title, anchorRef, onClose, children }) {
  const panel = useRef(null);
  const titleId = useId();
  useEffect(() => {
    const element = panel.current;
    const anchor = anchorRef.current;
    function position() {
      const bounds = anchor.getBoundingClientRect();
      element.style.maxHeight = `${window.innerHeight - 24}px`;
      const height = element.getBoundingClientRect().height;
      element.style.left = `${Math.max(12, Math.min(bounds.right - element.offsetWidth, window.innerWidth - element.offsetWidth - 12))}px`;
      element.style.top = `${Math.max(12, Math.min(bounds.bottom + 8, window.innerHeight - height - 12))}px`;
    }
    element.showPopover();
    position();
    element
      .querySelector('button:not(:disabled), input:not(:disabled), select:not(:disabled)')
      ?.focus({ preventScroll: true });
    const observer = new ResizeObserver(position);
    observer.observe(element);
    window.addEventListener('resize', position);
    window.addEventListener('scroll', position, true);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', position);
      window.removeEventListener('scroll', position, true);
      const restore =
        element.contains(document.activeElement) || document.activeElement === document.body;
      element.hidePopover();
      if (restore && anchor?.isConnected) anchor.focus({ preventScroll: true });
    };
  }, []);
  return (
    <div
      ref={panel}
      popover="auto"
      role="dialog"
      aria-labelledby={titleId}
      className="table-filter-panel rounded-xl border border-slate-200 bg-white text-slate-800 shadow-lg dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
      onToggle={(event) => {
        if (event.target === event.currentTarget && event.newState === 'closed') onClose();
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && !event.defaultPrevented) {
          event.preventDefault();
          event.stopPropagation();
          onClose();
        }
      }}
    >
      <header className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3 dark:border-slate-700">
        <h2 id={titleId} className="font-semibold">
          {title}
        </h2>
        <button
          type="button"
          className="btn-secondary !p-2"
          aria-label={`Close ${title.toLowerCase()}`}
          onClick={onClose}
        >
          <XMarkIcon className="h-4 w-4" aria-hidden="true" />
        </button>
      </header>
      <div className="table-filters space-y-4 p-4">{children}</div>
      <footer className="flex justify-end border-t border-slate-200 px-4 py-3 dark:border-slate-700">
        <button type="button" className="btn-primary" onClick={onClose}>
          Done
        </button>
      </footer>
    </div>
  );
}
