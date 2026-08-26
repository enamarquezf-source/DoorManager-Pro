import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const app = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');
const v2 = app.slice(app.indexOf('function CheckBlockPageV2('), app.indexOf('function DeficienciesPage('));

describe('check block navigation', () => {
  it.each([
    ['CheckBlockPageV2', v2],
  ])('%s exposes an explicit check return route', (_name, source) => {
    expect(source).toContain('<ChevronLeft size={16} /> Volver');
    expect(source).toContain('`/app/checks/${id}`');
    expect(source).toContain('`/app/superadmin/checks/${id}`');
  });

  it.each([
    ['CheckBlockPageV2', v2],
  ])('%s links to the associated work order only when available', (_name, source) => {
    expect(source).toContain('data.work_order_id &&');
    expect(source).toContain('Volver al parte');
    expect(source).toContain('`/app/partes/${data.work_order_id}`');
  });

  it('does not use history navigation in either block screen', () => {
    expect(v2).not.toContain('navigate(-1)');
  });

  it('keeps the existing execution permission guard', () => {
    expect(v2).toContain('canExecuteCheck(profile)');
  });
});
