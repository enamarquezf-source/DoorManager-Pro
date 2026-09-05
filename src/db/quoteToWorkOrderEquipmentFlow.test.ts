import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const app = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');
const creation = readFileSync(new URL('../../supabase/migrations/111_ensure_work_order_equipment_checks.sql', import.meta.url), 'utf8');
const preventive = readFileSync(new URL('../../supabase/migrations/112_ensure_preventive_work_order_equipment_checks.sql', import.meta.url), 'utf8');

describe('quote to work-order equipment flow', () => {
  it('keeps the complete conceptual chain from quote lines to checks', () => {
    expect(app).toContain('quote_equipment_lines: lines');
    expect(app).toContain('quoteEquipmentSelection(initial.quote_equipment_lines, equipmentTypes.data)');
    expect(app).toContain('equipment_selection = selectedEquipment.map');
    expect(app).toContain('workOrdersService.create(payload, creatorRole)');
    expect(creation).toContain("jsonb_array_elements(v_selection)");
    expect(creation).toContain('insert into public.work_order_equipment');
    expect(creation).toContain('perform public.dmp_ensure_work_order_equipment_check');
    expect(preventive).toContain("'Instalacion', 'Mantenimiento', 'Preventivo'");
  });

  it('does not add historical repair or backfill writes', () => {
    expect(app).not.toContain('PAR-2026-000033');
    expect(creation).not.toMatch(/PAR-2026-000033|backfill|historical repair/i);
    expect(preventive).not.toMatch(/PAR-2026-000033|backfill|historical repair/i);
  });
});
