import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const migration = readFileSync(new URL('../../supabase/migrations/063_check_sync_metadata_hotfix.sql', import.meta.url), 'utf8');

describe('063 check sync metadata hotfix', () => {
  it('registra las columnas del hotfix de forma idempotente', () => {
    expect(migration).toContain('alter table public.check_section_results');
    for (const column of ['intervention text', 'severity text', 'components jsonb', 'local_change_id text', 'synced_at timestamptz']) {
      expect(migration).toContain(`add column if not exists ${column}`);
    }
    expect(migration).not.toMatch(/\b(drop|delete|update|insert)\b/i);
  });
});
