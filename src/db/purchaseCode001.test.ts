import { readFileSync } from 'node:fs';
import pgQuery from 'pg-query-emscripten';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(new URL('../../supabase/migrations/125_purchase_order_code_generation.sql', import.meta.url), 'utf8');
const verification = readFileSync(new URL('../../supabase/verification/verify_125_purchase_order_code_generation.sql', import.meta.url), 'utf8');
const purchaseOrders = readFileSync(new URL('../../supabase/migrations/124_auth_rbac_runtime_fix.sql', import.meta.url), 'utf8');

describe('PURCHASE-CODE-001 canonical purchase order code generation', () => {
  it('parses the migration and read-only verification', async () => {
    const migrationParser = await pgQuery();
    const verificationParser = await pgQuery();
    expect(migrationParser.parse(migration).parse_tree.stmts.length).toBeGreaterThan(0);
    expect(verificationParser.parse(verification).parse_tree.stmts.length).toBeGreaterThan(0);
    expect(verification).not.toMatch(/^\s*(insert|update|delete|alter|create|drop|grant|revoke)\b/im);
  });

  it('adds only purchase_orders to the explicit canonical allowlist', () => {
    expect(migration).toContain("'purchase_orders'");
    expect(migration).toContain("p_table_name <> all(array['clients','sites','equipment','cases','work_orders','checks','alerts','deficiencies','materials','warehouses','opportunities','quotes','purchase_orders'])");
    expect(migration).toContain("raise exception 'Tabla no permitida para generar codigo: %'");
    expect(migration).not.toContain('if p_table_name is null');
    expect(migration).toContain('p_table_name');
  });

  it('preserves canonical format, locking, scope and security', () => {
    for (const value of ['assert_member_of_current_company', 'pg_advisory_xact_lock', 'execute format', 'from public.%I', 'where company_id = $1', 'p_prefix || \'-\' || v_year || \'-\'', 'greatest(p_width, 1)', 'security definer', 'search_path = public']) expect(migration).toContain(value);
    expect(verification).toContain("to_regprocedure('public.next_dmp_code(uuid,text,text,boolean,integer)')");
    expect(verification).toContain('purchase_orders missing from explicit allowlist');
    expect(verification).toContain('arbitrary table rejection missing');
  });

  it('sets an explicit restricted ACL before granting authenticated access', () => {
    const revoke = migration.indexOf('revoke all on function public.next_dmp_code');
    const grant = migration.indexOf('grant execute on function public.next_dmp_code');
    expect(revoke).toBeGreaterThan(-1);
    expect(grant).toBeGreaterThan(revoke);
    expect(migration.slice(revoke, grant)).toContain('from public, anon');
    expect(verification).toContain("has_function_privilege('authenticated', v_oid, 'EXECUTE')");
    expect(verification).toContain("has_function_privilege('anon', v_oid, 'EXECUTE')");
    expect(verification).toContain('acl.grantee = 0');
  });

  it('keeps purchase order creation on PED yearly six-digit codes', () => {
    expect(purchaseOrders).toContain("public.next_dmp_code(p_company_id, 'purchase_orders', 'PED', true, 6)");
    expect(verification).toContain('create purchase order code call');
  });

  it('keeps the allowlist closed to arbitrary tables', () => {
    const allowlist = migration.match(/p_table_name <> all\(array\[(.*?)\]\)/s)?.[1] ?? '';
    expect(allowlist).not.toContain('evil_table');
    expect(allowlist).not.toContain('format(');
    expect(verification).toContain('arbitrary table rejection missing');
  });

  it('recognizes valid ALL ARRAY formatting without accepting an incomplete allowlist', () => {
    const allowlistPattern = /p_table_name\s*<>\s*all\s*\(\s*array\s*\[/i;
    for (const variant of ['p_table_name <> ALL(ARRAY[', 'p_table_name <> ALL (ARRAY[', 'p_table_name\n<>\nALL ( ARRAY [']) expect(allowlistPattern.test(variant)).toBe(true);
    expect(allowlistPattern.test('p_table_name <> ALL(ARRAY[\'clients\',\'quotes\']')).toBe(true);
    for (const entry of ['clients', 'sites', 'equipment', 'cases', 'work_orders', 'checks', 'alerts', 'deficiencies', 'materials', 'warehouses', 'opportunities', 'quotes', 'purchase_orders']) expect(migration).toContain(`'${entry}'`);
    expect(migration).not.toContain("'evil_table'");
  });

  it('requires all three canonical lpad arguments and rejects malformed variants', () => {
    const paddingPattern = /lpad\s*\(\s*v_sequence::text\s*,\s*greatest\s*\(\s*p_width\s*,\s*1\s*\)\s*,\s*'0'\s*\)/i;
    for (const variant of [
      "lpad(v_sequence::text, greatest(p_width, 1), '0')",
      "lpad(\n v_sequence::text, greatest ( p_width,1 ), '0'\n)",
    ]) expect(paddingPattern.test(variant)).toBe(true);
    for (const invalid of [
      'lpad(v_sequence::text, greatest(p_width, 1))',
      "lpad(v_sequence::text, greatest(p_width, 1), '1')",
      "lpad(other_sequence::text, greatest(p_width, 1), '0')",
      "lpad(v_sequence::text, greatest(p_width, 2), '0')",
    ]) expect(paddingPattern.test(invalid)).toBe(false);
    expect(verification).toContain('canonical padding format missing');
    expect(verification).toContain('canonical code concatenation missing');
  });
});
