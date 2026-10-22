import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { canAccessRoute, canExecuteCheck, canViewCheck } from './permissions';
import type { Profile } from '../shared/types';

const actor = { id: 'manager', company_id: 'company', active: true, primary_area: 'Gerencia', roles: ['Gerencia'] } as Profile;
const app = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');

describe('acceso de Gerencia a partes y checks', () => {
  it('ofrece accesos directos en el menú de Gerencia', () => {
    const menu = app.split('const gerencia = [')[1].split('];')[0];
    for (const path of ['/app/partes', '/app/checks']) {
      expect(menu).toContain(`path: '${path}'`);
      expect(canAccessRoute(actor, path)).toBe(true);
    }
  });

  it('permite rellenar los bloques de su empresa y bloquea accesos ajenos', () => {
    expect(canViewCheck(actor, { company_id: 'company' })).toBe(true);
    expect(canExecuteCheck(actor)).toBe(true);
    expect(canViewCheck(actor, { company_id: 'other' })).toBe(false);
    expect(canViewCheck({ ...actor, active: false }, { company_id: 'company' })).toBe(false);
    const block = app.split('function CheckBlockPageV2')[1].split('function ')[0];
    expect(block).toContain('!canViewCheck(profile, data)');
    expect(block).not.toContain('if (!canExecuteCheck(profile)) return <AccessDenied />');
    expect(block).toContain('{canExecuteCheck(profile) && (');
  });
});
