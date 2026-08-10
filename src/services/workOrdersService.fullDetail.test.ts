import { describe, expect, it } from 'vitest';

describe('workOrdersService full detail queries', () => {
  it('carga tipo de equipo, checks completos y archivos firmables', async () => {
    const source = await import('node:fs').then((fs) => fs.readFileSync(new URL('./workOrdersService.ts', import.meta.url), 'utf8'));
    expect(source).toContain('primary_equipment:equipment!work_orders_main_equipment_id_fkey(*, equipment_types!equipment_equipment_type_id_fkey(*))');
    expect(source).toContain('equipment!checks_equipment_id_fkey(*, equipment_types!equipment_equipment_type_id_fkey(*))');
    expect(source).toContain('check_template_sections!check_template_sections_template_id_fkey');
    expect(source).toContain('work_order_photos');
    expect(source).toContain('withSignedFileUrl');
    expect(source).toContain('work_order_cost_entries');
    expect(source).toContain('cost_entries: costEntries');
    expect(source).toContain(".is('deleted_at', null).order('incurred_at'");
  });
});
