import React, { createContext, useId, useRef, useState } from 'react';
import { EllipsisVerticalIcon } from '@heroicons/react/24/outline';

export const ActionMenuContext = createContext(false);

/** Native top-layer popover avoids clipping inside scrollable tables and modal dialogs. */
export function ActionMenu({ children, label = 'More actions', borderless = false }) {
  const id = useId(),
    panel = useRef(null),
    trigger = useRef(null),
    [open, setOpen] = useState(false);
  function show() {
    const menu = panel.current;
    if (menu.matches(':popover-open')) {
      menu.hidePopover();
      return;
    }
    menu.showPopover();
    const anchor = trigger.current.getBoundingClientRect(),
      bounds = menu.getBoundingClientRect();
    menu.style.left = `${Math.max(8, Math.min(anchor.right - bounds.width, window.innerWidth - bounds.width - 8))}px`;
    menu.style.top = `${Math.max(8, Math.min(anchor.bottom + 6, window.innerHeight - bounds.height - 8))}px`;
    menu.querySelector('button:not(:disabled), a[href], input:not(:disabled)')?.focus();
  }
  return (
    <>
      <button
        ref={trigger}
        type="button"
        className={`btn-secondary !p-2.5 ${borderless ? '!border-0 !bg-transparent !shadow-none' : ''}`}
        aria-label={label}
        title={label}
        aria-expanded={open}
        aria-controls={id}
        aria-haspopup="true"
        onClick={show}
      >
        <EllipsisVerticalIcon className="h-5 w-5" aria-hidden="true" />
      </button>
      <div
        ref={panel}
        id={id}
        popover="auto"
        className="action-menu"
        onToggle={(event) => setOpen(event.newState === 'open')}
        onClick={(event) => {
          if (event.target.closest('button:not(:disabled), a[href]')) panel.current.hidePopover();
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault();
            event.stopPropagation();
            panel.current.hidePopover();
            trigger.current.focus();
            return;
          }
          const items = [
            ...panel.current.querySelectorAll(
              'button:not(:disabled), a[href], input:not(:disabled)',
            ),
          ];
          let index = items.indexOf(document.activeElement);
          if (event.key === 'ArrowDown') index = (index + 1) % items.length;
          else if (event.key === 'ArrowUp') index = (index + items.length - 1) % items.length;
          else if (event.key === 'Home') index = 0;
          else if (event.key === 'End') index = items.length - 1;
          else return;
          event.preventDefault();
          items[index]?.focus();
        }}
      >
        <ActionMenuContext.Provider value={true}>{children}</ActionMenuContext.Provider>
      </div>
    </>
  );
}
