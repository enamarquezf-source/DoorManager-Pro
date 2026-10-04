import { readFileSync } from 'node:fs';
import pgQuery from 'pg-query-emscripten';
import { describe, expect, it } from 'vitest';
import { invoiceLineAmounts } from '../shared/invoiceDraftReview';

const sql = readFileSync('supabase/migrations/151_preserve_invoice_hour_precision.sql', 'utf8');
describe('invoice hour precision repair', () => {
  it('preserves approved minute-derived prices after editing and saving', () => {
    for (const [minutes, price] of [[400, 110], [61, 55], [95, 110]]) {
      const quantity = Math.round(minutes / 60 * 1e9) / 1e9;
      expect(invoiceLineAmounts({ quantity, unit_price: price, discount: 0, tax_rate: 21 }).subtotal).toBe(Math.round(minutes / 60 * price * 100) / 100);
    }
    expect(invoiceLineAmounts({ quantity: 6.667, unit_price: 110, discount: 0, tax_rate: 21 }).subtotal).toBe(733.37);
  });
  it('covers both additional and ordinary labor without recalculating existing invoices', () => {
    expect(sql.match(/round\(t.duration_minutes::numeric \/ 60, 9\)/g)).toHaveLength(2);
    expect(sql).toContain('quantity type numeric(18,9)');
    expect(sql).not.toContain('round(t.duration_minutes::numeric / 60, 3)');
    expect(sql).toContain('dmp_guided_billing_eligible');
    expect(sql).toContain('assert_member_of_current_company');
    expect(sql).not.toMatch(/^update public\.(invoices|invoice_work_orders)/m);
  });
  it('is a valid transaction', async () => {
    const parser = await pgQuery();
    expect(parser.parse(sql).error).toBeNull();
  });
});
