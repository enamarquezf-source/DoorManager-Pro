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
});
