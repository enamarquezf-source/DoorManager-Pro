import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import pgQuery from 'pg-query-emscripten';

const migration = readFileSync(new URL('../../supabase/migrations/040_validate_economic_calculations.sql', import.meta.url), 'utf8');
const app = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');

describe('economic validation 040', () => {
  it('parses migration SQL', async () => {
    const parser = await pgQuery();
    expect(parser.parse(migration).parse_tree.stmts.length).toBeGreaterThan(0);
  });

  it('keeps economic views scoped, invoker-safe and free of join multiplication', () => {
    expect(migration).toContain('with (security_invoker = true)');
    expect(migration).toContain('where work_order_id = wo.id and company_id = wo.company_id');
    expect(migration).toContain('where client_id = c.id\n    and company_id = c.company_id');
    expect(migration).toContain('left join lateral');
    expect(migration).not.toContain('left join public.v_work_order_economic_summary w on w.client_id = c.id\nleft join public.quotes q');
    expect(migration).not.toContain('sum(q.total) filter');
    expect(migration).toContain('coalesce(sum(coalesce(taxable_base, subtotal_sale, subtotal, 0)), 0) as sale_amount');
  });

  it('updates management UI labels away from VAT-inclusive profit', () => {
    expect(app).toContain('Venta sin IVA');
    expect(app).toContain('Coste real');
    expect(app).toContain('Margen');
    expect(app).toContain('Venta sin IVA, coste real y margen');
  });
});
