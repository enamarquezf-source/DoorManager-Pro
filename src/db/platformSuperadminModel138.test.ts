import { readFileSync } from 'node:fs';
import pgQuery from 'pg-query-emscripten';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(new URL('../../supabase/migrations/138_platform_superadmin_model.sql', import.meta.url), 'utf8');
const verification = readFileSync(new URL('../../supabase/verification/verify_138_platform_superadmin_model.sql', import.meta.url), 'utf8');

describe('PLATFORM-SUPERADMIN-MODEL-030', () => {
  it('parses migration and keeps verification read-only', async () => {
    const parser = await pgQuery();
    expect(parser.parse(migration).parse_tree.stmts.length).toBeGreaterThan(0);
    expect(parser.parse(verification).parse_tree.stmts.length).toBeGreaterThan(0);
    expect(verification).not.toMatch(/^\s*(insert|update|delete|alter|create|drop|grant|revoke)\b/im);
  });

  it('defines a global membership table without tenant scope or automatic bootstrap', () => {
    expect(migration).toContain('create table public.platform_superadmins');
    expect(migration).toContain('profile_id uuid primary key references public.profiles(id) on delete cascade');
    expect(migration).toContain('created_by uuid references public.profiles(id) on delete set null');
    expect(migration).not.toContain('company_id');
    expect(migration).not.toContain('insert into public.platform_superadmins');
    expect(migration).toContain('alter table public.platform_superadmins enable row level security');
  });

  it('makes the platform helper depend only on active authenticated membership', () => {
    expect(migration).toContain('join public.platform_superadmins ps on ps.profile_id = p.id');
    expect(migration).toContain('p.auth_user_id = auth.uid()');
    expect(migration).toContain('p.active = true');
    expect(migration).toContain('p.deleted_at is null');
    expect(migration).not.toContain('primary_area');
    expect(migration).not.toContain('profile_roles');
    expect(migration).toContain('revoke all on function public.is_platform_superadmin() from public, anon');
    expect(migration).toContain('grant execute on function public.is_platform_superadmin() to authenticated');
  });

  it('verifies the table, ACL, RLS and exact helper contract', () => {
    expect(verification).toContain("to_regclass('public.platform_superadmins')");
    expect(verification).toContain("to_regprocedure('public.is_platform_superadmin()')");
    expect(verification).toContain('aclexplode');
    expect(verification).toContain("atttypid = 'uuid'::regtype");
    expect(verification).toContain('from pg_policy where polrelid = v_table');
    expect(verification).toContain('relrowsecurity');
    expect(verification).toContain('primary_area');
    expect(verification).toContain('profile_roles');
    expect(verification).toContain('pg_get_functiondef');
  });
});
