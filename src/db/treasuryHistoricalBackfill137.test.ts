import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

describe('treasury historical backfill 137', () => {
  it('keeps the migration additive and idempotent', () => {
    const migration = readFileSync('supabase/migrations/137_treasury_historical_backfill.sql', 'utf8');
    expect(migration).toContain('create or replace view public.treasury_account_balances');
    expect(migration).toContain('dmp_preview_treasury_historical_backfill');
    expect(migration).toContain('dmp_apply_treasury_historical_backfill');
    expect(migration).toContain('transaction_date >= a.opening_balance_date');
    expect(migration).toContain("v_account.currency_code = 'EUR'");
    expect(migration).toContain("pg_advisory_xact_lock(hashtextextended('treasury_historical_backfill:'");
    expect(migration).toContain("source_type = 'customer_payment'");
    expect(migration).toContain("source_type = 'supplier_payment'");
    expect(migration).toContain('not exists (select 1 from public.treasury_transactions');
    expect(migration).not.toContain('create table');
    expect(migration).not.toContain('alter table');
    expect(migration).not.toContain('create index');
  });

  it('exposes the explicit UI preview/apply flow and verification contract', () => {
    const panel = readFileSync('src/modules/HistoricalTreasuryBackfillPanel.tsx', 'utf8');
    const service = readFileSync('src/services/treasuryService.ts', 'utf8');
    const verify = readFileSync('supabase/verification/verify_137_treasury_historical_backfill.sql', 'utf8');
    expect(panel).toContain('Regularizar históricos');
    expect(panel).toContain('Previsualizar');
    expect(panel).toContain('Aplicar regularización');
    expect(panel).toContain('no modificarán el Saldo DMP actual');
    expect(panel).toContain("hasPermission(profile, 'treasury.transactions.create')");
    expect(panel).toContain("hasPermission(profile, 'billing.write')");
    expect(panel).toContain("hasPermission(profile, 'supplier_payments.create')");
    expect(panel).toContain('onApplied');
    expect(panel).toContain('Histórico anterior al saldo inicial');
    expect(service).toContain("dmp_preview_treasury_historical_backfill");
    expect(service).toContain("dmp_apply_treasury_historical_backfill");
    expect(service).toContain('TreasuryHistoricalBackfillPreview');
    expect(service).toContain('TreasuryHistoricalBackfillResult');
    expect(verify).toContain("'opening date controls balance'");
    expect(verify).toContain("'real payment schema contract'");
    expect(verify).toContain("'company-scoped concurrency lock'");
    expect(verify).toContain("'authenticated execute and public/anon denied'");
    expect(verify).toContain("'SUMMARY'");
  });
});
