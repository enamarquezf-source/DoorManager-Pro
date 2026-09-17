import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

describe('treasury ambiguous id hotfix 136', () => {
  it('does not modify migration 132 and replaces only affected treasury RPCs', () => {
    const source = readFileSync('supabase/migrations/132_treasury_core.sql', 'utf8');
    const hotfix = readFileSync('supabase/migrations/136_treasury_rpc_ambiguous_id_hotfix.sql', 'utf8');
    expect(source).toContain('returning id into id');
    expect(hotfix).toContain('dmp_create_treasury_account');
    expect(hotfix).toContain('dmp_record_invoice_payment');
    expect(hotfix).toContain('dmp_record_supplier_payment');
    expect(hotfix).toContain('dmp_record_treasury_manual_movement');
    expect(hotfix).toContain('dmp_transfer_treasury');
    expect(hotfix).not.toContain('create table');
    expect(hotfix).not.toContain('alter table');
    expect(hotfix).not.toContain('create index');
    expect(hotfix).not.toContain('create policy');
    expect(hotfix).not.toContain('grant ');
    expect(hotfix).not.toContain('revoke ');
  });

  it('qualifies returning expressions and preserves security contracts', () => {
    const hotfix = readFileSync('supabase/migrations/136_treasury_rpc_ambiguous_id_hotfix.sql', 'utf8');
    const verify = readFileSync('supabase/verification/verify_136_treasury_rpc_ambiguous_id_hotfix.sql', 'utf8');
    const service = readFileSync('src/services/treasuryService.ts', 'utf8');
    expect(hotfix).toContain('returning treasury_accounts.id into v_id');
    expect(hotfix).toContain('returning invoice_payments.id into v_payment_id');
    expect(hotfix).toContain('returning supplier_invoice_payments.id into v_payment_id');
    expect(hotfix).not.toContain('returning id into id');
    expect(hotfix.match(/security definer set search_path=public/g)?.length).toBe(5);
    expect(verify).toContain("to_regprocedure('public.dmp_create_treasury_account(text,text,text,text,numeric,date,text)')");
    expect(verify).toContain("'legacy payment RPCs remain revoked'");
    expect(verify).toContain("'manual movement treasury contract'");
    expect(verify).toContain("'treasury transfer contract'");
    expect(verify).toContain("dmp_record_treasury_manual_movement(uuid,text,numeric,date,text,text,text)");
    expect(verify).toContain("dmp_transfer_treasury(uuid,uuid,numeric,date,text,text)");
    expect(service).toContain("supabase.rpc('dmp_create_treasury_account'");
    expect(service).not.toContain("from('treasury_accounts').insert");
  });
});
