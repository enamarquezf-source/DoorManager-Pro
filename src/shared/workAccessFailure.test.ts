import { expect, it } from 'vitest';
import { isWorkAccessFailure } from './workAccessFailure';

it('distinguishes an assignment refusal from a failed request', () => {
  expect(isWorkAccessFailure('No tienes permiso para acceder a este trabajo')).toBe(true);
  expect(isWorkAccessFailure('Parte bloqueado. Motivo: Finalizado técnicamente.')).toBe(true);
  expect(isWorkAccessFailure('Failed to fetch')).toBe(false);
  expect(isWorkAccessFailure('No se ha podido consultar el check. Inténtalo de nuevo.')).toBe(false);
});
