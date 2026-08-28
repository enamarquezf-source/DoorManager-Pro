import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import pgQuery from 'pg-query-emscripten';

const migration = readFileSync(new URL('../../supabase/migrations/083_technical_planned_concept_resolution.sql', import.meta.url), 'utf8');
const preflight = readFileSync(new URL('../../supabase/verification/preflight_technical_planned_concepts_083.sql', import.meta.url), 'utf8');
const postflight = readFileSync(new URL('../../supabase/verification/postflight_technical_planned_concepts_083.sql', import.meta.url), 'utf8');
const app = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');
const service = readFileSync(new URL('../services/workOrdersService.ts', import.meta.url), 'utf8');

describe('technical planned concept resolution 083', () => {
  it('parses migration and read-only verification scripts', async () => {
    const parser = await pgQuery();
    expect(parser.parse(migration).parse_tree.stmts.length).toBeGreaterThan(0);
    expect(parser.parse(preflight).parse_tree.stmts.length).toBeGreaterThan(0);
    expect(parser.parse(postflight).parse_tree.stmts.length).toBeGreaterThan(0);
    expect(preflight + postflight).not.toMatch(/\b(insert|update|delete|alter|create|drop)\b/i);
  });

  it('separates technical decisions from economic amounts', () => {
    expect(migration).toContain('dmp_resolve_planned_concept_technical');
    expect(migration).toContain('technical_notes');
    expect(migration).toContain('real_unit_cost = null');
    expect(migration).not.toContain('work_order_cost_entries');
    expect(service).toContain('dmp_resolve_planned_concept_technical');
    expect(app).toContain('setTechnicalPlannedQuoteLineDecision');
    expect(app).toContain('canResolvePlannedConcept');
    expect(app).toContain('reloadKeepingContext');
    expect(app).toContain('requestAnimationFrame');
  });

  it('keeps protected economics hidden from technical users', () => {
    expect(app).toContain('showCosts ? money(line.total_cost) : \'-\'');
    expect(app).toContain('showCosts ? money(line.total_price ?? line.total) : \'-\'');
  });
});
