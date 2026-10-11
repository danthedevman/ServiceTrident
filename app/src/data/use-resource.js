import { ActivePanelContext } from '../components/record-tabs.jsx';
import { useContext } from 'react';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { AuthContext } from '../auth/auth-context.js';
import { infiniteResourceOptions, resourceOptions } from './query-client.js';

/** Share authenticated reads across every consumer; retain data while refreshing in the background.
 * Query keys include the full path, including pagination/filter parameters. No placeholder data
 * from another page or account is substituted. Public reads have a separate cache namespace.
 * @param {string|null} path @param {number} [pollMs]
 */
export function useResource(path, pollMs = 0) {
  const active = useContext(ActivePanelContext);
  const { user, loading: sessionLoading } = useContext(AuthContext);
  const publicRead = path?.startsWith('/public/');
  const enabled = active && !!path && (publicRead || (!sessionLoading && !!user));
  const query = useQuery({
    ...resourceOptions(path, user?.email ?? null),
    enabled,
    refetchInterval: pollMs || false,
  });
  // A revoked public link must not continue displaying its cached status data.
  const data = publicRead && query.error ? null : query.data;
  return {
    data,
    error: query.error?.message ?? '',
    loading: !!path && query.isPending,
    pending: !!path && (query.isPending || query.isFetching),
    refreshing: !!data && query.isFetching,
    refresh: () => (enabled ? query.refetch() : Promise.resolve()),
  };
}

/** Load additional server pages without replacing already visible results. */
export function useInfiniteResource(path) {
  const active = useContext(ActivePanelContext);
  const { user, loading } = useContext(AuthContext);
  const enabled = active && !!path && !loading && !!user;
  const query = useInfiniteQuery({
    ...infiniteResourceOptions(path, user?.email ?? null),
    enabled,
  });
  return {
    data: query.data,
    error: query.error?.message ?? '',
    pending: enabled && query.isFetching,
    hasMore: query.hasNextPage,
    refresh: () => (enabled ? query.refetch() : Promise.resolve()),
    loadMore: () =>
      enabled && query.hasNextPage && !query.isFetching
        ? query.fetchNextPage({ cancelRefetch: false })
        : Promise.resolve(),
  };
}
