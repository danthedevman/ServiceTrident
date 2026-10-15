import { useEffect, useRef } from 'react';

/** Observe the list's own scroll pane; failed requests wait for an explicit retry. */
export function useInfiniteScroll(resource) {
  const sentinel = useRef(null);
  useEffect(() => {
    const element = sentinel.current;
    if (!element || !resource.hasMore || resource.pending || resource.error) return;
    const root = element.closest('.list-outlet, .record-scroll-area, .page-scroll-area');
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) void resource.loadMore();
      },
      { root, rootMargin: '240px' },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [resource.hasMore, resource.pending, resource.error, resource.loadMore]);
  return sentinel;
}
