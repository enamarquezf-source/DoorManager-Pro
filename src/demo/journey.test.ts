import {expect,it} from 'vitest';
import {demoTourSteps,type DemoSession} from './model';
import {journeyProgressKey,observeMission} from './journey';
const session={id:'visitor',role:'SAT',work_order_id:'own-work'} as DemoSession;
it('keeps a continuous journey position when changing role but isolates visitors and tours',()=>{
 expect(journeyProgressKey(session,'connected')).toBe(journeyProgressKey({...session,role:'Oficina'},'connected'));
 expect(journeyProgressKey(session,'connected')).not.toBe(journeyProgressKey({...session,id:'other'},'connected'));
 expect(journeyProgressKey(session,'connected')).not.toBe(journeyProgressKey(session,'discover'));
 expect(journeyProgressKey(session,'work')).not.toBe(journeyProgressKey({...session,role:'Tecnico'},'work'));
});
it('does not count seeded records or merely opening a mission as an action saved',()=>{
 const baseline=observeMission(undefined,12);expect(baseline.saved).toBe(false);
 expect(observeMission(baseline,12).saved).toBe(false);
 const saved=observeMission(baseline,13);expect(saved.saved).toBe(true);
 expect(observeMission(saved,0).saved).toBe(true);
});
it('connects SAT, field work, SAT approval, invoicing and management using the selected work',()=>{
 const steps=demoTourSteps(session,'connected');
 expect(steps.map(s=>s.requiredRole).filter((role,index,all)=>role!==all[index-1])).toEqual(['SAT','Tecnico','SAT','Oficina','Gerencia']);
 expect(steps.find(s=>s.goal==='sat_approved')?.route).toBe('/app/partes/own-work');
 expect(steps.some(s=>s.goal==='completed_work')).toBe(true);
 expect(steps.some(s=>s.goal==='payments')).toBe(true);
 expect(steps.at(-1)?.finale).toBe(true);
 expect(demoTourSteps({...session,role:'Tecnico'},'connected').map(s=>s.title)).toEqual(steps.map(s=>s.title));
});
it('clearly identifies the prepared cases as examples rather than pretending they were executed',()=>{
 const steps=demoTourSteps(session,'discover');expect(steps).toHaveLength(6);
 expect(steps.every(step=>!step.goal)).toBe(true);
 expect(steps.find(s=>s.requiredRole==='Oficina')?.text).toContain('otro caso preparado');
});
