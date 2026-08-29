import { describe, expect, it } from 'vitest';
import { collectionStatus } from '../shared/collectionStatus';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(process.cwd());
const moduleSource = readFileSync(resolve(root, 'src/modules/BillingModule.tsx'), 'utf8');
const serviceSource = readFileSync(resolve(root, 'src/services/billingService.ts'), 'utf8');

describe('collections UX and payment state', () => {
  const today = new Date(2026, 7, 30);

  it('labels pending, partial, paid, overdue and cancelled invoices', () => {
    expect(collectionStatus({ status: 'emitida', total_amount: 1000, paid_amount: 0 }, today)).toBe('Pendiente');
    expect(collectionStatus({ status: 'parcialmente_cobrada', total_amount: 1000, paid_amount: 400 }, today)).toBe('Parcialmente cobrada');
    expect(collectionStatus({ status: 'cobrada', total_amount: 1000, paid_amount: 1000 }, today)).toBe('Cobrada');
    expect(collectionStatus({ status: 'emitida', total_amount: 1000, paid_amount: 0, due_date: '2026-08-29' }, today)).toBe('Vencida');
    expect(collectionStatus({ status: 'cancelada', total_amount: 1000, paid_amount: 0 }, today)).toBe('Cancelada');
  });

  it('does not call overdue an invoice with no due date or no remaining balance', () => {
    expect(collectionStatus({ status: 'emitida', total_amount: 1000, paid_amount: 0 }, today)).not.toBe('Vencida');
    expect(collectionStatus({ status: 'cobrada', total_amount: 1000, paid_amount: 1000, due_date: '2026-01-01' }, today)).toBe('Cobrada');
  });

  it('exposes readable collection actions and payment audit context', () => {
    expect(moduleSource).toContain('Estado de cobro');
    expect(moduleSource).toContain('REGISTRAR COBRO');
    expect(moduleSource).toContain('Vence:');
    expect(moduleSource).toContain('collectionStatus(invoice)');
    expect(serviceSource).toContain('invoice_payments(*)');
  });
});
