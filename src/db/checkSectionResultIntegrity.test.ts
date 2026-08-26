import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(resolve(process.cwd(), 'supabase/migrations/069_check_section_result_integrity.sql'), 'utf8');

describe('check section result integrity', () => {
  it('enforces that the requested section belongs to the check template', () => {
    expect(migration).toContain('validate_check_section_result_template');
    expect(migration).toContain('s.template_id = c.template_id');
    expect(migration).toContain('s.id = new.section_id');
    expect(migration).toContain('c.company_id = new.company_id');
    expect(migration).toContain('t.company_id = c.company_id or t.company_id is null');
    expect(migration).toContain('before insert or update of check_id, section_id');
    expect(migration).toContain('La sección no pertenece a la plantilla asociada al check');
  });
});
