import { describe, expect, it } from 'vitest';
import { alertFilterFromUrl, clientStatusFromUrl, documentAreaFromUrl } from './urlContracts';
import { workOrderFilterFromUrl } from './urlContracts';

describe('URL filter contracts', () => {
  it.each([
    ['filtro=material', 'material'],
    ['filtro=no-terminados', 'no-terminados'],
    ['filtro=revision-sat', 'revision-sat'],
    ['filtro=revision-comercial', 'revision-comercial'],
    ['estado=realizado', 'finalizados'],
    ['fecha=hoy', 'hoy'],
  ])('parses work-order URL %s', (query, expected) => {
    expect(workOrderFilterFromUrl(new URLSearchParams(query))).toBe(expected);
  });

  it('maps dashboard filters to their target contracts', () => {
    expect(alertFilterFromUrl(new URLSearchParams('prioridad=critica'))).toBe('criticos');
    expect(alertFilterFromUrl(new URLSearchParams('tipo=administrativo'))).toBe('administrativos');
    expect(documentAreaFromUrl(new URLSearchParams('area=compras'))).toBe('compras');
    expect(clientStatusFromUrl(new URLSearchParams('estado=activo'))).toBe('Activo');
  });
});
