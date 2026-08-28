import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import pgQuery from 'pg-query-emscripten';

const root = resolve(process.cwd());
const migration = readFileSync(resolve(root, 'supabase/migrations/090_fix_department_routing_queue.sql'), 'utf8');
const schema = readFileSync(resolve(root, 'supabase/migrations/001_initial_dmp_schema.sql'), 'utf8');
const preflight = readFileSync(resolve(root, 'supabase/verification/preflight_department_routing_queue_090.sql'), 'utf8');
const postflight = readFileSync(resolve(root, 'supabase/verification/postflight_department_routing_queue_090.sql'), 'utf8');
const probe = readFileSync(resolve(root, 'supabase/verification/probe_department_routing_queue_definition_090.sql'), 'utf8');
const service = readFileSync(resolve(root, 'src/services/workOrdersService.ts'), 'utf8');

describe('090 departmental routing queue runtime', () => {
  it('removes the invalid e.name reference from the queue SQL', () => {
    expect(migration).not.toContain('e.name');
    expect(migration).toContain('left join public.equipment e on e.id=we.equipment_id');
    expect(migration).toContain('string_agg(distinct e.code');
  });

  it('uses a real column on the equipment alias', () => {
    const equipmentTable = schema.slice(schema.indexOf('create table public.equipment ('), schema.indexOf('create table public.equipment_components'));
    expect(equipmentTable).toContain('code text not null');
    expect(equipmentTable).not.toMatch(/\bname\s+text/);
    expect(migration).toContain('e.code');
  });

  it('keeps the SAT queue contract', () => {
    expect(migration).toContain("p_queue='sat' and wo.sat_review_status='pending'");
    expect(migration).toContain("p_queue not in ('sat','commercial','billing')");
  });

  it('keeps the Commercial queue contract', () => {
    expect(migration).toContain("p_queue='commercial' and wo.sat_review_destination='comercial' and wo.commercial_review_status='pending'");
    expect(migration).toContain('v_supervisor or wo.current_responsible_id=public.current_profile_id()');
  });

  it('keeps the Billing queue contract', () => {
    expect(migration).toContain("p_queue='billing' and wo.sat_review_status='approved'");
    expect(migration).toContain("wo.sat_review_destination='facturacion' and wo.commercial_review_status='not_started'");
    expect(migration).toContain("wo.sat_review_destination='comercial' and wo.commercial_review_status='approved'");
  });

  it('preserves the frontend return shape', () => {
    expect(migration).toContain('returns table(id uuid,company_id uuid,code text,title text,client_name text,site_name text,equipment_names text,description text,quote_code text,sat_reviewed_at timestamptz,sat_reviewer_name text,sat_review_flags jsonb,sat_review_reason text,current_responsible_id uuid,commercial_review_status text,commercial_review_reason text,commercial_reviewed_at timestamptz,source text,entered_at timestamptz)');
    for (const field of ['client_name', 'site_name', 'equipment_names', 'quote_code', 'sat_review_flags', 'current_responsible_id', 'source', 'entered_at']) expect(migration).toContain(field);
  });

  it('keeps assigned Commercial rows eligible for their actor', () => {
    expect(migration).toContain('wo.current_responsible_id=public.current_profile_id()');
    expect(migration).toContain('wo.commercial_review_status=\'pending\'');
  });

  it('keeps other Commercial users isolated', () => {
    expect(migration).toContain('(v_supervisor or wo.current_responsible_id=public.current_profile_id())');
  });

  it('keeps supervisor access in the queue', () => {
    expect(migration).toContain("v_supervisor boolean:=public.has_any_role(array['superadmin','SAT','Gerencia'])");
    expect(migration).toContain("public.has_any_role(array['superadmin','SAT','Gerencia','Comercial'])");
  });

  it('keeps valid Billing routing and invoice isolation', () => {
    expect(migration).toContain('not exists (select 1 from public.invoice_work_orders iw');
    expect(migration).toContain('wo.company_id=v_company');
    expect(migration).not.toContain('update public.invoices');
  });

  it('keeps the frontend RPC parameter unchanged', () => {
    expect(service).toContain("supabase.rpc('dmp_department_routing_queue', { p_queue: queue })");
    expect(service).not.toMatch(/\{\s*p_department\s*:/);
  });

  it('uses correct preflight polarity for invalid and valid equipment references', () => {
    expect(preflight).toContain("position('e.name' in (select definition from normalized))=0 then 'OK'");
    expect(preflight).toContain("position('e.name' in (select definition from normalized))=0 then 'La definición remota no contiene e.name'");
    expect(preflight).toContain("position('string_agg(distinct e.code' in (select definition from normalized))>0 then 'OK'");
    expect(preflight).toContain("position('left join public.equipment e on e.id=we.equipment_id' in (select definition from normalized))>0");
  });

  it('probes only the exact queue signature and exposes both reference flags', () => {
    expect(probe).toContain("signature='p_queue text'");
    expect(probe).toContain('contains_e_dot_name');
    expect(probe).toContain('contains_e_dot_code');
    expect(probe).toContain('function_definition_hash');
    expect(probe).toContain('overloads');
    expect(probe).not.toMatch(/\b(insert|update|delete|alter|create|drop)\b/i);
    expect(probe).not.toContain("dmp_department_routing_queue', { p_queue");
  });

  it('parses migration and read-only verification SQL', async () => {
    const parser = await pgQuery();
    for (const sql of [migration, preflight, postflight, probe]) expect(parser.parse(sql).parse_tree.stmts.length).toBeGreaterThan(0);
    expect(preflight).not.toMatch(/\b(insert|update|delete|alter|create|drop)\b/i);
    expect(postflight).not.toMatch(/\b(insert|update|delete|alter|create|drop)\b/i);
  });
});
