// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest';
import { findDemoTarget } from './DemoSpotlight';
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
