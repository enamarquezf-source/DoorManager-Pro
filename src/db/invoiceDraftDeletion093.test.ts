import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import pgQuery from 'pg-query-emscripten';

const root = resolve(process.cwd());
const migration092 = readFileSync(resolve(root, 'supabase/migrations/092_safe_invoice_draft_deletion.sql'), 'utf8');
const migration093 = readFileSync(resolve(root, 'supabase/migrations/093_fix_invoice_draft_deletion_audit.sql'), 'utf8');
const preflight093 = readFileSync(resolve(root, 'supabase/verification/preflight_fix_invoice_draft_deletion_audit_093.sql'), 'utf8');
const postflight093 = readFileSync(resolve(root, 'supabase/verification/postflight_fix_invoice_draft_deletion_audit_093.sql'), 'utf8');

function splitTopLevel(value: string) {
  const parts: string[] = [];
  let start = 0;
  let depth = 0;
  let quote = false;
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (character === "'" && value[index + 1] === "'") { index += 1; continue; }
    if (character === "'") quote = !quote;
    if (!quote && character === '(') depth += 1;
    if (!quote && character === ')') depth -= 1;
    if (!quote && depth === 0 && character === ',') { parts.push(value.slice(start, index).trim()); start = index + 1; }
  }
  parts.push(value.slice(start).trim());
  return parts.filter(Boolean);
}

function auditInsert(sql: string) {
  const match = sql.match(/insert into public\.audit_log\(([^)]+)\)\s*values\s*\(([^;]+)\);/is);
  expect(match).not.toBeNull();
  return { columns: splitTopLevel(match?.[1] ?? ''), expressions: splitTopLevel(match?.[2] ?? '') };
}

describe('093 invoice draft deletion audit fix', () => {
  it('demuestra el desajuste de 092 y verifica siete columnas contra siete expresiones en 093', () => {
    const broken = auditInsert(migration092);
    expect(broken.columns).toHaveLength(7);
    expect(broken.expressions).toHaveLength(6);

    const fixed = auditInsert(migration093);
    expect(fixed.columns).toEqual(['company_id', 'table_name', 'record_id', 'operation', 'changed_by', 'old_data', 'new_data']);
    expect(fixed.expressions).toHaveLength(fixed.columns.length);
    expect(fixed.expressions[4]).toBe('v_actor.id');
    expect(fixed.expressions[5]).toContain('jsonb_build_object');
    expect(fixed.expressions[6]).toContain("'DELETE_INVOICE_DRAFT'");
  });

  it('conserva la firma, seguridad, reglas y orden de borrado de 092', () => {
    for (const text of [
      'create or replace function public.dmp_delete_invoice_draft(p_invoice_id uuid)',
      'returns void', 'security definer', 'set search_path = public',
      "has_any_role(array['superadmin','Gerencia','Oficina'])",
      "v_invoice.status <> 'borrador'", 'v_invoice.code is not null',
      'v_invoice.fiscal_snapshot is not null', 'invoice_payments',
      'delete from public.invoice_work_orders', 'delete from public.invoices',
      'revoke all on function public.dmp_delete_invoice_draft(uuid) from public, anon',
      'grant execute on function public.dmp_delete_invoice_draft(uuid) to authenticated',
    ]) expect(migration093).toContain(text);
    expect(migration093.indexOf('insert into public.audit_log')).toBeLessThan(migration093.indexOf('delete from public.invoice_work_orders'));
    expect(migration093.indexOf('delete from public.invoice_work_orders')).toBeLessThan(migration093.indexOf('delete from public.invoices'));
  });

  it('mantiene preflight y postflight read-only y SQL parseable', async () => {
    const parser = await pgQuery();
    for (const sql of [migration093, preflight093, postflight093]) {
      const parsed = parser.parse(sql);
      expect(parsed.error).toBeNull();
      expect(parsed.parse_tree.stmts.length).toBeGreaterThan(0);
    }
    for (const sql of [preflight093, postflight093]) {
      expect(sql.toLowerCase()).not.toContain('insert into');
      expect(sql.toLowerCase()).not.toContain('delete from');
      expect(sql.toLowerCase()).not.toContain('update public');
      expect(sql.toLowerCase()).not.toMatch(/(?:select|perform|call)\s+public\.dmp_delete_invoice_draft/i);
      expect(sql).toContain('select area, check_name, status, finding_count, detail');
    }
    const checkBranches = postflight093.split(/\n\s*union all select /i).slice(1);
    for (const branch of checkBranches.filter((item) => /\b(definition|prosecdef|proconfig|returns)\b/i.test(item))) {
      expect(branch).toMatch(/\bfrom\s+rpc\b/i);
    }
    expect(postflight093).toContain("from rpc where signature = 'p_invoice_id uuid'");
    expect(postflight093).toContain("case when count(*) = 1 and bool_and(returns = 'void') then 'OK' else 'BLOCKER' end");
    expect(postflight093).not.toMatch(/case when returns\s*=\s*'void'/i);
    expect(postflight093).not.toMatch(/case when definition\s+(?:like|~)/i);
    expect(postflight093).not.toContain('create or replace function');
  });
});
