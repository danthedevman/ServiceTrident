import { QueryClient } from '@tanstack/react-query';
import { api } from './api.js';

/** One in-memory cache for the browser session; never persist private responses to storage. */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15_000,
      gcTime: 5 * 60_000,
      retry: false,
      refetchOnWindowFocus: true,
    },
  },
});

/** Namespace private responses by account and public responses by their token-bearing URL. */
export function resourceKey(path, account) {
  return path?.startsWith('/public/') ? ['public', path] : ['private', account, path];
}

/** Use identical freshness and fetch rules for route reads and prefetching. */
export function resourceOptions(path, account) {
  return {
    queryKey: resourceKey(path, account),
    queryFn: ({ signal }) => api(path, { signal }),
    ...(path?.startsWith('/related-counts/') ? { refetchOnWindowFocus: false } : {}),
    staleTime: path?.startsWith('/related-counts/')
      ? 60_000
      : path?.includes('/events/')
        ? 5 * 60_000
        : ['/services', '/collections', '/status-settings'].includes(path)
          ? 60_000
          : 15_000,
  };
}

/** Keep infinite lists in the private cache and request one bounded server page at a time. */
export function infiniteResourceOptions(path, account) {
  return {
    ...resourceOptions(path, account),
    queryKey: [...resourceKey(path, account), 'infinite'],
    initialPageParam: 1,
    queryFn: ({ signal, pageParam }) =>
      api(`${path}${path.includes('?') ? '&' : '?'}page=${pageParam}`, { signal }),
    getNextPageParam: (lastPage, _pages, lastPageParam) =>
      (lastPage.hasMore ?? lastPage.page * lastPage.pageSize < lastPage.total)
        ? lastPageParam + 1
        : undefined,
  };
}

/** Warm likely navigation destinations on hover/focus without persisting responses. */
export function prefetchRoute(route, user) {
  if (!user) return;
  const paths =
    route === '/' || route === '/dashboard'
      ? ['/response-dashboard', '/status']
      : route === '/status'
        ? ['/status', '/status-settings']
        : ['/services', '/collections'].includes(route)
          ? [
              `/tables/${route.slice(1)}?search=&searchColumn=&sortBy=name&order=asc&page=1&pageSize=10&from=&to=`,
            ]
          : route === '/monitors'
            ? [
                '/tables/monitors?search=&searchColumn=&sortBy=name&order=asc&page=1&pageSize=10&from=&to=',
              ]
            : [];
  for (const path of paths) void queryClient.prefetchQuery(resourceOptions(path, user.email));
}

/** Cancel old requests before removing their data, including pending responses during logout. */
export function clearPrivateCache() {
  void queryClient.cancelQueries({ queryKey: ['private'] });
  queryClient.removeQueries({ queryKey: ['private'] });
}

/** Change the session and discard all previous account data, including cached profile edits. */
export function setSessionUser(user) {
  void queryClient.cancelQueries({ queryKey: ['session'] });
  queryClient.setQueryData(['session'], { user });
  clearPrivateCache();
}

/** Centralize write invalidation so lists, breadcrumbs, forms, dashboards, and status stay consistent.
 * All existing mutation forms keep their field errors and busy state. Writes are never retried.
 */
export async function writeApi(path, options) {
  const sessionUser = queryClient.getQueryData(['session'])?.user;
  const account = sessionUser?.email;
  const result = await api(path, options);
  if (
    (!path.startsWith('/auth/') || path === '/auth/details' || path === '/auth/photo') &&
    account
  ) {
    const prefix = ['private', account];
    await queryClient.cancelQueries({ queryKey: prefix });
    if (queryClient.getQueryData(['session'])?.user !== sessionUser) return result;
    if (options.method === 'DELETE') {
      queryClient.removeQueries({
        predicate: ({ queryKey }) =>
          queryKey[0] === 'private' &&
          queryKey[1] === account &&
          (queryKey[2] === path || queryKey[2]?.startsWith(`${path}/`)),
      });
    }
    // Prime exact detail responses where the mutation returns that same API shape.
    if (result?.monitor && queryClient.getQueryData(['session'])?.user === sessionUser) {
      queryClient.setQueryData(resourceKey(`/monitors/${result.monitor.id}`, account), result);
    }
    if (path === '/status-settings') {
      queryClient.setQueryData(resourceKey(path, account), result);
    }
    if (path === '/status-settings' || path === '/status-settings/icon') {
      void queryClient.cancelQueries({ queryKey: ['public'] });
      queryClient.removeQueries({ queryKey: ['public'] });
    }
    await queryClient.invalidateQueries({ queryKey: prefix });
  }
  if (path === '/auth/details' || path === '/auth/photo' || path.startsWith('/member-photos/'))
    await queryClient.invalidateQueries({ queryKey: ['session'] });
  return result;
}
