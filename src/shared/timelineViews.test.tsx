import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ActivityTimeline, Timeline } from './timelineViews';
import { activityTimeline } from './workOrderPresentation';

describe('timeline views', () => {
  it('renderiza actividad estructurada sin pintar objetos React inválidos', () => {
    const html = renderToString(<ActivityTimeline events={[{ type: 'Nota', date: '2026-08-03T10:00:00Z', author: 'Ana SAT', title: 'Intervención', text: 'Trabajo realizado' }]} formatDate={(value) => value.slice(0, 10)} />);

    expect(html).toContain('Nota');
    expect(html).toContain('Intervención');
    expect(html).toContain('2026-08-03');
    expect(html).toContain('Ana SAT');
    expect(html).toContain('Trabajo realizado');
  });

  it('mantiene seguro el timeline legacy aunque reciba objetos', () => {
    const html = renderToString(<Timeline items={['Texto', { type: 'Nota', title: 'Objeto' }, null]} />);

    expect(html).toContain('Texto');
    expect(html).toContain('Evento no textual');
    expect(html).toContain('-');
  });

  it('renderiza ActivityEvent reales de partes sin pasarlos al Timeline legacy', () => {
    const events = activityTimeline({
      status_history: [{ changed_at: '2026-08-10T08:00:00Z', previous_status: 'Pendiente', new_status: 'En intervencion', reason: 'Inicio', profiles: { first_name: 'Ana', last_name: 'SAT' } }],
      notes: [{ created_at: '2026-08-10T09:00:00Z', note: 'Observación técnica', profiles: { first_name: 'Teo', last_name: 'Tec' } }],
      materials: [{ created_at: '2026-08-10T10:00:00Z', used_quantity: 2, unit: 'ud', description: 'Bisagra', profiles: { first_name: 'Teo', last_name: 'Tec' } }],
      time_entries: [{ created_at: '2026-08-10T11:00:00Z', duration_minutes: 90, hour_type: 'normal', description: 'Ajuste', profiles: { first_name: 'Teo', last_name: 'Tec' } }],
      photos: [{ created_at: '2026-08-10T12:00:00Z', name: 'foto.jpg', description: 'Antes', profiles: { first_name: 'Teo', last_name: 'Tec' } }],
      signatures: [{ signed_at: '2026-08-10T13:00:00Z', signer_name: 'Cliente', signer_role: 'Encargado' }],
      checks: [{ created_at: '2026-08-10T14:00:00Z', code: 'CHK-1', global_result: 'Todo favorable' }],
      deficiencies: [{ created_at: '2026-08-10T15:00:00Z', code: 'DEF-1', description: 'Holgura' }],
    });

    const html = renderToString(<ActivityTimeline events={events} formatDate={(value) => value.slice(0, 10)} />);

    for (const label of ['Estado', 'Nota', 'Material', 'Hora', 'Foto', 'Firma', 'Check', 'Deficiencia']) expect(html).toContain(label);
    expect(html).toContain('2026-08-10');
    expect(html).toContain('Teo Tec');
    expect(html).toContain('Holgura');
    expect(renderToString(<Timeline items={events} />)).toContain('Evento no textual');
    expect(html).not.toContain('Evento no textual');
  });
});
