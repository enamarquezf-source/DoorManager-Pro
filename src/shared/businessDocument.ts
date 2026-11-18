import { displayStatus, fullName } from './labels';

export type BusinessDocument = {
  kind: string; code: string; title: string; status?: string; date?: string;
  issuer: string[]; customer: string[]; reference: string[];
  sections: { title: string; text?: string; columns?: string[]; rows?: string[][]; widths?: number[] }[];
  totals?: { label: string; value: string; emphasis?: boolean }[];
  notice?: string;
};
export const documentMoney = (v: unknown) => `${Number(v ?? 0).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
export const documentDate = (v?: string | null) => v ? v.slice(0, 10).split('-').reverse().join('/') : 'Sin fecha';
const text = (v: unknown) => v == null ? '' : String(v);
const address = (p: any) => [p?.address, p?.postal_code, p?.city, p?.province, p?.country].filter(Boolean).join(', ');
function identity(p: any, fallback: string) {
  return [p?.legal_name || p?.name || fallback, p?.tax_id && `NIF/CIF ${p.tax_id}`, address(p), [p?.email, p?.phone].filter(Boolean).join(' · ')].filter(Boolean) as string[];
}

export function workDocument(work: any, issuer?: any): BusinessDocument {
  const client = work.clients ?? work.client;
  const site = work.sites ?? work.site;
  const active = (rows: any[] = []) => rows.filter(row => !row.deleted_at);
  const equipment = active(work.associated_equipment).map(row => row.equipment ?? row);
  if (!equipment.length && work.primary_equipment) equipment.push(work.primary_equipment);
  return {
    kind: 'Parte de trabajo', code: work.code || 'Parte', title: work.title || 'Intervención técnica',
    status: displayStatus(work.status), date: documentDate(work.scheduled_date ?? work.created_at),
    issuer: identity(issuer, 'Empresa prestadora no informada'), customer: identity(client, 'Cliente no informado'),
    reference: [site?.name, address(site), work.quotes?.code && `Presupuesto ${work.quotes.code}`, work.cases?.code && `Expediente ${work.cases.code}`].filter(Boolean),
    sections: [
      { title: 'Solicitud del cliente', text: work.description || 'Sin descripción registrada.' },
      { title: 'Trabajo realizado', text: work.work_performed || work.result || 'Trabajo realizado pendiente de registrar.' },
      { title: 'Equipos intervenidos', columns: ['Equipo', 'Identificación'], widths: [65, 113], rows: equipment.map(e => [e.code || '-', [e.name || e.location || e.description, e.brand, e.model].filter(Boolean).join(' · ') || 'Equipo']) },
      { title: 'Tiempo de intervención', columns: ['Fecha', 'Profesional', 'Tiempo'], widths: [35, 108, 35], rows: active(work.time_entries).map(t => [documentDate(t.work_date ?? t.date ?? t.started_at ?? t.created_at), fullName(t.profiles ?? t.technician ?? t.profile) || 'Profesional', `${Math.floor(Number(t.duration_minutes ?? 0) / 60)} h ${Number(t.duration_minutes ?? 0) % 60} min`]) },
      { title: 'Materiales utilizados', columns: ['Descripción', 'Cantidad'], widths: [143, 35], rows: active(work.materials).map(m => [m.materials?.description || m.description || 'Material', `${m.used_quantity ?? m.quantity ?? 0} ${m.unit ?? m.materials?.unit ?? 'ud'}`]) },
      { title: 'Recursos y desplazamientos', columns: ['Concepto', 'Cantidad'], widths: [143, 35], rows: active(work.cost_entries).map(c => [c.description || displayStatus(c.cost_type) || 'Recurso', `${c.quantity ?? 1} ${c.unit ?? 'ud'}`]) },
      { title: 'Comprobaciones del equipo', columns: ['Check', 'Estado', 'Finalización'], widths: [65, 65, 48], rows: active(work.checks).map(c => [c.code || 'Check', displayStatus(c.status), c.finished_at ? documentDate(c.finished_at) : 'Pendiente']) },
      { title: 'Conformidad registrada', columns: ['Firmante', 'Fecha'], widths: [130, 48], rows: active(work.signatures).map(s => [s.signer_name || 'Sin nombre', documentDate(s.signed_at)]) },
    ].filter(section => section.text || section.rows?.length),
    notice: 'Documento de intervención. No sustituye a la factura ni al informe detallado de checks. Las firmas originales se conservan en el parte.',
  };
}

export function quoteDocument(quote: any, issuer?: any, internal = false): BusinessDocument {
  const lines = (quote.quote_lines ?? []).filter((line: any) => !line.deleted_at);
  return {
    kind: internal ? 'Presupuesto · uso interno' : 'Presupuesto', code: quote.code || 'Borrador', title: quote.title || 'Propuesta de trabajo',
    status: displayStatus(quote.status), date: documentDate(quote.issue_date ?? quote.created_at),
    issuer: identity(issuer, 'Empresa emisora no informada'), customer: identity(quote.clients, 'Cliente no informado'),
    reference: [quote.sites?.name, quote.equipment?.code, quote.valid_until && `Válido hasta ${documentDate(quote.valid_until)}`].filter(Boolean),
    sections: [
      ...(quote.description ? [{ title: 'Tu propuesta', text: text(quote.description) }] : []),
      { title: 'Detalle de la propuesta', columns: internal ? ['Descripción', 'Cant.', 'Coste ud.', 'Precio ud.', 'IVA', 'Base'] : ['Descripción', 'Cant.', 'Precio ud.', 'IVA', 'Base'],
        widths: internal ? [63, 18, 27, 27, 15, 28] : [80, 20, 30, 18, 30],
        rows: lines.map((l: any) => [l.description || 'Concepto', `${l.quantity ?? 1} ${l.unit ?? 'ud'}`, ...(internal ? [documentMoney(l.unit_cost)] : []), documentMoney(l.unit_price), `${l.tax_rate ?? 0}%`, documentMoney(l.total_price ?? l.total)]) },
      { title: 'Condiciones de la propuesta', text: quote.conditions || 'Condiciones no informadas. Consulta con la empresa emisora antes de aceptar.' },
    ],
    totals: [
      {label:'Subtotal',value:documentMoney(quote.subtotal_sale ?? quote.subtotal)},
      ...(Number(quote.discount_amount) ? [{label:'Descuento aplicado',value:documentMoney(quote.discount_amount)}] : []),
      {label:'Base imponible',value:documentMoney(quote.taxable_base)}, {label:'IVA',value:documentMoney(quote.tax_amount)},
      {label:'Total con IVA',value:documentMoney(quote.total_amount ?? quote.total),emphasis:true},
      ...(internal ? [{label:'Coste interno',value:documentMoney(quote.subtotal_cost)},{label:'Margen previsto sin IVA',value:documentMoney(quote.estimated_margin)}] : []),
    ], notice: internal ? 'Documento interno. Contiene costes y márgenes. No entregar al cliente.' : 'Propuesta económica sujeta a las condiciones y al periodo de validez indicados.',
  };
}

export function invoiceDocument(invoice: any): BusinessDocument {
  const snapshot = invoice.fiscal_snapshot;
  const totals = snapshot?.totals ?? invoice;
  const work = snapshot?.work ?? {};
  return {
    kind: invoice.status === 'borrador' ? 'Factura · borrador' : 'Factura', code: invoice.code || 'Borrador', title: 'Servicios y trabajos realizados',
    date: documentDate(totals.issue_date ?? invoice.issue_date), status: displayStatus(invoice.status),
    issuer: identity(snapshot?.emitter, 'Empresa emisora no informada'), customer: identity(snapshot?.client ?? invoice.clients, 'Cliente no informado'),
    reference: [work.code && `Parte ${work.code}`, work.site_name, work.quote_code && `Presupuesto ${work.quote_code}`, `Vencimiento ${documentDate(totals.due_date ?? invoice.due_date)}`].filter(Boolean),
    sections: [{title:'Conceptos facturados',columns:['Descripción','Cant.','Precio ud.','Dto.','IVA','Base'],widths:[68,17,27,16,20,30],
      rows:(snapshot?.lines ?? invoice.invoice_work_orders ?? []).filter((l:any)=>!l.deleted_at).map((l:any)=>[l.description || 'Concepto', text(l.quantity ?? 1), documentMoney(l.unit_price), `${l.discount ?? 0}%`,`${l.tax_rate ?? totals.tax_rate ?? 0}%`,documentMoney(l.subtotal)])},
      ...(totals.notes ? [{title:'Observaciones',text:text(totals.notes)}] : [])],
    totals:[{label:'Base imponible',value:documentMoney(totals.subtotal)},{label:'IVA',value:documentMoney(totals.tax_amount)},{label:'Total factura',value:documentMoney(totals.total_amount),emphasis:true}],
    notice: invoice.status === 'borrador' ? 'Borrador sin emitir. No es una factura definitiva.' : undefined,
  };
}
