// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest';
import { findDemoTarget, isDemoTaskSurface, checkTaskHint } from './DemoSpotlight';
import type { DemoStep } from './model';

const step: DemoStep = { title: 'Cliente', text: '', route: '/app/clientes', target: '.page-head', goal: 'clients' };
afterEach(() => { document.body.innerHTML = ''; vi.restoreAllMocks(); });
function visible() {
  vi.spyOn(HTMLElement.prototype, 'getClientRects').mockReturnValue([{ width: 100, height: 44 }] as unknown as DOMRectList);
}
it('points at the hours section until it opens, then at the add-hours button', () => {
  document.body.innerHTML = '<main><details><summary id="hours" data-demo-hours>Horas</summary><button id="add">Añadir horas</button></details></main>';
  visible();
  const mission = { ...step, goal: 'times', target: '[data-demo-hours]' };
  expect(findDemoTarget(mission)?.id).toBe('hours');
  document.querySelector('details')!.open = true;
  expect(findDemoTarget(mission)?.id).toBe('add');
});
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

it('opens the prepared office example rather than the pending commercial work or a heading',()=>{
 document.body.innerHTML='<main><header class="page-head">Partes</header><a href="/app/partes/pending">Empresa propia Pendiente</a><a id="ready" href="/app/partes/ready" aria-label="Cliente Cliente ejemplo Oficina 1 Centro industrial">PAR-Oficina-1</a></main>';visible();
 expect(findDemoTarget({title:'Recibe un trabajo revisado',text:'',route:'/app/partes',target:'.page-head'})?.id).toBe('ready');
});

it('distinguishes the field, records and close views within the same technician work',()=>{
 const records={...step,goal:'work_notes',route:'/app/tecnico/trabajo/work?vista=records'};
 expect(isDemoTaskSurface(records,'/app/tecnico/trabajo/work?vista=checks')).toBe(false);
 expect(isDemoTaskSurface(records,'/app/tecnico/trabajo/work?vista=work')).toBe(false);
 expect(isDemoTaskSurface(records,'/app/tecnico/trabajo/work?vista=records')).toBe(true);
 expect(isDemoTaskSurface({...records,goal:'signatures',route:'/app/tecnico/trabajo/work?vista=close'},'/app/tecnico/trabajo/work?vista=records')).toBe(false);
});

it('points to the signature disclosure when it is closed',()=>{
 document.body.innerHTML='<main><details><summary id="open-signature" data-demo-signature-toggle>Firma del cliente</summary></details></main>';
 visible();
 expect(findDemoTarget({...step,goal:'signatures'})?.id).toBe('open-signature');
});

it('guides the signature through name, drawing, consent and saving without choosing consent for the visitor',()=>{
 document.body.innerHTML='<main><label>Nombre firmante<input id="signer"/></label><canvas id="pad" class="signature-pad" data-has-ink="false"></canvas><label id="consent" class="signature-consent"><input type="checkbox"/>Confirmo mi firma</label><button id="save">Guardar firma</button></main>';visible();const signature={...step,goal:'signatures'};
 expect(findDemoTarget(signature)?.id).toBe('signer');(document.getElementById('signer') as HTMLInputElement).value='Visitante ficticio';expect(findDemoTarget(signature)?.id).toBe('pad');document.getElementById('pad')!.setAttribute('data-has-ink','true');expect(findDemoTarget(signature)?.id).toBe('consent');expect((document.querySelector('.signature-consent input') as HTMLInputElement).checked).toBe(false);(document.querySelector('.signature-consent input') as HTMLInputElement).checked=true;expect(findDemoTarget(signature)?.id).toBe('save');
});

it('guides an empty supplier invoice to its article instead of registration',()=>{
 document.body.innerHTML='<main><section data-invoice-has-lines="false"><button disabled>Registrar factura</button><label>Descripción *<input id="article" /></label></section></main>';visible();
 expect(findDemoTarget({title:'Registra la factura del proveedor',route:'/app/modulos/facturas-proveedor',target:'.page-head',text:''})?.id).toBe('article');
});
it('guides a registered supplier invoice to the source account before payment',()=>{
 document.body.innerHTML='<main><form class="supplier-payment-entry"><select id="account"><option value="">Selecciona cuenta</option></select><button>Registrar pago</button></form></main>';visible();
 expect(findDemoTarget({title:'Registra la factura del proveedor',route:'/app/modulos/facturas-proveedor',target:'.page-head',text:''})?.id).toBe('account');
});

it('marks the wizard next button after the required name is filled even when the name still has focus',()=>{
 document.body.innerHTML='<div role="dialog"><form><label>Nombre<input id="name" required value="Demo"/></label><button type="button" id="next">Siguiente</button><button type="submit" hidden>Guardar</button></form></div>';visible();document.getElementById('name')!.focus();
 expect(findDemoTarget(step)?.id).toBe('next');
 document.getElementById('next')!.textContent='Revisar datos';expect(findDemoTarget(step)?.id).toBe('next');
});

it('follows the component defect through selection, description, other results and confirmation',()=>{
 document.body.innerHTML='<main><div data-demo-check-results><button class="active">Problema leve</button></div><section class="check-affected-items" id="items"><label class="check-affected-choice"><input id="affected" type="checkbox"/></label><label class="check-item-note">Qué le ocurre<textarea id="note"></textarea></label><label id="remaining" class="check-remaining-choice"><input type="checkbox"/>He revisado los demás</label></section><button id="confirm">Confirmar selección</button></main>';visible();const mission={...step,goal:'checks'};
 expect(findDemoTarget(mission)?.id).toBe('items');expect(checkTaskHint(findDemoTarget(mission))).toContain('solo el componente');
 (document.getElementById('affected') as HTMLInputElement).checked=true;expect(findDemoTarget(mission)?.id).toBe('note');expect(checkTaskHint(findDemoTarget(mission))).toContain('qué le ocurre');
 (document.getElementById('note') as HTMLTextAreaElement).value='Defecto ficticio';expect(findDemoTarget(mission)?.id).toBe('remaining');expect((document.querySelector('#remaining input') as HTMLInputElement).checked).toBe(false);
 (document.querySelector('#remaining input') as HTMLInputElement).checked=true;expect(findDemoTarget(mission)?.id).toBe('confirm');
});
it('keeps the pointer on a pending check and matches the invoice record',()=>{
 document.body.innerHTML='<main><a class="work-order-check-link" id="done">Finalizado</a><a class="work-order-check-link" id="pending">Pendiente</a><button id="close">Finalizar parte</button></main>';
 visible();
 expect(findDemoTarget({...step,goal:'checks',target:'.work-order-check-link'})?.id).toBe('pending');
 expect(findDemoTarget({...step,goal:'completed_work'})?.id).toBe('close');
 expect(isDemoTaskSurface({...step,route:'/app/modulos/facturas-proveedor?id=own'},'/app/modulos/facturas-proveedor?id=other')).toBe(false);
});
it('points to saving a loaded cost study instead of continually refreshing it',()=>{
 document.body.innerHTML='<main><section class="cost-study-panel"><button>Nuevo estudio</button><input required value="Estudio de prueba"><button id="refresh">Actualizar datos</button><button id="save">Guardar estudio</button></section></main>';
 visible();
 const mission={...step,title:'Haz un estudio de costes',goal:undefined};
 expect(findDemoTarget(mission)?.id).toBe('save');
 document.querySelector('input')!.value='';
 expect(findDemoTarget(mission)).toBe(document.querySelector('input'));
 document.body.innerHTML='<main><section class="cost-study-panel"><button>Nuevo estudio</button><button id="analyse">Analizar periodo</button></section></main>';
 expect(findDemoTarget(mission)?.id).toBe('analyse');
});
