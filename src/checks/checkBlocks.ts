import { templateForEquipment, visibleTemplateZones, visualZoneMatchesSection, type CheckZone } from './sectionalZones';

export type FunctionalCheckBlock = {
  id: string;
  sectionId: string;
  slug: string;
  name: string;
  items: any[];
  visual?: CheckZone;
  result?: any;
};

export function slug(value?: string | null) {
  return (value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export function equipmentTypeName(equipment?: any) {
  return equipment?.equipment_types?.name ?? equipment?.type_name ?? equipment?.type ?? null;
}

export function visualTemplateForEquipment(equipment?: any) {
  return templateForEquipment(equipment);
}

export function buildFunctionalCheckBlocks(check: any): FunctionalCheckBlock[] {
  const sections = [...(check?.check_templates?.check_template_sections ?? [])].sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
  const visual = visibleTemplateZones(check?.equipment);
  const results = check?.check_section_results ?? [];
  return sections.map((section) => {
    const sectionSlug = slug(section.slug ?? section.key ?? section.title);
    const zone = visual.find((item) => visualZoneMatchesSection(item, section));
    return {
      id: sectionSlug || section.id,
      sectionId: section.id,
      slug: sectionSlug,
      name: section.title,
      items: [...(section.check_template_items ?? [])].sort((a, b) => (a.position ?? 0) - (b.position ?? 0)),
      visual: zone,
      result: results.find((item: any) => item.section_id === section.id),
    };
  });
}

export function isUuid(value?: string | null) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value ?? '');
}

export function templateTypeMismatch(check: any) {
  const equipmentTypeId = check?.equipment?.equipment_type_id;
  const templateTypeId = check?.check_templates?.equipment_type_id;
  return Boolean(equipmentTypeId && templateTypeId && equipmentTypeId !== templateTypeId);
}

export function remoteBlockState(result?: any) {
  return {
    observations: result?.observations ?? '',
    intervention: result?.intervention ?? '',
    severity: result?.severity ?? 'Leve',
    components: Array.isArray(result?.components) ? result.components : [],
  };
}
