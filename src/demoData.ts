export type Severity = 'ok' | 'info' | 'warn' | 'danger' | 'commercial' | 'maintenance' | 'muted';
export type ProfileId = 'sat' | 'comercial' | 'oficina' | 'gerencia' | 'tecnico';

export type TechnicianStage = 'downloaded' | 'traveling' | 'working' | 'review' | 'readyToSend' | 'sent';

export type Technician = {
  id: string;
  name: string;
  availability: string;
  currentWorkId?: string;
  eta: string;
  enabledFor: string;
  courses: { name: string; expires: string; days: number; affected: string }[];
  warning?: string;
};

export type Work = {
  id: string;
  caseId: string;
  partId: string;
  type: string;
  clientId: string;
  centerId: string;
  equipmentId: string;
  hour: string;
  technicianId?: string;
  material: string;
  access: string;
  priority: Severity;
  status: string;
  address: string;
  contact: string;
  fault: string;
  pendingInfo?: string;
  supplierId?: string;
  budgetId?: string;
  technicianStage?: TechnicianStage;
};

export type Client = { id: string; name: string; segment: string; contact: string };
export type Center = { id: string; clientId: string; name: string; address: string };
export type Equipment = { id: string; clientId: string; centerId: string; location: string; type: string; maker: string; model: string; serial: string; status: string; last: string; next: string };
export type Supplier = { id: string; name: string; contact: string };
export type Budget = { id: string; clientId: string; equipmentId?: string; amount: number; version: string; status: string; date: string; owner: string; sourceWorkId?: string };
export type AlertItem = { id: string; profiles: ProfileId[]; title: string; detail: string; severity: Severity; date: string; entity: string; status: string; route?: string };

export const clients: Client[] = [
  { id: 'cli-ares', name: 'Logística Ares SL', segment: 'Logística', contact: 'Sergio Mesa' },
  { id: 'cli-frio', name: 'Frío Norte Demo', segment: 'Alimentación', contact: 'Maite Robles' },
  { id: 'cli-orbita', name: 'Centro Órbita Ficticio', segment: 'Retail', contact: 'Pablo Ríos' },
  { id: 'cli-luma', name: 'Industrias Luma Test', segment: 'Industria', contact: 'Rita Sol' },
];

export const centers: Center[] = [
  { id: 'cen-ares-norte', clientId: 'cli-ares', name: 'Nave Norte', address: 'Polígono Beta 14' },
  { id: 'cen-ares-sur', clientId: 'cli-ares', name: 'Ampliación Sur', address: 'Polígono Beta 18' },
  { id: 'cen-frio-c2', clientId: 'cli-frio', name: 'Cámara 2', address: 'Av. Hielo 8' },
  { id: 'cen-frio-exp', clientId: 'cli-frio', name: 'Expediciones', address: 'Av. Hielo 8' },
  { id: 'cen-orbita-p1', clientId: 'cli-orbita', name: 'Parking P1', address: 'Calle Demo 12' },
  { id: 'cen-orbita-este', clientId: 'cli-orbita', name: 'Acceso Este', address: 'Calle Demo 12' },
  { id: 'cen-luma-n4', clientId: 'cli-luma', name: 'Nave 4', address: 'Camino Prueba 4' },
  { id: 'cen-luma-taller', clientId: 'cli-luma', name: 'Taller', address: 'Camino Prueba 4' },
];

export const suppliers: Supplier[] = [
  { id: 'sup-nord', name: 'Nordic Components Demo', contact: 'Entrega 24/48 h' },
  { id: 'sup-porta', name: 'PortaParts Ficticio', contact: 'Raúl Sanz' },
  { id: 'sup-hydro', name: 'HydroFake Service', contact: 'Lucía Mar' },
];

export const equipment: Equipment[] = [
  { id: 'EQ-SEC-001', clientId: 'cli-ares', centerId: 'cen-ares-norte', location: 'Muelle 1', type: 'Puerta seccional', maker: 'NovoDemo', model: 'SD-420', serial: 'ND-001-FIC', status: 'Operativa con aviso', last: '2026-06-24', next: '2026-09-24' },
  { id: 'EQ-PLA-002', clientId: 'cli-frio', centerId: 'cen-frio-exp', location: 'Muelle 3', type: 'Plataforma hidráulica', maker: 'HydroFake', model: 'HL-8', serial: 'HF-992', status: 'Pendiente reparación', last: '2026-06-29', next: '2026-07-12' },
  { id: 'EQ-COR-003', clientId: 'cli-luma', centerId: 'cen-luma-n4', location: 'Acceso camiones', type: 'Puerta corredera automática', maker: 'SlideTest', model: 'ST-900', serial: 'ST-003', status: 'Esperando material', last: '2026-06-21', next: '2026-07-05' },
  { id: 'EQ-RAP-004', clientId: 'cli-frio', centerId: 'cen-frio-c2', location: 'Paso frío', type: 'Puerta rápida enrollable', maker: 'RapidMock', model: 'RM-22', serial: 'RM-444', status: 'En revisión', last: '2026-06-15', next: '2026-06-30' },
  { id: 'EQ-BAR-007', clientId: 'cli-orbita', centerId: 'cen-orbita-p1', location: 'Entrada', type: 'Barrera', maker: 'BarrierLab', model: 'BL-4', serial: 'BL-707', status: 'Operativa', last: '2026-05-28', next: '2026-08-28' },
  { id: 'EQ-AUT-006', clientId: 'cli-orbita', centerId: 'cen-orbita-este', location: 'Recepción', type: 'Puerta automática cristal', maker: 'AutoGlass Demo', model: 'AG-2', serial: 'AG-006', status: 'Información pendiente', last: '2026-06-01', next: '2026-07-01' },
  { id: 'EQ-PLA-008', clientId: 'cli-frio', centerId: 'cen-frio-exp', location: 'Muelle 8', type: 'Plataforma hidráulica', maker: 'HydroFake', model: 'HL-12', serial: 'HF-120', status: 'Operativa', last: '2026-06-30', next: '2026-12-30' },
  { id: 'EQ-SEC-009', clientId: 'cli-luma', centerId: 'cen-luma-taller', location: 'Puerta 2', type: 'Puerta seccional', maker: 'NovoDemo', model: 'SD-360', serial: 'ND-009', status: 'Pendiente validación', last: '2026-06-30', next: '2026-10-01' },
  { id: 'EQ-RAP-010', clientId: 'cli-ares', centerId: 'cen-ares-norte', location: 'Paso producción', type: 'Puerta rápida enrollable', maker: 'RapidMock', model: 'RM-30', serial: 'RM-010', status: 'Incidencia crítica', last: '2026-04-11', next: '2026-07-11' },
  { id: 'EQ-BAR-011', clientId: 'cli-orbita', centerId: 'cen-orbita-p1', location: 'Salida oeste', type: 'Barrera', maker: 'BarrierLab', model: 'BL-6', serial: 'BL-611', status: 'Programada', last: '2026-06-10', next: '2026-07-10' },
];

export const technicians: Technician[] = [
  { id: 'tec-nora', name: 'Nora Vega', availability: 'Disponible 09:30', currentWorkId: 'TR-2401', eta: '10:45', enabledFor: 'Logística Ares', courses: [{ name: 'PRL metal', expires: '2026-08-02', days: 33, affected: 'Logística Ares' }, { name: 'Alturas', expires: '2027-01-18', days: 202, affected: 'Todos' }], warning: 'Reconocimiento médico vence en 18 días' },
  { id: 'tec-leo', name: 'Leo Martín', availability: 'En intervención', currentWorkId: 'TR-2402', eta: '12:15', enabledFor: 'Frío Norte', courses: [{ name: 'Frío industrial', expires: '2027-02-11', days: 226, affected: 'Frío Norte' }] },
  { id: 'tec-iris', name: 'Iris Soto', availability: 'En desplazamiento', currentWorkId: 'TR-2403', eta: '11:20', enabledFor: 'Centro Órbita', courses: [{ name: 'Plataformas', expires: '2026-11-04', days: 127, affected: 'Muelle y plataformas' }], warning: 'Falta autorización nocturna' },
  { id: 'tec-dani', name: 'Dani Ruiz', availability: 'Disponible', currentWorkId: 'TR-2405', eta: 'Ahora', enabledFor: 'Clientes estándar', courses: [{ name: 'PRL básico', expires: '2027-05-09', days: 313, affected: 'General' }] },
  { id: 'tec-mara', name: 'Mara Gil', availability: 'Pendiente material', currentWorkId: 'TR-2404', eta: '13:00', enabledFor: 'Industrias Luma', courses: [{ name: 'Carretilla', expires: '2026-07-12', days: 12, affected: 'Centros logísticos' }], warning: 'Curso carretilla caduca en 12 días' },
];

export const works: Work[] = [
  { id: 'TR-2401', caseId: 'EXP-2026-118', partId: 'PAR-8812', type: 'Avería urgente', clientId: 'cli-ares', centerId: 'cen-ares-norte', equipmentId: 'EQ-SEC-001', hour: '08:15', technicianId: 'tec-nora', material: 'Motor Nice X2 reservado', access: 'Garita avisada', priority: 'danger', status: 'en intervención', address: 'Polígono Beta 14', contact: 'Sergio Mesa 600 111 201', fault: 'La puerta se queda a media altura y salta térmico.', supplierId: 'sup-nord', technicianStage: 'working' },
  { id: 'TR-2402', caseId: 'EXP-2026-119', partId: 'PAR-8813', type: 'Preventivo', clientId: 'cli-frio', centerId: 'cen-frio-c2', equipmentId: 'EQ-RAP-004', hour: '09:00', technicianId: 'tec-leo', material: 'Kit bandas + tornillería', access: 'Permiso frío confirmado', priority: 'maintenance', status: 'programado', address: 'Av. Hielo 8', contact: 'Maite Robles 600 111 202', fault: 'Revisión trimestral y ajuste de lona.', supplierId: 'sup-porta', technicianStage: 'downloaded' },
  { id: 'TR-2403', caseId: 'EXP-2026-120', partId: 'PAR-8814', type: 'Inspección ITI', clientId: 'cli-orbita', centerId: 'cen-orbita-p1', equipmentId: 'EQ-BAR-007', hour: '10:30', technicianId: 'tec-iris', material: 'Sin material previsto', access: 'Mando en recepción', priority: 'info', status: 'en desplazamiento', address: 'Calle Demo 12', contact: 'Pablo Ríos 600 111 203', fault: 'Inspección visual por golpe en brazo.', technicianStage: 'traveling' },
  { id: 'TR-2404', caseId: 'EXP-2026-121', partId: 'PAR-8815', type: 'Correctivo', clientId: 'cli-luma', centerId: 'cen-luma-n4', equipmentId: 'EQ-COR-003', hour: '11:00', technicianId: 'tec-mara', material: 'Fotocélulas pendientes proveedor', access: 'Ubicación entrega sin confirmar', priority: 'warn', status: 'esperando material', address: 'Camino Prueba 4', contact: 'Rita Sol 600 111 204', fault: 'Fotocélulas fallan de forma intermitente.', pendingInfo: 'Confirmar recepción y franja de trabajo', supplierId: 'sup-porta', budgetId: 'PRE-3042', technicianStage: 'downloaded' },
  { id: 'TR-2405', caseId: 'EXP-2026-122', partId: 'PAR-8816', type: 'Visita comercial', clientId: 'cli-ares', centerId: 'cen-ares-sur', equipmentId: 'Nuevo hueco', hour: '12:30', technicianId: 'tec-dani', material: 'Medidor láser', access: 'Con cita', priority: 'commercial', status: 'programado', address: 'Polígono Beta 18', contact: 'Alicia Pont 600 111 205', fault: 'Toma de medidas para presupuesto.', budgetId: 'PRE-3041' },
  { id: 'TR-2406', caseId: 'EXP-2026-123', partId: 'PAR-8817', type: 'No terminado ayer', clientId: 'cli-frio', centerId: 'cen-frio-exp', equipmentId: 'EQ-PLA-002', hour: '13:30', technicianId: 'tec-nora', material: 'Latiguillo confirmado', access: 'Muelle libre desde 13:00', priority: 'warn', status: 'parcialmente preparado', address: 'Av. Hielo 8', contact: 'Maite Robles 600 111 202', fault: 'Plataforma baja con velocidad irregular.', supplierId: 'sup-hydro', technicianStage: 'review' },
  { id: 'TR-2407', caseId: 'EXP-2026-124', partId: 'PAR-8818', type: 'Mantenimiento', clientId: 'cli-orbita', centerId: 'cen-orbita-este', equipmentId: 'EQ-AUT-006', hour: '15:00', technicianId: 'tec-leo', material: 'Guías y lubricante', access: 'Tarjeta temporal', priority: 'maintenance', status: 'información pendiente', address: 'Calle Demo 12', contact: 'Pablo Ríos 600 111 203', fault: 'Pendiente confirmar horario de cierre.', pendingInfo: 'Horario de cierre y contacto de recepción' },
  { id: 'TR-2408', caseId: 'EXP-2026-125', partId: 'PAR-8819', type: 'Validación oficina', clientId: 'cli-luma', centerId: 'cen-luma-taller', equipmentId: 'EQ-SEC-009', hour: '16:00', technicianId: 'tec-mara', material: 'Usado: polea 120 mm', access: 'Completo', priority: 'ok', status: 'pendiente de validación', address: 'Camino Prueba 4', contact: 'Rita Sol 600 111 204', fault: 'Parte finalizado por técnico.', technicianStage: 'readyToSend' },
  { id: 'TR-2409', caseId: 'EXP-2026-126', partId: 'PAR-8820', type: 'Avería', clientId: 'cli-ares', centerId: 'cen-ares-norte', equipmentId: 'EQ-RAP-010', hour: '17:00', technicianId: 'tec-dani', material: 'Variador sin confirmar', access: 'Responsable ausente', priority: 'danger', status: 'información pendiente', address: 'Polígono Beta 14', contact: 'Sergio Mesa 600 111 201', fault: 'No abre, posible variador.', pendingInfo: 'Responsable de producción ausente', supplierId: 'sup-nord', budgetId: 'PRE-3043' },
  { id: 'TR-2410', caseId: 'EXP-2026-127', partId: 'PAR-8821', type: 'Preventivo', clientId: 'cli-frio', centerId: 'cen-frio-exp', equipmentId: 'EQ-PLA-008', hour: '18:00', technicianId: 'tec-iris', material: 'Sin material', access: 'Confirmado', priority: 'info', status: 'cerrado', address: 'Av. Hielo 8', contact: 'Maite Robles 600 111 202', fault: 'Preventivo anual completado.', technicianStage: 'sent' },
  { id: 'TR-2411', caseId: 'EXP-2026-128', partId: 'PAR-8822', type: 'Correctivo exterior', clientId: 'cli-orbita', centerId: 'cen-orbita-p1', equipmentId: 'EQ-BAR-011', hour: '19:00', technicianId: 'tec-nora', material: 'Brazo 4 m', access: 'Vigilancia pendiente', priority: 'warn', status: 'programado', address: 'Calle Demo 12', contact: 'Pablo Ríos 600 111 203', fault: 'Alerta meteorológica simulada por viento.', pendingInfo: 'Vigilancia debe emitir pase temporal' },
  { id: 'TR-2412', caseId: 'EXP-2026-129', partId: 'PAR-8823', type: 'Instalación', clientId: 'cli-luma', centerId: 'cen-luma-n4', equipmentId: 'EQ-SEC-012', hour: '20:00', technicianId: 'tec-leo', material: 'Kit completo en almacén', access: 'Obra con casco y chaleco', priority: 'info', status: 'finalizado por técnico', address: 'Camino Prueba 4', contact: 'Rita Sol 600 111 204', fault: 'Montaje inicial pendiente validación.' },
];

export const budgets: Budget[] = [
  { id: 'PRE-3041', clientId: 'cli-ares', amount: 14850, version: 'v2', status: 'enviado', date: '2026-06-26', owner: 'Laura Sánchez', sourceWorkId: 'TR-2405' },
  { id: 'PRE-3042', clientId: 'cli-luma', equipmentId: 'EQ-COR-003', amount: 1260, version: 'v1', status: 'pendiente valoración', date: '2026-06-29', owner: 'Laura Sánchez', sourceWorkId: 'TR-2404' },
  { id: 'PRE-3043', clientId: 'cli-ares', equipmentId: 'EQ-RAP-010', amount: 980, version: 'v1', status: 'aceptación parcial', date: '2026-06-30', owner: 'Laura Sánchez', sourceWorkId: 'TR-2409' },
  { id: 'PRE-3038', clientId: 'cli-orbita', equipmentId: 'EQ-BAR-011', amount: 2140, version: 'v3', status: 'aceptado', date: '2026-06-20', owner: 'Laura Sánchez' },
];

export const alerts: AlertItem[] = [
  { id: 'av-sat-1', profiles: ['sat'], title: 'Acceso pendiente', detail: 'Vigilancia no ha emitido pase para EQ-BAR-011', severity: 'danger', date: '2026-06-30', entity: 'TR-2411', status: 'pendiente', route: '/demo/sat/trabajos/TR-2411' },
  { id: 'av-sat-2', profiles: ['sat', 'oficina'], title: 'Material no confirmado', detail: 'Variador para EQ-RAP-010 sin fecha proveedor', severity: 'danger', date: '2026-06-30', entity: 'TR-2409', status: 'riesgo', route: '/demo/sat/trabajos/TR-2409' },
  { id: 'av-com-1', profiles: ['comercial'], title: 'Presupuesto sin respuesta', detail: 'PRE-3041 lleva 4 días sin contestación', severity: 'commercial', date: '2026-06-30', entity: 'PRE-3041', status: 'seguimiento' },
  { id: 'av-com-2', profiles: ['comercial', 'gerencia'], title: 'Contrato próximo a renovar', detail: 'Logística Ares vence en 35 días', severity: 'warn', date: '2026-07-05', entity: 'CON-ARES-24', status: 'próximo' },
  { id: 'av-ofi-1', profiles: ['oficina', 'gerencia'], title: 'Factura vencida', detail: 'FAC-2308 vencida hace 8 días', severity: 'danger', date: '2026-06-22', entity: 'FAC-2308', status: 'vencida' },
  { id: 'av-ofi-2', profiles: ['oficina'], title: 'PRL próxima a caducar', detail: 'Carretilla de Mara Gil caduca en 12 días', severity: 'warn', date: '2026-07-12', entity: 'tec-mara', status: 'pendiente renovación' },
  { id: 'av-ger-1', profiles: ['gerencia'], title: 'Desviación de costes', detail: 'TR-2401 supera previsión por cambio de motor', severity: 'warn', date: '2026-06-30', entity: 'TR-2401', status: 'monitorizar' },
  { id: 'av-tec-1', profiles: ['tecnico'], title: 'Mensaje de SAT', detail: 'Confirmar firma y fotografías antes de cerrar TR-2401', severity: 'info', date: '2026-06-30', entity: 'TR-2401', status: 'nuevo' },
  { id: 'av-tec-2', profiles: ['tecnico'], title: 'Requisito de acceso', detail: 'Registrar entrada y salida en garita', severity: 'warn', date: '2026-06-30', entity: 'cen-ares-norte', status: 'obligatorio' },
];

export const invoices = [
  { id: 'FAC-2308', clientId: 'cli-ares', due: '2026-06-22', amount: 4320, status: 'vencida' },
  { id: 'FAC-2311', clientId: 'cli-frio', due: '2026-07-08', amount: 1850, status: 'pendiente' },
  { id: 'FAC-2312', clientId: 'cli-luma', due: '2026-07-15', amount: 740, status: 'emitida' },
];

export const purchases = [
  { id: 'PED-1180', supplierId: 'sup-porta', date: '2026-06-30', confirmation: 'sin confirmar', affected: 'TR-2404, TR-2409' },
  { id: 'PED-1181', supplierId: 'sup-hydro', date: '2026-07-01', confirmation: 'entrega prevista', affected: 'TR-2406' },
  { id: 'PED-1182', supplierId: 'sup-nord', date: '2026-07-02', confirmation: 'confirmado', affected: 'TR-2401' },
];

export const contracts = [
  { id: 'CON-ARES-24', clientId: 'cli-ares', renewal: '2026-08-04', equipment: 18, status: 'renovación próxima' },
  { id: 'CON-FRIO-22', clientId: 'cli-frio', renewal: '2026-10-12', equipment: 11, status: 'vigente' },
  { id: 'CON-ORB-25', clientId: 'cli-orbita', renewal: '2026-07-28', equipment: 7, status: 'revisión comercial' },
];

export function clientName(id: string) { return clients.find((item) => item.id === id)?.name ?? id; }
export function centerName(id: string) { return centers.find((item) => item.id === id)?.name ?? id; }
export function technicianName(id?: string) { return technicians.find((item) => item.id === id)?.name ?? 'Sin asignar'; }
export function supplierName(id?: string) { return suppliers.find((item) => item.id === id)?.name ?? 'Sin proveedor'; }
export function equipmentName(id: string) { return equipment.find((item) => item.id === id)?.type ?? id; }
