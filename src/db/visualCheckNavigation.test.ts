import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const app = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');
const v2 = app.slice(app.indexOf('function CheckBlockPageV2('), app.indexOf('function DeficienciesPage('));

describe('visual check navigation safety', () => {
  it('CheckBlockPageV2 never falls back to the first section', () => {
    const source = v2;
    expect(source).not.toContain('zones[0]');
    expect(source).toContain('Bloque no encontrado');
    expect(source).toContain('No se guardará sobre otra sección.');
    expect(source).toContain('Volver al parte');
  });

  it('keeps the clean equipment image and lower section cards on the same block routes', () => {
    const detail = app.slice(app.indexOf('function CheckDetailPage('), app.indexOf('function CheckBlockPageV2('));
    expect(detail).toContain('door-check');
    expect(detail).toContain('template?.image');
    expect(detail).toContain('className="block-list status-summary"');
    expect(detail).toContain('to={blockHref(zone.id)}');
    expect(detail).not.toContain('physicalZones.map');
    expect(detail).not.toContain('className={`hotspot');
  });

  it('CheckBlockPageV2 resolves only the requested persisted section id', () => {
    const source = v2;
    expect(source).toContain('zones.find((item) => item.sectionId === blockId)');
    expect(source).not.toContain('item.id === blockId ||');
  });
});
