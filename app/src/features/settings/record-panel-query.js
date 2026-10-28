// Match the bounded page sizes accepted by the shared table API.
export const RECORD_PANEL_PAGE_SIZE = 10;
export function recordPanelParams({ search = '', sortBy, order = 'asc', page = 1 }) {
  return new URLSearchParams({
    search,
    sortBy,
    order,
    page: String(page),
    pageSize: String(RECORD_PANEL_PAGE_SIZE),
  });
}
