import { useQuery } from '@tanstack/react-query';

export type LoadState<T> = { data: T; loading: boolean; refreshing: boolean; error: string };

// Transitional adapter: legacy screens keep their API while all server state uses Query.
export function useLoad<T>(loader: (signal: AbortSignal) => Promise<T>, deps: unknown[] = [], empty: T) {
  const query = useQuery({
    queryKey: ['legacy-load', loader.toString(), ...deps],
    queryFn: ({ signal }) => loader(signal),
  });
  const state: LoadState<T> = {
    data: query.data ?? empty,
    loading: query.isPending,
    refreshing: query.isFetching && !query.isPending,
    error: query.error instanceof Error ? query.error.message : query.error ? 'Error inesperado' : '',
  };
  return { ...state, reload: () => query.refetch() };
}
