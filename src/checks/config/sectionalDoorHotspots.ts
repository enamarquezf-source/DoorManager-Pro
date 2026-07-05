import type { CSSProperties } from 'react';

export type CheckBlockId = 'muelles' | 'guias' | 'hoja' | 'peatonal' | 'automatizacion' | 'funcionamiento';

export type CheckZone = {
  id: CheckBlockId;
  name: string;
  components: string[];
  area?: CSSProperties;
  zIndex?: number;
  requiresPedestrianDoor?: boolean;
};

export type EquipmentCheckTemplate = {
  key: string;
  name: string;
  image: string;
  placeholder?: boolean;
  zones: CheckZone[];
};

export const sectionalZones: CheckZone[] = [
  { id: 'muelles', name: 'Línea de muelles', components: ['Muelles', 'Eje', 'Tambores', 'Cables', 'Soportes', 'Cojinetes', 'Seguridad de rotura o paracaídas de cable'], area: { left: '17%', top: '13%', width: '58%', height: '10%' }, zIndex: 50 },
  { id: 'guias', name: 'Guías', components: ['Guía izquierda', 'Guía derecha', 'Anclajes', 'Curvas', 'Rodillos'], area: { left: '18%', top: '25%', width: '9%', height: '51%' }, zIndex: 40 },
  { id: 'hoja', name: 'Hoja', components: ['Paneles', 'Herrajes', 'Bisagras', 'Rodillos', 'Juntas', 'Perfil inferior', 'Sistema anticaída'], area: { left: '30%', top: '29%', width: '34%', height: '45%' }, zIndex: 30 },
  { id: 'peatonal', name: 'Puerta peatonal', components: ['Hoja peatonal', 'Bisagras', 'Cerradura', 'Contacto de seguridad', 'Juntas'], area: { left: '52%', top: '52%', width: '12%', height: '22%' }, zIndex: 45, requiresPedestrianDoor: true },
  { id: 'automatizacion', name: 'Sistema eléctrico y seguridad', components: ['Motor directo al eje', 'Desbloqueo manual', 'Cuadro de maniobra', 'Cableado', 'Finales de carrera o encoder', 'Fotocélulas', 'Banda de seguridad', 'Activación', 'Señalización'], area: { left: '69%', top: '26%', width: '13%', height: '49%' }, zIndex: 35 },
  { id: 'funcionamiento', name: 'Funcionamiento general', components: ['Apertura y cierre', 'Equilibrado', 'Suavidad de marcha', 'Ruidos o rozamientos', 'Maniobra manual'] },
];

const placeholderZones: CheckZone[] = [
  { id: 'hoja', name: 'Estructura principal', components: ['Estructura', 'Fijaciones', 'Elementos móviles', 'Juntas', 'Seguridad'], area: { left: '18%', top: '24%', width: '64%', height: '42%' }, zIndex: 20 },
  { id: 'automatizacion', name: 'Automatización y seguridad', components: ['Motor', 'Cuadro', 'Cableado', 'Fotocélulas', 'Activación'], area: { left: '18%', top: '70%', width: '64%', height: '16%' }, zIndex: 30 },
];

export const equipmentCheckTemplates: EquipmentCheckTemplate[] = [
  { key: 'puerta-seccional-industrial', name: 'Puerta seccional industrial', image: '/checks/seccional-industrial.png', zones: sectionalZones },
  { key: 'puerta-rapida', name: 'Puerta rápida', image: '', placeholder: true, zones: placeholderZones },
  { key: 'puerta-enrollable', name: 'Puerta enrollable', image: '', placeholder: true, zones: placeholderZones },
  { key: 'barrera-automatica', name: 'Barrera automática', image: '', placeholder: true, zones: placeholderZones },
  { key: 'puerta-corredera', name: 'Puerta corredera', image: '', placeholder: true, zones: placeholderZones },
  { key: 'puerta-batiente', name: 'Puerta batiente', image: '', placeholder: true, zones: placeholderZones },
  { key: 'muelle-de-carga', name: 'Muelle de carga', image: '', placeholder: true, zones: placeholderZones },
  { key: 'abrigo-de-muelle', name: 'Abrigo de muelle', image: '', placeholder: true, zones: placeholderZones },
  { key: 'puerta-peatonal-automatica', name: 'Puerta peatonal automática', image: '', placeholder: true, zones: placeholderZones },
  { key: 'cancela-o-porton', name: 'Cancela o portón', image: '', placeholder: true, zones: placeholderZones },
];

export function templateForEquipment(equipment?: any) {
  const raw = `${equipment?.equipment_types?.name ?? equipment?.type_name ?? equipment?.type ?? ''}`.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  return equipmentCheckTemplates.find((item) => raw.includes(item.name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase())) ?? equipmentCheckTemplates[0];
}

export function visibleSectionalZones(equipment?: any) {
  const hasPedestrianDoor = Boolean(equipment?.has_pedestrian_door ?? equipment?.pedestrian_door ?? equipment?.metadata?.has_pedestrian_door);
  return sectionalZones.filter((zone) => !zone.requiresPedestrianDoor || hasPedestrianDoor);
}

export function visibleTemplateZones(equipment?: any) {
  const template = templateForEquipment(equipment);
  const hasPedestrianDoor = Boolean(equipment?.has_pedestrian_door ?? equipment?.pedestrian_door ?? equipment?.metadata?.has_pedestrian_door);
  return template.zones.filter((zone) => !zone.requiresPedestrianDoor || hasPedestrianDoor);
}

export function physicalTemplateZones(equipment?: any) {
  return visibleTemplateZones(equipment).filter((zone) => Boolean(zone.area));
}

export function physicalSectionalZones(equipment?: any) {
  return visibleSectionalZones(equipment).filter((zone) => Boolean(zone.area));
}

export const checkStatuses = ['Sin revisar', 'Todo favorable', 'Problema leve', 'No favorable', 'Favorable tras intervención', 'No aplicable'];
export const checkProblemStatuses = ['Problema leve', 'No favorable', 'Favorable tras intervención'];
