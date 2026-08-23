import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const migration = readFileSync(new URL('../../supabase/migrations/067_canonical_work_order_sales.sql', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const app = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');

describe('067 canonical work-order sales', () => {
  it('keeps the quoted and operational sale branches separate', () => {
    expect(migration).toContain('when b.has_accepted_quote then round(b.quoted_calc+b.additional_calc,2)');
    expect(migration).toContain('else round(b.material_sale+b.time_sale+b.auxiliary_sale,2)');
    expect(migration).toContain("source <> 'quote' and contributes_to_sale");
  });

  it('keeps warranty cost while forcing sale to zero and calculates margin from both', () => {
    expect(migration).toContain("when b.warranty or not b.billable or b.economic_status in ('garantia','no_facturable') then 0");
    expect(migration).toContain('round(sale_calc-real_cost_calc,2) margin_amount');
    expect(migration).toContain("case when warranty or not billable or economic_status in ('garantia','no_facturable') then 'non_billable'");
  });

  it('makes dashboard economics use the same canonical work-order universe', () => {
    expect(migration).toContain('round(sum(sale_amount),2) sale_amount');
    expect(migration).toContain("status in ('Finalizado tecnicamente','Enviado','Cerrado') and sale_amount>0");
    expect(migration).toContain('round(coalesce(w.sale_amount,0)-coalesce(w.real_cost,0),2) margin_amount');
    expect(migration).not.toContain('orphan_quote_sale_amount');
  });

  it('labels the management cards according to their canonical universe', () => {
    expect(app).toContain("kpiCard('Venta sin IVA'");
    expect(app).toContain("'Partes facturables'");
    expect(app).toContain("'Venta presupuestada u operativa sin IVA'");
    expect(app).toContain('Partes realizados');
  });
});
