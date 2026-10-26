import { expect, it } from 'vitest';
import { isTravelCost } from './travelCosts';
it('keeps custom kilometre and explicitly labelled travel costs visible after server normalization', () => {
 expect(isTravelCost({cost_type:'desplazamiento',unit:'km'})).toBe(true);
 expect(isTravelCost({cost_type:'demo-km-audit',unit:'km',description:'Visita a cliente'})).toBe(true);
 expect(isTravelCost({cost_type:'salida',unit:'ud',description:'Desplazamiento zona 1'})).toBe(true);
 expect(isTravelCost({cost_type:'alquiler',unit:'ud',description:'Plataforma elevadora'})).toBe(false);
 expect(isTravelCost({cost_type:'km',unit:'km',deleted_at:'2026-10-26'})).toBe(false);
});
