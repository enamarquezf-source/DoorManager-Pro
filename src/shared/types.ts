export type RoleName = 'superadmin' | 'SAT' | 'Comercial' | 'Oficina' | 'Gerencia' | 'Tecnico';
export type Workspace = 'superadmin' | 'sat' | 'comercial' | 'oficina' | 'gerencia' | 'tecnico';
export type Severity = 'ok' | 'info' | 'warn' | 'danger' | 'commercial' | 'maintenance' | 'muted';

export type Profile = {
  id: string;
  company_id: string;
  auth_user_id: string | null;
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
  primary_area: RoleName;
  active: boolean;
  roles: RoleName[];
};

export type ClientRow = Record<string, any>;
export type SiteRow = Record<string, any>;
export type EquipmentRow = Record<string, any>;
export type CaseRow = Record<string, any>;
export type WorkOrderRow = Record<string, any>;
export type CheckRow = Record<string, any>;
export type AlertRow = Record<string, any>;
export type DocumentRow = Record<string, any>;
