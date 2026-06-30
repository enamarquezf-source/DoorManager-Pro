export type {
  AlertItem,
  Budget,
  Center,
  CheckBlockId,
  CheckProgress,
  CheckRecord,
  CheckResult,
  Client,
  DemoStore,
  DemoUser,
  Equipment,
  ProfileId,
  Severity,
  Supplier,
  Technician,
  TechnicianStage,
  Work,
  WorkRuntime,
} from './data/models';
import { initialDemoStore } from './data/initialData';

export const demoUsers = initialDemoStore.users;
export const technicians = initialDemoStore.technicians;
export const clients = initialDemoStore.clients;
export const centers = initialDemoStore.centers;
export const suppliers = initialDemoStore.suppliers;
export const equipment = initialDemoStore.equipment;
export const works = initialDemoStore.works;
export const parts = initialDemoStore.parts;
export const checks = initialDemoStore.checks;
export const budgets = initialDemoStore.budgets;
export const alerts = initialDemoStore.alerts;
export const opportunities = initialDemoStore.opportunities;
export const invoices = initialDemoStore.invoices;
export const purchases = initialDemoStore.purchases;
export const contracts = initialDemoStore.contracts;
export const documents = initialDemoStore.documents;

export function clientName(id: string) { return clients.find((item) => item.id === id)?.name ?? id; }
export function centerName(id: string) { return centers.find((item) => item.id === id)?.name ?? id; }
export function technicianName(id?: string) { return technicians.find((item) => item.id === id)?.name ?? 'Sin asignar'; }
export function supplierName(id?: string) { return suppliers.find((item) => item.id === id)?.name ?? 'Sin proveedor'; }
export function equipmentName(id: string) { return equipment.find((item) => item.id === id)?.type ?? id; }
