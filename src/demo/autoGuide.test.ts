import {expect,it} from 'vitest';
import {interactionCompletes,navigationCompletes,navigationMission} from './autoGuide';
import {demoTourSteps,type DemoSession} from './model';
const session={id:'visitor',role:'Tecnico',work_order_id:'own'} as DemoSession;
it('follows opening the prepared work and a check without treating a page refresh as completion',()=>{
 const steps=demoTourSteps(session,'discover');
 expect(navigationCompletes(steps[0],'/app/tecnico','/app/tecnico/trabajo/own?vista=work')).toBe(true);
 expect(navigationCompletes(steps[0],'/app/tecnico','/app/tecnico')).toBe(false);
 expect(navigationCompletes(steps[1],'/app/tecnico/trabajo/own?vista=checks','/app/checks/check')).toBe(true);
});
it('requires saved evidence for write missions rather than clicks or visits',()=>{
 const step=demoTourSteps({...session,role:'SAT'},'connected')[0];
 expect(navigationCompletes(step,'/app/clientes','/app/clientes/client')).toBe(false);
 expect(interactionCompletes(step,'Crear cliente')).toBe(false);
});
it('recognizes reading the calendar and the user intentionally navigating to another section',()=>{
 const steps=demoTourSteps(session,'discover');
 expect(interactionCompletes(steps[3],'Ver calendario')).toBe(true);
 expect(interactionCompletes(steps[3],'Actualizar')).toBe(false);
 expect(navigationMission(steps,0,'/app/modulos/cobros','Tecnico')).toBe(-1);
 expect(navigationMission(steps,0,'/app/modulos/cobros','Gerencia')).toBe(3);
});
it('recognizes opening the received material and never treats a save click as a saved study',()=>{
 const steps=demoTourSteps({...session,role:'Gerencia'},'purchases');expect(navigationCompletes(steps[5],'/app/modulos/materiales','/app/modulos/materiales/rodillo')).toBe(true);
 expect(interactionCompletes({title:'Haz un estudio de costes'} as any,'Guardar estudio')).toBe(false);
});
