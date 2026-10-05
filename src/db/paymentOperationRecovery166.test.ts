import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import pgQuery from 'pg-query-emscripten';
const sql = readFileSync(new URL('../../supabase/migrations/166_payment_operation_recovery.sql', import.meta.url), 'utf8');

describe('payment operation recovery', () => {
  it('parses the ledger and complete procedural RPC', async () => {
    const parser = await pgQuery();
    expect(parser.parse(sql).error).toBeNull();
    expect(parser.parsePlpgsql(sql).error).toBeNull();
  });
  it('scopes recovery to actor, company, kind and original payload without bypassing payment checks', () => {
    expect(sql).toContain('receipt.actor_id is distinct from actor.id');
    expect(sql).toContain('receipt.company_id is distinct from actor.company_id');
    expect(sql).toContain('receipt.payload is distinct from p_payload');
    expect(sql).toContain('receipt.kind is distinct from p_kind');
    expect(sql).toContain('pg_advisory_xact_lock');
    expect(sql).toContain('public.dmp_record_invoice_payment(');
    expect(sql).toContain('public.dmp_record_supplier_payment(');
    expect(sql).toContain('revoke all on public.payment_operation_receipts from public,anon,authenticated');
    expect(sql).not.toMatch(/exception when|update public\.(invoices|supplier_invoices)|delete from/i);
  });
});
