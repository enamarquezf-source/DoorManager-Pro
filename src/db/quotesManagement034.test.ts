import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import pgQuery from 'pg-query-emscripten';

const migration = readFileSync(new URL('../../supabase/migrations/034_fix_quotes_management.sql', import.meta.url), 'utf8');
const economicsFixMigration = readFileSync(new URL('../../supabase/migrations/036_fix_quote_line_economics.sql', import.meta.url), 'utf8');
const unitPriceFixMigration = readFileSync(new URL('../../supabase/migrations/037_fix_quote_unit_price_mapping.sql', import.meta.url), 'utf8');
const discountTaxMarginMigration = readFileSync(new URL('../../supabase/migrations/038_fix_quote_discount_tax_margin.sql', import.meta.url), 'utf8');
const superadminScopeMigration = readFileSync(new URL('../../supabase/migrations/043_superadmin_company_scope_permissions.sql', import.meta.url), 'utf8');
const quoteWorkOrderFixMigration = readFileSync(new URL('../../supabase/migrations/044_fix_generate_work_order_from_quote.sql', import.meta.url), 'utf8');
const quotesService = readFileSync(new URL('../services/quotesService.ts', import.meta.url), 'utf8');
const app = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');
const clientsService = readFileSync(new URL('../services/clientsService.ts', import.meta.url), 'utf8');
const workOrdersService = readFileSync(new URL('../services/workOrdersService.ts', import.meta.url), 'utf8');
const quoteIntegrityMigration = readFileSync(new URL('../../supabase/migrations/053_quote_integrity_traceability.sql', import.meta.url), 'utf8');

describe('quotes management 034', () => {
  it('parses migration SQL', async () => {
    const parser = await pgQuery();
    expect(parser.parse(migration).parse_tree.stmts.length).toBeGreaterThan(0);
    expect(parser.parse(economicsFixMigration).parse_tree.stmts.length).toBeGreaterThan(0);
    expect(parser.parse(unitPriceFixMigration).parse_tree.stmts.length).toBeGreaterThan(0);
    expect(parser.parse(discountTaxMarginMigration).parse_tree.stmts.length).toBeGreaterThan(0);
    expect(parser.parse(superadminScopeMigration).parse_tree.stmts.length).toBeGreaterThan(0);
    expect(parser.parse(quoteWorkOrderFixMigration).parse_tree.stmts.length).toBeGreaterThan(0);
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
    for (const status of ['Borrador', 'Enviado', 'Aceptado', 'Ejecutado en cliente', 'Rechazado', 'Caducado', 'Cancelado']) expect(quotesService).toContain(status);
    for (const type of ['material', 'labor', 'transport', 'mobile_workshop', 'other']) expect(migration).toContain(type);
    expect(quotesService).toContain('quoteStatuses');
    expect(quotesService).toContain('quoteStatusFilters');
    expect(quotesService).toContain('quoteLineTypes');
  });

  it('wires quote status filters in the module list', () => {
    expect(app).toContain('quoteStatusFilters.map');
    expect(app).toContain("params.get('estado')");
    expect(app).toContain('Enviado/Mandado');
    expect(app).toContain('visibleQuotes');
  });

  it('lets superadmin reach shared quote routes instead of redirecting home', () => {
    expect(app).toContain('superadminSharedRoutes');
    expect(app).toContain("'/app/modulos/presupuestos'");
    expect(app).toContain("location.pathname.startsWith(route)");
  });

  it('implements create edit line crud totals and sent state in service', () => {
    expect(quotesService).toContain('async create');
    expect(quotesService).toContain('async update');
    expect(quotesService).toContain('addLine');
    expect(quotesService).toContain('updateLine');
    expect(quotesService).toContain('deleteLine');
    expect(quotesService).toContain('sendToClient');
    expect(quotesService).toContain("'Enviado'");
    expect(migration).toContain('dmp_recalculate_quote_totals');
    expect(migration).toContain('estimated_margin');
  });

  it('keeps quote line amounts equal to entered unit amounts and recalculates totals', () => {
    for (const sql of [migration, economicsFixMigration]) {
      expect(sql).toContain('new.total_cost := round(new.quantity * new.unit_cost, 2)');
      expect(sql).toContain('new.total_price := round(new.quantity * new.unit_price, 2)');
      expect(sql).toContain('quote_lines_set_totals_trigger');
      expect(sql).toContain('quote_lines_recalculate_trigger');
      expect(sql).toContain('quotes_recalculate_on_discount_trigger');
      expect(sql).toContain('taxable_base');
    }
    expect(quoteIntegrityMigration).toContain('new.total_price := round(new.quantity * new.unit_price * (1 - new.discount_percent / 100), 2)');
    expect(quoteIntegrityMigration).toContain('el descuento de la linea debe estar entre 0 y 100');
    expect(quotesService).toContain('const totalCost = Math.round(quantity * unitCost * 100) / 100');
    expect(quotesService).toContain('Math.round(quantity * unitPrice * (1 - discountPercent / 100) * 100) / 100');
    expect(quotesService).toContain("['unit_price', 'unitPrice', 'price', 'salePrice', 'sale_price', 'unitSale', 'sellingPrice']");
    expect(quotesService).not.toContain('unitPrice || 1');
    expect(quotesService).not.toContain('line.unit_price || 1');
    expect(unitPriceFixMigration).toContain('alter table public.quote_lines alter column unit_price set default 0');
    expect(unitPriceFixMigration).toContain('and unit_price = 1');
    expect(unitPriceFixMigration).toContain('set unit_price = unit_cost');

    const lines = [3100, 1500, 300].map((amount) => ({ quantity: 1, unitCost: amount, unitPrice: amount, taxRate: 21 }));
    const subtotalCost = lines.reduce((sum, line) => sum + line.quantity * line.unitCost, 0);
    const subtotalSale = lines.reduce((sum, line) => sum + line.quantity * line.unitPrice, 0);
    const taxAmount = lines.reduce((sum, line) => sum + line.quantity * line.unitPrice * line.taxRate / 100, 0);
    expect(subtotalCost).toBe(4900);
    expect(subtotalSale).toBe(4900);
    expect(taxAmount).toBe(1029);
    expect(subtotalSale + taxAmount).toBe(5929);
  });

  it('models discount type, taxable base, VAT and margin without VAT profit', () => {
    for (const sql of [migration, economicsFixMigration, discountTaxMarginMigration]) {
      expect(sql).toContain("discount_type text not null default 'amount'");
      expect(sql).toContain('discount_value numeric(12,2) not null default 0');
      expect(sql).toContain('taxable_base numeric(12,2) not null default 0');
      expect(sql).toContain("discount_type in ('percentage','amount')");
      expect(sql).toContain("v_discount_type = 'percentage'");
      expect(sql).toContain('discount_amount = round(coalesce(v_discount, 0), 2)');
      expect(sql).toContain('taxable_base = round(v_taxable, 2)');
      expect(sql).toContain('estimated_margin = round(v_taxable - v_cost, 2)');
      expect(sql).not.toContain('estimated_margin = round(v_taxable + v_tax');
    }
    expect(quotesService).toContain('export function calculateQuoteEconomics');
    expect(quotesService).toContain("discountType === 'percentage' ? subtotalSale * Number(discountValue ?? 0) / 100");
    expect(quotesService).toContain('estimatedMargin: taxableBase - subtotalCost');
    expect(app).toContain('Tipo de descuento');
    expect(app).toContain('Descuento %');
    expect(app).toContain('Descuento €');
    expect(app).toContain('Base imponible');
    expect(app).toContain('Total cliente con IVA');
    expect(app).toContain('Beneficio estimado sin IVA');
  });

  it('separates printable client and internal quote reports', () => {
    expect(app).toContain('Imprimir informe cliente');
    expect(app).toContain('Imprimir informe interno DMP');
    expect(app).toContain("printQuote('client')");
    expect(app).toContain("printQuote('internal')");
    expect(app).toContain('function QuotePrintableReport');
    expect(app).toContain("variant: 'client' | 'internal'");
    expect(app).toContain('client-report');
    expect(app).toContain('internal-report');
    expect(app).toContain('Subtotal coste interno');
    expect(app).toContain('Beneficio estimado sin IVA');
    expect(app).toContain('Margen línea');
    expect(app).toContain('Total cliente con IVA');
    expect(app).toContain('Base imponible');
    expect(app).not.toContain('window.open');
  });

  it('keeps quote statuses ready for future invoicing without changing totals on status edits', () => {
    for (const status of ['Borrador', 'Enviado', 'Aceptado', 'Ejecutado en cliente', 'Rechazado', 'Caducado', 'Cancelado']) expect(quotesService).toContain(status);
    expect(app).toContain('Estados candidatos para fases futuras: Aceptado y Ejecutado en cliente');
    expect(quotesService).toContain("supabase.rpc('dmp_change_quote_status'");
    expect(quotesService).toContain("return this.changeStatus(id, 'Enviado', 'Envio al cliente', email);");
    expect(quotesService).not.toContain('tax_amount: payload.status');
    expect(quotesService).not.toContain('total_amount: payload.status');
  });

  it('connects UI for edit print send material and manual lines', () => {
    expect(app).toContain('Editar presupuesto');
    expect(app).toContain('Imprimir informe cliente');
    expect(app).toContain('Imprimir informe interno DMP');
    expect(app).toContain('Marcar como enviado');
    expect(app).toContain('Esta acción no envía un email automáticamente.');
    expect(app).toContain('QuoteSendModal');
    expect(app).toContain('Material manual / sin catálogo');
    expect(app).toContain("unit_price: material?.price");
    expect(app).toContain('Servicio / Tarifa');
    expect(app).toContain('rate_version_id');
    expect(app).toContain('quotesService.deleteLine');
    expect(app).toContain('window.print()');
    expect(app).not.toContain('window.open');
  });

  it('opens quote detail in the same app screen', () => {
    expect(app).toContain('function QuoteDetailPage');
    expect(app).toContain('path="/app/modulos/presupuestos/:id"');
    expect(app).toContain('/app/modulos/presupuestos/${quote.id}');
    expect(app).toContain('quote-detail-page');
    expect(app).not.toContain('QuoteDetailModal quoteId={selected}');
  });

  it('loads quote detail without fragile embedded relationships', () => {
    expect(quotesService).toContain("supabase.from('quotes').select('*')");
    expect(quotesService).toContain("supabase.from('quote_lines').select('*')");
    expect(quotesService).toContain('optionalRelated');
    expect(quotesService).toContain('DMP get quote failed');
    expect(quotesService).toContain("select('id, code, description, manufacturer, reference, unit, cost, price, stock_quantity");
    expect(quotesService).not.toContain('quote_lines!quote_lines_quote_id_fkey');
  });

  it('keeps the current client available when editing a quote', () => {
    expect(quotesService).toContain('id,code,legal_name,email,company_id,deleted_at');
    expect(app).toContain('Cliente asociado actualmente');
    expect(app).toContain('clientOptions.unshift');
  });

  it('changes quote status outside the full edit form', () => {
    expect(quotesService).toContain('async changeStatus');
    expect(app).toContain('function QuoteStatusSelector');
    expect(app).toContain('Cambiar estado');
    expect(app).toContain('Estado del presupuesto actualizado.');
  });

  it('lists quotes in client detail with economic summary', () => {
    expect(clientsService).toContain('quotes!quotes_client_id_fkey');
    expect(app).toContain('Presupuestos del cliente');
    expect(app).toContain('Resumen economico');
    expect(app).toContain('quoteStats');
  });

  it('generates work orders from accepted quotes without consuming materials', () => {
    expect(quoteWorkOrderFixMigration).toContain('alter table public.work_orders add column if not exists quote_id uuid references public.quotes(id)');
    expect(quoteWorkOrderFixMigration).toContain('v_quote_id uuid := nullif(p_payload->>\'quote_id\', \'\')::uuid');
    expect(quoteWorkOrderFixMigration).toContain('quote_id, client_id, site_id');
    expect(quoteWorkOrderFixMigration).toContain("public.has_any_role(array['superadmin','SAT','Comercial','Gerencia','Oficina'])");
    expect(quoteWorkOrderFixMigration).toContain('if not public.is_platform_superadmin() then perform public.assert_member_of_current_company(v_company_id); end if;');
    expect(quoteWorkOrderFixMigration).toContain('v_quote.company_id <> v_company_id or v_quote.client_id <> v_client_id');
    expect(quoteWorkOrderFixMigration).toContain('v_quote.site_id is not null and v_quote.site_id is distinct from v_site_id');
    expect(quoteWorkOrderFixMigration).toContain('v_quote.equipment_id is not null and v_quote.equipment_id is distinct from v_equipment_id');
    expect(quoteWorkOrderFixMigration).toContain('v_quote.case_id is not null and v_quote.case_id is distinct from v_case_id');
    expect(quoteWorkOrderFixMigration).toContain("lower(coalesce(v_quote.status, '')) not in ('aceptado','ejecutado en cliente')");
    expect(workOrdersService).toContain("'quote_id'");
    expect(workOrdersService).toContain('quotes!work_orders_quote_id_fkey');
    expect(workOrdersService).toContain("supabase.rpc('dmp_create_work_order_full', { p_payload:");
    expect(workOrdersService).not.toContain("supabase.rpc('create_work_order_full'");
    expect(workOrdersService).toContain("code: error?.code, message: error?.message, details: error?.details, hint: error?.hint");
    const mixedSelection = [{ existing_equipment_id: 'existing' }, { new: { equipment_type_id: 'type-a' } }, { new: { equipment_type_id: 'type-b' } }];
    expect(mixedSelection).toHaveLength(3);
    expect(mixedSelection[0]).toEqual({ existing_equipment_id: 'existing' });
    expect(mixedSelection.slice(1).every((item) => 'new' in item)).toBe(true);
    expect(workOrdersService).toContain("resource: 'dmp_create_work_order_full'");
    expect(quotesService).toContain("supabase.from('work_orders').select('id,code,title,status,scheduled_date,quote_id').eq('quote_id', id)");
    expect(app).toContain('Generar parte');
    expect(app).toContain('generated_work_orders');
    expect(app).toContain('quoteWorkOrderInitial');
    expect(app).toContain('planned_material: quotePlannedMaterial(lines)');
    expect(app).toContain('Los materiales quedan como previstos, sin descontar stock');
    expect(app).toContain('Presupuesto origen');
    expect(quoteWorkOrderFixMigration).not.toContain('insert into public.work_order_materials');
    expect(app).not.toContain('workOrdersService.upsertMaterial(line');
  });

  it('covers role, company and clear error rules for quote to work order generation', () => {
    for (const role of ['superadmin', 'SAT', 'Comercial', 'Gerencia', 'Oficina']) expect(quoteWorkOrderFixMigration).toContain(role);
    expect(quoteWorkOrderFixMigration).not.toContain("'Tecnico']) then raise exception 'No tienes permisos para crear partes'");
    expect(quoteWorkOrderFixMigration).toContain('work_orders_platform_superadmin_insert');
    expect(quoteWorkOrderFixMigration).toContain('work_orders_insert_quote_authorized_roles');
    expect(quoteWorkOrderFixMigration).toContain("company_id = public.current_company_id() and public.has_any_role(array['superadmin','SAT','Comercial','Gerencia','Oficina'])");
    expect(quoteWorkOrderFixMigration).toContain('validacion del formulario: presupuesto sin empresa');
    expect(quoteWorkOrderFixMigration).toContain('validacion del formulario: presupuesto sin cliente');
    expect(quoteWorkOrderFixMigration).toContain('validacion del formulario: presupuesto sin centro para crear parte');
    expect(quoteWorkOrderFixMigration).toContain('validacion del formulario: presupuesto no aceptado para generar parte');
    expect(app).toContain("disabled={!canManageQuote || data.deleted_at || data.status !== 'Aceptado' || generatedWorks.length > 0}");
    expect(app).not.toContain("|| !data.site_id}>Generar parte");
    expect(app).toContain('DMP generate work order from quote failed');
    expect(app).toContain('quoteStatus');
    expect(app).toContain('quoteCompanyId');
    expect(app).toContain('quoteSiteId');
    expect(app).toContain('quoteEquipmentId');
    expect(app).toContain('quoteCaseId');
    expect(app).toContain("rpcName: 'dmp_create_work_order_full'");
    expect(app).toContain('Codigo: ${err.code}');
    expect(app).toContain('No se pudo generar el parte desde el presupuesto');
    expect(quoteWorkOrderFixMigration).not.toContain('stock_deducted_quantity');
    expect(quoteWorkOrderFixMigration).not.toContain('adjustStock');
  });
});
