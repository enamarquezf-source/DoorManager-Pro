import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import pgQuery from 'pg-query-emscripten';

const migration = readFileSync(new URL('../../supabase/migrations/027_work_order_cost_entries.sql', import.meta.url), 'utf8');
const app = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');
const permissions = readFileSync(new URL('../auth/permissions.ts', import.meta.url), 'utf8');
const service = readFileSync(new URL('../services/workOrdersService.ts', import.meta.url), 'utf8');

describe('work order cost entries 027', () => {
  it('parses migration SQL', async () => {
    const parser = await pgQuery();
    expect(parser.parse(migration).parse_tree.stmts.length).toBeGreaterThan(0);
  });

  it('creates scoped auxiliary cost entries with direct writes blocked', () => {
    expect(migration).toContain('create table if not exists public.work_order_cost_entries');
    expect(migration).toContain("cost_type in ('desplazamiento','taller_movil','plataforma_elevadora','medio_auxiliar','coste_externo','parking_peaje','dieta','otro')");
    expect(migration).toContain('deleted_at timestamptz');
    expect(migration).toContain('deleted_by uuid references public.profiles(id)');
    expect(migration).toContain('delete_reason text');
    expect(migration).toContain('validated_at timestamptz');
    expect(migration).toContain('work_order_cost_entries_work_order_local_change_unique');
    expect(migration).toContain('where local_change_id is not null and deleted_at is null');
    expect(migration).toContain('work_order_cost_entries_insert_block_direct');
    expect(migration).toContain('work_order_cost_entries_update_block_direct');
    expect(migration).toContain('work_order_cost_entries_delete_block_direct');
    expect(migration).toContain('deleted_at is null');
    expect(migration).toContain('or public.is_platform_superadmin()');
  });

  it('exposes only authenticated RPCs and audits soft delete changes', () => {
    for (const fn of ['dmp_upsert_work_order_cost_entry(jsonb)', 'dmp_delete_work_order_cost_entry(uuid, text)']) {
      expect(migration).toContain(`revoke all on function public.${fn} from public`);
      expect(migration).toContain(`revoke all on function public.${fn} from anon`);
      expect(migration).toContain(`grant execute on function public.${fn} to authenticated`);
    }
    expect(migration).toContain('insert into public.audit_log');
    expect(migration).toContain("'work_order_cost_entries'");
    expect(migration).toContain("'SOFT_DELETE'");
    expect(migration).toContain('No tienes permisos para registrar importes economicos');
  });

  it('soft deletes cost entries instead of physically deleting rows', () => {
    const deleteBody = migration.slice(migration.indexOf('function public.dmp_delete_work_order_cost_entry'), migration.indexOf('revoke all on table public.work_order_cost_entries'));
    expect(deleteBody).toContain('returns uuid');
    expect(deleteBody).toContain('v_entry.deleted_at is not null');
    expect(deleteBody).toContain('v_entry.registered_by <> v_profile.id');
    expect(deleteBody).toContain('v_entry.validated_at is not null');
    expect(deleteBody).toContain('No tienes permisos para eliminar costes validados');
    expect(deleteBody).toContain('set deleted_at = now(), deleted_by = v_profile.id, delete_reason = trim(p_reason), updated_at = now(), updated_by = v_profile.id');
    expect(deleteBody).toContain('return p_cost_entry_id');
    expect(deleteBody).not.toContain('delete from public.work_order_cost_entries');
  });

  it('connects frontend service, permissions and detail UI', () => {
    expect(service).toContain('dmp_upsert_work_order_cost_entry');
    expect(service).toContain('dmp_delete_work_order_cost_entry');
    expect(service).toContain('cost_entries: costEntries');
    expect(service).toContain(".from('work_order_cost_entries').select");
    expect(service).toContain(".is('deleted_at', null)");
    expect(permissions).toContain('canManageWorkOrderCosts');
    expect(app).toContain('Recursos y costes');
    expect(app).toContain('WorkOrderCostsCard');
    expect(app).toContain('WorkOrderCostForm');
    expect(app).toContain("tab === 'costes'");
  });
});
