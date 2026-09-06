export const queryKeys = {
  company: (companyId: string | null | undefined) => ['company', companyId ?? 'none'] as const,
  equipmentTypes: (companyId: string | null | undefined, admin = false) => [...queryKeys.company(companyId), 'equipment-types', admin ? 'admin' : 'active'] as const,
  checkTemplates: (companyId: string | null | undefined, scope: 'active' | 'managed' = 'active') => [...queryKeys.company(companyId), 'check-templates', scope] as const,
  profiles: (companyId: string | null | undefined, role: 'technicians' | 'commercials' | 'active') => [...queryKeys.company(companyId), 'profiles', role] as const,
  materials: (companyId: string | null | undefined, search = '') => [...queryKeys.company(companyId), 'materials', search] as const,
  capabilities: (companyId: string | null | undefined) => [...queryKeys.company(companyId), 'capabilities'] as const,
};
