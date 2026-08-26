import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(resolve(process.cwd(), 'supabase/migrations/070_allow_incomplete_check_finish.sql'), 'utf8');
const app = readFileSync(resolve(process.cwd(), 'src/App.tsx'), 'utf8');

describe('check finish contract', () => {
  it('does not block unfinished business sections', () => {
    expect(migration).not.toContain('No se puede finalizar: hay secciones sin sincronizar');
    expect(migration).toContain('revoke all on function public.finish_check_safe(uuid, text) from public');
    expect(migration).toContain('revoke all on function public.finish_check_safe(uuid, text) from anon');
    expect(app).toContain('const canFinishCheck = pending.length === 0;');
    expect(app).toContain('Hay bloques sin revisar. Puedes finalizar');
  });
});
