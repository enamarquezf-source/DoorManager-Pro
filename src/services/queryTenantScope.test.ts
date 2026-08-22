import { describe, expect, it, vi } from 'vitest';

const rpc = vi.fn();

vi.mock('../lib/supabase/client', () => ({ supabase: { rpc } }));

describe('tenant company helpers', () => {
  it('separates profile company from operating company', async () => {
    rpc.mockImplementation(async (name: string) => ({ data: name === 'current_company_id' ? 'profile-company' : 'operating-company', error: null }));
    const { currentCompanyId, currentProfileCompanyId, operatingCompanyId } = await import('./query');

    await expect(currentProfileCompanyId()).resolves.toBe('profile-company');
    await expect(operatingCompanyId()).resolves.toBe('operating-company');
    await expect(currentCompanyId()).resolves.toBe('operating-company');
    expect(rpc).toHaveBeenNthCalledWith(1, 'current_company_id');
    expect(rpc).toHaveBeenNthCalledWith(2, 'dmp_operating_company_id');
    expect(rpc).toHaveBeenNthCalledWith(3, 'dmp_operating_company_id');
  });

  it('fails closed when the profile has no company', async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    const { currentProfileCompanyId } = await import('./query');

    await expect(currentProfileCompanyId()).rejects.toThrow('empresa operativa válida');
  });
});
