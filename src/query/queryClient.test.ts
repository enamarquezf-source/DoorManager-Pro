import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import { queryKeys } from './queryKeys';

describe('query cache foundation', () => {
  it('deduplicates concurrent consumers and reuses fresh data', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { staleTime: 60_000, retry: false } } });
    const loader = vi.fn().mockResolvedValue([{ id: 'type-1' }]);
    const key = queryKeys.equipmentTypes('company-a');
    await Promise.all([client.fetchQuery({ queryKey: key, queryFn: loader }), client.fetchQuery({ queryKey: key, queryFn: loader })]);
    await client.fetchQuery({ queryKey: key, queryFn: loader });
    expect(loader).toHaveBeenCalledOnce();
    expect(client.getQueryData(key)).toEqual([{ id: 'type-1' }]);
    client.removeQueries({ queryKey: queryKeys.equipmentTypes('company-b') });
    expect(client.getQueryData(key)).toEqual([{ id: 'type-1' }]);
  });

  it('keeps stale data when a refresh fails', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const key = queryKeys.equipmentTypes('company-a');
    client.setQueryData(key, [{ id: 'old' }]);
    await expect(client.fetchQuery({ queryKey: key, queryFn: () => Promise.reject(new Error('refresh failed')) })).rejects.toThrow('refresh failed');
    expect(client.getQueryData(key)).toEqual([{ id: 'old' }]);
  });
});
