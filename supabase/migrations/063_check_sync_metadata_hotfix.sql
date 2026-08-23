-- DoorManager Pro - registra el hotfix desplegado para sincronizacion de bloques de checks.
-- Idempotente: las columnas ya pueden existir en Supabase por aplicacion manual.

alter table public.check_section_results
  add column if not exists intervention text,
  add column if not exists severity text,
  add column if not exists components jsonb not null default '[]'::jsonb,
  add column if not exists local_change_id text,
  add column if not exists synced_at timestamptz;
