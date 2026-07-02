import type { DemoStore } from './models';

const users = [
  { id: 'marta', name: 'Marta López', email: 'marta@doormanager.local', position: 'Coordinación SAT y comercial', primary: 'sat', roles: ['sat', 'comercial'] },
  { id: 'laura', name: 'Laura Sánchez', email: 'laura@doormanager.local', position: 'Gestión comercial', primary: 'comercial', roles: ['comercial'] },
  { id: 'elena', name: 'Elena Ruiz', email: 'elena@doormanager.local', position: 'Administración', primary: 'oficina', roles: ['oficina'] },
  { id: 'carlos', name: 'Carlos Navarro', email: 'carlos@doormanager.local', position: 'Dirección', primary: 'gerencia', roles: ['gerencia'] },
  { id: 'diego', name: 'Diego Martín', email: 'diego@doormanager.local', position: 'Técnico de campo', primary: 'tecnico', roles: ['tecnico'], technicianId: 'tec-diego' },
] as DemoStore['users'];

const clients = [
  { id: 'cli-ares', name: 'Logística Ares SL', segment: 'Logística', contact: 'Sergio Mesa' },
  { id: 'cli-frio', name: 'Frío Norte SL', segment: 'Alimentación', contact: 'Maite Robles' },
  { id: 'cli-luma', name: 'Industrias Luma', segment: 'Industria', contact: 'Rita Sol' },
  { id: 'cli-orbita', name: 'Centro Órbita', segment: 'Retail', contact: 'Pablo Ríos' },
  { id: 'cli-delta', name: 'Plataforma Delta', segment: 'Distribución', contact: 'Alicia Pont' },
] as DemoStore['clients'];

const centers = [
  { id: 'cen-ares-norte', clientId: 'cli-ares', name: 'Nave Norte', address: 'Polígono Beta 14' },
  { id: 'cen-ares-exp', clientId: 'cli-ares', name: 'Expediciones', address: 'Polígono Beta 16' },
  { id: 'cen-frio-c2', clientId: 'cli-frio', name: 'Cámara 2', address: 'Av. Hielo 8' },
  { id: 'cen-frio-exp', clientId: 'cli-frio', name: 'Expediciones', address: 'Av. Hielo 8' },
  { id: 'cen-luma-n4', clientId: 'cli-luma', name: 'Nave 4', address: 'Camino Prueba 4' },
  { id: 'cen-luma-taller', clientId: 'cli-luma', name: 'Taller', address: 'Camino Prueba 4' },
  { id: 'cen-orbita-p1', clientId: 'cli-orbita', name: 'Parking P1', address: 'Calle Roble 12' },
  { id: 'cen-orbita-este', clientId: 'cli-orbita', name: 'Acceso Este', address: 'Calle Roble 12' },
  { id: 'cen-delta-carga', clientId: 'cli-delta', name: 'Muelles Delta', address: 'Ronda Ficticia 22' },
] as DemoStore['centers'];

const documents = [
  { id: 'DOC-SEC-001', title: 'Manual instalación SD-420', type: 'manual', scope: 'Modelo SD-420', maker: 'NovoDoor', model: 'SD-420', equipmentId: 'EQ-SEC-001', family: 'Puerta seccional industrial' },
  { id: 'DOC-SEC-002', title: 'Esquema eléctrico DM-CTRL', type: 'esquema eléctrico', scope: 'Cuadro de maniobra DM-CTRL', controlPanel: 'DM-CTRL', family: 'Cuadros de maniobra' },
  { id: 'DOC-SEC-003', title: 'Despiece hoja industrial', type: 'despiece', scope: 'Puerta seccional industrial', family: 'Puerta seccional industrial' },
  { id: 'DOC-CE-001', title: 'Declaración CE NovoDoor', type: 'declaración CE', scope: 'Marca NovoDoor', maker: 'NovoDoor' },
  { id: 'DOC-INT-001', title: 'Procedimiento interno SAT-SEC', type: 'procedimiento interno', scope: 'Cliente Logística Ares', clientId: 'cli-ares' },
  { id: 'DOC-MAN-001', title: 'Mantenimiento trimestral puertas rápidas', type: 'mantenimiento', scope: 'Familia puertas rápidas', family: 'Puerta rápida' },
  { id: 'DOC-DES-001', title: 'Desbloqueo motor Nice X2', type: 'desbloqueo', scope: 'Motor Nice X2', motor: 'Nice X2', equipmentId: 'EQ-SEC-001' },
] as DemoStore['documents'];

const equipment = [
  { id: 'EQ-SEC-001', code: 'EQ-SEC-001', clientId: 'cli-ares', centerId: 'cen-ares-norte', location: 'Muelle 1', type: 'Puerta seccional industrial', maker: 'NovoDoor', model: 'SD-420', serial: 'ND-001-FIC', status: 'Operativa con aviso', installedAt: '2022-03-14', last: '2026-06-24', next: '2026-09-24', documentIds: ['DOC-SEC-001', 'DOC-SEC-002', 'DOC-SEC-003', 'DOC-DES-001'], history: ['2026-06-24 Ajuste de guías', '2026-06-30 Avería por térmico'] },
  { id: 'EQ-RAP-010', code: 'EQ-RAP-010', clientId: 'cli-ares', centerId: 'cen-ares-exp', location: 'Paso producción', type: 'Puerta rápida', maker: 'RapidMock', model: 'RM-30', serial: 'RM-010', status: 'Incidencia crítica', installedAt: '2021-11-09', last: '2026-04-11', next: '2026-07-11', documentIds: ['DOC-MAN-001'], history: ['2026-04-11 Preventivo', '2026-06-30 Variador pendiente'] },
  { id: 'EQ-PLA-002', code: 'EQ-PLA-002', clientId: 'cli-frio', centerId: 'cen-frio-exp', location: 'Muelle 3', type: 'Muelle de carga', maker: 'HydroFake', model: 'HL-8', serial: 'HF-992', status: 'Pendiente reparación', installedAt: '2020-01-20', last: '2026-06-29', next: '2026-07-12', documentIds: [], history: ['2026-06-29 Revisión hidráulica incompleta'] },
  { id: 'EQ-RAP-004', code: 'EQ-RAP-004', clientId: 'cli-frio', centerId: 'cen-frio-c2', location: 'Paso frío', type: 'Puerta rápida', maker: 'RapidMock', model: 'RM-22', serial: 'RM-444', status: 'En revisión', installedAt: '2023-02-02', last: '2026-06-15', next: '2026-06-30', documentIds: ['DOC-MAN-001'], history: ['2026-06-15 Ajuste lona'] },
  { id: 'EQ-COR-003', code: 'EQ-COR-003', clientId: 'cli-luma', centerId: 'cen-luma-n4', location: 'Acceso camiones', type: 'Cancela corredera automática', maker: 'SlideTest', model: 'ST-900', serial: 'ST-003', status: 'Esperando material', installedAt: '2019-09-10', last: '2026-06-21', next: '2026-07-05', documentIds: [], history: ['2026-06-21 Deficiencia fotocélulas'] },
  { id: 'EQ-SEC-009', code: 'EQ-SEC-009', clientId: 'cli-luma', centerId: 'cen-luma-taller', location: 'Puerta 2', type: 'Puerta seccional industrial', maker: 'NovoDoor', model: 'SD-360', serial: 'ND-009', status: 'Pendiente validación', installedAt: '2024-05-19', last: '2026-06-30', next: '2026-10-01', documentIds: ['DOC-SEC-003', 'DOC-CE-001'], history: ['2026-06-30 Intervención finalizada'] },
  { id: 'EQ-BAR-007', code: 'EQ-BAR-007', clientId: 'cli-orbita', centerId: 'cen-orbita-p1', location: 'Entrada', type: 'Barrera', maker: 'BarrierLab', model: 'BL-4', serial: 'BL-707', status: 'Operativa', installedAt: '2022-07-01', last: '2026-05-28', next: '2026-08-28', documentIds: [], history: ['2026-05-28 Preventivo'] },
  { id: 'EQ-AUT-006', code: 'EQ-AUT-006', clientId: 'cli-orbita', centerId: 'cen-orbita-este', location: 'Recepción', type: 'Puerta automática', maker: 'AutoGlass', model: 'AG-2', serial: 'AG-006', status: 'Información pendiente', installedAt: '2023-08-12', last: '2026-06-01', next: '2026-07-01', documentIds: [], history: ['2026-06-01 Mantenimiento'] },
  { id: 'EQ-CUA-013', code: 'EQ-CUA-013', clientId: 'cli-delta', centerId: 'cen-delta-carga', location: 'Sala técnica', type: 'Cuadro de maniobra', maker: 'ControlDoor', model: 'DM-CTRL', serial: 'CTRL-013', status: 'Programada', installedAt: '2025-03-03', last: '2026-06-10', next: '2026-07-10', documentIds: ['DOC-SEC-002'], history: ['2026-06-10 Revisión visual'] },
] as DemoStore['equipment'];

const technicians = [
  { id: 'tec-diego', name: 'Diego Martín', availability: 'Disponible 08:00', currentWorkId: 'TR-2401', eta: '10:10', enabledFor: 'Puertas industriales', courses: [{ name: 'PRL metal', expires: '2026-11-02', days: 124, affected: 'Todos' }] },
  { id: 'tec-nora', name: 'Nora Vega', availability: 'Disponible 09:30', currentWorkId: 'TR-2406', eta: '10:45', enabledFor: 'Logística Ares', courses: [{ name: 'PRL metal', expires: '2026-08-02', days: 33, affected: 'Logística Ares' }], warning: 'Reconocimiento médico vence en 18 días' },
  { id: 'tec-leo', name: 'Leo Martín', availability: 'En intervención', currentWorkId: 'TR-2402', eta: '12:15', enabledFor: 'Frío Norte', courses: [{ name: 'Frío industrial', expires: '2027-02-11', days: 226, affected: 'Frío Norte' }] },
  { id: 'tec-iris', name: 'Iris Soto', availability: 'En desplazamiento', currentWorkId: 'TR-2403', eta: '11:20', enabledFor: 'Centro Órbita', courses: [{ name: 'Plataformas', expires: '2026-11-04', days: 127, affected: 'Muelles' }] },
  { id: 'tec-dani', name: 'Dani Ruiz', availability: 'Disponible', currentWorkId: 'TR-2405', eta: 'Ahora', enabledFor: 'Clientes estándar', courses: [{ name: 'PRL básico', expires: '2027-05-09', days: 313, affected: 'General' }] },
  { id: 'tec-mara', name: 'Mara Gil', availability: 'Pendiente material', currentWorkId: 'TR-2404', eta: '13:00', enabledFor: 'Industrias Luma', courses: [{ name: 'Carretilla', expires: '2026-07-12', days: 12, affected: 'Centros logísticos' }], warning: 'Curso carretilla caduca en 12 días' },
] as DemoStore['technicians'];

const suppliers = [
  { id: 'sup-nord', name: 'Nordic Components', contact: 'Entrega 24/48 h' },
  { id: 'sup-porta', name: 'PortaParts Ficticio', contact: 'Raúl Sanz' },
  { id: 'sup-hydro', name: 'HydroFake Service', contact: 'Lucía Mar' },
] as DemoStore['suppliers'];

const works = [
  { id: 'TR-2401', caseId: 'EXP-2026-118', partId: 'PAR-8812', type: 'Avería urgente', clientId: 'cli-ares', centerId: 'cen-ares-norte', equipmentId: 'EQ-SEC-001', date: '2026-07-01', hour: '08:15', technicianId: 'tec-diego', material: 'Motor Nice X2 reservado', access: 'Garita avisada', priority: 'danger', status: 'En intervención', address: 'Polígono Beta 14', contact: 'Sergio Mesa 600 111 201', fault: 'La puerta se queda a media altura y salta térmico.', supplierId: 'sup-nord', technicianStage: 'working', budgetId: 'PRE-3044', history: ['Trabajo descargado', 'En desplazamiento', 'En intervención'] },
  { id: 'TR-2402', caseId: 'EXP-2026-119', partId: 'PAR-8813', type: 'Preventivo', clientId: 'cli-frio', centerId: 'cen-frio-c2', equipmentId: 'EQ-RAP-004', date: '2026-07-01', hour: '09:00', technicianId: 'tec-leo', material: 'Kit bandas + tornillería', access: 'Permiso frío confirmado', priority: 'maintenance', status: 'Trabajo descargado', address: 'Av. Hielo 8', contact: 'Maite Robles 600 111 202', fault: 'Revisión trimestral y ajuste de lona.', supplierId: 'sup-porta', technicianStage: 'downloaded', history: ['Trabajo descargado'] },
  { id: 'TR-2403', caseId: 'EXP-2026-120', partId: 'PAR-8814', type: 'Inspección', clientId: 'cli-orbita', centerId: 'cen-orbita-p1', equipmentId: 'EQ-BAR-007', date: '2026-07-01', hour: '10:30', technicianId: 'tec-iris', material: 'Sin material previsto', access: 'Mando en recepción', priority: 'info', status: 'En desplazamiento', address: 'Calle Roble 12', contact: 'Pablo Ríos 600 111 203', fault: 'Inspección visual por golpe en brazo.', technicianStage: 'traveling', history: ['Trabajo descargado', 'En desplazamiento'] },
  { id: 'TR-2404', caseId: 'EXP-2026-121', partId: 'PAR-8815', type: 'Correctivo', clientId: 'cli-luma', centerId: 'cen-luma-n4', equipmentId: 'EQ-COR-003', date: '2026-07-01', hour: '11:00', technicianId: 'tec-mara', material: 'Fotocélulas pendientes proveedor', access: 'Ubicación entrega sin confirmar', priority: 'warn', status: 'Pendiente', address: 'Camino Prueba 4', contact: 'Rita Sol 600 111 204', fault: 'Fotocélulas fallan de forma intermitente.', pendingInfo: 'Confirmar recepción y franja de trabajo', supplierId: 'sup-porta', budgetId: 'PRE-3042', technicianStage: 'downloaded', history: ['Pendiente de material'] },
  { id: 'TR-2405', caseId: 'EXP-2026-122', partId: 'PAR-8816', type: 'Visita comercial', clientId: 'cli-ares', centerId: 'cen-ares-exp', equipmentId: 'EQ-RAP-010', date: '2026-07-01', hour: '12:30', technicianId: 'tec-dani', material: 'Medidor láser', access: 'Con cita', priority: 'commercial', status: 'Pendiente', address: 'Polígono Beta 16', contact: 'Alicia Pont 600 111 205', fault: 'Toma de medidas para presupuesto.', budgetId: 'PRE-3041', history: ['Visita planificada'] },
  { id: 'TR-2406', caseId: 'EXP-2026-123', partId: 'PAR-8817', type: 'Trabajo no terminado', clientId: 'cli-frio', centerId: 'cen-frio-exp', equipmentId: 'EQ-PLA-002', date: '2026-07-01', hour: '13:30', technicianId: 'tec-nora', material: 'Latiguillo confirmado', access: 'Muelle libre desde 13:00', priority: 'warn', status: 'Finalizado técnicamente', address: 'Av. Hielo 8', contact: 'Maite Robles 600 111 202', fault: 'Plataforma baja con velocidad irregular.', supplierId: 'sup-hydro', technicianStage: 'review', history: ['Trabajo descargado', 'En intervención', 'Finalizado técnicamente'] },
  { id: 'TR-2408', caseId: 'EXP-2026-125', partId: 'PAR-8819', type: 'Mantenimiento', clientId: 'cli-luma', centerId: 'cen-luma-taller', equipmentId: 'EQ-SEC-009', date: '2026-06-30', hour: '16:00', technicianId: 'tec-mara', material: 'Usado: polea 120 mm', access: 'Completo', priority: 'ok', status: 'Pendiente de envío', address: 'Camino Prueba 4', contact: 'Rita Sol 600 111 204', fault: 'Parte finalizado por técnico.', technicianStage: 'readyToSend', history: ['Finalizado técnicamente', 'Pendiente de envío'] },
  { id: 'TR-2409', caseId: 'EXP-2026-126', partId: 'PAR-8820', type: 'Avería', clientId: 'cli-ares', centerId: 'cen-ares-norte', equipmentId: 'EQ-RAP-010', date: '2026-07-01', hour: '17:00', technicianId: 'tec-dani', material: 'Variador sin confirmar', access: 'Responsable ausente', priority: 'danger', status: 'Devolución solicitada', address: 'Polígono Beta 14', contact: 'Sergio Mesa 600 111 201', fault: 'No abre, posible variador.', pendingInfo: 'Responsable ausente', supplierId: 'sup-nord', budgetId: 'PRE-3043', history: ['Enviado', 'Devolución solicitada por técnico'] },
  { id: 'TR-2410', caseId: 'EXP-2026-127', partId: 'PAR-8821', type: 'Preventivo', clientId: 'cli-frio', centerId: 'cen-frio-exp', equipmentId: 'EQ-PLA-002', date: '2026-06-30', hour: '18:00', technicianId: 'tec-iris', material: 'Sin material', access: 'Confirmado', priority: 'info', status: 'Enviado', address: 'Av. Hielo 8', contact: 'Maite Robles 600 111 202', fault: 'Preventivo anual completado.', technicianStage: 'sent', history: ['Enviado'] },
  { id: 'TR-2411', caseId: 'EXP-2026-128', partId: 'PAR-8822', type: 'Correctivo exterior', clientId: 'cli-orbita', centerId: 'cen-orbita-p1', equipmentId: 'EQ-BAR-007', date: '2026-07-01', hour: '19:00', technicianId: 'tec-diego', material: 'Brazo 4 m', access: 'Vigilancia pendiente', priority: 'warn', status: 'Trabajo descargado', address: 'Calle Roble 12', contact: 'Pablo Ríos 600 111 203', fault: 'Alerta meteorológica simulada por viento.', pendingInfo: 'Vigilancia debe emitir pase temporal', technicianStage: 'downloaded', history: ['Trabajo descargado'] },
] as DemoStore['works'];

const parts = works.map((work) => ({ id: work.partId, workId: work.id, clientId: work.clientId, centerId: work.centerId, equipmentId: work.equipmentId, title: work.type, description: work.fault, status: work.status, createdAt: work.date, updatedAt: work.date })) as DemoStore['parts'];

const checks = [
  { id: 'CHK-PAR-8812', workId: 'TR-2401', partId: 'PAR-8812', equipmentId: 'EQ-SEC-001', technician: 'Diego Martín', date: '2026-07-01 09:10', progress: 'En curso', result: 'Borrador', blocks: { hoja: 'Todo favorable', guias: 'Problema leve', muelles: 'Sin revisar', automatizacion: 'No favorable', estructura: 'Todo favorable', funcionamiento: 'Sin revisar' }, deficiency: 'Cuadro dispara térmico y requiere valoración comercial' },
  { id: 'CHK-PAR-8817', workId: 'TR-2406', partId: 'PAR-8817', equipmentId: 'EQ-PLA-002', technician: 'Nora Vega', date: '2026-06-30 18:10', progress: 'Realizado', result: 'Favorable tras intervención', completed: true, blocks: { hoja: 'No aplicable', guias: 'No aplicable', muelles: 'No aplicable', automatizacion: 'Favorable tras intervención', estructura: 'Todo favorable', funcionamiento: 'Favorable tras intervención' } },
  { id: 'CHK-PAR-8820', workId: 'TR-2409', partId: 'PAR-8820', equipmentId: 'EQ-RAP-010', technician: 'Dani Ruiz', date: '2026-06-30 17:30', progress: 'Realizado', result: 'No favorable', completed: true, blocks: { hoja: 'Problema leve', guias: 'Todo favorable', muelles: 'No aplicable', automatizacion: 'No favorable', estructura: 'Todo favorable', funcionamiento: 'No favorable' }, deficiency: 'Variador defectuoso, presupuesto requerido', opportunityId: 'OPO-9001' },
] as DemoStore['checks'];

const opportunities = [
  { id: 'OPO-9001', origin: 'Deficiencia de check', partId: 'PAR-8820', workId: 'TR-2409', equipmentId: 'EQ-RAP-010', deficiency: 'Variador defectuoso', clientId: 'cli-ares', owner: 'Laura Sánchez', status: 'Abierta', budgetId: 'PRE-3043' },
  { id: 'OPO-9002', origin: 'Visita comercial', partId: 'PAR-8816', workId: 'TR-2405', equipmentId: 'EQ-RAP-010', deficiency: 'Ampliación de acceso', clientId: 'cli-ares', owner: 'Laura Sánchez', status: 'Seguimiento', budgetId: 'PRE-3041' },
] as DemoStore['opportunities'];

const budgets = [
  { id: 'PRE-3041', clientId: 'cli-ares', equipmentId: 'EQ-RAP-010', amount: 14850, version: 'v2', status: 'enviado', date: '2026-06-26', owner: 'Laura Sánchez', sourceWorkId: 'TR-2405', opportunityId: 'OPO-9002' },
  { id: 'PRE-3042', clientId: 'cli-luma', equipmentId: 'EQ-COR-003', amount: 1260, version: 'v1', status: 'pendiente valoración', date: '2026-06-29', owner: 'Laura Sánchez', sourceWorkId: 'TR-2404' },
  { id: 'PRE-3043', clientId: 'cli-ares', equipmentId: 'EQ-RAP-010', amount: 980, version: 'v1', status: 'aceptación parcial', date: '2026-06-30', owner: 'Laura Sánchez', sourceWorkId: 'TR-2409', opportunityId: 'OPO-9001' },
  { id: 'PRE-3044', clientId: 'cli-ares', equipmentId: 'EQ-SEC-001', amount: 1640, version: 'v1', status: 'pendiente', date: '2026-07-01', owner: 'Marta López', sourceWorkId: 'TR-2401' },
] as DemoStore['budgets'];

const alerts = [
  { id: 'av-sat-1', profiles: ['sat'], title: 'Acceso pendiente', detail: 'Vigilancia no ha emitido pase para EQ-BAR-007', severity: 'danger', date: '2026-07-01', entity: 'TR-2411', relatedType: 'work', relatedId: 'TR-2411', owner: 'Marta López', status: 'pendiente', read: false, route: '/app/trabajos/TR-2411' },
  { id: 'av-sat-2', profiles: ['sat', 'oficina'], title: 'Material no confirmado', detail: 'Variador para EQ-RAP-010 sin fecha proveedor', severity: 'danger', date: '2026-07-01', entity: 'TR-2409', relatedType: 'work', relatedId: 'TR-2409', owner: 'Marta López', status: 'riesgo', read: false, route: '/app/trabajos/TR-2409' },
  { id: 'av-com-1', profiles: ['comercial'], title: 'Presupuesto sin respuesta', detail: 'PRE-3041 lleva 4 días sin contestación', severity: 'commercial', date: '2026-06-30', entity: 'PRE-3041', relatedType: 'budget', relatedId: 'PRE-3041', owner: 'Laura Sánchez', status: 'seguimiento', read: true, route: '/app/presupuestos?estado=enviado' },
  { id: 'av-com-2', profiles: ['comercial', 'gerencia'], title: 'Contrato próximo a renovar', detail: 'Logística Ares vence en 35 días', severity: 'warn', date: '2026-07-05', entity: 'CON-ARES-24', relatedType: 'client', relatedId: 'cli-ares', owner: 'Laura Sánchez', status: 'próximo', read: false, route: '/app/contratos?filtro=renovacion' },
  { id: 'av-ofi-1', profiles: ['oficina', 'gerencia'], title: 'Factura vencida', detail: 'FAC-2308 vencida hace 8 días', severity: 'danger', date: '2026-06-22', entity: 'FAC-2308', relatedType: 'invoice', relatedId: 'FAC-2308', owner: 'Elena Ruiz', status: 'vencida', read: false, route: '/app/cobros?filtro=vencidos' },
  { id: 'av-tec-1', profiles: ['tecnico'], title: 'Mensaje de SAT', detail: 'Confirmar firma y fotografías antes de cerrar TR-2401', severity: 'info', date: '2026-07-01', entity: 'TR-2401', relatedType: 'work', relatedId: 'TR-2401', owner: 'Diego Martín', status: 'nuevo', read: false, route: '/app/tecnico/trabajo/TR-2401' },
] as DemoStore['alerts'];

export const initialDemoStore: DemoStore = {
  users,
  technicians,
  clients,
  centers,
  equipment,
  suppliers,
  works,
  parts,
  checks,
  alerts,
  budgets,
  opportunities,
  contracts: [
    { id: 'CON-ARES-24', clientId: 'cli-ares', renewal: '2026-08-04', equipment: 18, status: 'renovación próxima' },
    { id: 'CON-FRIO-22', clientId: 'cli-frio', renewal: '2026-10-12', equipment: 11, status: 'vigente' },
    { id: 'CON-ORB-25', clientId: 'cli-orbita', renewal: '2026-07-28', equipment: 7, status: 'revisión comercial' },
  ],
  invoices: [
    { id: 'FAC-2308', clientId: 'cli-ares', due: '2026-06-22', amount: 4320, status: 'vencida', workId: 'TR-2401' },
    { id: 'FAC-2311', clientId: 'cli-frio', due: '2026-07-08', amount: 1850, status: 'pendiente', workId: 'TR-2410' },
    { id: 'FAC-2312', clientId: 'cli-luma', due: '2026-07-15', amount: 740, status: 'emitida', workId: 'TR-2408' },
  ],
  purchases: [
    { id: 'PED-1180', supplierId: 'sup-porta', date: '2026-06-30', confirmation: 'sin confirmar', affected: 'TR-2404, TR-2409' },
    { id: 'PED-1181', supplierId: 'sup-hydro', date: '2026-07-01', confirmation: 'entrega prevista', affected: 'TR-2406' },
    { id: 'PED-1182', supplierId: 'sup-nord', date: '2026-07-02', confirmation: 'confirmado', affected: 'TR-2401' },
  ],
  documents,
  runtime: {
    'TR-2401': { stage: 'working', history: ['08:15 Trabajo descargado', '08:35 Estado cambiado a “En desplazamiento”', '09:05 Estado cambiado a “En intervención”'] },
    'TR-2406': { stage: 'review', history: ['13:30 Trabajo descargado', '16:40 Estado cambiado a “Finalizado técnicamente”'] },
    'TR-2411': { stage: 'downloaded', history: ['19:00 Trabajo descargado'] },
  },
};
