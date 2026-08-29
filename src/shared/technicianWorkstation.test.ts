import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { technicianConceptLines, technicianProgress } from './technicianWorkstation';

const app = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');
const screen = app.slice(app.indexOf('function TechnicianWorkPage()'), app.indexOf('function TechnicianConceptSelection'));

describe('technician workstation', () => {
  it('summarizes technical progress without economic fields', () => {
    const progress = technicianProgress({ work_performed: 'Ajustada', materials: [{}], time_entries: [{}], planned_quote_lines: [{ line_type: 'travel' }], checks: [{ status: 'Realizado' }, { status: 'En curso' }], photos: [{ id: '1' }], signatures: [] });
    expect(progress).toEqual({ work: 'complete', materials: 'complete', hours: 'complete', travel: 'complete', checks: { done: 1, total: 2 }, photos: 1, signature: 'pending' });
  });

  it('excludes commercial fee and discount lines from technical selection', () => {
    expect(technicianConceptLines({ planned_quote_lines: [{ id: 'm', line_type: 'material' }, { id: 'f', line_type: 'fee' }, { id: 'd', line_type: 'discount' }] }).map((line: any) => line.id)).toEqual(['m']);
  });

  it('exposes the single technical work surface and keeps administrative routing out', () => {
    expect(screen).toContain('CABECERA DEL PARTE');
    expect(screen).toContain('Trabajo realizado');
    expect(screen).toContain('CHECKS DEL PARTE');
    expect(screen).toContain('FINALIZAR TRABAJO EN CAMPO');
    expect(screen).not.toContain('Enviar a Comercial');
    expect(screen).not.toContain('Enviar a Facturación');
  });
});
