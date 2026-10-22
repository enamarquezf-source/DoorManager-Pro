export const demoProjectUrl = 'https://xlhzyhotzfflemjnqvqn.supabase.co';
export function isDemoProject(url: string | undefined) {
  try { const parsed = new URL(url ?? ''); return parsed.origin === demoProjectUrl && parsed.pathname === '/' && !parsed.search && !parsed.hash; } catch { return false; }
}
export const publicDemoEnabled = isDemoProject(import.meta.env.VITE_SUPABASE_URL);
export const demoRoles = [
  { id: 'Gerencia', title: 'Gerencia', description: 'Visión del negocio, costes y rentabilidad.', route: '/app/inicio', icon: 'chart' },
  { id: 'Oficina', title: 'Oficina', description: 'Documentos, facturación y cobros.', route: '/app/inicio', icon: 'office' },
  { id: 'SAT', title: 'SAT', description: 'Clientes, equipos, mantenimientos y planificación.', route: '/app/inicio', icon: 'planning' },
  { id: 'Comercial', title: 'Comercial', description: 'Clientes, presupuestos y oportunidades.', route: '/app/inicio', icon: 'sales' },
  { id: 'Tecnico', title: 'Técnico', description: 'Un parte preparado con tres equipos y sus checks.', route: '/app/tecnico', icon: 'tools' },
] as const;
export type DemoRole = typeof demoRoles[number]['id'];
export const validDemoRole = (value: unknown): value is DemoRole => demoRoles.some(role => role.id === value);
export type DemoSession = { id: string; company_id: string; profile_id: string; role: DemoRole; expires_at: string; ended: boolean; cleanup_state: string; work_order_id: string | null };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function parseDemoSession(value: any): DemoSession {
  if (!value || !uuid.test(value.id) || !uuid.test(value.company_id) || !uuid.test(value.profile_id) || !validDemoRole(value.role)
    || !Number.isFinite(Date.parse(value.expires_at)) || typeof value.ended !== 'boolean'
    || (value.work_order_id !== null && !uuid.test(value.work_order_id))) throw new Error('La sesión de prueba no es válida. Vuelve a la portada.');
  return value;
}
export function demoTourSteps(session: DemoSession) {
  if (session.role === 'Tecnico' && session.work_order_id) {
    const work = `/app/tecnico/trabajo/${session.work_order_id}`;
    return [
      { title: 'Tu jornada preparada', text: 'Encontrarás un parte ficticio asignado. Espera a que termine la descarga de la jornada y pulsa su tarjeta.', route: '/app/tecnico', target: '.journey-card' },
      { title: 'Antes de empezar', text: 'Consulta el aviso, el centro y la información del trabajo en «En campo».', route: `${work}?vista=work`, target: '.technician-workstation-head' },
      { title: 'Tres equipos, tres revisiones', text: 'Abre un check de seccional, corredera o barrera. Entra en una sección y evalúa cada componente: favorable, problema leve o fallo grave. Explica el defecto y prueba a añadir una foto ficticia.', route: `${work}?vista=checks`, target: '.work-order-check-link' },
      { title: 'Registra lo realizado', text: 'En «Completar parte» escribe y guarda el trabajo realizado. Prueba los registros de horas, materiales y desplazamientos.', route: `${work}?vista=records`, target: '.technician-work-tabs' },
      { title: 'Revisa y termina', text: 'Revisa el resumen, añade una firma ficticia y prueba el cierre y la sincronización. La guía no guarda ni finaliza el parte por ti.', route: `${work}?vista=close`, target: '.technician-close-review' },
    ];
  }
  const first = { title: 'Tu espacio de prueba', text: 'Este entorno empieza vacío. Los datos que crees pertenecen solo a esta sesión. Usa información ficticia.', route: '/app/inicio', target: '.topbar' };
  if (session.role === 'SAT') return [first,
    { title: 'Crea un cliente', text: 'Empieza por un cliente ficticio. Después podrás añadir un centro y equipos.', route: '/app/clientes', target: '.page-head' },
    { title: 'Planifica un trabajo', text: 'Crea un parte: puedes elegir un equipo existente, crear uno o continuar sin equipo conocido.', route: '/app/partes', target: '.page-head' },
    { title: 'Programa mantenimientos', text: 'Explora el contrato, sus equipos y la planificación de visitas.', route: '/app/modulos/mantenimientos', target: '.flow-hero' }];
  if (session.role === 'Comercial') return [first,
    { title: 'Tu primer cliente', text: 'Crea un cliente ficticio para explorar el recorrido comercial.', route: '/app/clientes', target: '.page-head' },
    { title: 'Prepara un presupuesto', text: 'Prueba conceptos, materiales y precios sobre tu cliente ficticio.', route: '/app/modulos/presupuestos', target: '.page-head' }];
  if (session.role === 'Oficina') return [first,
    { title: 'La documentación', text: 'Explora cómo se vinculan documentos a la actividad. Usa archivos ficticios.', route: '/app/documentos', target: '.flow-hero' },
    { title: 'Facturación y cobros', text: 'Aquí llegan los trabajos preparados para facturar. Al empezar vacío no hay facturas; todos los importes de la demo son simulaciones.', route: '/app/modulos/facturacion', target: '.page-head' }];
  return [first,
    { title: 'Clientes y actividad', text: 'Crea un cliente ficticio y explora cómo se conecta con centros, equipos y trabajos.', route: '/app/clientes', target: '.page-head' },
    { title: 'Los trabajos', text: 'Consulta o crea partes y descubre su recorrido operativo.', route: '/app/partes', target: '.page-head' },
    { title: 'Costes y rentabilidad', text: 'Los informes se alimentan de los registros creados durante la prueba; una empresa vacía aún no tiene resultados.', route: '/app/modulos/rentabilidad', target: '.flow-hero' }];
}
