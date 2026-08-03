import { describe, expect, it } from 'vitest';
import { buildTechnicalReference, publicErrorMessage } from './errorDiagnostics';

describe('error diagnostics', () => {
  it('crea referencias tecnicas DMP estables para copiar', () => {
    expect(buildTechnicalReference('DMP', 123456)).toMatch(/^DMP-/);
  });

  it('no muestra tokens o errores auth crudos al usuario', () => {
    expect(publicErrorMessage(new Error('JWT token expired abc.def.ghi'))).toBe('La sesión puede haber caducado. Vuelve a intentarlo o cierra sesión si el problema continúa.');
  });

  it('traduce fallos de red a mensaje comprensible', () => {
    expect(publicErrorMessage('Failed to fetch')).toBe('Hay un problema de conexión. Revisa la cobertura y vuelve a intentarlo.');
  });
});
