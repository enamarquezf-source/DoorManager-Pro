import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(new URL('../../supabase/migrations/146_economic_review_assignment_authorization.sql', import.meta.url), 'utf8');

describe('migration 146 economic assignment authorization', () => {
  it('requires Commercial destination and current responsibility only for non-supervisory Commercial actors', () => {
    expect(migration).toContain("public.has_any_role(array['Comercial'])");
    expect(migration).toContain("not public.has_any_role(array['superadmin','SAT','Gerencia'])");
    expect(migration).toContain("w.sat_review_destination is distinct from 'comercial'");
    expect(migration).toContain('w.current_responsible_id is distinct from a.id');
    expect(migration).toContain("w.commercial_review_status is distinct from 'pending'");
    expect(migration).toContain('revision Comercial: el parte no esta pendiente de aprobacion');
    expect(migration).toContain('economia: el parte no esta asignado al comercial actual');
  });

  it('preserves tenant, locking, lifecycle, invoice, audit and grants contracts', () => {
    expect(migration).toContain('dmp024_active_profile()');
    expect(migration).toContain('for update');
    expect(migration).toContain('assert_member_of_current_company(w.company_id)');
    expect(migration).toContain("w.economic_review_status='approved'");
    expect(migration).toContain("i.status<>'cancelada'");
    expect(migration).toContain("'ECONOMIC_REVIEW_APPROVE'");
    expect(migration).toContain("grant execute on function public.dmp_review_work_order_economic(uuid,jsonb,text,boolean) to authenticated");
  });

  it('does not authorize through primary_area', () => {
    expect(migration).not.toContain('primary_area');
    expect(migration).toContain('has_any_role');
  });

  it('cannot update a cost entry belonging to another work order in the same company', () => {
    expect(migration).toContain('where id=eid and company_id=w.company_id and work_order_id=w.id and deleted_at is null');
  });
});
