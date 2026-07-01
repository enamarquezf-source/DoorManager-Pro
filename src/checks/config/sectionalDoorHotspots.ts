import type { CSSProperties } from 'react';

export type CheckBlockId = 'muelles' | 'hoja' | 'guias' | 'automatizacion' | 'peatonal' | 'funcionamiento';

export type CheckZone = {
  id: CheckBlockId;
  name: string;
  components: string[];
  area?: CSSProperties;
  zIndex?: number;
  requiresPedestrianDoor?: boolean;
};

export const sectionalZones: CheckZone[] = [
  { id: 'muelles', name: 'Línea de muelles', components: ['Muelles', 'Eje', 'Tambores', 'Cables', 'Soportes', 'Cojinetes', 'Seguridad de rotura o paracaídas de cable'], area: { left: '33%', top: '15%', width: '35%', height: '10%' }, zIndex: 50 },
  { id: 'hoja', name: 'Hoja', components: ['Paneles', 'Herrajes', 'Bisagras', 'Rodillos', 'Juntas', 'Perfil inferior', 'Sistema anticaída'], area: { left: '34%', top: '33%', width: '28%', height: '33%' }, zIndex: 30 },
  { id: 'guias', name: 'Guías', components: ['Guía izquierda', 'Guía derecha', 'Anclajes', 'Curvas', 'Rodillos'], area: { left: '24%', top: '31%', width: '7%', height: '40%' }, zIndex: 40 },
  { id: 'automatizacion', name: 'Sistema eléctrico y seguridad', components: ['Motor directo al eje', 'Desbloqueo manual', 'Cuadro de maniobra', 'Cableado', 'Finales de carrera o encoder', 'Fotocélulas', 'Banda de seguridad', 'Activación', 'Señalización'], area: { left: '73%', top: '32%', width: '13%', height: '27%' }, zIndex: 35 },
  { id: 'peatonal', name: 'Puerta peatonal insertada', components: ['Hoja peatonal', 'Bisagras', 'Cerradura', 'Contacto de seguridad', 'Juntas'], area: { left: '45%', top: '43%', width: '11%', height: '23%' }, zIndex: 45, requiresPedestrianDoor: true },
  { id: 'funcionamiento', name: 'Funcionamiento general', components: ['Apertura y cierre', 'Equilibrado', 'Suavidad de marcha', 'Ruidos o rozamientos', 'Maniobra manual'] },
];

export function visibleSectionalZones(equipment?: any) {
  const hasPedestrianDoor = Boolean(equipment?.has_pedestrian_door ?? equipment?.pedestrian_door ?? equipment?.metadata?.has_pedestrian_door);
  return sectionalZones.filter((zone) => !zone.requiresPedestrianDoor || hasPedestrianDoor);
}

export function physicalSectionalZones(equipment?: any) {
  return visibleSectionalZones(equipment).filter((zone) => Boolean(zone.area));
}

export const checkProblemStatuses = ['Sin revisar', 'Problema leve', 'No favorable', 'Favorable tras intervención', 'No aplicable'];
