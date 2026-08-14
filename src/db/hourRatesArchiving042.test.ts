import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import pgQuery from 'pg-query-emscripten';

const migration = readFileSync(new URL('../../supabase/migrations/042_permissions_archiving_hour_rates.sql', import.meta.url), 'utf8');
const app = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');
const service = readFileSync(new URL('../services/hourRatesService.ts', import.meta.url), 'utf8');

describe('042 hour rates and archiving', () => {
  it('parses migration SQL', async () => {
    const parser = await pgQuery();
    expect(parser.parse(migration).parse_tree.stmts.length).toBeGreaterThan(0);
  });

  it('creates technician hour rates with RLS and no physical deletes', () => {
    expect(migration).toContain('create table if not exists public.technician_hour_rates');
    expect(migration).toContain('alter table public.technician_hour_rates enable row level security');
    expect(migration).toContain('technician_hour_rates_no_delete');
    expect(migration).toContain("public.has_any_role(array['superadmin','Gerencia','Oficina'])");
  });

  it('applies the current rate snapshot when saving work order time', () => {
    expect(migration).toContain('public.dmp_current_hour_rate');
    expect(migration).toContain('hourly_cost = v_hourly_cost');
    expect(migration).toContain('hourly_price = v_hourly_price');
    expect(migration).toContain('total_cost = round(v_duration::numeric / 60 * v_hourly_cost, 2)');
    expect(migration).toContain('total_price = round(v_duration::numeric / 60 * v_hourly_price, 2)');
  });

  it('exposes a management module for hour rates', () => {
    expect(app).toContain('function HourRatesModule');
    expect(app).toContain("moduleId === 'tarifas-horas'");
    expect(app).toContain("path: '/app/modulos/tarifas-horas'");
    expect(service).toContain("supabase.from('technician_hour_rates')");
  });

  it('extends controlled lifecycle entities without service role', () => {
    for (const entity of ['materials', 'equipment_components', 'documents', 'alerts', 'opportunities']) expect(migration).toContain(entity);
    expect(migration).not.toContain('service_role');
    expect(migration).not.toContain('disable row level security');
  });
});
