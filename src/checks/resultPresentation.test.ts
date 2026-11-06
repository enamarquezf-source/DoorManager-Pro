import { expect, it } from 'vitest';
import { checkResultLabel, checkResultTone } from './resultPresentation';

it('shows the saved critical severity even if the summary result says minor', () => {
  const label = checkResultLabel('Problema leve', [
    { result: 'Problema leve', severity: 'Leve' },
    { result: 'Problema leve', severity: 'Critica' },
  ]);
  expect(label).toBe('Problema crítico');
  expect(checkResultTone(label)).toBe('danger');
});

it('keeps minor problems distinct and ignores old severity on favorable sections', () => {
  const label = checkResultLabel('Problema leve', [{ result: 'Todo favorable', severity: 'Crítica' }]);
  expect(label).toBe('Problema leve');
  expect(checkResultTone(label)).toBe('warn');
  expect(checkResultTone('No favorable')).toBe('danger');
});
