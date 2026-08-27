import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { isQuoteEditable, validQuoteTransitions } from './quotesService';

const migration = readFileSync(resolve(process.cwd(), 'supabase/migrations/072_quote_immutable_canonical_integrity.sql'), 'utf8');
const migration073 = readFileSync(resolve(process.cwd(), 'supabase/migrations/073_office_validation_and_additional_sales.sql'), 'utf8');
const app = readFileSync(resolve(process.cwd(), 'src/App.tsx'), 'utf8');

describe('072 quote historical and canonical integrity', () => {
  it('only allows draft and sent quotes to be edited', () => {
    expect(isQuoteEditable('Borrador')).toBe(true);
    expect(isQuoteEditable('Enviado')).toBe(true);
    for (const status of ['Aceptado', 'Ejecutado en cliente', 'Rechazado', 'Caducado', 'Cancelado']) {
      expect(isQuoteEditable(status)).toBe(false);
    }
    expect(migration).toContain('quote_line_editable_guard');
    expect(migration).toContain("v_status not in ('Borrador','Enviado')");
  });

  it('exposes only transitions accepted by the database matrix', () => {
    expect(validQuoteTransitions('Aceptado')).toEqual(['Rechazado', 'Caducado', 'Cancelado', 'Ejecutado en cliente']);
    expect(validQuoteTransitions('Ejecutado en cliente')).toEqual([]);
    expect(validQuoteTransitions('Rechazado')).toEqual(['Borrador', 'Enviado']);
  });

  it('validates generic versions and material snapshots on the server', () => {
    expect(migration).toContain('v.technician_profile_id is null');
    expect(migration).toContain('v.active and v.deleted_at is null');
    expect(migration).toContain('new.unit_cost := coalesce(v_material.cost, 0)');
    expect(migration).toContain('new.unit_price := coalesce(v_material.price, 0)');
    expect(app).toContain('rate_version_id: next === \'service\' ? current.rate_version_id : null');
    expect(app).not.toContain(`function ${['Legacy', 'QuoteLineForm'].join('')}(`);
    expect(app).not.toContain(`function ${['Historical', 'QuoteLineCompatibility'].join('')}(`);
    expect(app).not.toContain(["hourRatesService.list", "('', quoteCompanyId)"].join(''));
  });

  it('keeps quote status transition writes compatible with terminal immutability', () => {
    const sendBranchStart = migration073.indexOf("if p_new_status = 'Enviado' then");
    const sendBranchEnd = migration073.indexOf('else', sendBranchStart);
    const nonSendUpdateStart = migration073.indexOf('update public.quotes', sendBranchEnd);
    const nonSendUpdateEnd = migration073.indexOf('returning * into', nonSendUpdateStart);
    expect(sendBranchStart).toBeGreaterThan(-1);
    expect(migration073).toContain('dmp_quote_transition_apply');
    expect(migration073.slice(sendBranchStart, sendBranchEnd)).toContain('sent_at =');
    expect(migration073.slice(sendBranchStart, sendBranchEnd)).toContain('sent_to_email =');
    expect(migration073.slice(nonSendUpdateStart, nonSendUpdateEnd)).not.toContain('sent_at =');
    expect(migration073.slice(nonSendUpdateStart, nonSendUpdateEnd)).not.toContain('sent_to_email =');
    expect(migration073).toContain("dmp_quote_transition_apply(v_work.quote_id,'Ejecutado en cliente'");
    const officeFunction = migration073.slice(migration073.indexOf('create or replace function public.dmp_review_work_order_office'));
    expect(officeFunction).not.toContain('update public.quote_lines');
    expect(officeFunction).not.toContain('update public.quotes');
    expect(officeFunction).not.toContain('update public.work_order_materials');
    expect(officeFunction).not.toContain('update public.work_order_time_entries');
    expect(officeFunction).not.toContain('material_stock_movements');
  });
});
