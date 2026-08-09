import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import pgQuery from 'pg-query-emscripten';

const migration = readFileSync(new URL('../../supabase/migrations/023_work_order_operations_and_controlled_delete.sql', import.meta.url), 'utf8');
const preflight = readFileSync(new URL('../../supabase/verification/preflight_work_order_operations_023.sql', import.meta.url), 'utf8');
const verification = readFileSync(new URL('../../supabase/verification/verify_work_order_operations_023.sql', import.meta.url), 'utf8');
const app = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');
const permissions = readFileSync(new URL('../auth/permissions.ts', import.meta.url), 'utf8');
const service = readFileSync(new URL('../services/workOrdersService.ts', import.meta.url), 'utf8');

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
    for (const fn of ['dmp_upsert_work_order_time_entry(jsonb)', 'dmp_delete_work_order_time_entry(uuid, text)', 'dmp_upsert_work_order_material(jsonb)', 'dmp_delete_work_order_material(uuid, text)', 'dmp_change_work_order_status(uuid, text, text)', 'dmp_permanently_delete_entity(text, uuid, text, text)']) {
      expect(migration).toContain(`revoke all on function public.${fn} from public`);
      expect(migration).toContain(`revoke all on function public.${fn} from anon`);
      expect(migration).toContain(`grant execute on function public.${fn} to authenticated`);
    }
  });

  it('implements controlled materials and offline duplicate protection', () => {
    expect(migration).toContain('alter table public.work_order_materials alter column material_id drop not null');
    expect(migration).toContain('description text');
    expect(migration).toContain('registered_by uuid references public.profiles(id)');
    expect(migration).toContain('work_order_materials_company_local_change_unique');
    expect(migration).toContain('select id into v_id from public.work_order_materials where company_id = v_work.company_id and local_change_id = v_local');
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
  });

  it('adds UI blocks for hours and materials in the same work order detail', () => {
    expect(app).toContain('Añadir horas');
    expect(app).toContain('Horas trabajadas');
    expect(app).toContain('Añadir material');
    expect(app).toContain('Materiales utilizados');
    expect(app).toContain('Timeline events');
    expect(app).toContain('Confirmacion destructiva final');
    expect(permissions).toContain('canManageWorkOrderTime');
    expect(permissions).toContain('canManageWorkOrderMaterials');
    expect(permissions).toContain('canViewWorkOrderCosts');
  });

  it('documents verification queries for Supabase without executing them locally', () => {
    expect(preflight).toContain('work_order_materials_columns_before_023');
    expect(verification).toContain('critical_rpc_after_023');
    expect(verification).toContain('begin;');
    expect(verification).toContain('rollback;');
  });
});
