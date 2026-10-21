import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import pgQuery from 'pg-query-emscripten';
import { canManageCostStudies } from '../auth/permissions';
const sql = readFileSync(new URL('../../supabase/migrations/175_cost_and_productivity_studies.sql', import.meta.url), 'utf8');
const postflight = readFileSync(new URL('../../supabase/verification/verify_175_cost_studies.sql', import.meta.url), 'utf8');
describe('cost studies database contract', () => {
  it('parses SQL and PL/pgSQL', async () => {
    const parser = await pgQuery();
    expect(parser.parse(sql).error).toBeNull();
    expect(parser.parsePlpgsql(sql).error).toBeNull();
    expect(parser.parse(postflight).error).toBeNull();
    expect(parser.parsePlpgsql(postflight).error).toBeNull();
  });
  it('scopes source rows and employee inputs to the authenticated company, including historical employees', () => {
    for (const alias of ['p', 'w', 't', 'm', 'r', 'i']) expect(sql).toContain(`${alias}.company_id = actor.company_id`);
    expect(sql).toContain('p.id = employee_id and p.company_id = actor.company_id');
    expect(sql).toContain('company_id = public.current_company_id()');
    expect(sql).not.toContain('or public.is_platform_superadmin()');
  });
  it('captures dated sources server-side, excludes draft/cancelled invoices and supports immutable retry receipts', () => {
    expect(sql).toContain('t.work_date between p_from and p_to');
    expect(sql).toContain('m.used_at between p_from and p_to');
    expect(sql).toContain('r.incurred_at between p_from and p_to');
    expect(sql).toContain("i.status not in ('borrador','cancelada')");
    expect(sql).toContain('public.dmp_cost_study_sources(p_from,p_to),actor.id');
    expect(sql).toContain('pg_advisory_xact_lock');
    expect(sql).toContain('previous.inputs <> p_inputs');
    expect(sql).toContain('return previous.id');
    expect(sql).not.toMatch(/grant\s+(insert|update|delete)/i);
  });
  it.each(['Gerencia', 'superadmin', 'SAT', 'Oficina', 'Comercial', 'Tecnico'])('limits salary access for role %s', role => {
    const profile = { active: true, roles: [role] } as any;
    expect(canManageCostStudies(profile)).toBe(['Gerencia', 'superadmin'].includes(role));
    expect(canManageCostStudies({ ...profile, active: false })).toBe(false);
  });
});
