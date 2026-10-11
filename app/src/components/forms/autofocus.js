import { useLayoutEffect, useRef } from 'react';

/** Focus once after an async create form appears, without stealing focus during tab switches or refreshes. */
export function useFirstFormFieldFocus(root, requested, active, route) {
  const completed = useRef(null);
  useLayoutEffect(() => {
    if (!requested || !active || completed.current === route || !root.current) return;
    const focus = () => {
      const controls = root.current.querySelectorAll(
        'form input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]), form textarea, form [role="combobox"], form [contenteditable="true"]',
      );
      const first = [...controls].find(
        (control) =>
          !control.disabled &&
          !control.readOnly &&
          control.getClientRects().length &&
          !control.closest('[hidden], [inert]'),
      );
      if (!first) return false;
      if (
        !root.current.contains(document.activeElement) ||
        !document.activeElement.matches(
          'input, textarea, [role="combobox"], [contenteditable="true"]',
        )
      )
        first.focus({ preventScroll: true });
      completed.current = route;
      return true;
    };
    if (focus()) return;
    const observer = new MutationObserver(() => {
      if (focus()) observer.disconnect();
    });
    observer.observe(root.current, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [root, requested, active, route]);
}
