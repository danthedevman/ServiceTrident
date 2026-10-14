import { useEffect } from 'react';

/** Native dragging does not reliably scroll nested owners. Keep scrolling while the pointer stays at an edge. */
export function useBoardDragScroll(board, active) {
  useEffect(() => {
    if (!active || !board.current) return;
    const surface = board.current;
    const page = surface.closest('.task-board-page');
    if (!page) return;
    let pointer = null,
      frame,
      previous;
    const speed = (position, start, end) => {
      const edge = Math.min(64, (end - start) / 4);
      if (position < start || position > end || edge <= 0) return 0;
      if (position < start + edge) return -800 * ((start + edge - position) / edge) ** 2;
      if (position > end - edge) return 800 * ((position - end + edge) / edge) ** 2;
      return 0;
    };
    const scroll = (time) => {
      const seconds = previous === undefined ? 0 : Math.min((time - previous) / 1000, 0.05);
      previous = time;
      if (pointer) {
        const bounds = page.getBoundingClientRect(),
          laneBounds = surface.getBoundingClientRect();
        const left = Math.max(0, bounds.left, laneBounds.left),
          right = Math.min(innerWidth, bounds.right, laneBounds.right);
        const top = Math.max(0, bounds.top),
          bottom = Math.min(innerHeight, bounds.bottom);
        if (pointer.x >= left && pointer.x <= right && pointer.y >= top && pointer.y <= bottom) {
          surface.scrollLeft += speed(pointer.x, left, right) * seconds;
          page.scrollTop += speed(pointer.y, top, bottom) * seconds;
        }
      }
      frame = requestAnimationFrame(scroll);
    };
    const track = (event) => {
      pointer = { x: event.clientX, y: event.clientY };
    };
    const stop = () => {
      pointer = null;
      cancelAnimationFrame(frame);
    };
    const leave = (event) => {
      if (!event.relatedTarget) pointer = null;
    };
    document.addEventListener('dragover', track, true);
    document.addEventListener('drop', stop, true);
    document.addEventListener('dragend', stop, true);
    document.addEventListener('dragleave', leave, true);
    frame = requestAnimationFrame(scroll);
    return () => {
      stop();
      document.removeEventListener('dragover', track, true);
      document.removeEventListener('drop', stop, true);
      document.removeEventListener('dragend', stop, true);
      document.removeEventListener('dragleave', leave, true);
    };
  }, [board, active]);
}
