import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const service = readFileSync(new URL('./searchService.ts', import.meta.url), 'utf8');
const app = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');
const migration = readFileSync(new URL('../../supabase/migrations/015_technician_scope_search_alerts_schedule.sql', import.meta.url), 'utf8');

describe('technician global search hardening', () => {
  it('uses the technician RPC instead of global list queries for technician workspace', () => {
    expect(service).toContain("supabase.rpc('technician_global_search'");
    expect(app).toContain("workspace === 'tecnico' ? await searchService.technician(trimmed) : await searchService.global(trimmed)");
  });

  it('ignores stale search responses and clears search on route/workspace changes', () => {
    expect(app).toContain('requestRef.current === requestId');
    expect(app).toContain("setQuery('')");
  });

  it('limits technician SQL search to assigned work and assigned checks', () => {
    expect(migration).toContain('create function public.technician_global_search');
    expect(migration).toContain('a.technician_id = public.current_profile_id()');
    expect(migration).toContain("'/app/tecnico/trabajo/'");
    expect(migration).toContain('ch.technician_id = public.current_profile_id() or public.is_assigned_to_work_order(ch.work_order_id)');
  });
});
