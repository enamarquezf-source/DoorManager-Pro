import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ActivityTimeline, Timeline } from './timelineViews';

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
});
