import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(process.cwd());
const moduleSource = readFileSync(resolve(root, 'src/modules/BillingModule.tsx'), 'utf8');
const styles = readFileSync(resolve(root, 'src/styles.css'), 'utf8');

describe('billing functional and UX flow', () => {
  it('filters the operational queue with invoiceable eligibility and prepares directly', () => {
    expect(moduleSource).toContain('nextRoutingRows.filter((row) => nextInvoiceable.some((work) => work.id === row.id))');
    expect(moduleSource).toContain('PREPARAR FACTURA');
    expect(moduleSource).toContain('Abrir parte');
    expect(moduleSource).toContain('work.source');
    expect(moduleSource).toContain('work.entered_at');
  });

  it('shows the full internal review context without changing economic lines', () => {
    for (const label of ['EQUIPOS', 'TRABAJO Y MATERIALES', 'HORAS Y DESPLAZAMIENTOS', 'REVISIÓN COMERCIAL']) expect(moduleSource).toContain(label);
    expect(moduleSource).toContain('SAT indica que existen materiales/horas no facturables');
    expect(moduleSource).toContain('no se modifica automáticamente ningún importe');
  });

  it('does not print draft or internal notes in the customer invoice', () => {
    expect(styles).toContain('.invoice-print-notes { display: none; }');
    expect(moduleSource).toContain('invoice.fiscal_snapshot');
    expect(moduleSource).not.toContain('unit_cost');
    expect(moduleSource).not.toContain('margen');
  });
});
