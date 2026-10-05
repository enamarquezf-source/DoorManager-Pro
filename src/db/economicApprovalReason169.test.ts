import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import pgQuery from 'pg-query-emscripten';

const sql = readFileSync(new URL('../../supabase/migrations/169_optional_economic_approval_reason.sql', import.meta.url), 'utf8');
const previous = readFileSync(new URL('../../supabase/migrations/152_office_economic_review_and_sat_recovery.sql', import.meta.url), 'utf8');
describe('optional economic approval notes', () => {
  it('parses SQL and PL/pgSQL', async () => {
    const parser = await pgQuery();
    expect(parser.parse(sql).error).toBeNull();
    expect(parser.parsePlpgsql(sql).error).toBeNull();
  });
  it('changes only the approval input guard while preserving authorization and monetary logic', () => {
    const start = 'create or replace function public.dmp_review_work_order_economic(';
    const original = previous.slice(previous.indexOf(start), previous.indexOf('create or replace function public.dmp_reopen_work_order_economic('));
    const expected = original.replace("if jsonb_typeof(p_decisions)<>'array' or v_reason='' then raise exception 'validacion del formulario: decisiones y motivo son obligatorios'; end if;", "if jsonb_typeof(p_decisions) is distinct from 'array' then raise exception 'validacion del formulario: decisiones obligatorias'; end if;");
    expect(sql).toContain(expected);
    expect(sql).not.toContain("v_reason='' then");
  });
});
