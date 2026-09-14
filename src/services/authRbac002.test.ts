import { beforeEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.fn();
const roleFilter = vi.fn();
const select = vi.fn(() => ({ in: roleFilter }));
const from = vi.fn(() => ({ select }));

vi.mock('../lib/supabase/client', () => ({
  supabase: { rpc, from },
}));

describe('AUTH-RBAC-002 canonical Supabase services', () => {
  beforeEach(() => {
    rpc.mockReset();
    from.mockClear();
    select.mockClear();
    roleFilter.mockReset();
  });

  it('loads users through the canonical list RPC', async () => {
    const users = [{ id: 'profile-1', first_name: 'Ana', primary_area: 'Oficina', active: true }];
    rpc.mockResolvedValueOnce({ data: users, error: null });
    roleFilter.mockResolvedValueOnce({ data: [{ profile_id: 'profile-1', roles: { name: 'Oficina' } }], error: null });
    const { superadminService } = await import('./superadminService');

    await expect(superadminService.users()).resolves.toEqual([{ ...users[0], profile_roles: [{ profile_id: 'profile-1', roles: { name: 'Oficina' } }] }]);
    expect(rpc).toHaveBeenCalledWith('dmp_admin_list_users');
    expect(from).toHaveBeenCalledWith('profile_roles');
    expect(select).toHaveBeenCalledWith('profile_id,roles!profile_roles_role_id_fkey(name)');
    expect(roleFilter).toHaveBeenCalledWith('profile_id', ['profile-1']);
  });

  it('loads user access through the canonical detail RPC', async () => {
    const access = { roles: ['Oficina'], permission_grants: [], module_visibility: [{ code: 'purchase_orders', visible: true }] };
    rpc.mockResolvedValueOnce({ data: access, error: null });
    const { accessService } = await import('./accessService');

    await expect(accessService.get('profile-1')).resolves.toEqual(access);
    expect(rpc).toHaveBeenCalledWith('dmp_admin_get_user_access', { p_profile_id: 'profile-1' });
  });

  it('updates user access with explicit positive and revoke operations', async () => {
    rpc.mockResolvedValueOnce({ data: { saved: true }, error: null });
    const { accessService } = await import('./accessService');
    const grants = [{ code: 'purchase_orders.create', granted: true }, { code: 'materials.create', granted: false }];
    const visibility = [{ code: 'purchase_orders', visible: false }];

    await expect(accessService.update('profile-1', null, grants, visibility)).resolves.toEqual({ saved: true });
    expect(rpc).toHaveBeenCalledWith('dmp_admin_update_user_access', {
      p_profile_id: 'profile-1', p_role_names: null, p_permission_grants: grants, p_module_visibility: visibility,
    });
  });

  it('uses functional Spanish messages while expectData logs technical details', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    rpc.mockResolvedValueOnce({ data: null, error: { code: '42804', message: 'structure of query does not match function result type' } });
    const { superadminService } = await import('./superadminService');
    await expect(superadminService.users()).rejects.toThrow('No se ha podido cargar la gestión de usuarios. Inténtalo de nuevo.');

    rpc.mockResolvedValueOnce({ data: null, error: { message: 'No API key found in request' } });
    const { accessService } = await import('./accessService');
    await expect(accessService.get('profile-1')).rejects.toThrow('No se han podido cargar los permisos y la visibilidad. Inténtalo de nuevo.');
    expect(log).toHaveBeenCalled();
    log.mockRestore();
  });
});
