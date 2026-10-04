import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
vi.mock('../services/workOrdersService', () => ({ workOrdersService: {} }));
import { EconomicReviewPanel } from './EconomicReviewPanel';

const profile = { active: true, roles: ['SAT'] };
const time = { id: 'h', duration_minutes: 300, hourly_cost: 0, hourly_price: 0, total_cost: 0, total_price: 0, source: 'manual' };
const work = { id: 'w', code: 'PAR-NOVA-001', status: 'Finalizado tecnicamente', economic_review_status: 'pending', time_entries: [time], cost_entries: [{ id: 'van', quantity: 1, unit_cost: 250, total_cost: 250, unit_price: 0, total_price: 0 }] };
const render = (part: any) => renderToStaticMarkup(<EconomicReviewPanel workOrder={part} profile={profile} onChanged={() => {}} />);

describe('economic review display', () => {
  it('offers an explicit zero confirmation for an empty nonbillable test part', () => {
    const html = render({ ...work, billable: false, time_entries: [], cost_entries: [] });
    expect(html).toContain('No hay conceptos económicos registrados');
    expect(html).toContain('Confirmo que la venta aprobada es 0,00');
    expect(html).toContain('APROBAR REVISIÓN ECONÓMICA');
    expect(html).toContain('Motivo de revisión');
  });
  it('lets Office review existing concepts and correct classification', () => {
    const html = renderToStaticMarkup(<EconomicReviewPanel workOrder={work} profile={{ active: true, roles: ['Oficina'] }} onChanged={() => {}} />);
    expect(html).toContain('APROBAR REVISIÓN ECONÓMICA');
    expect(html).toContain('Corregir facturabilidad / garantía');
    expect(html).not.toContain('Comprobar tarifas históricas');
  });
  it('shows persisted decisions for an approved review instead of pending inputs', () => {
    const html = render({ ...work, economic_review_status: 'approved', sale_amount: 55, time_entries: [{ ...time, contributes_to_sale: false }], cost_entries: [{ id: 'van', quantity: 1, unit_cost: 35, total_cost: 35, unit_price: 55, total_price: 55, contributes_to_sale: true }] });
    expect(html).toContain('ENTRA EN VENTA: 55,00');
    expect(html).toContain('NO ENTRA EN VENTA');
    expect(html).not.toContain('PENDIENTE DE DECISIÓN');
  });
  it('shows pending figures and a partial cost for the legacy zero-hour fixture', () => {
    const html = render(work);
    expect(html).toContain('Coste parcial');
    expect(html).toContain('Por decidir');
    expect(html).toContain('sin tarifa vinculada');
    expect(html).toContain('Por comprobar');
    expect(html).not.toContain('-250,00');
  });

  it('keeps a genuine approved zero and negative margin when the hourly snapshot exists', () => {
    const html = render({ ...work, economic_review_status: 'approved', sale_amount: 0, time_entries: [{ ...time, rate_version_id: 'free-rate' }] });
    expect(html).toContain('-250,00');
    expect(html).not.toContain('Por decidir');
    expect(html).not.toContain('Coste parcial');
    expect(html).not.toContain('Comprobar tarifas históricas');
  });

  it('does not offer recovery to commercial reviewers or expose the panel to technicians', () => {
    const commercial = renderToStaticMarkup(<EconomicReviewPanel workOrder={work} profile={{ active: true, roles: ['Comercial'] }} onChanged={() => {}} />);
    expect(commercial).toContain('sin tarifa vinculada');
    expect(commercial).not.toContain('Comprobar tarifas históricas');
    expect(renderToStaticMarkup(<EconomicReviewPanel workOrder={work} profile={{ active: true, roles: ['Tecnico'] }} onChanged={() => {}} />)).toBe('');
  });
});
