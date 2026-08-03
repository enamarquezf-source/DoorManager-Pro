import { describe, expect, it } from 'vitest';
import { buildFunctionalCheckBlocks, equipmentTypeName, isUuid, remoteBlockState, templateTypeMismatch, visualTemplateForEquipment } from './checkBlocks';

const sectionId = '11111111-1111-4111-8111-111111111111';

function check(equipmentTypeNameValue: string | null) {
  return {
    equipment: equipmentTypeNameValue ? { equipment_type_id: 'type-1', equipment_types: { name: equipmentTypeNameValue } } : { equipment_type_id: null },
    check_templates: {
      equipment_type_id: 'type-1',
      name: 'Plataforma hidráulica 6TN',
      check_template_sections: [
        { id: sectionId, title: 'Estado general', position: 1, check_template_items: [{ id: '22222222-2222-4222-8222-222222222222', title: 'Estado visual', component: 'Estructura', position: 1 }] },
        { id: '33333333-3333-4333-8333-333333333333', title: 'Sistema hidráulico', position: 4, check_template_items: [] },
      ],
    },
    check_section_results: [{ section_id: sectionId, result: 'Todo favorable' }],
  };
}

describe('functional check blocks', () => {
  it('resuelve muelle y abrigo sin caer en seccional', () => {
    expect(visualTemplateForEquipment(check('Muelle de carga').equipment)?.key).toBe('muelle-de-carga');
    expect(visualTemplateForEquipment(check('Abrigo de muelle').equipment)?.key).toBe('abrigo-de-muelle');
  });

  it('no usa fallback seccional cuando falta tipo', () => {
    expect(equipmentTypeName(check(null).equipment)).toBeNull();
    expect(visualTemplateForEquipment(check(null).equipment)).toBeNull();
  });

  it('construye bloques solo desde check_template_sections reales', () => {
    const blocks = buildFunctionalCheckBlocks(check('Muelle de carga'));
    expect(blocks.map((block) => block.name)).toEqual(['Estado general', 'Sistema hidráulico']);
    expect(blocks.every((block) => isUuid(block.sectionId))).toBe(true);
    expect(blocks[0].result?.result).toBe('Todo favorable');
  });

  it('detecta desalineacion entre plantilla y tipo', () => {
    expect(templateTypeMismatch({ equipment: { equipment_type_id: 'a' }, check_templates: { equipment_type_id: 'b' } })).toBe(true);
  });

  it('conserva datos remotos completos al reabrir un bloque desde otro dispositivo', () => {
    expect(remoteBlockState({ observations: 'Observación', intervention: 'Intervención realizada', severity: 'Alta', components: ['Bomba', 'Cilindro'] })).toEqual({ observations: 'Observación', intervention: 'Intervención realizada', severity: 'Alta', components: ['Bomba', 'Cilindro'] });
  });
});
