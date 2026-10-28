import type {DemoStep} from './model';
/** Completion follows user actions, never a timer or the existence of seeded rows. */
export function navigationCompletes(step:DemoStep,before:string,after:string) {
 if(before===after||step.goal||step.finale)return false;
 const name=step.title;
 if(name==='Un aviso, tres equipos'||name==='Tu jornada preparada')return /^\/app\/tecnico\/trabajo\//.test(after);
 if(name==='Consulta el aviso')return /[?&]vista=checks(?:&|$)/.test(after);
 if(name==='Revisión componente a componente')return /^\/app\/checks\/[^/?]+/.test(after);
 if(name==='De campo a Oficina'||name==='Recibe un trabajo revisado'||name==='Comprueba los conceptos')return /^\/app\/partes\/[^/?]+/.test(after);
 if(name==='Entiende el margen'||name==='Compara margen y costes')return /^\/app\/partes\/[^/?]+/.test(after);
 if(name==='Comprueba las existencias')return /^\/app\/modulos\/materiales\/[^/?]+/.test(after);
 if(name==='Explora una empresa con actividad')return /^\/app\/partes\/[^/?]+/.test(after);
 return false;
}
export function interactionCompletes(step:DemoStep,label:string) {
 if(step.goal||step.finale)return false;
 if(step.title==='Cobros a la vista'||step.title==='Comprueba los pendientes')return /^(Ver calendario|Con retraso|Vence hoy|Próximos 7 días)/i.test(label);
 if(step.title==='Analiza el tiempo')return /^(Últimos 3 meses|Año actual|Por empleado|Por empresa)/i.test(label);
 return false;
}
export function navigationMission(steps:DemoStep[],index:number,path:string,role:string) {
 // A deliberate sidebar navigation can move the instruction to that section.
 // It never marks skipped work as saved and never changes the visitor's role.
 return steps.findIndex((step,n)=>n>index&&!step.finale&&!step.role&&(!step.requiredRole||step.requiredRole===role)&&step.route.split('?')[0]===path.split('?')[0]&&step.route.split('?')[0]!==steps[index].route.split('?')[0]);
}
