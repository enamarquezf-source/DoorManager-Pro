import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const migration = readFileSync(new URL('../../supabase/migrations/068_fix_technical_finalize_no_quote.sql', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const service = readFileSync(new URL('../services/workOrdersService.ts', import.meta.url), 'utf8');
const query = readFileSync(new URL('../services/query.ts', import.meta.url), 'utf8');

describe('068 technical finalize without quote', () => {
  it('normalizes the no-row quote lookup before writing NOT NULL snapshots', () => {
    expect(migration).toContain('if not found then');
    expect(migration).toContain('v_quote := 0;');
    expect(migration).toContain('v_has_quote := false;');
    expect(migration).toContain('quoted_sale_amount=coalesce(v_quote,0)');
    expect(migration).toContain('additional_sale_amount=coalesce(v_additional,0)');
  });

  it('keeps the canonical operational sale and final state for an unquoted part', () => {
    expect(migration).toContain("else v_operational_sale end;");
    expect(migration).toContain("status='Finalizado tecnicamente'");
    expect(migration).toContain('sale_amount=coalesce(v_sale,0)');
    expect(migration).toContain('margin_amount=coalesce(v_margin,0)');
  });

  it('preserves the RPC diagnostics while the UI keeps a safe generic message', () => {
    expect(service).toContain("message: error?.message, details: error?.details, hint: error?.hint, code: error?.code");
    expect(query).toContain("message.includes('not-null')");
  });

  it('leaves quoted and warranty branches in the same atomic function', () => {
    expect(migration).toContain('when v_has_quote then round(v_quote + v_additional,2)');
    expect(migration).toContain("if v_economic_status in ('garantia','no_facturable')");
    expect(migration).toContain('insert into public.audit_log');
  });
});
