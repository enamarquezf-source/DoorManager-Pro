import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import pgQuery from 'pg-query-emscripten';

const migration = readFileSync(new URL('../../supabase/migrations/082_multi_equipment_work_orders.sql', import.meta.url), 'utf8');
const preflight = readFileSync(new URL('../../supabase/verification/preflight_multi_equipment_work_orders_082.sql', import.meta.url), 'utf8');
const postflight = readFileSync(new URL('../../supabase/verification/postflight_multi_equipment_work_orders_082.sql', import.meta.url), 'utf8');
const service = readFileSync(new URL('../services/workOrdersService.ts', import.meta.url), 'utf8');
const app = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');
const styles = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');
const picker = app.slice(app.indexOf('function MultiEquipmentPicker'), app.indexOf('function LegacyMultiEquipmentPicker'));

describe('multi-equipment work orders 082', () => {
  it('parses migration and both verification scripts', async () => {
    const parser = await pgQuery();
    expect(parser.parse(migration).parse_tree.stmts.length).toBeGreaterThan(0);
    expect(parser.parse(preflight).parse_tree.stmts.length).toBeGreaterThan(0);
    expect(parser.parse(postflight).parse_tree.stmts.length).toBeGreaterThan(0);
  });

  it('reuses the existing bridge, backfills primary equipment and supports pending checks', () => {
    expect(migration).toContain('alter table public.work_order_equipment');
    expect(migration).toContain('insert into public.work_order_equipment');
    expect(migration).toContain('equipment_selection');
    expect(migration).toContain("then 'pending_template'");
    expect(migration).toContain('generate_pending_installation_check');
    expect(migration).not.toContain('create table public.work_order_equipment');
    expect(migration).not.toContain('insert into public.work_order_materials');
    expect(migration).not.toContain('material_stock_movements');
  });

  it('loads every associated equipment and sends a collection without stock side effects', () => {
    expect(service).toContain("from('work_order_equipment')");
    expect(service).toContain('associated_equipment');
    expect(app).toContain('equipment_selection');
    expect(app).toContain('selectedEquipment.map');
    expect(app).toContain('function MultiEquipmentPicker');
    expect(app).toContain('<MultiEquipmentPicker values={values}');
    expect(app).toContain('Array.from({ length: quantity }');
    expect(app).toContain('EQUIPOS ASOCIADOS');
    expect(app).toContain("if (values.type === 'Instalacion' && !selectedEquipment.length)");
    expect(app).not.toContain("if (values.type === 'Instalacion' && !values.main_equipment_id && !values.installation_equipment?.equipment_type_id)");
  });

  it('uses only the selected collection for existing, new and mixed submissions', () => {
    expect(app).toContain("const selectedEquipment = values.equipment_selection ?? []");
    expect(app).toContain("selectedEquipment.map((item: any) => item.kind === 'existing'");
    expect(app).not.toContain('values.equipment_selection?.length ? values.equipment_selection :');
    expect(app).toContain("equipment_selection: [], main_equipment_id: ''");
    expect(app).toContain('!draft.equipment_type_id || !Number.isInteger(quantity) || quantity < 1');
    expect(app).toContain('setDraft({ equipment_type_id: \'\', quantity: 1');
  });

  it('keeps equipment cards readable on desktop and mobile', () => {
    expect(styles).toContain('.compact-list.multi-equipment-list article { grid-template-columns: auto minmax(180px, 1.2fr) minmax(180px, 1fr) minmax(90px, auto);');
    expect(styles).toContain('.compact-list.multi-equipment-list article { grid-template-columns: 1fr; align-items: stretch; }');
    expect(styles).toContain('.mini-modal:has(.multi-equipment-list) > form { width: min(900px, calc(100vw - 32px)); }');
    expect(styles).toContain('.multi-equipment-list article strong, .multi-equipment-list article p');
    expect(styles).toContain('grid-column: 2 / 4');
    expect(styles).not.toContain('.multi-equipment-list article { grid-template-columns: minmax(180px, 1fr) minmax(180px, 1fr) auto;');
    expect(styles).toContain('word-break: normal');
  });

  it('does not make the new-equipment draft part of the work-order submit validation', () => {
    expect(picker).toContain('label="Tipo de equipo"');
    expect(picker).not.toContain('label="Tipo de equipo" value={draft.equipment_type_id} onChange={(value) => setDraft({ ...draft, equipment_type_id: value })} required');
    expect(picker).toContain('<label>Cantidad<input');
    expect(picker).not.toContain('value={draft.quantity} onChange={(event) => setDraft({ ...draft, quantity: event.target.value })} required');
    expect(picker).toContain('Number.isInteger(quantity) || quantity < 1');
    expect(picker).toContain('equipment_selection: next');
    expect(picker).toContain('setDraft({ equipment_type_id: \'\', quantity: 1');
  });

  it('keeps verification scripts read-only', () => {
    expect(preflight + postflight).not.toMatch(/\b(insert|update|delete|alter|create|drop)\b/i);
  });
});
