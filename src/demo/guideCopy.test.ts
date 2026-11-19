import { describe, expect, it } from 'vitest';
import { guideCopy } from './guideCopy';
import { demoTourSteps } from './model';

const session: any = {
  id: 'demo',
  company_id: 'company',
  profile_id: 'profile',
  role: 'SAT',
  expires_at: '2026-11-20T00:00:00.000Z',
  ended: false,
  cleanup_state: 'active',
  work_order_id: 'work-order',
};

describe('guided demo copy', () => {
  it('names the technician identity used by the demo when SAT assigns a work order', () => {
    const step = demoTourSteps(session, 'connected').find(item => item.goal === 'assignments')!;
    expect(step.text).toContain('Visitante Demo');
    expect(guideCopy(step).action).toContain('Visitante Demo');
  });

  it('does not ask Office to approve the economic review a second time', () => {
    const step = demoTourSteps(session, 'connected').find(item => item.title === 'Comprueba los conceptos')!;
    expect(step.requiredRole).toBe('Oficina');
    expect(step.text).toContain('ya está aprobada por SAT');
    expect(guideCopy(step).action).toContain('ya está aprobada');
    expect(guideCopy(step).action).toContain('preparar la factura');
  });

  it('labels the collections action as opening the calendar it actually reveals', () => {
    const step = demoTourSteps({ ...session, role: 'Oficina' }, 'connected').find(item => item.title === 'Comprueba los pendientes')!;
    expect(guideCopy(step).cta).toBe('Ver calendario de cobros');
    expect(guideCopy(step).action).toContain('Ver calendario');
  });
});
