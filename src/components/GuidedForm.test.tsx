// @vitest-environment happy-dom
import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FormStep, GuidedForm, collectFormSteps, guideModalChildren, readFormReview } from './GuidedForm';
import { groupEntityFields } from '../shared/formFieldGroups';
import { readFileSync } from 'node:fs';

let host: HTMLDivElement;
let root: Root;
beforeEach(() => { (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true; host = document.createElement('div'); document.body.append(host); root = createRoot(host); });
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.restoreAllMocks(); });
const submit = async () => { await act(async () => { host.querySelector('form')!.dispatchEvent(new Event('submit', {bubbles:true,cancelable:true})); }); };
const click = async (text: string) => { const button = Array.from(host.querySelectorAll('button')).find(item => item.textContent?.includes(text)); expect(button).toBeTruthy(); await act(async () => button!.click()); };
function Fixture({ onSave, locked = false }: {onSave: () => void; locked?: boolean}) {
  const [name, setName] = useState('');
  return <GuidedForm form={<form onSubmit={event => {event.preventDefault();onSave();}}><FormStep title="Cliente"><label>Nombre *<input name="name" value={name} onChange={event => setName(event.target.value)} required/></label></FormStep><FormStep title="Datos adicionales"><label>Importe<input name="amount" type="number" min="0" defaultValue="0"/></label><label>Documento<input name="file" type="file"/></label></FormStep><div className="modal-footer"><button type="button">Cancelar</button><button className="primary" disabled={locked}>Crear cliente</button></div></form>}/>;
}
async function render(onSave = vi.fn(), locked = false) { await act(async () => root.render(<Fixture onSave={onSave} locked={locked}/>)); return onSave; }
async function typeName(value = 'Cliente de prueba') {
  const input = host.querySelector<HTMLInputElement>('input[name="name"]')!;
  await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input,value); input.dispatchEvent(new Event('input', {bubbles:true})); });
}
describe('guided forms', () => {
  it('keeps primary actions readable in dialogs outside the application shell', () => {
    const style = document.createElement('style');
    style.textContent = readFileSync('src/styles.css','utf8') + readFileSync('src/operations-theme.css','utf8');
    document.head.append(style);
    try {
      host.innerHTML = '<div class="mini-modal"><div class="modal-panel"><form class="guided-form"><div class="modal-footer guided-footer"><button class="primary">Siguiente</button></div></form></div></div>';
      const button = host.querySelector('button')!;
      expect(getComputedStyle(button).color).toMatch(/^(#fff|#ffffff|rgb\(255, 255, 255\))$/);
      expect(getComputedStyle(button).backgroundColor).toMatch(/^(#173f47|rgb\(23, 63, 71\))$/);
      button.disabled = true;
      expect(getComputedStyle(button).color).toMatch(/^(#40585f|rgb\(64, 88, 95\))$/);
      expect(getComputedStyle(button).backgroundColor).toMatch(/^(#dce5e7|rgb\(220, 229, 231\))$/);
    } finally { style.remove(); host.innerHTML = ''; }
  });
  it('validates the active step and never saves while advancing', async () => {
    const onSave = await render(); await submit();
    expect(host.querySelector<HTMLElement>('[data-guided-step="0"]')!.hidden).toBe(false);
    expect(onSave).not.toHaveBeenCalled();
    await typeName(); await submit();
    expect(host.querySelector<HTMLElement>('[data-guided-step="1"]')!.hidden).toBe(false);
    expect(onSave).not.toHaveBeenCalled();
  });
  it('preserves input and file nodes across steps and reviews before saving', async () => {
    const onSave = await render(); await typeName(); await submit();
    const file = host.querySelector('input[name="file"]');
    await click('Anterior'); expect(host.querySelector<HTMLInputElement>('input[name="name"]')!.value).toBe('Cliente de prueba');
    await submit(); expect(host.querySelector('input[name="file"]')).toBe(file);
    await submit(); expect(host.querySelector('.guided-review')!.textContent).toContain('Cliente de prueba');
    expect(host.querySelector('.guided-review')!.textContent).toContain('0'); expect(onSave).not.toHaveBeenCalled();
    await submit(); expect(onSave).toHaveBeenCalledTimes(1);
  });
  it('returns to invalid earlier fields and prevents Enter bypassing a disabled final action', async () => {
    const onSave = await render(vi.fn(), true); await typeName(); await submit(); await submit(); await submit(); expect(onSave).not.toHaveBeenCalled();
    await act(async () => root.render(<Fixture onSave={onSave}/>));
    const name = host.querySelector<HTMLInputElement>('input[name="name"]')!; name.value = '';
    await submit(); expect(host.querySelector<HTMLElement>('[data-guided-step="0"]')!.hidden).toBe(false); expect(onSave).not.toHaveBeenCalled();
  });
  it('validates numeric limits in the current step', async () => {
    await render(); await typeName(); await submit();
    host.querySelector<HTMLInputElement>('input[name="amount"]')!.value = '-1'; await submit();
    expect(host.querySelector('.guided-review')).toBeNull();
  });
  it('uses visible select labels and omits passwords, empty fields and uncommitted drafts', () => {
    const form = document.createElement('form');
    form.innerHTML = '<div data-guided-step="0"><label>Cliente<select><option value="private-id" selected>Empresa visible</option></select></label><label>Clave<input type="password" value="secret"/></label><label>Vacío<input value=""/></label><div data-review="omit"><label>Borrador<input value="No incluido"/></label></div><label>Fecha<input type="date" value="2026-10-21"/></label></div>';
    expect(readFormReview(form)).toEqual([{label:'Cliente',value:'Empresa visible',step:0},{label:'Fecha',value:'21/10/2026',step:0}]);
  });
  it('keeps explicit and card steps and does not change confirmation dialogs or multi-submit forms', () => {
    expect(collectFormSteps(<><FormStep title="Datos"><input/></FormStep><section title="Stock">Stock</section></>).map(step => step.title)).toEqual(['Datos','Stock']);
    const form = <form onSubmit={()=>{}}><div className="modal-footer"><button>Aceptar</button><button>Otra operación</button></div></form>;
    expect((guideModalChildren(form,false) as any[])[0].type).toBe('form');
  });
  it('groups client fields exactly once and keeps dependent context together', () => {
    const keys = ['legal_name','trade_name','tax_id','status','address','city','province','postal_code','country','phone','email','notes'];
    const groups = groupEntityFields(keys.map(key=>[key,key]));
    expect(groups).toHaveLength(3); expect(groups.flatMap(group=>group.fields.map(([key])=>key)).sort()).toEqual([...keys].sort());
    expect(groupEntityFields([['client_id','Cliente'],['site_id','Centro']])).toHaveLength(1);
  });
});
