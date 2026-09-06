import { describe, expect, it } from 'vitest';
import { queryKeys } from './queryKeys';

describe('multitenant query keys', () => {
  it('separates the same catalog by company', () => {
    expect(queryKeys.equipmentTypes('company-a')).not.toEqual(queryKeys.equipmentTypes('company-b'));
    expect(queryKeys.checkTemplates('company-a')).toEqual(['company', 'company-a', 'check-templates', 'active']);
  });

  it('keeps invalidation scoped to the exact catalog and tenant', () => {
    const target = queryKeys.equipmentTypes('company-a');
    expect(queryKeys.equipmentTypes('company-b')).not.toEqual(target);
    expect(queryKeys.profiles('company-a', 'technicians')).not.toEqual(target);
  });

  it('separates work order list filters and detail caches by tenant', () => {
    expect(queryKeys.workOrders.list('company-a', { search: 'a' })).not.toEqual(queryKeys.workOrders.list('company-b', { search: 'a' }));
    expect(queryKeys.workOrders.list('company-a', { search: 'a' })).not.toEqual(queryKeys.workOrders.list('company-a', { search: 'ab' }));
    expect(queryKeys.workOrders.summary('company-a', 'work-1')).not.toEqual(queryKeys.workOrders.summary('company-b', 'work-1'));
  });
});
