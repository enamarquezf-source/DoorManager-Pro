import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(resolve(process.cwd(), 'supabase/migrations/014_check_template_equipment_integrity.sql'), 'utf8');
const diagnostic = readFileSync(resolve(process.cwd(), 'supabase/diagnostics/checks_incompatible_templates.sql'), 'utf8');

describe('check template integrity migration', () => {
  it('bloquea plantillas incompatibles con el tipo de equipo', () => {
    expect(migration).toContain('validate_check_template_equipment');
    expect(migration).toContain('v_template_type_id <> v_equipment_type_id');
    expect(migration).toContain('before insert or update of equipment_id, template_id, company_id on public.checks');
  });

  it('incluye diagnostico de checks incompatibles existentes', () => {
    expect(diagnostic).toContain('ct.equipment_type_id <> e.equipment_type_id');
    expect(diagnostic).toContain('check_code');
    expect(diagnostic).toContain('template_name');
  });
});
