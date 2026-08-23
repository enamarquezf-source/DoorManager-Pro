import type { CSSProperties } from 'react';

export type CheckBlockId = string;

export type CheckZone = {
  id: CheckBlockId;
  name: string;
  components: string[];
  area?: CSSProperties;
  zIndex?: number;
  requiresPedestrianDoor?: boolean;
  sectionMatcher?: string | string[];
};

export type EquipmentCheckTemplate = {
  key: string;
  name: string;
  image: string;
  placeholder?: boolean;
  aliases?: string[];
  zones: CheckZone[];
};

export const sectionalZones: CheckZone[] = [
  { id: 'muelles', name: 'Línea de muelles', components: ['Muelles', 'Eje', 'Tambores', 'Cables', 'Soportes', 'Cojinetes', 'Seguridad de rotura o paracaídas de cable'], area: { left: '17%', top: '13%', width: '58%', height: '10%' }, zIndex: 50, sectionMatcher: 'linea-de-muelles' },
  { id: 'guias', name: 'Guías', components: ['Guía izquierda', 'Guía derecha', 'Anclajes', 'Curvas', 'Rodillos'], area: { left: '18%', top: '25%', width: '9%', height: '51%' }, zIndex: 40, sectionMatcher: 'guias' },
  { id: 'hoja', name: 'Hoja', components: ['Paneles', 'Herrajes', 'Bisagras', 'Rodillos', 'Juntas', 'Perfil inferior', 'Sistema anticaída'], area: { left: '30%', top: '29%', width: '34%', height: '45%' }, zIndex: 30, sectionMatcher: 'hoja' },
  { id: 'peatonal', name: 'Puerta peatonal', components: ['Hoja peatonal', 'Bisagras', 'Cerradura', 'Contacto de seguridad', 'Juntas'], area: { left: '52%', top: '52%', width: '12%', height: '22%' }, zIndex: 45, requiresPedestrianDoor: true, sectionMatcher: ['puerta-peatonal', 'puerta-peatonal-automatica'] },
  { id: 'automatizacion', name: 'Sistema eléctrico y seguridad', components: ['Motor directo al eje', 'Desbloqueo manual', 'Cuadro de maniobra', 'Cableado', 'Finales de carrera o encoder', 'Fotocélulas', 'Banda de seguridad', 'Activación', 'Señalización'], area: { left: '69%', top: '26%', width: '13%', height: '49%' }, zIndex: 35, sectionMatcher: ['sistema-electrico-y-seguridad', 'sistema-electrico-seguridad'] },
  { id: 'funcionamiento', name: 'Funcionamiento general', components: ['Apertura y cierre', 'Equilibrado', 'Suavidad de marcha', 'Ruidos o rozamientos', 'Maniobra manual'] },
];

function zone(id: string, name: string, components: string[], area?: CSSProperties, sectionMatcher?: string | string[]): CheckZone {
  return { id, name, components, area, zIndex: area ? 20 : undefined, sectionMatcher };
}

const rapidZones = [zone('lona', 'Lona', ['Lona', 'Ventanas', 'Soldaduras', 'Contrapesos'], { left: '18%', top: '24%', width: '64%', height: '55%' }), zone('guias', 'Guías', ['Guías', 'Cepillos', 'Fijaciones'], { left: '5%', top: '15%', width: '15%', height: '70%' }), zone('motor', 'Motor', ['Motor', 'Reductor', 'Desbloqueo'], { left: '76%', top: '8%', width: '18%', height: '22%' }), zone('cuadro', 'Cuadro eléctrico', ['Cuadro', 'Cableado', 'Protecciones']), zone('seguridad', 'Fotocélulas y seguridad', ['Fotocélulas', 'Banda', 'Señalización']), zone('funcionamiento', 'Funcionamiento general', ['Apertura', 'Cierre', 'Velocidad', 'Ruidos'])];
const rollUpZones = [zone('lamas', 'Lamas', ['Lamas', 'Terminal', 'Topes']), zone('eje', 'Eje y compensación', ['Eje', 'Muelles', 'Soportes']), zone('guias', 'Guías laterales', ['Guías', 'Anclajes']), zone('motor', 'Motor', ['Motor', 'Desbloqueo']), zone('seguridad', 'Cuadro eléctrico y seguridad', ['Cuadro', 'Fotocélulas', 'Banda']), zone('funcionamiento', 'Funcionamiento general', ['Maniobra', 'Ruidos', 'Equilibrado'])];
const barrierZones = [zone('armario', 'Armario', ['Armario', 'Mecanismo', 'Motor'], { left: '1%', top: '18%', width: '22%', height: '67%' }, ['armario', 'motorreductor']), zone('asta', 'Asta', ['Asta', 'Brazo', 'Goma', 'Luces'], { left: '18%', top: '25%', width: '80%', height: '24%' }, ['asta', 'mastil', 'mástil']), zone('accionamiento-seguridad', 'Medios de accionamiento y seguridad', ['Fotocélulas', 'Lazo', 'Señalización', 'Finales de carrera'], { left: '1%', top: '5%', width: '97%', height: '90%' }, ['medios-de-accionamiento-y-seguridad', 'fotocelulas-lazo-magnetico', 'seguridad']), zone('funcionamiento', 'Funcionamiento general', ['Subida', 'Bajada', 'Parada'])];
const slidingZones = [zone('hoja', 'Hoja', ['Hoja', 'Bastidor', 'Cerramiento']), zone('carril', 'Guía/carril', ['Carril', 'Limpieza', 'Topes']), zone('ruedas', 'Ruedas', ['Ruedas', 'Rodamientos']), zone('cremallera', 'Cremallera', ['Cremallera', 'Piñón']), zone('motor', 'Motor', ['Motor', 'Desbloqueo']), zone('seguridad', 'Fotocélulas y seguridad', ['Fotocélulas', 'Bandas']), zone('funcionamiento', 'Funcionamiento general', ['Apertura', 'Cierre', 'Ruidos'])];
const swingZones = [zone('hojas', 'Hojas', ['Hojas', 'Bastidor', 'Topes']), zone('bisagras', 'Bisagras', ['Bisagras', 'Anclajes']), zone('motores', 'Brazos/motores', ['Brazos', 'Motores', 'Soportes']), zone('cerradura', 'Cerradura/tope', ['Cerradura', 'Tope', 'Electrocerradura']), zone('seguridad', 'Fotocélulas y seguridad', ['Fotocélulas', 'Bandas']), zone('funcionamiento', 'Funcionamiento general', ['Apertura', 'Cierre', 'Sincronización'])];
const dockZones = [zone('plataforma', 'Plataforma', ['Plataforma', 'Chapa', 'Refuerzos'], { left: '10%', top: '15%', width: '80%', height: '45%' }), zone('labio', 'Uña/labio', ['Labio', 'Uña', 'Articulación'], { left: '22%', top: '42%', width: '56%', height: '20%' }), zone('bisagras', 'Bisagras', ['Bisagras', 'Pasadores'], { left: '8%', top: '35%', width: '20%', height: '25%' }), zone('hidraulico', 'Grupo hidráulico', ['Bomba', 'Cilindros', 'Latiguillos'], { left: '25%', top: '48%', width: '45%', height: '35%' }), zone('cuadro', 'Cuadro eléctrico', ['Cuadro', 'Pulsadores'], { left: '65%', top: '52%', width: '18%', height: '22%' }), zone('seguridad', 'Seguridad', ['Faldones', 'Señalización', 'Topes']), zone('funcionamiento', 'Funcionamiento general', ['Subida', 'Bajada', 'Reposo'])];
const shelterZones = [zone('lonas', 'Lona/cortinas', ['Lonas', 'Cortinas', 'Desgarros'], { left: '15%', top: '20%', width: '70%', height: '65%' }), zone('estructura', 'Estructura', ['Estructura', 'Perfiles'], { left: '5%', top: '8%', width: '90%', height: '84%' }), zone('brazos', 'Brazos/articulaciones', ['Brazos', 'Articulaciones'], { left: '5%', top: '35%', width: '20%', height: '45%' }), zone('fijaciones', 'Fijaciones', ['Tornillería', 'Anclajes']), zone('sellado', 'Estado de sellado', ['Sellado', 'Ajuste', 'Contacto vehículo'], { left: '15%', top: '72%', width: '70%', height: '18%' }), zone('funcionamiento', 'Funcionamiento general', ['Entrada', 'Retorno', 'Alineación'])];
const pedestrianZones = [zone('hojas', 'Hojas', ['Hojas', 'Vidrios', 'Perfiles'], { left: '30%', top: '25%', width: '40%', height: '65%' }), zone('guias', 'Guías/carro', ['Guías', 'Carros', 'Rodamientos'], { left: '28%', top: '10%', width: '45%', height: '20%' }), zone('motor', 'Motor', ['Motor', 'Correa', 'Batería'], { left: '35%', top: '5%', width: '35%', height: '18%' }), zone('sensores', 'Sensores', ['Radar', 'Presencia', 'Pulsadores'], { left: '40%', top: '8%', width: '25%', height: '18%' }), zone('seguridad', 'Seguridad', ['Anti-aplastamiento', 'Emergencia'], { left: '25%', top: '25%', width: '50%', height: '65%' }), zone('funcionamiento', 'Funcionamiento general', ['Apertura', 'Cierre', 'Velocidad'])];
const gateZones = [zone('hoja', 'Hoja', ['Hoja', 'Bastidor', 'Cerramiento'], { left: '15%', top: '25%', width: '70%', height: '55%' }), zone('guias', 'Guías/bisagras', ['Guías', 'Bisagras', 'Anclajes'], { left: '8%', top: '15%', width: '84%', height: '20%' }), zone('motor', 'Motor', ['Motor', 'Desbloqueo'], { left: '5%', top: '45%', width: '25%', height: '30%' }), zone('finales', 'Finales de carrera', ['Finales', 'Encoder'], { left: '5%', top: '15%', width: '20%', height: '20%' }), zone('seguridad', 'Seguridad', ['Fotocélulas', 'Bandas', 'Señalización'], { left: '5%', top: '35%', width: '90%', height: '45%' }), zone('funcionamiento', 'Funcionamiento general', ['Apertura', 'Cierre', 'Ruidos'])];

export const equipmentCheckTemplates: EquipmentCheckTemplate[] = [
  { key: 'puerta-seccional-industrial', name: 'Puerta seccional industrial', image: '/checks/seccional-industrial.png', zones: sectionalZones },
  { key: 'puerta-rapida', name: 'Puerta rápida', image: '/checks/puerta-rapida.png', zones: rapidZones },
  { key: 'puerta-enrollable', name: 'Puerta enrollable', image: '', placeholder: true, zones: rollUpZones },
  { key: 'barrera-automatica', name: 'Barrera automática', image: '/checks/barrera_automatica.png', aliases: ['barrera'], zones: barrierZones },
  { key: 'puerta-corredera', name: 'Puerta corredera', image: '', placeholder: true, zones: slidingZones },
  { key: 'puerta-batiente', name: 'Puerta batiente', image: '', placeholder: true, zones: swingZones },
  { key: 'muelle-de-carga', name: 'Muelle de carga', image: '/checks/plataforma-hidraulica.jpg', aliases: ['plataforma-hidraulica', 'plataforma'], zones: dockZones },
  { key: 'abrigo-de-muelle', name: 'Abrigo de muelle', image: '/checks/abrigo.png', zones: shelterZones },
  { key: 'puerta-peatonal-automatica', name: 'Puerta peatonal automática', image: '/checks/puerta-automatica-de-cristal.png', aliases: ['puerta-automatica-de-cristal'], zones: pedestrianZones },
  { key: 'cancela-o-porton', name: 'Cancela o portón', image: '/checks/cancela-corredera.png', aliases: ['cancela-corredera'], zones: gateZones },
];

export function templateForEquipment(equipment?: any) {
  const raw = normalized(`${equipment?.equipment_types?.name ?? equipment?.type_name ?? equipment?.type ?? ''}`);
  return equipmentCheckTemplates.find((item) => [item.name, ...(item.aliases ?? [])].some((value) => raw.includes(normalized(value)))) ?? null;
}

export function visibleSectionalZones(equipment?: any) {
  const hasPedestrianDoor = Boolean(equipment?.has_pedestrian_door ?? equipment?.pedestrian_door ?? equipment?.metadata?.has_pedestrian_door);
  return sectionalZones.filter((zone) => !zone.requiresPedestrianDoor || hasPedestrianDoor);
}

function normalized(value?: string | null) {
  return (value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export function isVisualZoneVisible(zone: CheckZone, equipment?: any) {
  const hasPedestrianDoor = Boolean(equipment?.has_pedestrian_door ?? equipment?.pedestrian_door ?? equipment?.metadata?.has_pedestrian_door);
  return !zone.requiresPedestrianDoor || hasPedestrianDoor;
}

export function visualZoneMatchesSection(zone: CheckZone, section: any) {
  const sectionSlug = normalized(section?.slug ?? section?.key ?? section?.title);
  const matchers = zone.sectionMatcher ? (Array.isArray(zone.sectionMatcher) ? zone.sectionMatcher : [zone.sectionMatcher]) : [zone.id, zone.name];
  return matchers.some((matcher) => {
    const matcherSlug = normalized(matcher);
    return matcherSlug === sectionSlug || sectionSlug.includes(matcherSlug) || matcherSlug.includes(sectionSlug);
  });
}

export function visibleTemplateZones(equipment?: any) {
  const template = templateForEquipment(equipment);
  if (!template) return [];
  return template.zones.filter((zone) => isVisualZoneVisible(zone, equipment));
}

export function physicalTemplateZones(equipment?: any) {
  return visibleTemplateZones(equipment).filter((zone) => Boolean(zone.area));
}

export function physicalSectionalZones(equipment?: any) {
  return visibleSectionalZones(equipment).filter((zone) => Boolean(zone.area));
}

export const checkStatuses = ['Sin revisar', 'Todo favorable', 'Problema leve', 'No favorable', 'Favorable tras intervención', 'No aplicable'];
export const checkProblemStatuses = ['Problema leve', 'No favorable', 'Favorable tras intervención'];
