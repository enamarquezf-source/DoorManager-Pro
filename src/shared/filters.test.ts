import { describe, expect, it } from 'vitest';
import { deficiencyFiltersFromParams, isOpenDeficiencyStatus, workOrderFilterFromParams } from './filters';

describe('URL filter mapping', () => {
  it('maps management KPI params to work order filters', () => {
    expect(workOrderFilterFromParams(new URLSearchParams('estado=realizado'))).toBe('finalizados');
    expect(workOrderFilterFromParams(new URLSearchParams('estado=pendiente'))).toBe('pendientes');
    expect(workOrderFilterFromParams(new URLSearchParams('estado=en-curso'))).toBe('en-curso');
    expect(workOrderFilterFromParams(new URLSearchParams('prioridad=crítica'))).toBe('urgentes');
    expect(workOrderFilterFromParams(new URLSearchParams('filtro=sin-asignar'))).toBe('sin-asignar');
    expect(workOrderFilterFromParams(new URLSearchParams('fecha=hoy'))).toBe('hoy');
    expect(workOrderFilterFromParams(new URLSearchParams('estado=desconocido'))).toBe('todos');
  });

  it('maps deficiency params and open statuses safely', () => {
    expect(deficiencyFiltersFromParams(new URLSearchParams('estado=abierta')).state).toBe('abierta');
    expect(deficiencyFiltersFromParams(new URLSearchParams('gravedad=Alta')).severity).toBe('alta');
    expect(deficiencyFiltersFromParams(new URLSearchParams('filtro=desviaciones')).state).toBe('abierta');
    expect(isOpenDeficiencyStatus('Detectada')).toBe(true);
    expect(isOpenDeficiencyStatus('En valoracion')).toBe(true);
    expect(isOpenDeficiencyStatus('Cerrada')).toBe(false);
  });
});
