import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const app = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');

describe('case relation navigation', () => {
  it('resolves case links from related_id and related_type', () => {
    expect(app).toContain('row?.related_type && row?.related_id');
    expect(app).toContain('`${prefix}/${relationBase}/${row.related_id}`');
    expect(app).not.toContain('formatEntityLabel(row), row.legal_name ?? row.description ?? row.status ?? row.related_id');
    for (const type of ['Equipo', 'Parte', 'Check', 'Documento', 'Presupuesto', 'Incidencia']) {
      expect(app).toContain(`${type}:`);
    }
    expect(app).not.toContain("Aviso: 'avisos'");
    expect(app).not.toContain("Oportunidad: 'modulos/oportunidades'");
  });

  it('does not expose a false document route for case attachment rows', () => {
    expect(app).toContain('row?.case_id && row?.file_id');
    expect(app).toContain('row.title ?? row.legal_name');
  });

  it('keeps technician check deep links inside the technician workspace', () => {
    expect(app).toContain('workspace === "tecnico" ? `/app/tecnico/trabajo/${data.work_order_id}`');
    expect(app).toContain('`/app/partes/${data.work_order_id}`');
  });
});
