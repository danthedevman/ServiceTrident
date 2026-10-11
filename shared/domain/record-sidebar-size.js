export const RECORD_SIDEBAR_MIN = 240;
export const RECORD_SIDEBAR_MAX = 560;
export const RECORD_SIDEBAR_SNAP = 160;
export const RECORD_SIDEBAR_COLLAPSED = 64;

/** Below the snap threshold the rail collapses; expanded widths remain bounded. */
export function recordSidebarSize(width) {
  if (width <= RECORD_SIDEBAR_SNAP) return RECORD_SIDEBAR_COLLAPSED;
  return Math.min(RECORD_SIDEBAR_MAX, Math.max(RECORD_SIDEBAR_MIN, Math.round(width)));
}
