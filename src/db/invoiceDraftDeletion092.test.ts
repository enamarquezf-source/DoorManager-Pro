import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { canDeleteInvoiceDraft } from '../auth/permissions';
import { shouldRenderDraftDelete } from '../modules/BillingModule';

const root = resolve(process.cwd());
const migration = readFileSync(resolve(root, 'supabase/migrations/092_safe_invoice_draft_deletion.sql'), 'utf8');
const preflight = readFileSync(resolve(root, 'supabase/verification/preflight_safe_invoice_draft_deletion_092.sql'), 'utf8');
const postflight = readFileSync(resolve(root, 'supabase/verification/postflight_safe_invoice_draft_deletion_092.sql'), 'utf8');
const probe = readFileSync(resolve(root, 'supabase/verification/probe_invoice_draft_deletion_candidates_092.sql'), 'utf8');
const service = readFileSync(resolve(root, 'src/services/billingService.ts'), 'utf8');
const moduleSource = readFileSync(resolve(root, 'src/modules/BillingModule.tsx'), 'utf8');

function profile(role: string, active = true) { return { id: `${role}-id`, company_id: 'company-id', auth_user_id: `${role}-auth`, first_name: role, last_name: 'User', email: `${role}@test.local`, phone: null, primary_area: role, active, roles: [role] } as any; }

describe('092 safe invoice draft deletion contract', () => {
  it('deletes only a draft and protects fiscal and payment history', () => {
    for (const guard of ["v_invoice.status <> 'borrador'", 'v_invoice.code is not null', 'v_invoice.fiscal_snapshot is not null', 'from public.invoice_payments where invoice_id = v_invoice.id', 'for update']) expect(migration).toContain(guard);
    for (const status of ['emitida', 'parcialmente_cobrada', 'cobrada', 'cancelada']) expect(migration).not.toContain(`status = '${status}'`);
    expect(migration).toContain('delete from public.invoice_work_orders');
    expect(migration).toContain('delete from public.invoices');
    expect(migration).not.toContain('update public.work_orders');
  });

  it('uses backend permissions, compatible audit and authenticated-only RPC access', () => {
    expect(migration).toContain("has_any_role(array['superadmin','Gerencia','Oficina'])");
    expect(migration).toContain("operation, changed_by, old_data, new_data");
    expect(migration).toContain("'DELETE'");
    expect(migration).toContain('revoke all on function public.dmp_delete_invoice_draft(uuid) from public, anon');
    expect(migration).toContain('grant execute on function public.dmp_delete_invoice_draft(uuid) to authenticated');
    expect(service).toContain("supabase.rpc('dmp_delete_invoice_draft'");
    expect(service).not.toContain("from('invoice_work_orders').delete");
  });

  it('allows only active Superadmin, Gerencia and Oficina in the local permission model', () => {
    for (const role of ['superadmin', 'Gerencia', 'Oficina']) expect(canDeleteInvoiceDraft(profile(role))).toBe(true);
    for (const role of ['Tecnico', 'Comercial', 'SAT']) expect(canDeleteInvoiceDraft(profile(role))).toBe(false);
    expect(canDeleteInvoiceDraft(profile('Oficina', false))).toBe(false);
  });

  it('covers the real UI render predicate for Elena Ruiz and non-draft states', () => {
    expect(shouldRenderDraftDelete(canDeleteInvoiceDraft(profile('Oficina')), { status: 'borrador' })).toBe(true);
    expect(shouldRenderDraftDelete(canDeleteInvoiceDraft(profile('superadmin')), { status: 'borrador' })).toBe(true);
    expect(shouldRenderDraftDelete(canDeleteInvoiceDraft(profile('Gerencia')), { status: 'borrador' })).toBe(true);
    for (const role of ['Tecnico', 'Comercial', 'SAT']) expect(shouldRenderDraftDelete(canDeleteInvoiceDraft(profile(role)), { status: 'borrador' })).toBe(false);
    for (const status of ['emitida', 'parcialmente_cobrada', 'cobrada', 'cancelada']) expect(shouldRenderDraftDelete(canDeleteInvoiceDraft(profile('Oficina')), { status })).toBe(false);
    expect(shouldRenderDraftDelete(true, null)).toBe(false);
  });

  it('exposes a draft-only destructive UI with strong confirmation and refresh callback', () => {
    expect(moduleSource).toContain('canDeleteDraft');
    expect(moduleSource).toContain("shouldRenderDraftDelete(canDelete, invoice)");
    expect(moduleSource).toContain('ELIMINAR BORRADOR');
    expect(moduleSource).toContain('El borrador y sus líneas se eliminarán.');
    expect(moduleSource).toContain('El parte volverá a estar disponible para preparar una nueva factura.');
    expect(moduleSource).toContain('Esta acción no afecta al trabajo realizado ni al routing del parte.');
    expect(moduleSource).toContain('billingService.deleteDraft(invoice.id)');
    expect(moduleSource).toContain('onSaved()');
    expect(moduleSource).not.toContain('Eliminar factura');
  });

  it('ships read-only verification and candidate classifications', () => {
    expect(preflight).toContain("'rpc_092_absent_before_apply'");
    expect(preflight).toContain("case when count(*)=0 then 'OK' else 'REVIEW' end");
    expect(preflight).toContain('La RPC 092 ya existe; revisar si se trata de una ejecucion previa');
    expect(preflight).not.toContain("case when count(*)>0 then 'OK'");
    for (const sql of [preflight, postflight]) {
      expect(sql.toLowerCase()).not.toContain('insert into');
      expect(sql.toLowerCase()).not.toContain('update public');
      expect(sql.toLowerCase()).not.toContain('delete from');
      expect(sql).toContain('select area, check_name, status, finding_count, detail');
    }
    for (const classification of ['deletable_draft', 'draft_with_payment_blocked', 'draft_with_fiscal_snapshot_blocked', 'draft_with_number_blocked', 'issued_not_deletable', 'partially_paid_not_deletable', 'paid_not_deletable', 'cancelled_not_deletable', 'unknown']) expect(probe).toContain(classification);
    for (const column of ['invoice_id', 'code', 'status', 'fiscal_snapshot_present', 'payment_count', 'work_order_count', 'line_count', 'eligible_for_delete_092', 'classification']) expect(probe).toContain(column);
  });

  it('keeps every postflight invoice data branch self-contained', () => {
    const invoiceBranches = [
      "issued_with_fiscal_snapshot_intact',",
      "drafts_with_payments',",
      "drafts_with_fiscal_snapshot',",
      "drafts_with_fiscal_number',",
      "invoice_tenant_mismatch',",
    ];
    for (const branch of invoiceBranches) {
      const start = postflight.indexOf(branch);
      expect(start).toBeGreaterThan(-1);
      const body = postflight.slice(start, postflight.indexOf('\n', start));
      expect(body).toMatch(/\bfrom\b/i);
    }
    expect(postflight).toContain("i.status in('emitida','parcialmente_cobrada','cobrada','cancelada')");
    expect(postflight).toContain('i.fiscal_snapshot is null');
    expect(postflight).not.toMatch(/issued_with_fiscal_snapshot_intact'[\s\S]{0,220}(?<![.])\bstatus\b/);
    expect(postflight).not.toMatch(/issued_with_fiscal_snapshot_intact'[\s\S]{0,220}(?<![.])\bfiscal_snapshot\b/);
    expect(migration).toContain('create or replace function public.dmp_delete_invoice_draft');
  });

  it('keeps postflight read-only and never invokes the 092 RPC', () => {
    expect(postflight.toLowerCase()).not.toContain('insert into');
    expect(postflight.toLowerCase()).not.toContain('update public');
    expect(postflight.toLowerCase()).not.toContain('delete from');
    expect(postflight.toLowerCase()).not.toContain('truncate ');
    expect(postflight.toLowerCase()).not.toContain('alter table');
    expect(postflight.toLowerCase()).not.toContain('drop table');
    expect(postflight).not.toMatch(/(?:select|perform|call)\s+public\.dmp_delete_invoice_draft/i);
  });

  it('provides a non-invasive remote RPC inspection without invoking it', () => {
    const remoteProbe = readFileSync(resolve(root, 'supabase/verification/probe_existing_invoice_draft_delete_rpc_092.sql'), 'utf8');
    expect(remoteProbe).toContain('pg_get_functiondef');
    for (const field of ['function_exists', 'exact_signature', 'overload_count', 'function_definition_hash', 'security_definer', 'search_path', 'owner', 'authenticated_execute', 'anon_execute', 'migration_092_recorded']) expect(remoteProbe).toContain(field);
    expect(remoteProbe).toContain('definition_matches_local_092');
    expect(remoteProbe).toContain("bool_or(prosecdef) filter (where exact_signature = 'p_invoice_id uuid') as security_definer");
    expect(remoteProbe).not.toContain('max(prosecdef)');
    expect(remoteProbe).not.toContain('min(prosecdef)');
    expect(remoteProbe).not.toMatch(/(?:max|min|sum)\s*\([^)]*prosecdef/i);
    expect(remoteProbe).not.toMatch(/select\s+public\.dmp_delete_invoice_draft/i);
    expect(remoteProbe).not.toMatch(/perform\s+public\.dmp_delete_invoice_draft/i);
  });
});
