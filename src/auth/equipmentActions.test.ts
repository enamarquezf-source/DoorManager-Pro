import { expect, it } from 'vitest';
import { canCreateEquipment, canEditEquipment } from './permissions';
import type { Profile, RoleName } from '../shared/types';

it.each<[RoleName, boolean, boolean]>([['superadmin', true, true], ['SAT', true, true], ['Gerencia', true, true], ['Oficina', false, true], ['Comercial', false, false], ['Tecnico', false, false]])('matches direct equipment write rights for %s', (role, create, edit) => {
  const profile = { active: true, roles: [role] } as Profile;
  expect(canCreateEquipment(profile)).toBe(create);
  expect(canEditEquipment(profile)).toBe(edit);
  expect(canCreateEquipment({ ...profile, active: false })).toBe(false);
  expect(canEditEquipment({ ...profile, deleted_at: '2026-11-04' })).toBe(false);
});
