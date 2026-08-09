import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import pgQuery from 'pg-query-emscripten';

const migration = readFileSync(new URL('../../supabase/migrations/023_work_order_operations_and_controlled_delete.sql', import.meta.url), 'utf8');
const preflight = readFileSync(new URL('../../supabase/verification/preflight_work_order_operations_023.sql', import.meta.url), 'utf8');
const verification = readFileSync(new URL('../../supabase/verification/verify_work_order_operations_023.sql', import.meta.url), 'utf8');
const app = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');
const permissions = readFileSync(new URL('../auth/permissions.ts', import.meta.url), 'utf8');
const service = readFileSync(new URL('../services/workOrdersService.ts', import.meta.url), 'utf8');
const lifecycleService = readFileSync(new URL('../services/entityLifecycleService.ts', import.meta.url), 'utf8');

describe('work order operations 023', () => {
  it('parses migration and verification SQL', async () => {
    const parser = await pgQuery();
    expect(parser.parse(migration).parse_tree.stmts.length).toBeGreaterThan(0);
    expect(parser.parse(preflight).parse_tree.stmts.length).toBeGreaterThan(0);
    expect(parser.parse(verification).parse_tree.stmts.length).toBeGreaterThan(0);
  });

  it('creates secure work order time entries with calculated net duration', () => {
    expect(migration).toContain('create table if not exists public.work_order_time_entries');
    expect(migration).toContain('duration_minutes integer not null check (duration_minutes > 0)');
    expect(migration).toContain('ended_at > started_at');
    expect(migration).toContain('public.dmp_work_minutes');
    expect(migration).toContain('manual_duration boolean not null default false');
    expect(migration).toContain("hour_type in ('normal','nocturna','festiva','desplazamiento','otra')");
  });

  it('protects hours, materials, status and delete RPC from anon/public', () => {
    for (const fn of ['dmp_upsert_work_order_time_entry(jsonb)', 'dmp_delete_work_order_time_entry(uuid, text)', 'dmp_upsert_work_order_material(jsonb)', 'dmp_delete_work_order_material(uuid, text)', 'dmp_change_work_order_status(uuid, text, text)', 'dmp_lifecycle_dependencies_enhanced(text, uuid)', 'dmp_permanently_delete_entity(text, uuid, text, text)']) {
      expect(migration).toContain(`revoke all on function public.${fn} from public`);
      expect(migration).toContain(`revoke all on function public.${fn} from anon`);
      expect(migration).toContain(`grant execute on function public.${fn} to authenticated`);
    }
    for (const fn of ['dmp_active_profile()', 'dmp_assert_work_order_operator(uuid, boolean)', 'dmp_work_minutes(time, time, integer, integer)', 'dmp_lifecycle_delete_plan(text, uuid)', 'dmp_deficiency_blocking_reference_count(uuid[])', 'dmp_file_reference_count(uuid)', 'dmp_queue_storage_cleanup(uuid[], uuid, text)', 'dmp_commercial_can_manage_work_order(public.work_orders, public.profiles)']) {
      expect(migration).toContain(`revoke all on function public.${fn} from public`);
      expect(migration).toContain(`revoke all on function public.${fn} from anon`);
      expect(migration).toContain(`revoke all on function public.${fn} from authenticated`);
      expect(migration).not.toContain(`grant execute on function public.${fn} to authenticated`);
    }
  });

  it('implements controlled materials and offline duplicate protection', () => {
    expect(migration).toContain('alter table public.work_order_materials alter column material_id drop not null');
    expect(migration).toContain('description text');
    expect(migration).toContain('registered_by uuid references public.profiles(id)');
    expect(migration).toContain('drop index if exists public.work_order_materials_company_local_change_unique');
    expect(migration).not.toContain('create unique index if not exists work_order_materials_company_local_change_unique');
    expect(migration).toContain('work_order_materials_work_order_local_change_unique');
    expect(migration).toContain('local_change_id = v_local and work_order_id <> v_work.id');
    expect(migration).toContain('select id into v_id from public.work_order_materials where company_id = v_work.company_id and work_order_id = v_work.id and local_change_id = v_local');
    expect(migration).toContain('v_material_row.company_id is not null and v_material_row.company_id <> v_work.company_id');
  });

  it('uses secure direct status selection with full history', () => {
    expect(migration).toContain('create or replace function public.dmp_change_work_order_status');
    expect(migration).toContain('insert into public.work_order_status_history');
    expect(migration).toContain('manual_correction');
    expect(migration).toContain("p_new_status not in ('Pendiente','Trabajo descargado'");
    expect(service).toContain("supabase.rpc('dmp_change_work_order_status'");
    expect(app).toContain('WorkOrderStatusSelector');
    expect(app).not.toContain('>Cambiar estado</button>');
    expect(app).not.toContain('>Volver estado</button>');
    expect(migration).toContain("origin = 'Comercial'");
    expect(migration).toContain('p_work.current_responsible_id = p_profile.id');
    expect(migration).toContain('finished_at = case when p_new_status');
    expect(migration).toContain('sent_at = case when p_new_status');
    expect(migration).toContain('public.dmp_commercial_can_manage_work_order(v_work, v_profile)');
    expect(migration).toContain("p_work.origin = 'Comercial'");
    expect(migration).toContain('p_work.created_by = p_profile.id or p_work.current_responsible_id = p_profile.id');
    expect(permissions).toContain("workOrder?.origin === 'Comercial'");
    expect(permissions).toContain('workOrder?.created_by === profile.id || workOrder?.current_responsible_id === profile.id');
  });

  it('deletes corrective actions before exclusive deficiencies and blocks unclassified deficiency FKs', () => {
    expect(migration).toContain('v_deficiency_ids uuid[]');
    expect(migration).toContain('select coalesce(array_agg(id), \'{}\') into v_deficiency_ids from public.deficiencies where work_order_id = p_entity_id');
    expect(migration).toContain('public.dmp_deficiency_blocking_reference_count(v_deficiency_ids)');
    expect(migration).toContain("c.confrelid = 'public.deficiencies'::regclass");
    expect(migration).toContain('delete from public.corrective_actions where deficiency_id = any(v_deficiency_ids);');
    expect(migration.indexOf('delete from public.corrective_actions where deficiency_id = any(v_deficiency_ids);')).toBeLessThan(migration.indexOf('delete from public.deficiencies where work_order_id = p_entity_id;'));
    expect(migration).toContain("'acciones_correctivas'");
    expect(migration).toContain("'referencias_deficiencias_no_clasificadas'");
    expect(preflight).toContain('deficiency_fk_classification_before_023');
    expect(verification).toContain('deficiency_fk_classification_after_023');
  });

  it('queues exclusive storage files instead of deleting file rows', () => {
    expect(migration).toContain('create table if not exists public.storage_cleanup_queue');
    expect(migration).toContain('alter table public.storage_cleanup_queue enable row level security');
    expect(migration).toContain('create policy storage_cleanup_queue_no_direct_access');
    expect(migration).toContain('public.dmp_file_reference_count(v_file.id) = 0');
    expect(migration).toContain("c.confrelid = 'public.files'::regclass");
    expect(migration).toContain('public.dmp_queue_storage_cleanup(v_file_ids, v_actor.id');
    expect(migration).toContain("'file_snapshot'");
    expect(migration).toContain('equipment_photos');
    expect(migration).toContain('case_documents');
    expect(migration).toContain('deficiencies');
    expect(migration).toContain('documents');
    expect(migration).not.toContain('delete from public.files');
    expect(preflight).toContain('file_fk_classification_before_023');
    expect(verification).toContain('storage_cleanup_queue_after_023');
  });

  it('extends lifecycle dependency reporting without replacing 022 function', () => {
    expect(migration).toContain('create or replace function public.dmp_lifecycle_dependencies_enhanced');
    expect(migration).not.toContain('create or replace function public.dmp_lifecycle_dependencies(p_entity text, p_entity_id uuid)');
    expect(migration).toContain('public.dmp_lifecycle_delete_plan');
    expect(migration).toContain('can_controlled_cascade_delete');
    expect(migration).toContain('cascade_dependencies');
    expect(migration).toContain('blocking_dependencies');
    expect(migration).toContain('stock_movements');
    expect(migration).toContain('Hay documentos vinculados al parte');
    expect(lifecycleService).toContain("supabase.rpc('dmp_lifecycle_dependencies_enhanced'");
    expect(app).toContain('Dependencias bloqueantes');
    expect(app).toContain('Dependencias eliminables en cascada');
    expect(app).toContain('cascada controlada');
  });

  it('adds UI blocks for hours and materials in the same work order detail', () => {
    expect(app).toContain('Añadir horas');
    expect(app).toContain('Horas trabajadas');
    expect(app).toContain('Añadir material');
    expect(app).toContain('Materiales utilizados');
    expect(app).toContain('Editar horas');
    expect(app).toContain('Editar material');
    expect(app).toContain('Timeline events');
    expect(app).toContain('Confirmacion destructiva final');
    expect(permissions).toContain('canManageWorkOrderTime');
    expect(permissions).toContain('canManageWorkOrderMaterials');
    expect(permissions).toContain('canViewWorkOrderCosts');
  });

  it('documents verification queries for Supabase without executing them locally', () => {
    expect(preflight).toContain('work_order_materials_columns_before_023');
    expect(preflight).toContain('foreign_keys_to_operational_entities_before_023');
    expect(preflight).toContain('local_change_collisions_before_023');
    expect(preflight).toContain('legacy_company_local_change_index_before_023');
    expect(preflight).toContain('commercial_sat_work_order_exposure_before_023');
    expect(preflight).toContain('cross_company_profile_or_material_before_023');
    expect(verification).toContain('critical_rpc_after_023');
    expect(verification).toContain('dmp_lifecycle_dependencies_enhanced');
    expect(verification).toContain('controlled_delete_plan_after_023');
    expect(verification).toContain('private_rpc_after_023');
    expect(verification).toContain('begin;');
    expect(verification).toContain('rollback;');
  });
});
