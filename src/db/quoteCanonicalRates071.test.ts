import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(resolve(process.cwd(), 'supabase/migrations/071_quote_canonical_rate_options.sql'), 'utf8');
const app = readFileSync(resolve(process.cwd(), 'src/App.tsx'), 'utf8');
const quotesService = readFileSync(resolve(process.cwd(), 'src/services/quotesService.ts'), 'utf8');
const ratesService = readFileSync(resolve(process.cwd(), 'src/services/hourRatesService.ts'), 'utf8');

describe('071 canonical quote rates', () => {
  it('resolves only current-company concepts and versions for the quote date', () => {
    expect(migration).toContain('q.company_id = public.current_company_id()');
    expect(migration).toContain('q.issue_date');
    expect(migration).toContain('rv.valid_from <= coalesce(v_issue_date, current_date)');
    expect(migration).toContain('rv.valid_to is null or rv.valid_to >= coalesce(v_issue_date, current_date)');
    expect(migration).toContain('c.active');
    expect(migration).toContain('c.deleted_at is null');
    expect(migration).toContain('rv.active');
    expect(migration).toContain('rv.deleted_at is null');
  });

  it('does not use contributes_to_sale as a quote visibility filter', () => {
    expect(migration).toContain('c.classification in (\'labor\', \'cost\')');
    expect(migration).not.toContain('and c.contributes_to_sale');
  });

  it('keeps quote creation server-priced and connects the canonical selector', () => {
    expect(ratesService).toContain("supabase.rpc('dmp_quote_rate_options'");
    expect(quotesService).toContain('payload.concept_id');
    expect(quotesService).toContain('rate_version_id: payload.rate_version_id');
    expect(quotesService).toContain('concept_id: payload.concept_id');
    expect(app).toContain("label: 'Servicio / Tarifa'");
    expect(app).toContain('quoteRateOptions(quoteId)');
    expect(app).toContain('value: rate.concept_id');
  });
});
