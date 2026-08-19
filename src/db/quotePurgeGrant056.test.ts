import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const purgeMigration = readFileSync(new URL('../../supabase/migrations/055_test_data_purge_controls.sql', import.meta.url), 'utf8');
const grantMigration = readFileSync(new URL('../../supabase/migrations/056_quote_purge_grant_frontend.sql', import.meta.url), 'utf8');
const signature = 'dmp_purge_entity_with_cleanup(text, uuid, text, text, jsonb, boolean, boolean)';

describe('purga definitiva 056: grant a authenticated', () => {
  it('055 revocaba la ejecución a public/anon pero NO la concedía a authenticated (causa del permission denied)', () => {
    expect(purgeMigration).toContain(`revoke all on function public.${signature} from public;`);
    expect(purgeMigration).not.toMatch(/grant execute on function public\.dmp_purge_entity_with_cleanup/);
  });

  it('056 concede EXECUTE a authenticated para dmp_purge_entity_with_cleanup', () => {
    expect(grantMigration).toContain(`grant execute on function public.${signature} to authenticated;`);
  });

  it('056 es idempotente y no redefine funciones ni toca las migraciones 001-055', () => {
    expect(grantMigration).not.toContain('create or replace');
    expect(grantMigration).not.toMatch(/delete from/);
    expect(grantMigration.trim().split('\n').filter((line) => line.trim() && !line.trim().startsWith('--')).length).toBe(1);
  });

  it('la autorización real sigue en is_platform_superadmin() dentro de dmp_purge_entity_with_cleanup (055 intacta)', () => {
    expect(purgeMigration).toContain("if not public.is_platform_superadmin() then");
    expect(purgeMigration).toContain("raise exception 'purga: solo el propietario global puede ejecutar purgas definitivas.");
    expect(grantMigration).not.toContain('if not public.is_platform_superadmin() then');
  });

  it('la RPC de purga solo se invoca con entidades soportadas; quotes conserva su semántica de bloantes en el plan', () => {
    expect(purgeMigration).toMatch(/elsif p_entity = 'quotes' then/);
    expect(purgeMigration).toContain("'partes_generados', (select count(*) from public.work_orders where quote_id = p_entity_id)");
    expect(purgeMigration).toContain('Usa scope.purge_related_work_orders.enable para purgarlos en cascada');
  });
});