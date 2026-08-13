import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import pgQuery from 'pg-query-emscripten';

const migration = readFileSync(new URL('../../supabase/migrations/034_fix_quotes_management.sql', import.meta.url), 'utf8');
const quotesService = readFileSync(new URL('../services/quotesService.ts', import.meta.url), 'utf8');
const app = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');
const clientsService = readFileSync(new URL('../services/clientsService.ts', import.meta.url), 'utf8');

describe('quotes management 034', () => {
  it('parses migration SQL', async () => {
    const parser = await pgQuery();
    expect(parser.parse(migration).parse_tree.stmts.length).toBeGreaterThan(0);
  });

  it('keeps quote code automatic and company scoped', () => {
    expect(quotesService).toContain("codesService.next('quotes', 'PRE', true, 6, company_id)");
    expect(migration).toContain("new.code := public.next_dmp_code(new.company_id, TG_TABLE_NAME, 'PRE', true, 6)");
    expect(migration).toContain('trg_quotes_auto_code');
    expect(migration).toContain('quotes_company_code_unique');
  });

  it('allows requested roles and blocks other company ids by policy', () => {
    for (const role of ['SAT', 'Comercial', 'Gerencia', 'superadmin']) expect(migration).toContain(role);
    expect(migration).toContain('company_id = public.current_company_id()');
    expect(migration).not.toContain('disable row level security');
    expect(migration).not.toContain('service_role');
  });

  it('supports required quote states and line types', () => {
    for (const status of ['Borrador', 'Enviado', 'Aceptado', 'Ejecutado en cliente', 'Rechazado']) expect(migration).toContain(status);
    for (const type of ['material', 'labor', 'transport', 'mobile_workshop', 'other']) expect(migration).toContain(type);
    expect(quotesService).toContain('quoteStatuses');
    expect(quotesService).toContain('quoteLineTypes');
  });

  it('implements create edit line crud totals and sent state in service', () => {
    expect(quotesService).toContain('async create');
    expect(quotesService).toContain('async update');
    expect(quotesService).toContain('addLine');
    expect(quotesService).toContain('updateLine');
    expect(quotesService).toContain('deleteLine');
    expect(quotesService).toContain('sendToClient');
    expect(quotesService).toContain("status: 'Enviado'");
    expect(migration).toContain('dmp_recalculate_quote_totals');
    expect(migration).toContain('estimated_margin');
  });

  it('connects UI for edit print send material and manual lines', () => {
    expect(app).toContain('Editar presupuesto');
    expect(app).toContain('Imprimir presupuesto');
    expect(app).toContain('Enviar al cliente');
    expect(app).toContain('QuoteSendModal');
    expect(app).toContain('Material manual / sin catálogo');
    expect(app).toContain('quotesService.deleteLine');
    expect(app).toContain('window.print()');
  });

  it('lists quotes in client detail with economic summary', () => {
    expect(clientsService).toContain('quotes!quotes_client_id_fkey');
    expect(app).toContain('Presupuestos del cliente');
    expect(app).toContain('Resumen economico');
    expect(app).toContain('quoteStats');
  });
});
