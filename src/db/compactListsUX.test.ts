import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const app = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');

describe('compact list design and sidebar updates', () => {
  it('moves update checking to the sidebar and removes the version strip from pages', () => {
    expect(app).not.toContain('function VersionUpdateNotice');
    expect(app).not.toContain('DoorManager Pro actualizado');
    expect(app).not.toContain('version-strip');
    expect(app).toContain('function SidebarUpdateCheck');
    expect(app).toContain('</nav><SidebarUpdateCheck />');
    expect(app).toContain('className={`sidebar-update');
  });

  it('keeps the actualizaciones action reachable from the sidebar with its guards', () => {
    expect(app).toContain("'Buscar actualizaciones'");
    expect(app).toContain('sidebar-update');
    expect(app).toContain('hasPotentialUnsavedFormData');
    expect(app).toContain('technicianOfflineService.pending()');
    expect(app).toContain("state.status === 'update-available'");
  });

  it('does not reintroduce redundant list summaries', () => {
    const removed = [
      'Presupuestos de instalación, reparación y mantenimiento',
      'Partes SAT con técnicos, comerciales, checks',
      'Clientes, contactos y actividad relacionada',
      'Centros, accesos, contactos, equipos y partes',
      'Inventario de equipos, tipos y componentes',
      'Expedientes con eventos y enlaces reales',
      'Catálogo de materiales para partes y presupuestos',
      'Registros disponibles para tu rol y empresa.',
      'Pipeline comercial vinculado a clientes',
      'Agenda operativa de SAT y planificación de recursos',
    ];
    for (const text of removed) expect(app).not.toContain(text);
  });

  it('uses compact record cards for the main listados', () => {
    expect(app).toContain('function RecordCard');
    expect(app).toContain('function RecordMeta');
    expect((app.match(/className="record-list"/g) ?? []).length).toBeGreaterThanOrEqual(5);
    expect(app).toContain('className="sat-meta-row"');
    expect(app).not.toContain('sat-assignment-grid');
    expect(app).not.toContain('Próxima revisión');
  });

  it('keeps lifecycle actions reachable on the compact listados', () => {
    for (const entity of ['quotes', 'clients', 'sites', 'equipment', 'work_orders']) expect(app).toContain(`LifecycleActionPanel entity="${entity}"`);
    expect(app).toContain('lifecycleEntity="cases"');
  });

  it('keeps the essential operational data on each compact row', () => {
    expect(app).toContain("[ 'Total', `${Number(quote.total_amount ?? quote.total ?? 0)");
    expect(app).toContain('quote.clients?.legal_name ?? \'-\'');
    expect(app).toContain("[ 'Stock actual', `${Number(item.stock_quantity ?? 0)");
    expect(app).toContain("[ 'Stock mínimo',");
    expect(app).toContain('client.code ?? \'-\'');
    expect(app).toContain("work.main_technician_name ?? 'Sin asignar'");
    expect(app).toContain("work.commercial_name ?? work.creator_name ?? 'No informado'");
    expect(app).toContain('work.scheduled_date ?? \'Sin fecha\'');
  });

  it('does not move list data back onto the rows or break calculations', () => {
    expect(app).not.toContain("[ 'Impuestos', `${Number(quote.tax_amount");
    expect(app).not.toContain("[ 'Margen estimado', `${Number(quote.estimated_margin");
    expect(app).toContain('Number(quote.total_amount ?? quote.total ?? 0)');
    expect(app).toContain('Number(item.stock_quantity ?? 0) * Number(item.cost ?? 0)');
    expect(app).toContain("checks.filter((check: any) => check.status !== 'Realizado')");
    expect(app).toContain('stockValue.toLocaleString');
  });
});