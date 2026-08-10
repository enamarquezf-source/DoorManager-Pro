import { describe, expect, it } from 'vitest';
import { activityTimeline, interventionSummary, maskDocument } from './workOrderPresentation';

describe('work order presentation adapters', () => {
  it('extrae diagnostico, trabajo y observaciones desde la nota tecnica sincronizada', () => {
    const summary = interventionSummary({ notes: [{ note: 'Diagnóstico: No llega tensión\nTrabajo realizado: Comprabar cables y fusibles\nObservaciones: Se sustituye fusible', created_at: '2026-08-03T10:00:00Z' }] });
    expect(summary.diagnosis).toBe('No llega tensión');
    expect(summary.work).toBe('Comprabar cables y fusibles');
    expect(summary.observations).toBe('Se sustituye fusible');
  });

  it('usa la ultima observacion tecnica guardada en notas del parte', () => {
    const summary = interventionSummary({ work_order_notes: [
      { note: 'Observaciones: Primera revision', created_at: '2026-08-03T10:00:00Z' },
      { note: 'Observaciones: Correccion final', created_at: '2026-08-03T11:00:00Z' },
    ] });

    expect(summary.observations).toBe('Correccion final');
  });

  it('prioriza los campos actuales corregidos sobre la nota tecnica historica', () => {
    const summary = interventionSummary({
      diagnosis: 'radar mal orientado',
      work_performed: 'reajuste y prueba de seguridad',
      result: 'operativa tras prueba',
      observations: 'cliente informado',
      work_order_notes: [{ note: 'Diagnóstico: prueba\nTrabajo realizado: prueba\nObservaciones: prueba', created_at: '2026-08-03T10:00:00Z' }],
    });

    expect(summary.diagnosis).toBe('radar mal orientado');
    expect(summary.work).toBe('reajuste y prueba de seguridad');
    expect(summary.result).toBe('operativa tras prueba');
    expect(summary.observations).toBe('cliente informado');
  });

  it('mantiene la nota antigua en el historial aunque el valor actual este corregido', () => {
    const events = activityTimeline({
      diagnosis: 'radar mal orientado',
      work_order_notes: [{ note: 'Diagnóstico: prueba', created_at: '2026-08-03T10:00:00Z' }],
    });

    expect(events).toContainEqual({ type: 'Nota', date: '2026-08-03T10:00:00Z', author: null, title: 'Intervención', text: 'Diagnóstico: prueba' });
  });

  it('unifica actividad cronologica de notas, materiales, fotos, firmas y checks', () => {
    const events = activityTimeline({ notes: [{ note: 'Nota', created_at: '2026-08-03T10:00:00Z' }], photos: [{ name: 'foto.jpg', taken_at: '2026-08-03T11:00:00Z' }], signatures: [{ signer_name: 'Cliente', signed_at: '2026-08-03T12:00:00Z' }], materials: [{ description: 'Fusible', created_at: '2026-08-03T09:00:00Z' }], checks: [{ code: 'CHK', created_at: '2026-08-03T08:00:00Z' }] });
    expect(events.map((event) => event.type)).toEqual(['Firma', 'Foto', 'Nota', 'Material', 'Check']);
  });

  it('devuelve eventos estructurados y descarta filas sin fecha real', () => {
    const events = activityTimeline({
      notes: [{ note: 'Nota válida', created_at: '2026-08-03T10:00:00Z', profiles: { first_name: 'Ana', last_name: 'SAT' } }, { note: 'Sin fecha' }],
      deficiencies: [{ created_at: '2026-08-03T11:00:00Z', description: null }],
    });

    expect(events).toEqual([
      { type: 'Deficiencia', date: '2026-08-03T11:00:00Z', author: null, title: 'Deficiencia', text: null },
      { type: 'Nota', date: '2026-08-03T10:00:00Z', author: 'Ana SAT', title: 'Intervención', text: 'Nota válida' },
    ]);
  });

  it('oculta parcialmente documentos de firma', () => {
    expect(maskDocument('12345678A')).toBe('12****8A');
  });
});
