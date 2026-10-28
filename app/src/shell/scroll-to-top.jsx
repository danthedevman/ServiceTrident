import { useLayoutEffect } from 'react';
import { useLocation } from 'react-router-dom';

/** Start each navigation at the top before paint, including browser back/forward.
 * Data refreshes and local table state do not trigger a navigation reset.
 */
export function ScrollToTop() {
  const { key } = useLocation();
  useLayoutEffect(() => {
    const previous = window.history.scrollRestoration;
    window.history.scrollRestoration = 'manual';
    return () => {
      window.history.scrollRestoration = previous;
    };
  }, []);
  useLayoutEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    for (const node of document.querySelectorAll(
      '#main, .page-scroll-area, .dashboard-scroll-area, .record-scroll-area, .record-sidebar-content, .table-rows',
    )) {
      if (!node.closest('[hidden], [inert]'))
        node.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    }
  }, [key]);
  return null;
}
