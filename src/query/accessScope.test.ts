import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';
import type { Profile } from '../shared/types';
import { queryAccessScope } from './accessScope';

const office = { id: 'profile-office', auth_user_id: 'user-office', company_id: 'company', active: true, roles: ['Oficina'], permission_grants: [] } as unknown as Profile;
const technician = { ...office, id: 'profile-tech', auth_user_id: 'user-tech', roles: ['Tecnico'] } as Profile;

describe('authenticated query isolation', () => {
  it('cannot reuse office economics when another user opens the same resource', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
    const officeKey = ['legacy-load', 'part-detail', 'part', queryAccessScope(office, office.auth_user_id)];
    const technicianKey = ['legacy-load', 'part-detail', 'part', queryAccessScope(technician, technician.auth_user_id)];
    client.setQueryData(officeKey, { costs: 1234 });
    expect(client.getQueryData(technicianKey)).toBeUndefined();
    await client.fetchQuery({ queryKey: technicianKey, queryFn: async () => ({ title: 'Assigned part' }) });
    expect(client.getQueryData(technicianKey)).toEqual({ title: 'Assigned part' });
    client.clear();
  });

  it('invalidates cached access after a permission or role revocation', () => {
    const previous = queryAccessScope(office, office.auth_user_id);
    expect(queryAccessScope({ ...office, permission_grants: ['-billing.read'] }, office.auth_user_id)).not.toBe(previous);
    expect(queryAccessScope({ ...office, roles: ['Tecnico'] }, office.auth_user_id)).not.toBe(previous);
  });

  it('does not change cache identity just because role order changes', () => {
    expect(queryAccessScope({ ...office, roles: ['Oficina', 'Gerencia'] }, office.auth_user_id))
      .toBe(queryAccessScope({ ...office, roles: ['Gerencia', 'Oficina'] }, office.auth_user_id));
  });

  it('rejects disabled profiles, signed out sessions and mismatched identities', () => {
    expect(queryAccessScope({ ...office, active: false }, office.auth_user_id)).toBe('anonymous');
    expect(queryAccessScope(office, null)).toBe('anonymous');
    expect(queryAccessScope(office, technician.auth_user_id)).toBe('anonymous');
  });

  it('discarding the session cache prevents a late response from repopulating it', async () => {
    const client = new QueryClient();
    let finish!: (value: unknown) => void;
    const request = client.fetchQuery({ queryKey: ['session-data'], queryFn: () => new Promise((resolve) => { finish = resolve; }) }).catch(() => undefined);
    client.clear();
    finish({ private: 'old-session' });
    await request;
    expect(client.getQueryData(['session-data'])).toBeUndefined();
  });
});
