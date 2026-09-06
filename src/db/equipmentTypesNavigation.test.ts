import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const app = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');
const permissions = readFileSync(new URL('../auth/permissions.ts', import.meta.url), 'utf8');

describe('equipment types navigation', () => {
  it('dispatches the dynamic module route to the equipment type administration page', () => {
    expect(app).toContain("if (moduleId === 'tipos-equipo') return <EquipmentTypesPage />;");
    expect(app).toContain("path: '/app/modulos/tipos-equipo'");
    expect(app).toContain("path: '/app/avisos'");
    expect(app).not.toContain("id: 'tipos-equipo', label: 'Tipos de equipo', path: '/app/avisos'");
  });

  it('keeps the deep link permission separate from the alerts route', () => {
    expect(permissions).toContain("if (path.startsWith('/app/modulos/tipos-equipo')) return hasAny(profile, ['superadmin', 'SAT']);");
    expect(permissions).toContain("if (path.startsWith('/app/avisos')) return hasAny(profile, ['SAT', 'Gerencia', 'Comercial', 'Oficina', 'Tecnico']);");
  });
});
