import type { CSSProperties } from 'react';

export type CheckBlockId = 'hoja' | 'guias' | 'muelles' | 'automatizacion' | 'estructura' | 'funcionamiento';

export type CheckZone = {
  id: CheckBlockId;
  name: string;
  components: string[];
  area?: CSSProperties;
  zIndex?: number;
};

export const sectionalZones: CheckZone[] = [
  { id: 'hoja', name: 'Hoja', components: ['Paneles', 'Herrajes', 'Bisagras', 'Rodillos', 'Juntas', 'Perfil inferior', 'Sistema anticaída'], area: { left: '33%', top: '34%', width: '29%', height: '31%' }, zIndex: 20 },
  { id: 'guias', name: 'Guías', components: ['Guías'], area: { left: '24%', top: '30%', width: '7%', height: '40%' }, zIndex: 30 },
  { id: 'muelles', name: 'Línea de muelles y compensación', components: ['Muelles', 'Eje', 'Tambores', 'Cables', 'Soportes', 'Cojinetes', 'Seguridad de rotura o paracaídas de cable'], area: { left: '33%', top: '17%', width: '35%', height: '10%' }, zIndex: 40 },
  { id: 'automatizacion', name: 'Automatización, maniobra y seguridad', components: ['Motor directo al eje', 'Desbloqueo manual', 'Cuadro de maniobra', 'Cableado', 'Alimentación y protecciones', 'Finales de carrera o encoder', 'Fotocélulas', 'Banda de seguridad', 'Activación', 'Señalización'], area: { left: '73%', top: '32%', width: '13%', height: '27%' }, zIndex: 25 },
  { id: 'estructura', name: 'Estructura', components: ['Estructura'], area: { left: '15%', top: '27%', width: '7%', height: '45%' }, zIndex: 10 },
  { id: 'funcionamiento', name: 'Funcionamiento general', components: ['Apertura y cierre', 'Equilibrado', 'Suavidad de marcha', 'Ruidos o rozamientos', 'Maniobra manual'] },
];

export const physicalSectionalZones = sectionalZones.filter((zone) => zone.id !== 'funcionamiento');

export const checkProblemStatuses = ['Sin revisar', 'Problema leve', 'No favorable', 'Favorable tras intervención', 'No aplicable'];
