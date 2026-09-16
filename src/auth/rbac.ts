import type { Profile, RoleName } from '../shared/types';

export const permissionLabels: Record<string, string> = {
  'purchase_orders.read': 'Ver pedidos de compra',
  'purchase_orders.create': 'Crear pedidos de compra',
  'purchase_orders.update': 'Editar pedidos de compra',
  'purchase_orders.submit': 'Emitir pedidos',
  'purchase_orders.cancel': 'Cancelar pedidos',
  'purchase_receipts.read': 'Ver recepciones',
  'purchase_receipts.create': 'Crear recepciones',
  'purchase_receipts.update': 'Editar borradores',
  'purchase_receipts.confirm': 'Confirmar recepciones',
  'purchase_receipts.cancel': 'Cancelar borradores',
  'supplier_invoices.read': 'Ver facturas de proveedor',
  'supplier_invoices.create': 'Crear facturas de proveedor',
  'supplier_invoices.update': 'Editar borradores de proveedor',
  'supplier_invoices.register': 'Registrar facturas de proveedor',
  'supplier_invoices.cancel': 'Cancelar facturas de proveedor',
  'supplier_payments.read': 'Ver pagos de proveedor',
  'supplier_payments.create': 'Registrar pagos de proveedor',
  'supplier_payments.reverse': 'Revertir pagos de proveedor',
  'treasury.read': 'Ver tesorería',
  'treasury.accounts.create': 'Crear cuentas de tesorería',
  'treasury.accounts.update': 'Editar cuentas de tesorería',
  'treasury.transactions.create': 'Registrar movimientos de tesorería',
  'treasury.transactions.reverse': 'Revertir movimientos de tesorería',
  'treasury.transfers.create': 'Transferir entre cuentas',
  'materials.read': 'Ver materiales',
  'materials.create': 'Crear materiales',
  'materials.update': 'Editar materiales',
  'stock.read': 'Ver stock',
  'stock.adjust': 'Ajustar stock',
  'suppliers.read': 'Ver proveedores',
  'suppliers.create': 'Crear proveedores',
  'suppliers.update': 'Editar proveedores',
  'users.read': 'Ver usuarios',
  'users.update': 'Gestionar usuarios',
  'users.deactivate': 'Activar o desactivar usuarios',
  'admin.users.read': 'Consultar usuarios y permisos',
  'admin.users.update': 'Administrar usuarios y permisos',
  'admin.roles.manage': 'Gestionar permisos',
  'admin.modules.manage': 'Configurar visibilidad del menú',
};

export const permissionCatalog = Object.keys(permissionLabels);

export const moduleLabels: Record<string, string> = {
  users: 'Usuarios y permisos', suppliers: 'Proveedores', purchase_orders: 'Compras', supplier_invoices: 'Facturas de proveedor',
  purchase_receipts: 'Recepciones', materials: 'Materiales', stock: 'Stock / Almacenes',
  sat: 'SAT', commercial: 'Comercial', documents: 'Documentos', billing: 'Facturación', admin: 'Administración',
};

const roleDefaults: Record<RoleName, string[]> = {
  superadmin: permissionCatalog,
  Gerencia: permissionCatalog.filter((key) => !key.startsWith('admin.') && !['users.create', 'users.deactivate'].includes(key)),
  Oficina: permissionCatalog.filter((key) => key.startsWith('purchase_') || key.startsWith('supplier_invoices.') || key.startsWith('supplier_payments.') || key.startsWith('treasury.') || key.startsWith('materials.') || key.startsWith('suppliers.') || key.startsWith('documents.') || key.startsWith('billing.') || key === 'stock.read'),
  SAT: ['suppliers.read', 'purchase_orders.read', 'purchase_receipts.read', 'materials.read', 'stock.read', 'sat.read', 'sat.write', 'sat.assign', 'sat.checks.manage', 'documents.read'],
  Comercial: ['suppliers.read', 'materials.read', 'commercial.read', 'commercial.write', 'documents.read', 'documents.create', 'documents.update'],
  Tecnico: ['materials.read', 'stock.read', 'sat.read', 'sat.write', 'sat.checks.manage', 'documents.read'],
};

export function rolePermissionKeys(role: string | null | undefined) {
  return roleDefaults[role as RoleName] ?? [];
}

export function effectivePermissionKeys(profile: (Profile & { permission_grants?: string[] }) | null | undefined) {
  if (!profile || !profile.active || profile.deleted_at) return new Set<string>();
  if (profile.primary_area === 'superadmin' || profile.roles?.includes('superadmin')) return new Set(permissionCatalog);
  const result = new Set([profile.primary_area, ...profile.roles].flatMap(rolePermissionKeys));
  result.forEach((key) => { if (profile.permission_grants?.includes(`-${key}`)) result.delete(key); });
  (profile.permission_grants ?? []).filter((key) => !key.startsWith('-')).forEach((key) => result.add(key));
  return result;
}

export function hasPermission(profile: (Profile & { permission_grants?: string[] }) | null | undefined, permission: string) {
  return effectivePermissionKeys(profile).has(permission);
}

export function moduleVisible(profile: (Profile & { visible_modules?: string[]; hidden_modules?: string[] }) | null | undefined, module: string) {
  if (!profile || !profile.active || profile.deleted_at) return false;
  if (profile.hidden_modules?.includes(module)) return false;
  if (profile.primary_area === 'superadmin' || profile.roles?.includes('superadmin')) return true;
  return !profile.visible_modules || profile.visible_modules.includes(module);
}
