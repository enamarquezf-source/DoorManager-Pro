import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import pgQuery from 'pg-query-emscripten';

const migration = readFileSync(new URL('../../supabase/migrations/053_quote_integrity_traceability.sql', import.meta.url), 'utf8');
const quotesService = readFileSync(new URL('../services/quotesService.ts', import.meta.url), 'utf8');
const app = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');
const workOrderMigration = readFileSync(new URL('../../supabase/migrations/048_fix_finalize_and_installation_flow.sql', import.meta.url), 'utf8');

describe('quote integrity and traceability 053', () => {
  it('parses migration SQL', async () => {
    const parser = await pgQuery();
    expect(parser.parse(migration).parse_tree.stmts.length).toBeGreaterThan(0);
  });

  it('QUO-01: creates quote status history with trace columns', () => {
    expect(migration).toContain('create table if not exists public.quote_status_history');
    expect(migration).toContain('quote_id uuid not null references public.quotes(id)');
    expect(migration).toContain('previous_status text');
    expect(migration).toContain('new_status text not null');
    expect(migration).toContain('changed_by uuid references public.profiles(id)');
    expect(migration).toContain('changed_at timestamptz not null default now()');
    expect(migration).toContain('reason text');
    expect(migration).toContain('manual_correction boolean not null default false');
    expect(migration).toContain('quote_status_history_quote_idx');
  });

  it('QUO-01: history writes are server-side only and reads are role scoped', () => {
    expect(migration).toContain('enable row level security');
    expect(migration).toContain('quote_status_history_select_authorized_roles');
    expect(migration).toContain("has_any_role(array['superadmin','Comercial','Gerencia','SAT','Oficina'])");
    expect(migration).toContain('quote_status_history_write_denied');
    expect(migration).toContain('quote_status_history_update_denied');
    expect(migration).toContain('quote_status_history_delete_denied');
    expect(migration).not.toContain('service_role');
    expect(migration).not.toContain('disable row level security');
  });

  it('QUO-02: defines an explicit transition matrix and forbids Aceptado -> Borrador', () => {
    expect(migration).toContain('dmp_quote_status_transition_valid');
    expect(migration).toContain("p_previous = 'Borrador' and p_new in ('Enviado','Aceptado','Rechazado','Caducado','Cancelado')");
    expect(migration).toContain("p_previous = 'Aceptado' and p_new in ('Rechazado','Caducado','Cancelado','Ejecutado en cliente')");
    expect(migration).toContain("p_previous = 'Ejecutado en cliente' and false");
    expect(migration).not.toContain("p_previous = 'Aceptado' and p_new in ('Borrador'");
    expect(migration).toContain("not (p_new in ('Borrador','Enviado') and p_has_work_order)");
  });

  it('QUO-02: guard trigger is a single gate that does NOT depend on current_user or the SQL owner', () => {
    expect(migration).toContain('dmp_quotes_status_guard_trigger');
    expect(migration).toContain('create trigger quotes_status_guard_trigger');
    expect(migration).toContain('before update of status on public.quotes');
    expect(migration).toContain('usa la operacion segura de cambio de estado');
    expect(migration).toContain("coalesce(current_setting('dmp.quote_status_change', true), '') = 'true'");
    expect(migration).not.toContain("current_user = 'postgres'");
    expect(migration).not.toContain('current_user = session_user');
    expect(migration).not.toContain('dmp_quote_status_transition_valid(old.status');
  });

  it('QUO-01/02/06: core is the single server-side validation and traceability logic', () => {
    expect(migration).toContain('create or replace function public.dmp_quote_transition_apply');
    expect(migration).toContain('revoke all on function public.dmp_quote_transition_apply(uuid, text, text, text, uuid) from authenticated');
    expect(migration).toContain('set_config(\'dmp.quote_status_change\', \'true\', true)');
    expect(migration).toContain('v_previous, v_quote.status, v_actor, v_reason, v_forced_reason');
    expect(migration).toContain('insert into public.quote_status_history(company_id, quote_id, previous_status, new_status, changed_by, reason, manual_correction)');
    expect(migration).toContain('el motivo es obligatorio para este cambio de estado');
    expect(migration).toContain('transicion de estado de presupuesto no permitida');
  });

  it('QUO-02: forbids status -> same status to avoid a fake history entry', () => {
    expect(migration).toContain('el presupuesto ya se encuentra en el estado');
    expect(migration).toContain('p_new_status is not distinct from v_quote.status');
    expect(migration).not.toContain("p_new_status is not distinct from v_quote.status then\n      return");
  });

  it('QUO-01/06: RPC only authorizes and delegates to the core (no duplicated logic)', () => {
    expect(migration).toContain('create or replace function public.dmp_change_quote_status');
    expect(migration).toContain('p_reason text default null');
    expect(migration).toContain('p_sent_to_email text default null');
    expect(migration).toContain('return public.dmp_quote_transition_apply(p_quote_id, p_new_status, p_reason, p_sent_to_email, public.current_profile_id());');
    expect(migration).toContain("has_any_role(array['superadmin','Comercial','Gerencia','SAT','Oficina'])");
    expect(migration).toContain('revoke all on function public.dmp_change_quote_status(uuid, text, text, text) from public');
    expect(migration).toContain('grant execute on function public.dmp_change_quote_status(uuid, text, text, text) to authenticated');
  });

  it('QUO-06: Enviado requires a destination email and records it', () => {
    expect(migration).toContain('el email del cliente para marcar el presupuesto como enviado');
    expect(migration).toContain('el email del cliente no es valido');
    expect(migration).toContain('sent_to_email = case when p_new_status = \'Enviado\' then trim(p_sent_to_email) else sent_to_email end');
  });

  it('QUO-01/02: finalize uses the safe mechanism explicitly for Aceptado -> Ejecutado en cliente', () => {
    expect(migration).toContain('create or replace function public.dmp_finalize_work_order_technical(p_work_order_id uuid, p_payload jsonb default \'{}\'::jsonb)');
    expect(migration).toContain("perform public.dmp_quote_transition_apply(v_work.quote_id, 'Ejecutado en cliente'");
    expect(migration).not.toContain("set status = 'Ejecutado en cliente'");
    expect(migration).not.toContain("where company_id = v_work.company_id and id = v_work.quote_id and deleted_at is null and status = 'Aceptado'");
  });

  it('QUO-03/10: position is max(position)+1 with an advisory lock, not count + 1', () => {
    expect(migration).toContain('dmp_quote_lines_position_trigger');
    expect(migration).toContain("if new.position is null or new.position <= 0 then");
    expect(migration).toContain('pg_advisory_xact_lock');
    expect(migration).toContain('coalesce(max(position), 0) + 1');
    expect(migration).toContain('create trigger quote_lines_position_trigger');
    expect(migration).toContain('before insert on public.quote_lines');
    expect(quotesService).not.toContain('(quote.quote_lines ?? []).filter((line: any) => !line.deleted_at).length + 1');
    expect(quotesService).not.toContain('count + 1');
  });

  it('QUO-04: line discount applies to total_price and is validated forward', () => {
    expect(migration).toContain('new.total_price := round(new.quantity * new.unit_price * (1 - new.discount_percent / 100), 2)');
    expect(migration).toContain('el descuento de la linea debe estar entre 0 y 100');
    expect(quotesService).toContain('Math.round(quantity * unitPrice * (1 - discountPercent / 100) * 100) / 100');
    expect(quotesService).toContain('el descuento de la línea debe estar entre 0 y 100');
  });

  it('QUO-04: backfill is conservative and only touches editable quotes that differ', () => {
    const start = migration.indexOf('Backfill CONSERVADOR');
    const end = migration.indexOf('QUO-05: garantia server-side');
    const backfill = migration.slice(start, end);
    expect(backfill).toContain('update public.quote_lines ql');
    expect(backfill).toContain('from public.quotes q');
    expect(backfill).toContain("q.status in ('Borrador','Enviado')");
    expect(backfill).toContain('is distinct from');
    expect(backfill).not.toContain("'Aceptado'");
    expect(backfill).not.toContain('set total_cost = round(coalesce(quantity, 0) * coalesce(unit_cost, 0), 2)');
    expect(backfill).not.toContain('where deleted_at is null');
  });

  it('QUO-05: preflight is read-only and detects duplicates before the unique index', () => {
    const start = migration.indexOf('Preflight READ-ONLY');
    const end = migration.indexOf('create unique index if not exists work_orders_single_quote_unique');
    const preflight = migration.slice(start, end);
    expect(preflight).toContain("having count(*) > 1");
    expect(preflight).toContain('presupuestos con mas de un parte activo');
    expect(preflight).toContain('No se ha modificado ningun dato');
    expect(preflight).not.toContain('update ');
    expect(preflight).not.toContain('delete ');
    expect(preflight).not.toContain('truncate');
    expect(preflight).not.toContain('reconcil');
    expect(migration).toContain('create unique index if not exists work_orders_single_quote_unique');
    expect(migration).toContain('on public.work_orders(quote_id)');
    expect(migration).toContain('where quote_id is not null and deleted_at is null');
  });

  it('QUO-05: create_work_order_full refuses a quote that already has a work order', () => {
    expect(migration).toContain('el presupuesto ya tiene un parte generado');
    expect(migration).toContain("if public.dmp_quote_has_generated_work_order(v_quote.id) then raise exception");
    expect(workOrderMigration).toContain('create_work_order_full');
  });

  it('QUO-07: deleteLine preserves the row and fills author and reason', () => {
    expect(quotesService).toContain("async deleteLine(lineId: string, reason = 'Línea eliminada')");
    expect(quotesService).toContain('deleted_by');
    expect(quotesService).toContain('delete_reason');
    expect(quotesService).toContain('deleted_at');
    expect(app).toContain("quotesService.deleteLine(removingLine.id, 'Línea eliminada')");
  });

  it('routes manual status changes through the safe RPC in the service and the UI', () => {
    expect(quotesService).toContain("supabase.rpc('dmp_change_quote_status'");
    expect(quotesService).toContain("p_sent_to_email: sentToEmail ?? null");
    expect(quotesService).toContain("return this.changeStatus(id, 'Enviado', 'Envio al cliente', email);");
    expect(quotesService).toContain("const { status: _status, ...rest } = normalized");
    expect(app).toContain('quotesService.changeStatus(quote.id, confirm.next, confirm.reason || \'Cambio rapido de estado\', sentToEmail)');
    expect(app).toContain('quotesService.changeStatus(initial.id, values.status, \'Cambio de estado al editar el presupuesto\',');
  });
});