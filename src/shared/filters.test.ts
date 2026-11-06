import { describe, expect, it } from 'vitest';
import { checkTabFromParams, deficiencyFiltersFromParams, filterChecks, isOpenDeficiencyStatus, workOrderFilterFromParams } from './filters';

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

  it('maps check status params to the checks tabs', () => {
    expect(checkTabFromParams(new URLSearchParams('estado=por-realizar'))).toBe('pending');
    expect(checkTabFromParams(new URLSearchParams('estado=realizado'))).toBe('done');
    expect(checkTabFromParams(new URLSearchParams())).toBe('pending');
    expect(checkTabFromParams(new URLSearchParams('estado=desconocido'))).toBe('pending');
  });
});

it('finds checks by model, client and site, including checks without an assigned work order', () => {
  const checks = [
    { code: 'CHK-1', client_name: 'Logística Norte', site_name: 'Almacén central', equipment: { model: 'PARK 80' } },
    { code: 'CHK-2', equipment: { model: 'PARK 80', clients: { legal_name: 'Taller Sur' }, sites: { name: 'Centro Aragón' } } },
  ];
  expect(filterChecks(checks, 'park 80')).toEqual(checks);
  expect(filterChecks(checks, 'logistica almacen')).toEqual([checks[0]]);
  expect(filterChecks(checks, 'park sur aragon')).toEqual([checks[1]]);
  expect(filterChecks(checks, 'aragon norte')).toEqual([]);
  expect(filterChecks(checks, ' ')).toBe(checks);
});
