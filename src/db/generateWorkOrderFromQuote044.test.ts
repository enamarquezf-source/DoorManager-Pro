import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import pgQuery from 'pg-query-emscripten';

const migration = readFileSync(new URL('../../supabase/migrations/044_fix_generate_work_order_from_quote.sql', import.meta.url), 'utf8');

describe('generate work order from quote 044', () => {
  it('parses migration SQL', async () => {
    const parser = await pgQuery();
    expect(parser.parse(migration).parse_tree.stmts.length).toBeGreaterThan(0);
  });

  it('replaces the RPC with quote-safe validation and authorized roles', () => {
    expect(migration).toContain('create or replace function public.create_work_order_full(p_payload jsonb)');
    expect(migration).toContain("public.has_any_role(array['superadmin','SAT','Comercial','Gerencia','Oficina'])");
    expect(migration).not.toContain("'Tecnico'");
    expect(migration).toContain('if not public.is_platform_superadmin() then perform public.assert_member_of_current_company(v_company_id); end if;');
    expect(migration).toContain('v_quote.company_id <> v_company_id or v_quote.client_id <> v_client_id');
    expect(migration).toContain('v_quote.site_id is not null and v_quote.site_id is distinct from v_site_id');
    expect(migration).toContain('v_quote.equipment_id is not null and v_quote.equipment_id is distinct from v_equipment_id');
    expect(migration).toContain('v_quote.case_id is not null and v_quote.case_id is distinct from v_case_id');
    expect(migration).toContain("lower(coalesce(v_quote.status, '')) not in ('aceptado','ejecutado en cliente')");
  });

  it('keeps work order quote relation and avoids material stock side effects', () => {
    expect(migration).toContain('alter table public.work_orders add column if not exists quote_id uuid references public.quotes(id)');
    expect(migration).toContain('create index if not exists work_orders_quote_id_idx');
    expect(migration).toContain('planned_material');
    expect(migration).not.toContain('insert into public.work_order_materials');
    expect(migration).not.toContain('material_stock_movements');
    expect(migration).not.toContain('stock_deducted_quantity');
  });

  it('recreates only the required work order policies idempotently', () => {
    expect(migration).toContain('drop policy if exists work_orders_platform_superadmin_select on public.work_orders');
    expect(migration).toContain('drop policy if exists work_orders_platform_superadmin_insert on public.work_orders');
    expect(migration).toContain('drop policy if exists work_orders_platform_superadmin_update on public.work_orders');
    expect(migration).toContain('drop policy if exists work_orders_insert_quote_authorized_roles on public.work_orders');
    expect(migration).toContain('create policy work_orders_platform_superadmin_insert on public.work_orders for insert to authenticated');
    expect(migration).toContain('create policy work_orders_insert_quote_authorized_roles on public.work_orders for insert to authenticated');
    expect(migration).not.toContain('for all');
    expect(migration).not.toContain('disable row level security');
    expect(migration).not.toContain('service_role');
  });
});
