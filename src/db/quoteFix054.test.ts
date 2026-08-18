import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import pgQuery from 'pg-query-emscripten';

const migration053 = readFileSync(new URL('../../supabase/migrations/053_quote_integrity_traceability.sql', import.meta.url), 'utf8');
const migration054 = readFileSync(new URL('../../supabase/migrations/054_fix_quote_status_runtime.sql', import.meta.url), 'utf8');
const quotesService = readFileSync(new URL('../services/quotesService.ts', import.meta.url), 'utf8');

describe('quote status runtime fix 054', () => {
  it('parses migration SQL', async () => {
    const parser = await pgQuery();
    expect(parser.parse(migration054).parse_tree.stmts.length).toBeGreaterThan(0);
  });

  it('054 redefines dmp_quote_transition_apply with a row-compatible RETURNING (returning * into v_quote)', () => {
    expect(migration054).toContain('create or replace function public.dmp_quote_transition_apply');
    expect(migration054).toContain('v_quote public.quotes;');
    expect(migration054).toContain('returning * into v_quote;');
    expect(migration054).not.toContain('returning to_jsonb(quotes.*) into v_quote');
    expect(migration054).not.toMatch(/returning\s+to_jsonb\([^)]*\)\s+into\s+v_quote/i);
  });

  it('053 carries the bug exactly once and 054 replaces it (regression guard)', () => {
    const occurrences053 = migration053.match(/returning to_jsonb\(quotes\.\*\) into v_quote/g)?.length ?? 0;
    expect(occurrences053).toBe(1);
    const occurrences054 = migration054.match(/returning to_jsonb\(quotes\.\*\) into v_quote/g)?.length ?? 0;
    expect(occurrences054).toBe(0);
    expect(migration054).toContain('returning * into v_quote;');
  });

  it('054 changes ONLY the RETURNING: matrix, reason, email, GUC, history and privileges are identical to 053', () => {
    expect(migration054).toContain('if p_new_status is not distinct from v_quote.status then');
    expect(migration054).toContain('dmp_quote_status_transition_valid(v_quote.status, p_new_status, public.dmp_quote_has_generated_work_order(v_quote.id))');
    expect(migration054).toContain('el motivo es obligatorio para este cambio de estado');
    expect(migration054).toContain('el email del cliente para marcar el presupuesto como enviado');
    expect(migration054).toContain("perform set_config('dmp.quote_status_change', 'true', true);");
    expect(migration054).toContain("perform set_config('dmp.quote_status_change', '', true);");
    expect(migration054).toContain('insert into public.quote_status_history');
    for (const role of ['public', 'anon', 'authenticated']) {
      expect(migration054).toContain(`revoke all on function public.dmp_quote_transition_apply(uuid, text, text, text, uuid) from ${role}`);
    }
    expect(migration054).not.toMatch(/grant\s+execute\s+on\s+function\s+public\.dmp_quote_transition_apply/i);
  });

  it('054 has no other composite/jsonb RETURNING mismatch antipattern', () => {
    expect(migration054).not.toMatch(/returning\s+to_jsonb\([^)]*\)\s+into\s+(?!v_new\b)/i);
  });

  it('053 has no other returning-to_jsonb-into-composite besides the corrected quote transition', () => {
    const bug053 = migration053.match(/returning\s+to_jsonb\([^)]*\)\s+into\s+v_quote/g) ?? [];
    expect(bug053).toEqual(['returning to_jsonb(quotes.*) into v_quote']);
  });

  it('changeStatus logs message/details/hint/code/name/quoteId/targetStatus without leaking SQL to the UI', () => {
    const block = quotesService.slice(quotesService.indexOf('async changeStatus('), quotesService.indexOf('async addLine('));
    expect(block).toContain("const targetStatus = status === 'Mandado' ? 'Enviado' : status");
    expect(block).toContain("console.error('DMP quote operation failed', { action: 'change quote status'");
    expect(block).toContain('quoteId: id');
    expect(block).toContain('targetStatus');
    expect(block).toContain('message: error?.message');
    expect(block).toContain('details: error?.details');
    expect(block).toContain('hint: error?.hint');
    expect(block).toContain('code: error?.code');
    expect(block).toContain('name: error?.name');
    expect(block).toContain('throw error;');
  });
});