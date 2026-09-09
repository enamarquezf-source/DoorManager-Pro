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

  it('does not reuse a fresh work order cache across access modes', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { staleTime: 60_000, retry: false } } });
    const fullKey = queryKeys.workOrders.detail('company-a', 'work-1', false);
    const technicianKey = queryKeys.workOrders.detail('company-a', 'work-1', true);
    const fullLoader = vi.fn().mockResolvedValue({ mode: 'full' });
    const technicianLoader = vi.fn().mockResolvedValue({ mode: 'technician' });

    await client.fetchQuery({ queryKey: fullKey, queryFn: fullLoader });
    await client.fetchQuery({ queryKey: technicianKey, queryFn: technicianLoader });

    expect(fullLoader).toHaveBeenCalledOnce();
    expect(technicianLoader).toHaveBeenCalledOnce();
    expect(client.getQueryData(fullKey)).toEqual({ mode: 'full' });
    expect(client.getQueryData(technicianKey)).toEqual({ mode: 'technician' });
  });
});
