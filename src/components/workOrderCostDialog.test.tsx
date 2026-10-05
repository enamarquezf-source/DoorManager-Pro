import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';

vi.mock('../query/useLoad', () => ({ useLoad: () => ({ data: [], loading: false, error: '', reload: vi.fn() }) }));
vi.mock('./FormPrimitives', async (importOriginal) => ({
  ...(await importOriginal<any>()),
  ModalShell: ({ title, children }: any) => createElement('section', { role: 'dialog' }, createElement('h3', {}, title), children),
}));
import { WorkOrderCostForm } from '../App';

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
