import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockSupabase = vi.hoisted(() => {
  const seeds = new Map<string, any[]>();
  const calls: { table: string; filters: { op: string; col: string; value: any }[] }[] = [];

  const from = (table: string) => {
    const entry = { table, filters: [] as { op: string; col: string; value: any }[] };
    calls.push(entry);
    const filtered = () => {
      const rows = seeds.get(table) ?? [];
      return rows.filter((row: any) => entry.filters.every((f) => {
        if (f.op === 'eq') return row[f.col] === f.value;
        if (f.op === 'is') return f.value === null ? row[f.col] == null : row[f.col] === f.value;
        return true;
      }));
    };
    const chain: any = {
      select: () => chain,
      eq: (col: string, value: any) => { entry.filters.push({ op: 'eq', col, value }); return chain; },
      is: (col: string, value: any) => { entry.filters.push({ op: 'is', col, value }); return chain; },
      not: (col: string, value: any) => { entry.filters.push({ op: 'not', col, value }); return chain; },
      order: () => chain,
      limit: () => chain,
      maybeSingle: () => Promise.resolve({ data: filtered()[0] ?? null, error: null }),
      then: (resolve: (value: any) => any, reject?: (reason?: any) => any) => Promise.resolve({ data: filtered(), error: null }).then(resolve, reject),
    };
    return chain;
  };

  return {
    seeds,
    calls,
    supabase: {
      from,
      rpc: () => Promise.resolve({ data: null, error: null }),
    },
  };
});

vi.mock('../lib/supabase/client', () => ({ supabase: mockSupabase.supabase }));

import { quotesService } from './quotesService';

const activeQuote = {
  id: 'q-active', company_id: 'c1', client_id: 'cl1', site_id: null, equipment_id: null,
  work_order_id: null, opportunity_id: null, case_id: null, status: 'Borrador', quote_type: 'reparacion',
  code: 'PRE-0001', title: 'Presupuesto activo', issue_date: '2026-01-10',
  subtotal_cost: 100, subtotal_sale: 200, taxable_base: 200, total_amount: 242, estimated_margin: 100,
  deleted_at: null,
};

const archivedQuote = {
  ...activeQuote,
  id: 'q-archived',
  code: 'PRE-0002',
  title: 'Presupuesto archivado',
  deleted_at: '2026-02-01T10:00:00.000Z',
};

const baseSeed = (quoteId: string) => ({
  seeds: () => {
    mockSupabase.seeds.set('quotes', [quoteId === activeQuote.id ? activeQuote : archivedQuote]);
    mockSupabase.seeds.set('clients', [{ id: 'cl1', code: 'CL-1', legal_name: 'Cliente de prueba', email: 'cliente@example.com', company_id: 'c1', deleted_at: null }]);
    mockSupabase.seeds.set('quote_lines', [{ id: 'l1', quote_id: quoteId, line_type: 'material', description: 'Línea 1', position: 1, quantity: 1, unit_cost: 100, unit_price: 200, tax_rate: 21, deleted_at: null }]);
  },
});

describe('quotesService.get: flujo de presupuestos archivados', () => {
  beforeEach(() => {
    mockSupabase.seeds.clear();
    mockSupabase.calls.length = 0;
  });

  it('carga un presupuesto activo normalmente', async () => {
    baseSeed(activeQuote.id).seeds();
    mockSupabase.seeds.set('work_orders', [
      { id: 'wo-generated', quote_id: activeQuote.id, code: 'PTE-0001', title: 'Parte generado', status: 'Pendiente', scheduled_date: '2026-01-12', deleted_at: null },
    ]);

    const result = await quotesService.get(activeQuote.id);

    expect(result.id).toBe(activeQuote.id);
    expect(result.deleted_at).toBeNull();
    expect(result.clients?.legal_name).toBe('Cliente de prueba');
    expect(result.quote_lines).toHaveLength(1);
    expect(result.generated_work_orders).toHaveLength(1);
  });

  it('abre un presupuesto archivado sin filtrar deleted_at en la cabecera', async () => {
    baseSeed(archivedQuote.id).seeds();
    mockSupabase.seeds.set('quote_lines', [
      { ...(mockSupabase.seeds.get('quote_lines')![0]), deleted_at: archivedQuote.deleted_at },
    ]);
    mockSupabase.seeds.set('work_orders', [
      { id: 'wo-generated', quote_id: archivedQuote.id, code: 'PTE-0002', title: 'Parte generado', status: 'Aceptado', scheduled_date: '2026-01-15', deleted_at: null },
    ]);

    const result = await quotesService.get(archivedQuote.id);

    expect(result).not.toBeNull();
    expect(result.id).toBe(archivedQuote.id);
    expect(result.deleted_at).toBe(archivedQuote.deleted_at);
    expect(result.quote_lines).toHaveLength(0);
    expect(result.generated_work_orders).toHaveLength(1);

    const quoteFetch = mockSupabase.calls.find((call) => call.table === 'quotes');
    expect(quoteFetch?.filters.some((f) => f.col === 'deleted_at')).toBe(false);
    const generatedFetch = mockSupabase.calls.find((call) => call.table === 'work_orders' && call.filters.some((f) => f.col === 'quote_id'));
    expect(generatedFetch?.filters.some((f) => f.col === 'deleted_at' && f.value === null)).toBe(true);
  });

  it('lanza el error esperado para un id inexistente', async () => {
    await expect(quotesService.get('id-inexistente')).rejects.toThrow('No se ha encontrado el presupuesto solicitado.');
  });
});