import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const app = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');
const labels = readFileSync(new URL('../shared/labels.ts', import.meta.url), 'utf8');
const errors = readFileSync(new URL('../shared/errorMessages.ts', import.meta.url), 'utf8');
const userAccessPanel = readFileSync(new URL('../components/UserAccessPanel.tsx', import.meta.url), 'utf8');

describe('UI-SPANISH-001', () => {
  it('centralizes Spanish labels for purchase and stock statuses', () => {
    for (const value of ['draft: \'Borrador\'', 'ordered: \'Pedido\'', 'partially_received: \'Recibido parcialmente\'', 'received: \'Recibido\'', 'cancelled: \'Cancelado\'', 'confirmed: \'Confirmada\'', 'Devolucion: \'Devolución\'']) expect(labels).toContain(value);
    expect(app).toContain('displayStatus(value)');
  });

  it('renders one clear empty option and a Spanish purchase action', () => {
    expect(app).toContain('const explicitEmpty = options.find((option) => option.value === \'\')');
    expect(app).toContain('Selecciona un proveedor');
    expect(app).toContain('Sin almacén previsto');
    expect(app).toContain("title === 'Nuevo pedido de compra' ? 'Crear pedido'");
    expect(errors).toContain('purchase order');
    expect(`${app}\n${userAccessPanel}`).not.toMatch(/>\s*svg\s*</i);
  });

  it('maps known purchase errors to functional Spanish messages', () => {
    for (const value of ['El proveedor seleccionado no está disponible.', 'El almacén seleccionado no pertenece a la empresa.', 'No tienes permisos para crear pedidos de compra.', 'No tienes permisos para realizar esta operación sobre pedidos de compra.', 'No se ha podido completar la operación. Revisa los datos e inténtalo de nuevo.']) expect(errors).toContain(value);
    expect(app).not.toContain('create purchase order');
  });
});
