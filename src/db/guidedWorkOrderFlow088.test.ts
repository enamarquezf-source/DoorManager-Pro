import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(new URL('../../supabase/migrations/088_guided_work_order_operational_flow.sql', import.meta.url), 'utf8');
const preflight = readFileSync(new URL('../../supabase/verification/preflight_guided_work_order_flow_088.sql', import.meta.url), 'utf8');
const postflight = readFileSync(new URL('../../supabase/verification/postflight_guided_work_order_flow_088.sql', import.meta.url), 'utf8');
const probe = readFileSync(new URL('../../supabase/verification/probe_guided_work_order_flow_088.sql', import.meta.url), 'utf8');
const app = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');
const compactSql = (sql: string) => sql.replace(/\s+/g, ' ').trim();

describe('088 guided work order flow', () => {
  it('persists SAT routing and commercial approval without replacing canonical economics', () => {
    expect(migration).toContain('sat_review_destination');
    expect(migration).toContain('commercial_review_status');
    expect(migration).toContain('dmp_review_work_order_sat');
    expect(migration).toContain('dmp_review_work_order_commercial');
    expect(migration).toContain("office_validation_status='pending'");
    expect(migration).not.toContain('set sale_amount=');
  });

  it('keeps one routing-column convention across migration, RPC, frontend and verification', () => {
    const columns = ['sat_review_status', 'sat_review_destination', 'sat_review_flags', 'sat_review_reason', 'sat_reviewed_at', 'sat_reviewed_by', 'commercial_review_status', 'commercial_review_reason', 'commercial_reviewed_at', 'commercial_reviewed_by'];
    for (const column of columns) {
      expect(migration).toContain(column);
      expect(postflight).toContain(column);
    }
    expect(migration).toContain('sat_review_destination=p_destination');
    expect(probe).toContain("column_name='sat_review_destination'");
  });

  it('keeps destination validation in the same scope as its source column', () => {
    expect(postflight).toContain("select sat_review_destination destination,count(*)::bigint total");
    expect(postflight).toContain("sat_review_status review_status,count(*)::bigint total");
    expect(postflight).not.toContain("jsonb_object_agg(sat_review_status,total)");
    expect(postflight).not.toContain("count(*) filter(where sat_review_destination");
  });

  it('gates office validation behind SAT and commercial review', () => {
    expect(migration).toContain("v_work.sat_review_status<>'approved'");
    expect(migration).toContain("v_work.commercial_review_status<>'approved'");
    expect(app).toContain('const readyForOffice = satApproved && commercialApproved;');
  });

  it('keeps the backfill limited to pending office work and narrows the trigger event', () => {
    expect(compactSql(migration)).toContain("where deleted_at is null and status='Finalizado tecnicamente' and office_validation_status='pending' and sat_review_status='not_started'");
    expect(migration).toContain('before update of status,office_validation_status,sat_review_status,sat_review_destination,commercial_review_status on public.work_orders');
    expect(migration).toContain('if old.office_validation_status is not distinct from new.office_validation_status');
    expect(migration).not.toContain('before update on public.work_orders');
    expect(migration).not.toMatch(/update\s+public\.invoices/i);
    expect(migration).not.toMatch(/update\s+public\.invoice_work_orders/i);
  });

  it('covers every backfill exclusion and keeps preflight identical to migration', () => {
    const migrationCondition = "deleted_at is null and status='Finalizado tecnicamente' and office_validation_status='pending' and sat_review_status='not_started'";
    const preflightCondition = "deleted_at is null and status='Finalizado tecnicamente' and office_validation_status='pending'";
    const backfillChecks = preflight.slice(preflight.indexOf("'backfill_candidate_count'"), preflight.indexOf("'historical_states_to_preserve'"));
    expect(compactSql(migration)).toContain(migrationCondition);
    expect(compactSql(preflight)).toContain(preflightCondition);
    expect(compactSql(preflight)).not.toContain(migrationCondition);
    expect(backfillChecks).not.toContain('sat_review_status');
    expect(preflight).toContain("status in ('Enviado','Cerrado','Cancelado')");
    expect(preflight).toContain("status<>'Finalizado tecnicamente'");
    expect(preflight).toContain("deleted_at is null");
  });

  it('preserves the required historical and administrative transitions', () => {
    expect(migration).toContain("status='Devuelto por SAT'");
    expect(migration).toContain("v_work.sat_review_status<>'approved'");
    expect(migration).toContain("v_work.commercial_review_status<>'approved'");
    expect(preflight).toContain("status in ('Enviado','Cerrado','Cancelado')");
    expect(preflight).toContain("status in ('Finalizado tecnicamente','Enviado','Devuelto por SAT','Cerrado','Cancelado')");
  });

  it('exposes guided actions in the work order detail', () => {
    expect(app).toContain('WorkOrderSatReviewCard');
    expect(app).toContain('WorkOrderCommercialReviewCard');
    expect(app).toContain('Aprobar importe y enviar a Facturación');
  });

  it.each([
    ['preflight', preflight],
    ['postflight', postflight],
    ['probe', probe],
  ])('%s returns one result set and is read-only', (_name, sql) => {
    expect(sql).toContain('select check_name,status,detail');
    expect(sql).not.toMatch(/(?:^|;|\n)\s*(insert|update|delete|alter|drop|create|truncate|notify)\s+/im);
    expect(sql).not.toContain('select public.dmp_');
  });
});
