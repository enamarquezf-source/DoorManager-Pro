import { expect, it } from 'vitest';
import { demoProjectUrl, isDemoProject, demoRoles, demoTourSteps, parseDemoSession, demoStepDone } from './model';
const session={id:'00000000-0000-4000-8000-000000000001',company_id:'00000000-0000-4000-8000-000000000002',profile_id:'00000000-0000-4000-8000-000000000003',role:'Tecnico',expires_at:new Date(Date.now()+60000).toISOString(),ended:false,cleanup_state:'pending',work_order_id:'00000000-0000-4000-8000-000000000004'};
it('enables the public flow only for the explicitly separate demo project',()=>{
  expect(isDemoProject(demoProjectUrl)).toBe(true);
  for(const url of [undefined,'https://production.supabase.co',`${demoProjectUrl}.evil.test`,`${demoProjectUrl}/extra`,`http://xlhzyhotzfflemjnqvqn.supabase.co`,`${demoProjectUrl}?project=demo`]) expect(isDemoProject(url)).toBe(false);
  expect(demoRoles.map(role=>role.id)).not.toContain('superadmin');
});
it('rejects malformed session metadata rather than navigating to arbitrary records',()=>{
  for(const value of [null,{...session,role:'superadmin'},{...session,work_order_id:'../../other'},{...session,expires_at:'never'}])expect(()=>parseDemoSession(value)).toThrow();
});
it('guides the technician through the actual assigned work and both work phases',()=>{
  const steps=demoTourSteps(parseDemoSession(session));
  expect(steps[0].route).toBe('/app/tecnico');
  expect(steps.slice(1).filter(step=>!step.role).every(step=>step.route.includes(session.work_order_id))).toBe(true);
  expect(steps.at(-1)?.role).toBe('SAT');
  expect(steps.some(step=>step.route.endsWith('?vista=checks'))).toBe(true);
  expect(steps.some(step=>step.route.endsWith('?vista=records'))).toBe(true);
});
it('tracks saved actions and connects the business roles without claiming a visit completes a task',()=>{
 const sat=demoTourSteps(parseDemoSession({...session,role:'SAT'}));
 expect(demoStepDone(sat[0],{clients:0})).toBe(false);
 expect(demoStepDone(sat[0],{clients:1})).toBe(true);
 expect(sat.some(step=>step.role==='Tecnico')).toBe(true);
 expect(sat.some(step=>step.role==='Oficina')).toBe(true);
 const office=demoTourSteps(parseDemoSession({...session,role:'Oficina'}));
 expect(office.some(step=>step.goal==='invoices')).toBe(true);
 expect(office.some(step=>step.goal==='payments')).toBe(true);
 expect(demoStepDone(office[0],{works:99})).toBe(false);
});
it('guides procurement from a new material through ordering, confirmed receipt and stock',()=>{
 const office=demoTourSteps(parseDemoSession({...session,role:'Oficina'}),'purchases');
 expect(office.map(step=>step.goal).filter(Boolean)).toEqual(['catalog_materials','suppliers','purchase_orders','ordered_purchases','purchase_receipts']);
 expect(office[0].route).toBe('/app/modulos/materiales');
 expect(office[1].route).toBe('/app/modulos/proveedores');
 expect(office[2].route).toBe('/app/modulos/compras');
 expect(office.at(-1)?.role).toBe('Tecnico');
 const sat=demoTourSteps(parseDemoSession({...session,role:'SAT'}),'purchases');
 expect(sat[0].role).toBe('Oficina');
  expect(sat[0].goal).not.toBe('catalog_materials');
 expect(demoTourSteps(parseDemoSession(session),'purchases')[0].goal).toBe('work_materials');
});
