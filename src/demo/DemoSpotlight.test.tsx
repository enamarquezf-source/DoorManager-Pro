// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest';
import { findDemoTarget, isDemoTaskSurface } from './DemoSpotlight';
import type { DemoStep } from './model';

const step: DemoStep = { title: 'Cliente', text: '', route: '/app/clientes', target: '.page-head', goal: 'clients' };
afterEach(() => { document.body.innerHTML = ''; vi.restoreAllMocks(); });
function visible() {
  vi.spyOn(HTMLElement.prototype, 'getClientRects').mockReturnValue([{ width: 100, height: 44 }] as unknown as DOMRectList);
}
it('marks the actual creation action rather than the entire header or a disabled action', () => {
  document.body.innerHTML = '<main><header class="page-head">Clientes</header><button disabled>Crear cliente</button><button id="create">Crear cliente</button></main>';
  visible();
  expect(findDemoTarget(step)?.id).toBe('create');
});
it('removes the mark while a form is open and restores it after closing', () => {
  document.body.innerHTML = '<main><button id="create">Crear cliente</button></main><div role="dialog">Formulario</div>';
  visible();
  expect(findDemoTarget(step)).toBeNull();
  document.querySelector('[role="dialog"]')!.remove();
  expect(findDemoTarget(step)?.id).toBe('create');
});
it('does not point to hidden actions or to buttons in the tutorial', () => {
  document.body.innerHTML = '<main><header class="page-head">Clientes</header><button hidden>Crear cliente</button><aside class="demo-guide"><button>Crear cliente</button></aside></main>';
  visible();
  expect(findDemoTarget(step)?.className).toBe('page-head');
});
it('guides the visible required field and then the current form action',()=>{
 document.body.innerHTML='<main><button>Crear cliente</button></main><div role="dialog"><form><div hidden><input required value=""/></div><label>Razón social<input id="name" required/></label><button type="button">Usar datos de ejemplo</button><button id="next" type="submit">Siguiente</button></form></div>';
 visible();expect(findDemoTarget(step)?.id).toBe('name');
 (document.getElementById('name') as HTMLInputElement).value='Empresa ficticia';
 expect(findDemoTarget(step)?.id).toBe('next');
});
it('points the calendar instruction at its opening control instead of the whole hero',()=>{
 document.body.innerHTML='<main><header class="flow-hero">Cobros</header><button id="calendar">Ver calendario</button></main>';visible();
 expect(findDemoTarget({title:'Cobros a la vista',text:'',route:'/app/modulos/cobros',target:'.flow-hero'})?.id).toBe('calendar');
});
it('points at the pending block, then the finish action after every block is saved',()=>{
 document.body.innerHTML='<main><a href="/app/checks/check/bloque/one">Hoja Todo favorable</a><a id="pending" href="/app/checks/check/bloque/two">Motor Sin revisar</a><button id="finish">Finalizar check</button></main>';visible();
 const check={title:'Revisa los componentes',text:'',route:'/app/tecnico/trabajo/work',target:'.work-order-check-link',goal:'checks'};
 expect(findDemoTarget(check)?.id).toBe('pending');document.querySelector('#pending')!.textContent='Motor Todo favorable';expect(findDemoTarget(check)?.id).toBe('finish');
});
it('finds the actual SAT routing action and the receive control',()=>{
 document.body.innerHTML='<main><header class="page-head">Parte</header><button id="sat">Enviar a destino</button><button id="receive">Registrar recepción</button></main>';visible();
 expect(findDemoTarget({...step,goal:'sat_approved'})?.id).toBe('sat');expect(findDemoTarget({...step,goal:'purchase_receipts'})?.id).toBe('receive');
});
it('keeps the review cue in a check instead of taking the technician back to the work list',()=>{
 const check={...step,goal:'checks',route:'/app/tecnico/trabajo/work?vista=checks'};
 expect(isDemoTaskSurface(check,'/app/checks/check/bloque/zone')).toBe(true);
 expect(isDemoTaskSurface({...check,goal:'clients'},'/app/checks/check')).toBe(false);
});
it('guides the signer name rather than submitting an empty signature',()=>{
 document.body.innerHTML='<main><label>Nombre firmante<input id="signer"/></label><button>Guardar firma local</button></main>';visible();expect(findDemoTarget({...step,goal:'signatures'})?.id).toBe('signer');
});
