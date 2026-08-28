import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import pgQuery from 'pg-query-emscripten';

const root = resolve(process.cwd());
const migration = readFileSync(resolve(root, 'supabase/migrations/089_operational_department_routing.sql'), 'utf8');
const preflight = readFileSync(resolve(root, 'supabase/verification/preflight_operational_department_routing_089.sql'), 'utf8');
const postflight = readFileSync(resolve(root, 'supabase/verification/postflight_operational_department_routing_089.sql'), 'utf8');
const probe = readFileSync(resolve(root, 'supabase/verification/probe_pending_commercial_assignment_089.sql'), 'utf8');
const billingProbe = readFileSync(resolve(root, 'supabase/verification/probe_billing_origins_089.sql'), 'utf8');
const app = readFileSync(resolve(root, 'src/App.tsx'), 'utf8');

describe('089 operational department routing', () => {
  it('requires a commercial for SAT to Comercial and clears it for Facturacion', () => {
    expect(migration).toContain("p_destination='comercial' and p_commercial_profile_id is null");
    expect(migration).toContain("p_destination='facturacion' and p_commercial_profile_id is not null");
    expect(migration).toContain('current_responsible_id=case when p_destination=\'comercial\' then p_commercial_profile_id');
  });
  it('validates company, active state and Comercial role', () => {
    expect(migration).toContain("p.company_id=v_work.company_id and p.active=true and p.deleted_at is null");
    expect(migration).toContain("r.name='Comercial'");
  });
  it('isolates the commercial queue and allows supervisors to see all', () => {
    expect(migration).toContain("wo.current_responsible_id=public.current_profile_id()");
    expect(migration).toContain("v_supervisor or wo.current_responsible_id=public.current_profile_id()");
  });
  it('requires assigned commercial approval and supports pending reassignment only', () => {
    expect(migration).toContain("v_work.current_responsible_id<>v_actor.id");
    expect(migration).toContain("v_work.commercial_review_status<>'pending'");
    expect(migration).toContain('Reasignacion Comercial');
  });
  it('exposes all department queues and the dynamic SAT selector', () => {
    expect(migration).toContain("p_queue not in ('sat','commercial','billing')");
    expect(app).toContain('profilesService.listCommercials()');
    expect(app).toContain('if (next === \'facturacion\') setCommercialProfileId(\'\')');
    expect(app).toContain('Enviar a Comercial');
    expect(app).toContain('Enviar a Facturación');
  });
  it('keeps invoice data outside SAT routing', () => {
    expect(migration).not.toContain('update public.invoices');
    expect(migration).not.toContain('fiscal_snapshot');
    expect(postflight).toContain('billing_objects_intact');
    expect(migration).toContain("sat_review_status='pending'");
    expect(migration).toContain("sat_review_destination=null");
    expect(migration).toContain("commercial_review_status='not_started'");
    expect(migration).toContain("select c.company_id,'work_orders',c.id,'UPDATE',null");
  });
  it('has read-only single-result-set verification scripts', () => {
    expect(preflight).toContain('with checks as');
    expect(preflight).toContain('select check_name,status,detail from checks');
    expect(postflight).toContain('with checks as');
    expect(postflight).toContain('select check_name,status,detail from checks');
    expect(preflight).not.toMatch(/\b(insert|update|delete|alter|create|drop)\b/i);
    expect(postflight).not.toMatch(/\b(insert|update|delete|alter|create|drop)\b/i);
  });
  it('parses migration and verification SQL', async () => {
    const parser = await pgQuery();
    for (const sql of [migration, preflight, postflight, probe, billingProbe]) expect(parser.parse(sql).parse_tree.stmts.length).toBeGreaterThan(0);
  });
  it('keeps the probe read-only and exposes the historical diagnosis fields', () => {
    expect(probe).toContain('commercial_review_status = \'pending\'');
    for (const field of ['work_order_id', 'current_responsible_id', 'responsible_active', 'responsible_company_id', 'responsible_roles', 'responsible_is_valid_commercial', 'office_validation_status', 'quote_code']) expect(probe).toContain(field);
    expect(probe).not.toMatch(/\b(insert|update|delete|alter|create|drop)\b/i);
  });
  it('distinguishes historical billing rows from new routing bypasses', () => {
    expect(billingProbe).toContain("office_validation_status='pending'");
    expect(billingProbe).toContain("then 'legacy_pre_088'");
    expect(billingProbe).toContain("then 'incoherent_new_routing'");
    expect(billingProbe).toContain('queue_089_billing_match');
    expect(billingProbe).not.toMatch(/\b(insert|update|delete|alter|create|drop)\b/i);
    expect(postflight).toContain('billing_legacy_population');
    expect(postflight).toContain('contradicciones nuevas con intencion de Facturacion sin routing aprobado');
  });
  it('does not treat a legitimate pending SAT row as a billing routing error', () => {
    expect(billingProbe).toContain("then 'pending_sat_not_billing'");
    expect(billingProbe).toContain("wo.sat_review_status='pending'");
    expect(postflight).toContain("wo.sat_review_status='pending' and wo.sat_review_destination is null and wo.commercial_review_status='not_started'");
    expect(postflight).toContain("wo.office_validation_status='validated' or wo.economic_status='pendiente_facturar'");
    expect(postflight).not.toContain("wo.office_validation_status='pending' and not (wo.sat_review_status='approved'");
  });
});
