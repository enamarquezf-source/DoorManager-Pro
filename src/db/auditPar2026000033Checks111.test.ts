import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import pgQuery from 'pg-query-emscripten';

const audit = readFileSync(new URL('../../supabase/verification/audit_par_2026_000033_checks_111.sql', import.meta.url), 'utf8');
const quoteAudit = readFileSync(new URL('../../supabase/verification/audit_quote_par_2026_000033_equipment_111.sql', import.meta.url), 'utf8');

describe('audit PAR-2026-000033 checks 111', () => {
  it('parses as read-only SQL and targets only the requested part', async () => {
    const parser = await pgQuery();
    expect(parser.parse(audit).parse_tree.stmts.length).toBeGreaterThan(0);
    expect(parser.parse(quoteAudit).parse_tree.stmts.length).toBeGreaterThan(0);
    expect(audit).toContain("code = 'PAR-2026-000033'");
    expect(audit).not.toMatch(/\b(insert into|update public|delete from|alter table|create table|drop table|notify)\b/i);
  });

  it('uses UUID-safe lateral check selection and complete classifications', () => {
    expect(audit).toContain('left join lateral');
    expect(audit).toContain('count(*) over () as active_check_count');
    for (const classification of ['CHECK_CREATED', 'PENDING_TEMPLATE', 'NOT_APPLICABLE', 'MISSING_CHECK', 'DUPLICATE_CHECK', 'OTHER']) expect(audit).toContain(classification);
    expect(audit).not.toMatch(/\b(min|max)\s*\(\s*(c\.)?(id|template_id|quote_id|main_equipment_id)\s*\)/i);
    expect(quoteAudit).toContain('from combined c');
    expect(quoteAudit).toContain('case c.row_kind');
    expect(quoteAudit).not.toContain("'QUOTE_TYPE_SUMMARY'");
    expect(quoteAudit.match(/union all/gi)).toHaveLength(3);
    expect(quoteAudit).toContain('Output contract (29 columns)');
  });

  it('separates main, bridge, and equipment-type summaries', () => {
    expect(audit).toContain('MAIN_EQUIPMENT');
    expect(audit).toContain('WORK_ORDER_EQUIPMENT');
    expect(audit).toContain('BOTH');
    expect(audit).toContain('TYPE_SUMMARY');
    expect(audit).toContain("equipment_type, count(*)::bigint as equipment_count");
    expect(audit).toContain('from part_summary summary');
    expect(audit).toContain('from classified detail');
    expect(audit).toContain('from type_summary types');
    expect(audit).toContain('join target on target.id = types.work_order_id');
    expect(audit.match(/union all/gi)).toHaveLength(2);
    expect(audit).toContain('), combined as (');
    expect(audit).toContain('select c.*');
    expect(audit).toContain('from combined c');
    expect(audit).toContain('case c.row_kind');
    expect(audit).not.toMatch(/\b(min|max)\s*\(/i);
  });
});
