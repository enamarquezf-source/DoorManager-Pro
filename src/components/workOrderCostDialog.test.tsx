import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ catalog: [] as any[] }));
vi.mock('../query/useLoad', () => ({ useLoad: () => ({ data: state.catalog, loading: false, error: '', reload: vi.fn() }) }));
vi.mock('./FormPrimitives', async (importOriginal) => ({
  ...(await importOriginal<any>()),
  ModalShell: ({ title, children }: any) => createElement('section', { role: 'dialog' }, createElement('h3', {}, title), children),
}));
import { WorkOrderCostForm } from '../App';
afterEach(() => { state.catalog = []; });

it('labels a new travel entry as adding even when initial defaults exist', () => {
  const html = renderToStaticMarkup(createElement(WorkOrderCostForm, {
    workOrder: { id: 'work' }, initial: { cost_type: 'desplazamiento', quantity: 1, description: 'Desplazamiento' },
    onClose: vi.fn(), onSaved: vi.fn(),
  }));
  expect(html).toContain('<h3>Añadir recurso/coste</h3>');
  expect(html).not.toContain('Editar recurso/coste');
});

it('labels an existing record as editing', () => {
  const html = renderToStaticMarkup(createElement(WorkOrderCostForm, {
    workOrder: { id: 'work' }, initial: { id: 'cost', quantity: 1 }, onClose: vi.fn(), onSaved: vi.fn(),
  }));
  expect(html).toContain('<h3>Editar recurso/coste</h3>');
});

it('presents a period resource with a readable unit rather than internal billing modes', () => {
  state.catalog = [{ id: 'platform', name: 'PEMP', unit: 'period', billing_mode: 'period' }];
  const html = renderToStaticMarkup(createElement(WorkOrderCostForm, {
    workOrder: { id: 'work' }, initial: { concept_id: 'platform', quantity: 1 }, onClose: vi.fn(), onSaved: vi.fn(),
  }));
  expect(html).toContain('PEMP · periodo');
  expect(html).not.toContain('· period · period');
  expect(html).toContain('Indica la cantidad realmente realizada.');
});
