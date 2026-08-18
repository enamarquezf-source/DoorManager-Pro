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
    expect(migration).not.toMatch(/grant\s+execute[^;]*to\s+service_role/i);
    expect(migration).not.toMatch(/grant\s+update[^;]*on\s+public\.[a-z_]+\s+to\s+service_role/i);
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

  it('QUO-02 reviewed: the matrix itself forbids status -> same status (unified with the core)', () => {
    const start = migration.indexOf('dmp_quote_status_transition_valid');
    const end = migration.indexOf('guarda de estado server-side en DOS capas');
    const matrix = migration.slice(start, end);
    expect(matrix).toContain('and p_new is distinct from p_previous');
    expect(matrix).not.toMatch(/p_previous\s*=\s*p_new/);
    expect(matrix).not.toContain('or (p_previous = p_new');
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

  it('QUO-01/02 reviewed: README-PUBLISHED CAPA 1 uses column grants, not a table-level revoke for status', () => {
    expect(migration).toContain('revoke update on public.quotes from anon, authenticated');
    expect(migration).toContain('grant update (client_id, site_id, equipment_id, opportunity_id, case_id, quote_type, title, description, valid_until, discount_type, discount_value, conditions, updated_by, updated_at) on public.quotes to authenticated');
    expect(migration).not.toMatch(/revoke\s+update\s*\(\s*status\s*\)/i);
    expect(migration).not.toMatch(/grant\s+update\s+\([^)]*status[^)]*\)/i);
    expect(migration).toContain("perform set_config('dmp.quote_status_change', '', true)");
    expect(migration).toContain('exception when others then');
    expect(migration).toContain("perform set_config('dmp.quote_status_change', '', true);\n    raise;");
  });

  it('QUO-01/02: CAPA 1 keeps service_role table UPDATE untouched and restricts client roles', () => {
    expect(migration).toContain('revoke update on public.quotes from anon, authenticated');
    expect(migration).not.toMatch(/revoke\s+update\s+on\s+public\.quotes[^;]*service_role/i);
    expect(migration).toContain('service_role NO se toca');
    expect(migration).not.toMatch(/grant\s+update[^;]*on\s+public\.quotes[^;]*to\s+service_role/i);
  });

  it('CAPA 1: authenticated only gets UPDATE on form-editable columns; server-managed columns are excluded', () => {
    const editable = ['client_id', 'site_id', 'equipment_id', 'opportunity_id', 'case_id', 'quote_type', 'title', 'description', 'valid_until', 'discount_type', 'discount_value', 'conditions', 'updated_by', 'updated_at'];
    const excluded = ['status', 'work_order_id', 'sent_at', 'sent_to_email', 'discount_amount', 'subtotal_cost', 'subtotal_sale', 'subtotal', 'taxable_base', 'tax_amount', 'total_amount', 'estimated_margin', 'deleted_at', 'deleted_by', 'delete_reason', 'company_id', 'created_by', 'created_at', 'issue_date'];
    const grantLine = migration.split('\n').find((line) => line.startsWith('grant update ('));
    expect(grantLine).toBeDefined();
    for (const column of editable) expect(grantLine).toContain(column);
    for (const column of excluded) expect(grantLine).not.toMatch(new RegExp(`\\b${column}\\b`));
  });

  it('CAPA 1: economic recalc is SECURITY DEFINER with the exact 038 formulas and restricted EXECUTE', () => {
    const start = migration.indexOf('create or replace function public.dmp_recalculate_quote_totals(p_quote_id uuid)');
    const end = migration.indexOf('create or replace function public.dmp_quote_lines_recalculate_trigger()');
    const recalc = migration.slice(start, end);
    expect(recalc).toContain('security definer');
    expect(recalc).toContain('set search_path = public');
    expect(recalc).toContain('v_discount := least(case when v_discount_type = \'percentage\' then v_sale * coalesce(v_discount_value, 0) / 100 else coalesce(v_discount_value, 0) end, v_sale);');
    expect(recalc).toContain('v_taxable := greatest(v_sale - coalesce(v_discount, 0), 0);');
    expect(recalc).toContain('subtotal_cost = round(v_cost, 2)');
    expect(recalc).toContain('subtotal_sale = round(v_sale, 2)');
    expect(recalc).toContain('subtotal = round(v_sale, 2)');
    expect(recalc).toContain('discount_amount = round(coalesce(v_discount, 0), 2)');
    expect(recalc).toContain('taxable_base = round(v_taxable, 2)');
    expect(recalc).toContain('tax_amount = round(v_tax, 2)');
    expect(recalc).toContain('total = round(v_taxable + v_tax, 2)');
    expect(recalc).toContain('total_amount = round(v_taxable + v_tax, 2)');
    expect(recalc).toContain('estimated_margin = round(v_taxable - v_cost, 2)');
    expect(recalc).toContain('updated_at = now()');
    expect(recalc).not.toContain('set status');
    expect(migration).toContain('revoke all on function public.dmp_recalculate_quote_totals(uuid) from public');
    expect(migration).toContain('revoke all on function public.dmp_recalculate_quote_totals(uuid) from anon');
    expect(migration).toContain('revoke all on function public.dmp_recalculate_quote_totals(uuid) from authenticated');
    expect(migration).not.toMatch(/grant\s+execute\s+on\s+function\s+public\.dmp_recalculate_quote_totals/i);
  });

  it('CAPA 1: recalc triggers stay as SECURITY DEFINER wrappers so client line/discount edits keep recalculating', () => {
    expect(migration).toContain('dmp_quote_lines_recalculate_trigger');
    expect(migration).toContain('dmp_quotes_recalculate_on_discount_trigger');
    expect(migration).toContain('security definer\nset search_path = public\nas $$\nbegin\n  perform public.dmp_recalculate_quote_totals');
    expect(migration).toContain('create trigger quote_lines_recalculate_trigger');
    expect(migration).toContain('create trigger quotes_recalculate_on_discount_trigger');
    expect(migration).toContain('after insert or update or delete on public.quote_lines');
    expect(migration).toContain('after update of discount_type, discount_value on public.quotes');
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
    expect(quotesService).toContain('updateQuoteColumns');
    expect(quotesService).toContain("const editable = cleanPayload(normalized, updateQuoteColumns);");
    expect(quotesService).not.toContain("const { status: _status, ...rest } = normalized");
    expect(app).toContain('quotesService.changeStatus(quote.id, confirm.next, confirm.reason || \'Cambio rapido de estado\', sentToEmail)');
    expect(app).toContain('quotesService.changeStatus(initial.id, values.status, \'Cambio de estado al editar el presupuesto\',');
  });

  it('service update never sends server-managed fields (status, sent_at, sent_to_email, work_order_id, calculated)', () => {
    const whitelist = quotesService.split('\n').find((line) => line.includes("const updateQuoteColumns = ['client_id'"));
    expect(whitelist).toBeDefined();
    const deniedTokens = ['status', 'sent_at', 'sent_to_email', 'work_order_id', 'discount_amount', 'subtotal_cost', 'subtotal_sale', 'subtotal', 'taxable_base', 'tax_amount', 'total_amount', 'estimated_margin', 'deleted_at', 'deleted_by', 'delete_reason', 'company_id', 'created_by', 'created_at', 'issue_date'];
    for (const token of deniedTokens) {
      expect(whitelist).not.toMatch(new RegExp(`\\b${token}\\b`));
    }
    expect(whitelist).toContain("'client_id'");
    expect(whitelist).toContain("'conditions'");
    expect(quotesService).toContain("const editable = cleanPayload(normalized, updateQuoteColumns);");
    expect(quotesService).toContain('{ ...editable, updated_by }');
  });

  it('QUO-08: audit - the INSERT bypass existed and the fix is a BEFORE INSERT trigger, not a table REVOKE INSERT', () => {
    expect(migration).toContain('QUO-08: guarda de superficie INSERT (cierre del bypass de integridad)');
    expect(migration).toContain('create trigger quotes_insert_normalize_trigger');
    expect(migration).toContain('before insert on public.quotes');
    expect(migration).not.toMatch(/revoke\s+insert\s+on\s+public\.quotes/i);
    expect(migration).not.toMatch(/grant\s+insert\s*\([^)]*\)\s+on\s+public\.quotes/i);
  });

  it('QUO-08: normalize trigger is SECURITY DEFINER with restricted search_path', () => {
    const start = migration.indexOf('create or replace function public.dmp_quote_insert_normalize_trigger()');
    const end = migration.indexOf('drop trigger if exists quotes_insert_normalize_trigger');
    const fn = migration.slice(start, end);
    expect(fn).toContain('security definer');
    expect(fn).toContain('set search_path = public');
    expect(migration).toContain('drop trigger if exists quotes_insert_normalize_trigger on public.quotes');
    expect(migration).toContain('create trigger quotes_insert_normalize_trigger');
    expect(migration).toContain('for each row execute function public.dmp_quote_insert_normalize_trigger()');
  });

  it('QUO-08: a quote can never be born outside Borrador and send/lifecycle fields are neutralized', () => {
    const section = migration.slice(migration.indexOf('QUO-08: guarda de superficie INSERT (cierre del bypass de integridad)'), migration.indexOf('QUO-01/02/06: nucleo unico'));
    expect(section).toContain("new.status := 'Borrador';");
    expect(section).toContain("new.sent_at := null;");
    expect(section).toContain('new.sent_to_email := null;');
    expect(section).toContain('new.deleted_at := null;');
    expect(section).toContain('new.deleted_by := null;');
    expect(section).toContain('new.delete_reason := null;');
    expect(section).not.toMatch(/new\.status\s*:=\s*'Aceptado'/i);
    expect(section).not.toMatch(/new\.status\s*:=\s*'Enviado'/i);
    expect(section).not.toMatch(/new\.status\s*:=\s*'Ejecutado en cliente'/i);
  });

  it('QUO-08: calculated economics are born to zero and recalc owns them on line insert', () => {
    const section = migration.slice(migration.indexOf('QUO-08: guarda de superficie INSERT (cierre del bypass de integridad)'), migration.indexOf('QUO-01/02/06: nucleo unico'));
    for (const token of ['subtotal_cost', 'subtotal_sale', 'subtotal', 'discount_amount', 'taxable_base', 'tax_amount', 'total', 'total_amount', 'estimated_margin']) {
      expect(section).toContain(`new.${token} := 0;`);
    }
    expect(section).toContain('new.updated_at := now();');
    expect(section).toMatch(/a 0; los escribe[\s\S]*?en cuanto se insertan lineas/);
  });

  it('QUO-08: trigger does NOT touch company_id/code/created_by so the legit create flow and 034 auto-code keep working', () => {
    const section = migration.slice(migration.indexOf('QUO-08: guarda de superficie INSERT (cierre del bypass de integridad)'), migration.indexOf('QUO-01/02/06: nucleo unico'));
    expect(section).not.toMatch(/new\.company_id\s*:/);
    expect(section).not.toMatch(/new\.code\s*:/);
    expect(section).not.toMatch(/new\.created_by\s*:/);
    expect(section).toContain("NO toca company_id (lo aporta quotesService.create() con currentCompanyId()");
    expect(section).toContain('trg_quotes_auto_code -> next_dmp_code');
  });

  it('QUO-08: quotesService.create() keeps sending Borrador + the real company/code/creator mechanism', () => {
    const create = quotesService.slice(quotesService.indexOf('async create('), quotesService.indexOf('async update('));
    expect(quotesService).toContain("defaults ? { status: 'Borrador', quote_type: 'reparacion', discount_type: 'percentage', discount_value: 0 }");
    expect(create).toContain('company_id');
    expect(create).toContain('created_by');
    expect(create).toContain('code');
    expect(create).toContain("supabase.from('quotes').insert(insertPayload)");
    expect(create).not.toContain("status: 'Aceptado'");
  });

  it('QUO-02: internal cores (has_generated_work_order and transition matrix) are not executable by PUBLIC/anon/authenticated', () => {
    const fn1 = 'public.dmp_quote_has_generated_work_order(uuid)';
    const fn2 = 'public.dmp_quote_status_transition_valid(text, text, boolean)';
    for (const fn of [fn1, fn2]) {
      for (const role of ['public', 'anon', 'authenticated']) {
        expect(migration).toContain(`revoke all on function ${fn} from ${role}`);
      }
      expect(migration).not.toMatch(new RegExp(`grant\\s+execute\\s+on\\s+function\\s+${fn.replace(/[()]/g, '\\$&')}\\s+to\\s+(public|anon|authenticated)`, 'i'));
    }
  });
});