import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const migration = readFileSync(new URL('../../supabase/migrations/121_supplier_details.sql', import.meta.url), 'utf8');
const verification = readFileSync(new URL('../../supabase/verification/verify_121_supplier_details.sql', import.meta.url), 'utf8');
const service = readFileSync(new URL('../services/suppliersService.ts', import.meta.url), 'utf8');
const app = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');
const prior117 = readFileSync(new URL('../../supabase/migrations/117_suppliers_material_relations.sql', import.meta.url), 'utf8');
const prior118 = readFileSync(new URL('../../supabase/migrations/118_harden_supplier_permissions.sql', import.meta.url), 'utf8');

describe('SUPPLIER-DETAILS-001', () => {
  it('adds optional general, address, contact, commercial and billing fields without changing 117/118', () => {
    for (const column of ['trade_name', 'internal_code', 'contact_name', 'website', 'fiscal_address', 'postal_code', 'city', 'province', 'country', 'payment_method', 'payment_terms_days', 'payment_due_day', 'currency_code', 'usual_discount', 'supplier_customer_reference', 'billing_email', 'billing_notes', 'internal_notes']) expect(migration).toContain(`add column if not exists ${column}`);
    expect(migration).toContain("payment_method in ('transferencia','domiciliacion','confirming','tarjeta','efectivo','otra')");
    expect(migration).toContain('payment_terms_days >= 0');
    expect(migration).toContain('payment_due_day between 1 and 31');
    expect(migration).toContain("currency_code ~ '^[A-Z]{3}$'");
    expect(migration).not.toContain('supplier_balance');
    expect(migration).not.toContain('total_paid');
    expect(verification).toContain('format_type(a.atttypid, a.atttypmod)');
    expect(verification).toContain('suppliers_payment_method_check');
    expect(verification).toContain('payment_terms_days >= 0');
    expect(verification).toContain("payment_due_day\\s+between\\s+1\\s+and\\s+31");
    expect(verification).toContain("usual_discount\\s+between\\s+0\\s+and\\s+100");
    expect(verification).toContain("v_expression !~ 'currency_code\\s*~'");
    expect(verification).toContain('usual_discount <= 100');
    expect(verification).not.toMatch(/array\s*\[\s*\['suppliers_payment_method_check'[\s\S]*?::text\[\]\[\]/);
    expect(verification).not.toMatch(/indexrelid::regclass::text\s*=\s*'public\./);
    expect(prior117).not.toContain('trade_name');
    expect(prior118).not.toContain('trade_name');
  });

  it('covers the real Supabase CHECK deparse forms', () => {
    const fixtures = [
      "CHECK (usual_discount IS NULL OR usual_discount >= 0::numeric AND usual_discount <= 100::numeric)",
      "CHECK (payment_method IS NULL OR (payment_method = ANY (ARRAY['transferencia'::text, 'domiciliacion'::text, 'confirming'::text, 'tarjeta'::text, 'efectivo'::text, 'otra'::text])))",
      "CHECK (currency_code IS NULL OR currency_code ~ '^[A-Z]{3}$'::text)",
      "CHECK (payment_due_day IS NULL OR payment_due_day >= 1 AND payment_due_day <= 31)",
      "CHECK (payment_terms_days IS NULL OR payment_terms_days >= 0)",
    ];
    for (const fixture of fixtures) expect(fixture).toMatch(/^CHECK \(.+\)$/);
    expect(verification).toContain('pg_get_constraintdef(con.oid, true)');
    expect(verification).toContain("'::(text|numeric)(\\[\\])?'");
    expect(verification).toContain("payment_method\\s*=\\s*any");
  });

  it('uses a 1:N bank account model with tenant-safe admin access', () => {
    expect(migration).toContain('create table public.supplier_bank_accounts');
    expect(migration).toContain('supplier_bank_accounts_supplier_company_fk');
    expect(migration).toContain('supplier_bank_accounts_primary_unique');
    expect(migration).toContain('supplier_bank_accounts_iban_unique');
    expect(migration).toContain("upper(regexp_replace(iban, '\\s+', '', 'g'))");
    for (const policy of ['supplier_bank_accounts_select_admin', 'supplier_bank_accounts_insert_admin', 'supplier_bank_accounts_update_admin', 'supplier_bank_accounts_platform_superadmin_select', 'supplier_bank_accounts_platform_superadmin_insert', 'supplier_bank_accounts_platform_superadmin_update']) expect(migration).toContain(policy);
    expect(migration).not.toMatch(/create policy suppliers_platform_superadmin_/);
    expect(migration).toContain("revoke delete, truncate, references, trigger on public.supplier_bank_accounts from authenticated");
    expect(migration).not.toContain("has_any_role(array['superadmin','SAT','Gerencia','Oficina'])");
    expect(verification).toContain('has_table_privilege');
    expect(verification).toContain('relrowsecurity');
    expect(verification).toContain('indisunique');
    expect(verification).toContain('indpred');
    expect(verification).toContain('supplier_bank_account_guard_trigger');
    expect(verification).toContain('supplier_bank_account_updated_at_trigger');
    for (const field of ['new.id is distinct from old.id', 'new.company_id is distinct from old.company_id', 'new.supplier_id is distinct from old.supplier_id', 'new.created_by is distinct from old.created_by', 'new.created_at is distinct from old.created_at']) expect(verification).toContain(field);
    expect(verification).toContain('new.is_primary and new.active');
  });

  it('accepts only redundant outer parentheses for platform policies', () => {
    const normalize = (expression: string) => expression.toLowerCase().replace(/\s+/g, '').replaceAll('public.', '');
    const platformExpression = /^\(*is_platform_superadmin\(\)\)*$/;
    for (const expression of ['is_platform_superadmin()', '(is_platform_superadmin())', '((is_platform_superadmin()))']) expect(platformExpression.test(normalize(expression))).toBe(true);
    for (const expression of ['is_platform_superadmin() OR true', 'is_platform_superadmin() AND true']) expect(platformExpression.test(normalize(expression))).toBe(false);
    expect(verification).toContain("~ '^\\(*is_platform_superadmin\\(\\)\\)*$'");
    expect(verification).not.toContain("trim(both '()' from");
  });

  it('keeps supplier create/edit and bank data behind the existing service boundary', () => {
    for (const field of ['trade_name', 'internal_code', 'contact_name', 'fiscal_address', 'payment_method', 'payment_terms_days', 'currency_code', 'billing_email', 'internal_notes']) expect(service).toContain(field);
    expect(service).toContain('savePrimaryBankAccount');
    expect(service).toContain('companyScope');
    expect(service).toContain('includeBanking');
    expect(service).toContain('const bankRelation');
    expect(service).toContain('setPrimaryBankAccount');
    expect(service).toContain('setBankAccountActive');
    expect(service).not.toContain('created_by:');
    expect(service.split('async get')[0]).not.toContain('supplier_bank_accounts');
    expect(service).not.toContain('supplier_balance');
    expect(service).not.toContain('outstanding_balance');
  });

  it('organizes the supplier form into the economic preparation blocks', () => {
    for (const label of ['Datos generales', 'Dirección fiscal', 'Contacto', 'Condiciones de pago', 'Datos bancarios', 'Facturación y notas', 'Razón social *', 'IBAN', 'Email de facturación']) expect(app).toContain(label);
    expect(app).toContain('function SupplierForm');
    expect(app).toContain('supplier_bank_accounts');
    expect(app).toContain('canManageBanking');
    expect(app).not.toContain('Saldo proveedor');
  });
});
