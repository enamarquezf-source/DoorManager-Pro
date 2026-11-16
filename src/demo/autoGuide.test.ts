import {expect,it} from 'vitest';
import {navigationCompletes,navigationMission} from './autoGuide';
import {demoTourSteps,type DemoSession} from './model';
const session={id:'visitor',role:'Tecnico',work_order_id:'own'} as DemoSession;
it('follows opening the prepared work and a check without treating a page refresh as completion',()=>{
 const steps=demoTourSteps(session,'discover');
 expect(navigationCompletes(steps[0],'/app/tecnico','/app/tecnico/trabajo/own?vista=work')).toBe(true);
 expect(navigationCompletes(steps[0],'/app/tecnico','/app/tecnico')).toBe(false);
 expect(navigationCompletes(steps[1],'/app/tecnico/trabajo/own?vista=checks','/app/checks/check')).toBe(false);
 expect(steps[1].goal).toBe('checks');
});
it('requires saved evidence for write missions rather than clicks or visits',()=>{
 const step=demoTourSteps({...session,role:'SAT'},'connected')[0];
 expect(navigationCompletes(step,'/app/clientes','/app/clientes/client')).toBe(false);
});
it('keeps the collections step open while reading the calendar and follows deliberate section navigation',()=>{
 const steps=demoTourSteps(session,'discover');
 const collections=steps.findIndex(step=>step.title==='Cobros a la vista');
 expect(navigationMission(steps,0,'/app/modulos/cobros','Tecnico')).toBe(-1);
 expect(navigationMission(steps,0,'/app/modulos/cobros','Gerencia')).toBe(collections);
});
it('recognizes opening the received material',()=>{
 const steps=demoTourSteps({...session,role:'Gerencia'},'purchases');expect(navigationCompletes(steps[5],'/app/modulos/materiales','/app/modulos/materiales/rodillo')).toBe(true);
});

it('keeps the management overview on the current step while the visitor reads the work',()=>{
 const step=demoTourSteps({...session,role:'Gerencia'},'work')[0];
 expect(navigationCompletes(step,'/app/inicio','/app/partes/example')).toBe(false);
 expect(navigationCompletes(step,'/app/inicio','/app/partes')).toBe(false);
});
