import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const service = read('../services/materialsService.ts');
const app = read('../App.tsx');
const lifecycle = read('../../supabase/migrations/052_material_lifecycle_rate_traceability.sql');
const stockBoundary = read('../../supabase/migrations/075_material_stock_write_boundary.sql');

describe('material catalog lifecycle', () => {
  it('filters the active catalog by active and keeps inactive/archived records queryable separately', () => {
    expect(service).toContain("archiveFilter === 'active'");
    expect(service).toContain("eq('active', true)");
    expect(service).toContain("archiveFilter === 'archived'");
    expect(service).toContain("active.eq.false,deleted_at.not.is.null");
    expect(app).toContain('materialDisplayStatus');
    expect(app).toContain('Consumido');
  });

  it('keeps one-off semantics distinct and derives consumption from stock movements', () => {
    expect(lifecycle).toContain('is_specific boolean not null default false');
    expect(lifecycle).toContain("p_source = 'work_order'");
    expect(lifecycle).toContain("set active = false, deleted_at = null");
    expect(lifecycle).toContain("jsonb_build_object('status', 'consumed'");
    expect(stockBoundary).toContain('revoke update on table public.materials from authenticated');
    expect(stockBoundary).toContain('dmp_adjust_material_stock');
    expect(stockBoundary).not.toContain('grant update(stock_quantity');
  });
});
