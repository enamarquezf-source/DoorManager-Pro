import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { economicEntryRows } from './economicReview';
import { shouldLoadEconomicReviewDetail } from './economicReviewDetailLoading';

const panel = readFileSync(resolve(process.cwd(), 'src/components/EconomicReviewPanel.tsx'), 'utf8');
const app = readFileSync(resolve(process.cwd(), 'src/App.tsx'), 'utf8');

describe('economic review detail loading', () => {
  it('loads full detail for SAT before leaving the summary tab', () => {
    expect(shouldLoadEconomicReviewDetail({ workspace: 'sat', canReview: true, status: 'Finalizado tecnicamente', tab: 'resumen' })).toBe(true);
  });

  it('does not load economic detail for an ineligible SAT part', () => {
    expect(shouldLoadEconomicReviewDetail({ workspace: 'sat', canReview: true, status: 'En intervencion', tab: 'resumen' })).toBe(false);
  });

  it('does not add a SAT economic fetch to other summary contexts', () => {
    expect(shouldLoadEconomicReviewDetail({ workspace: 'comercial', canReview: true, status: 'Finalizado tecnicamente', tab: 'resumen' })).toBe(false);
    expect(shouldLoadEconomicReviewDetail({ workspace: 'tecnico', canReview: false, status: 'Finalizado tecnicamente', tab: 'resumen' })).toBe(false);
  });

  it('keeps the existing full-detail behavior for any non-summary tab', () => {
    expect(shouldLoadEconomicReviewDetail({ workspace: 'sat', canReview: false, status: 'En intervencion', tab: 'materiales' })).toBe(true);
  });

  it('preserves economic presence metadata while keeping numeric fallbacks for calculations', () => {
    const rows = economicEntryRows({ time_entries: [{ id: 't', duration_minutes: 60, hourly_cost: null, hourly_price: null }], materials: [{ id: 'm', used_quantity: 2, unit_cost: null, unit_price: null }], cost_entries: [{ id: 'c', quantity: 1, unit_cost: 0, unit_price: 0, total_cost: 0, total_price: 0 }] });
    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({ kind: 'time', cost_unit: 0, sale_unit_configured: false, cost_unit_configured: false });
    expect(rows[1]).toMatchObject({ kind: 'material', quantity: 2, cost_unit_configured: false, sale_unit_configured: false });
    expect(rows[2]).toMatchObject({ kind: 'cost', cost_unit: 0, unit_price: 0, cost_unit_configured: true, sale_unit_configured: true });
  });

  it('renders real evidence sections and missing-value labels without editing technical fields', () => {
    expect(panel).toContain('<h4>MATERIALES</h4>');
    expect(panel).toContain('<h4>MANO DE OBRA</h4>');
    expect(panel).toContain('<h4>OTROS COSTES</h4>');
    expect(panel).toContain('Coste no configurado');
    expect(panel).toContain('Tarifa interna no configurada');
    expect(panel).toContain('Tarifa de venta no configurada');
    expect(panel).not.toContain('used_quantity} onChange');
    expect(panel).not.toContain('material_id} onChange');
  });

  it('loads the full detail only after the SAT summary identifies an eligible review', () => {
    expect(app).toContain('const economicDetailEnabled = shouldLoadEconomicReviewDetail');
    expect(app).toContain('useWorkOrderDetail(companyId, id, economicDetailEnabled, workspace === \'tecnico\')');
    expect(app).toContain('economicDetailEnabled && detailQuery.isPending && !detailQuery.data');
  });
});
