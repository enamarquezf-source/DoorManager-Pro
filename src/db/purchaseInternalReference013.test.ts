import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import pgQuery from 'pg-query-emscripten';

const migration = readFileSync(new URL('../../supabase/migrations/129_purchase_order_internal_reference.sql', import.meta.url), 'utf8');
const verification = readFileSync(new URL('../../supabase/verification/verify_129_purchase_order_internal_reference.sql', import.meta.url), 'utf8');
const app = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');
const legacyContextual = app.slice(app.indexOf('function LegacyContextualPurchaseFlow013'), app.indexOf('function PurchaseOrdersModule'));

describe('PURCHASE-INTERNAL-REFERENCE-013', () => {
  it('defines an additive nullable field and canonical plus compatibility RPCs', async () => {
    expect(migration).toContain('add column if not exists internal_reference text');
    expect(migration).toContain('supplier_reference');
    expect(migration).toContain('p_internal_reference text');
    expect(migration).toContain("p_order_date date default current_date");
    expect(migration).toContain('p_destination_warehouse_id uuid default null');
    expect(migration).toContain("has_permission('purchase_orders.create')");
    expect(migration).toContain("has_permission('purchase_orders.update')");
    expect(migration).not.toMatch(/has_any_role.*purchase_order/i);
    expect(migration).toContain('grant execute on function public.dmp_create_purchase_order(uuid, uuid, date, uuid, text, text, text) to authenticated');
    expect(migration).toContain('null);');
    expect((await pgQuery()).parse(migration).parse_tree.stmts.length).toBeGreaterThan(0);
  });

  it('retains the purchase receipt status contract in the recreated guard', () => {
    expect(migration).toContain("old.status = 'draft' and new.status not in ('draft','ordered','cancelled')");
    expect(migration).toContain("old.status = 'ordered' and new.status not in ('ordered','partially_received','received','cancelled')");
    expect(migration).toContain("old.status = 'partially_received' and new.status not in ('partially_received','received')");
    expect(migration).toContain("old.status in ('received','cancelled') and new.status is distinct from old.status");
    expect(migration).toContain("new.status = 'cancelled' and old.status = 'ordered' and exists (select 1 from public.purchase_receipts where purchase_order_id = new.id and status = 'confirmed')");
    expect(migration).toContain("new.status = 'ordered' and (not exists (select 1 from public.purchase_order_lines where purchase_order_id = new.id) or exists (select 1 from public.purchase_order_lines where purchase_order_id = new.id and unit_purchase_price is null))");
    expect(migration).toContain('new.internal_reference is distinct from old.internal_reference');
  });

  it('keeps verification read-only and strict about shape, ACL, RLS and semantics', async () => {
    expect(verification).toContain('to_regprocedure');
    expect(verification).toContain('aclexplode');
    expect(verification).toContain('relrowsecurity');
    expect(verification).toContain('attnotnull');
    expect(verification).toContain('pronargdefaults');
    expect(verification).toContain('current_date');
    expect(verification).not.toMatch(/^\s*(insert|update|delete|alter|create|drop|grant|revoke)\b/im);
    expect((await pgQuery()).parse(verification).parse_tree.stmts.length).toBeGreaterThan(0);
  });

  it('keeps UI references independent and movements relational', () => {
    expect(app).toContain('Referencia interna');
    expect(app).toContain('Referencia proveedor');
    expect(app).toContain('<label>Referencia interna<input value={internalReference');
    expect(app).toContain('<label>Referencia proveedor<input value={supplierReference');
    expect(app).toContain('internal_reference: internalReference');
    expect(app).toContain('const internalReference = data.internal_reference');
    expect(legacyContextual).not.toContain('supplier_reference: reference');
    expect(migration).toContain('p_destination_warehouse_id uuid default null, p_supplier_reference text default null, p_notes text default null');
    expect(migration).toContain('select internal_reference into v_internal_reference');
    expect(migration).toContain('p_notes, v_internal_reference);');
    expect(migration).not.toMatch(/(insert|update)\s+public\.stock_movements/i);
  });
});
