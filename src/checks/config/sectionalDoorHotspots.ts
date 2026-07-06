import type { CSSProperties } from 'react';

export type CheckBlockId = string;

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

function zone(id: string, name: string, components: string[], area?: CSSProperties): CheckZone {
  return { id, name, components, area, zIndex: area ? 20 : undefined };
}

const rapidZones = [zone('lona', 'Lona', ['Lona', 'Ventanas', 'Soldaduras', 'Contrapesos']), zone('guias', 'Guías', ['Guías', 'Cepillos', 'Fijaciones']), zone('motor', 'Motor', ['Motor', 'Reductor', 'Desbloqueo']), zone('cuadro', 'Cuadro eléctrico', ['Cuadro', 'Cableado', 'Protecciones']), zone('seguridad', 'Fotocélulas y seguridad', ['Fotocélulas', 'Banda', 'Señalización']), zone('funcionamiento', 'Funcionamiento general', ['Apertura', 'Cierre', 'Velocidad', 'Ruidos'])];
const rollUpZones = [zone('lamas', 'Lamas', ['Lamas', 'Terminal', 'Topes']), zone('eje', 'Eje y compensación', ['Eje', 'Muelles', 'Soportes']), zone('guias', 'Guías laterales', ['Guías', 'Anclajes']), zone('motor', 'Motor', ['Motor', 'Desbloqueo']), zone('seguridad', 'Cuadro eléctrico y seguridad', ['Cuadro', 'Fotocélulas', 'Banda']), zone('funcionamiento', 'Funcionamiento general', ['Maniobra', 'Ruidos', 'Equilibrado'])];
const barrierZones = [zone('mastil', 'Mástil', ['Mástil', 'Goma', 'Luces']), zone('motorreductor', 'Motorreductor', ['Motor', 'Reductor', 'Soporte']), zone('equilibrado', 'Muelle/equilibrado', ['Muelle', 'Tensión', 'Compensación']), zone('finales', 'Finales de carrera', ['Finales', 'Encoder']), zone('seguridad', 'Fotocélulas/lazo magnético', ['Fotocélulas', 'Lazo', 'Señalización']), zone('funcionamiento', 'Funcionamiento general', ['Subida', 'Bajada', 'Parada'])];
const slidingZones = [zone('hoja', 'Hoja', ['Hoja', 'Bastidor', 'Cerramiento']), zone('carril', 'Guía/carril', ['Carril', 'Limpieza', 'Topes']), zone('ruedas', 'Ruedas', ['Ruedas', 'Rodamientos']), zone('cremallera', 'Cremallera', ['Cremallera', 'Piñón']), zone('motor', 'Motor', ['Motor', 'Desbloqueo']), zone('seguridad', 'Fotocélulas y seguridad', ['Fotocélulas', 'Bandas']), zone('funcionamiento', 'Funcionamiento general', ['Apertura', 'Cierre', 'Ruidos'])];
const swingZones = [zone('hojas', 'Hojas', ['Hojas', 'Bastidor', 'Topes']), zone('bisagras', 'Bisagras', ['Bisagras', 'Anclajes']), zone('motores', 'Brazos/motores', ['Brazos', 'Motores', 'Soportes']), zone('cerradura', 'Cerradura/tope', ['Cerradura', 'Tope', 'Electrocerradura']), zone('seguridad', 'Fotocélulas y seguridad', ['Fotocélulas', 'Bandas']), zone('funcionamiento', 'Funcionamiento general', ['Apertura', 'Cierre', 'Sincronización'])];
const dockZones = [zone('plataforma', 'Plataforma', ['Plataforma', 'Chapa', 'Refuerzos']), zone('labio', 'Uña/labio', ['Labio', 'Uña', 'Articulación']), zone('bisagras', 'Bisagras', ['Bisagras', 'Pasadores']), zone('hidraulico', 'Grupo hidráulico', ['Bomba', 'Cilindros', 'Latiguillos']), zone('cuadro', 'Cuadro eléctrico', ['Cuadro', 'Pulsadores']), zone('seguridad', 'Seguridad', ['Faldones', 'Señalización', 'Topes']), zone('funcionamiento', 'Funcionamiento general', ['Subida', 'Bajada', 'Reposo'])];
const shelterZones = [zone('lonas', 'Lona/cortinas', ['Lonas', 'Cortinas', 'Desgarros']), zone('estructura', 'Estructura', ['Estructura', 'Perfiles']), zone('brazos', 'Brazos/articulaciones', ['Brazos', 'Articulaciones']), zone('fijaciones', 'Fijaciones', ['Tornillería', 'Anclajes']), zone('sellado', 'Estado de sellado', ['Sellado', 'Ajuste', 'Contacto vehículo']), zone('funcionamiento', 'Funcionamiento general', ['Entrada', 'Retorno', 'Alineación'])];
const pedestrianZones = [zone('hojas', 'Hojas', ['Hojas', 'Vidrios', 'Perfiles']), zone('guias', 'Guías/carro', ['Guías', 'Carros', 'Rodamientos']), zone('motor', 'Motor', ['Motor', 'Correa', 'Batería']), zone('sensores', 'Sensores', ['Radar', 'Presencia', 'Pulsadores']), zone('seguridad', 'Seguridad', ['Anti-aplastamiento', 'Emergencia']), zone('funcionamiento', 'Funcionamiento general', ['Apertura', 'Cierre', 'Velocidad'])];
const gateZones = [zone('hoja', 'Hoja', ['Hoja', 'Bastidor', 'Cerramiento']), zone('guias', 'Guías/bisagras', ['Guías', 'Bisagras', 'Anclajes']), zone('motor', 'Motor', ['Motor', 'Desbloqueo']), zone('finales', 'Finales de carrera', ['Finales', 'Encoder']), zone('seguridad', 'Seguridad', ['Fotocélulas', 'Bandas', 'Señalización']), zone('funcionamiento', 'Funcionamiento general', ['Apertura', 'Cierre', 'Ruidos'])];

export const equipmentCheckTemplates: EquipmentCheckTemplate[] = [
  { key: 'puerta-seccional-industrial', name: 'Puerta seccional industrial', image: '/checks/seccional-industrial.png', zones: sectionalZones },
  { key: 'puerta-rapida', name: 'Puerta rápida', image: '', placeholder: true, zones: rapidZones },
  { key: 'puerta-enrollable', name: 'Puerta enrollable', image: '', placeholder: true, zones: rollUpZones },
  { key: 'barrera-automatica', name: 'Barrera automática', image: '', placeholder: true, zones: barrierZones },
  { key: 'puerta-corredera', name: 'Puerta corredera', image: '', placeholder: true, zones: slidingZones },
  { key: 'puerta-batiente', name: 'Puerta batiente', image: '', placeholder: true, zones: swingZones },
  { key: 'muelle-de-carga', name: 'Muelle de carga', image: '', placeholder: true, zones: dockZones },
  { key: 'abrigo-de-muelle', name: 'Abrigo de muelle', image: '', placeholder: true, zones: shelterZones },
  { key: 'puerta-peatonal-automatica', name: 'Puerta peatonal automática', image: '', placeholder: true, zones: pedestrianZones },
  { key: 'cancela-o-porton', name: 'Cancela o portón', image: '', placeholder: true, zones: gateZones },
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
