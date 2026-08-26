import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { buildFunctionalCheckBlocks, equipmentTypeName, isUuid, remoteBlockState, templateTypeMismatch, visualTemplateForEquipment } from './checkBlocks';
import { equipmentCheckTemplates } from './config/sectionalDoorHotspots';

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
    expect(blocks.map((block) => block.id)).toEqual([sectionId, '33333333-3333-4333-8333-333333333333']);
    expect(blocks.every((block) => isUuid(block.sectionId))).toBe(true);
    expect(blocks[0].result?.result).toBe('Todo favorable');
  });

  it('detecta desalineacion entre plantilla y tipo', () => {
    expect(templateTypeMismatch({ equipment: { equipment_type_id: 'a' }, check_templates: { equipment_type_id: 'b' } })).toBe(true);
  });

  it('conserva datos remotos completos al reabrir un bloque desde otro dispositivo', () => {
    expect(remoteBlockState({ observations: 'Observación', intervention: 'Intervención realizada', severity: 'Alta', components: ['Bomba', 'Cilindro'] })).toEqual({ observations: 'Observación', intervention: 'Intervención realizada', severity: 'Alta', components: ['Bomba', 'Cilindro'] });
  });

  it('resuelve aliases de tipos a sus imagenes reales', () => {
    expect(visualTemplateForEquipment(check('Plataforma hidráulica 6TN').equipment)?.image).toBe('/checks/plataforma-hidraulica.jpg');
    expect(visualTemplateForEquipment(check('Puerta automática de cristal').equipment)?.image).toBe('/checks/puerta-automatica-de-cristal.png');
    expect(visualTemplateForEquipment(check('Barrera').equipment)?.image).toBe('/checks/barrera_automatica.png');
    expect(visualTemplateForEquipment(check('Cancela corredera').equipment)?.key).toBe('cancela-o-porton');
  });

  it('mantiene placeholder y tarjetas cuando el tipo no tiene imagen', () => {
    expect(visualTemplateForEquipment(check('Puerta enrollable').equipment)).toMatchObject({ image: '', placeholder: true });
    const sections = [{ id: sectionId, title: 'Lamas', position: 1, check_template_items: [] }];
    const blocks = buildFunctionalCheckBlocks({ equipment: { equipment_types: { name: 'Puerta enrollable' } }, check_templates: { check_template_sections: sections }, check_section_results: [] });
    expect(blocks[0]).toMatchObject({ sectionId, name: 'Lamas' });
    expect(blocks[0].visual?.area).toBeUndefined();
  });

  it('mantiene los archivos visuales configurados presentes en public', () => {
    for (const template of equipmentCheckTemplates.filter((item) => item.image)) {
      expect(existsSync(new URL(`../../public${template.image}`, import.meta.url))).toBe(true);
    }
  });

  it('mapea hotspots seccionales por aliases de seccion real', () => {
    const sections = ['Linea de muelles', 'Guias', 'Hoja', 'Puerta peatonal', 'Sistema electrico y seguridad', 'Funcionamiento general'].map((title, index) => ({ id: `${index + 1}1111111-1111-4111-8111-111111111111`, title, position: index, check_template_items: [] }));
    const blocks = buildFunctionalCheckBlocks({ equipment: { equipment_types: { name: 'Puerta seccional industrial' }, has_pedestrian_door: true }, check_templates: { check_template_sections: sections }, check_section_results: [] });
    expect(blocks.filter((block) => block.visual?.area).map((block) => block.visual?.id)).toEqual(['muelles', 'guias', 'hoja', 'peatonal', 'automatizacion']);
    expect(blocks.filter((block) => block.visual?.area).map((block) => block.sectionId)).toEqual(sections.slice(0, 5).map((section) => section.id));
    expect(blocks.find((block) => block.name === 'Funcionamiento general')?.visual?.area).toBeUndefined();
    expect(blocks.filter((block) => block.visual?.area).every((block) => block.visual?.sectionMatcher)).toBe(true);
  });

  it('mantiene el hotspot de puerta peatonal condicionado al equipo', () => {
    const sections = [{ id: sectionId, title: 'Puerta peatonal', position: 1, check_template_items: [] }];
    const withoutDoor = buildFunctionalCheckBlocks({ equipment: { equipment_types: { name: 'Puerta seccional industrial' } }, check_templates: { check_template_sections: sections }, check_section_results: [] });
    const withDoor = buildFunctionalCheckBlocks({ equipment: { equipment_types: { name: 'Puerta seccional industrial' }, has_pedestrian_door: true }, check_templates: { check_template_sections: sections }, check_section_results: [] });
    expect(withoutDoor[0].visual).toBeUndefined();
    expect(withDoor[0].visual?.id).toBe('peatonal');
  });

  it('mapea las tres zonas reales de barrera sin fijar UUIDs', () => {
    const sections = ['Armario', 'Asta', 'Medios de accionamiento y seguridad'].map((title, index) => ({ id: `${index + 4}1111111-1111-4111-8111-111111111111`, title, position: index, check_template_items: [] }));
    const blocks = buildFunctionalCheckBlocks({ equipment: { equipment_types: { name: 'Barrera' } }, check_templates: { check_template_sections: sections }, check_section_results: [] });
    expect(blocks.map((block) => block.visual?.id)).toEqual(['armario', 'asta', 'accionamiento-seguridad']);
    expect(blocks.map((block) => block.sectionId)).toEqual(sections.map((section) => section.id));
    expect(blocks.every((block) => block.visual?.sectionMatcher)).toBe(true);
  });
});
