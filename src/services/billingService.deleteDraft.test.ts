import { beforeEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.fn();

vi.mock('../lib/supabase/client', () => ({
  supabase: { rpc },
}));

describe('billingService.deleteDraft', () => {
  beforeEach(() => rpc.mockReset());

  it('invoca la RPC 092 con el nombre exacto del parametro y acepta RETURNS void', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: null });
    const { billingService } = await import('./billingService');

    await expect(billingService.deleteDraft('invoice-092')).resolves.toBeNull();
    expect(rpc).toHaveBeenCalledOnce();
    expect(rpc).toHaveBeenCalledWith('dmp_delete_invoice_draft', { p_invoice_id: 'invoice-092' });
  });

  it('propaga el error de la RPC como error funcional', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { code: '42501', message: 'permiso: no tienes permiso para eliminar borradores' } });
    const { billingService } = await import('./billingService');

    await expect(billingService.deleteDraft('invoice-092')).rejects.toThrow('permiso: no tienes permiso para eliminar borradores');
  });
});
