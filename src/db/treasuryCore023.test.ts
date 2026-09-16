import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import pgQuery from 'pg-query-emscripten';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const migration = read('../../supabase/migrations/132_treasury_core.sql');
const authMigration = read('../../supabase/migrations/123_auth_rbac_navigation.sql');
const verify = read('../../supabase/verification/verify_132_treasury_core.sql');
const treasuryService = read('../services/treasuryService.ts');
const treasuryModule = read('../modules/TreasuryModule.tsx');

describe('TREASURY-CORE-023', () => {
  it('parses migration and strict verification SQL', async () => {
    const parser = await pgQuery();
    expect(parser.parse(migration).parse_tree.stmts.length).toBeGreaterThan(0);
    expect(parser.parse(verify).parse_tree.stmts.length).toBe(1);
  });

  it('defines derived tenant-safe accounts and append-oriented movements', () => {
    for (const value of ['treasury_accounts', 'treasury_transactions', 'opening_balance', 'opening_balance_date', 'concept', "direction in ('inflow','outflow')", "source_type in ('customer_payment','supplier_payment','manual','transfer')", 'reversed_at', 'security_invoker = true']) expect(migration).toContain(value);
    expect(migration).not.toContain('current_balance');
    expect(migration).toContain('source_id is null');
    expect(migration).toContain('treasury_transactions_source_unique');
  });

  it('integrates payments, manual movements and two-leg transfers', () => {
    for (const rpc of ['dmp_record_invoice_payment', 'dmp_record_supplier_payment', 'dmp_record_treasury_manual_movement', 'dmp_transfer_treasury', 'dmp_reverse_treasury_transfer', 'dmp_treasury_reverse']) expect(migration).toContain(rpc);
    expect(migration).toContain("source_type='customer_payment'");
    expect(migration).toContain("source_type='supplier_payment'");
    expect(migration).toContain("source_type = 'manual'");
    expect(migration).toContain('where company_id=public.current_company_id() and transfer_group_id=p_transfer_group_id');
    expect(treasuryService).toContain('dmp_record_treasury_manual_movement');
    expect(treasuryModule).toContain('Cuenta destino');
    expect(treasuryModule).toContain('Transferir entre cuentas');
  });

  it('keeps historical payment signatures revoked and permissions exact', () => {
    expect(migration).toContain('dmp_record_invoice_payment(uuid,numeric,date,text,text,text) from public,anon,authenticated');
    expect(migration).toContain('dmp_record_supplier_payment(uuid,numeric,date,text,text,text) from public,anon,authenticated');
    for (const permission of ['treasury.read', 'treasury.accounts.create', 'treasury.accounts.update', 'treasury.transactions.create', 'treasury.transactions.reverse', 'treasury.transfers.create']) expect(migration).toContain(permission);
    expect(verify).toContain('aclexplode');
    expect(verify).toContain('verify_132_treasury_core');
  });

  it('preserves payment contracts and hardens reversal/ACL boundaries', () => {
    expect(migration).not.toContain('has_any_role(array[\'superadmin\',\'Gerencia\',\'Oficina\'])');
    expect(migration).toContain("v.status in ('borrador','cancelada')");
    expect(migration).toContain("company_id=i.company_id and source_type='customer_payment'");
    expect(migration).toContain("company_id=i.company_id and source_type='supplier_payment'");
    expect(migration).toContain('order by id for update loop');
    expect(migration).toContain('if leg_count <> 2 or not valid_legs');
    expect(migration).toContain('dmp_treasury_insert(uuid,uuid,text,numeric,date,text,text,text,uuid,uuid,text,text,text,uuid) from public,anon,authenticated');
    expect(verify).toContain('expected_fks');
    expect(verify).toContain('indoption');
    expect(verify).toContain('policy_definitions');
    expect(verify).toContain('dmp_reverse_invoice_payment(uuid,text)');
    expect(verify).toContain('dmp_reverse_supplier_payment(uuid,text)');
  });

  it('separates customer billing authority from treasury authority', () => {
    expect(authMigration).toContain("('billing.read', 'Consultar facturacion y cobros'), ('billing.write', 'Gestionar facturacion y cobros')");
    expect(authMigration).toContain("and p.code in ('users.read','users.update','users.deactivate','suppliers.read','suppliers.create','suppliers.update','purchase_orders.read','purchase_orders.create','purchase_orders.update','purchase_orders.submit','purchase_orders.cancel','purchase_receipts.read','purchase_receipts.create','purchase_receipts.update','purchase_receipts.confirm','purchase_receipts.cancel','materials.read','materials.create','materials.update','materials.archive','stock.read','stock.adjust','sat.read','sat.write','sat.assign','sat.checks.manage','commercial.read','commercial.write','documents.read','documents.create','documents.update','billing.read','billing.write')");
    expect(authMigration).toContain('profile_permission_grants');
    expect(migration).toContain("public.has_permission('billing.write')");
    expect(migration).toContain("public.has_permission('treasury.transactions.create')");
    expect(migration).toContain("public.has_permission('treasury.transactions.reverse')");
    expect(migration).not.toContain("where id=p_transaction_id for update");
    expect(migration).toContain("where id=p_transaction_id and company_id=public.current_company_id() for update");
    expect(verify).toContain("acldefault('r'::\"char\"");
    expect(verify).toContain('expected_policies');
    expect(verify).toContain('treasury_accounts_type_check');
    expect(verify).toContain('structural_catalog');
    expect(verify).toContain("'RBAC','customer_payment_auth'");
  });

  it('rejects null and blank payment methods before the inserts', () => {
    for (const guard of [
      "nullif(trim(p_method),'') is null",
      "p_method not in ('transferencia','tarjeta','efectivo','domiciliacion','otro')",
      "nullif(trim(p_payment_method),'') is null",
      "p_payment_method not in ('transferencia','tarjeta','efectivo','domiciliacion','otro')",
    ]) expect(migration).toContain(guard);
    expect(verify).toContain("'VALIDATION','payment_methods'");
    expect(migration).toContain("'transferencia'");
  });
});
