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

export type DemoProgress = Record<string, number>;
export type DemoStep = { title: string; text: string; route: string; target: string; goal?: string; role?: DemoRole };
export function demoStepDone(step: DemoStep, progress: DemoProgress) { return Boolean(step.goal && Number(progress[step.goal]) > 0); }
export function demoTourSteps(session: DemoSession): DemoStep[] {
 const work = session.work_order_id ? '/app/tecnico/trabajo/' + session.work_order_id : '/app/tecnico';
 if (session.role === 'Tecnico') return [
  {title:'Tu jornada preparada',text:'Abre el parte asignado. Si vienes de SAT, conserva el cliente y el trabajo que acabas de crear. Prepara la jornada para trabajar sin cobertura.',route:'/app/tecnico',target:'.journey-card'},
  {title:'Consulta el aviso',text:'En En campo revisa cliente, centro, equipo y motivo del aviso. Comprueba que tienes la información necesaria antes de empezar.',route:work+'?vista=work',target:'.technician-workstation-head'},
  {title:'Revisa los componentes',text:'Abre un equipo y una sección. Primero verás el componente y debajo qué comprobar. Marca alguno favorable y otro con problema. La guía espera una respuesta guardada y sincronizada.',route:work+'?vista=checks',target:'.work-order-check-link',goal:'checks'},
  {title:'Documenta el defecto',text:'Selecciona solo el componente afectado, explica qué le ocurre y añade una foto ficticia. Los demás pueden quedar favorables; no heredan el defecto.',route:work+'?vista=checks',target:'.work-order-check-link',goal:'photos'},
  {title:'Explica el trabajo realizado',text:'En Completar parte escribe qué has hecho y guarda. Ejemplo: ajuste de finales de carrera y prueba de seguridad.',route:work+'?vista=records',target:'.technician-work-tabs',goal:'work_notes'},
  {title:'Registra el tiempo',text:'Añade las horas realmente empleadas. Guarda y envía los cambios; si hay un fallo, revísalo en Pendientes antes de continuar.',route:work+'?vista=records',target:'.technician-work-tabs',goal:'times'},
  {title:'Firma de prueba',text:'Revisa el resumen y añade una firma ficticia. No uses firmas o datos personales reales.',route:work+'?vista=close',target:'.technician-close-review',goal:'signatures'},
  {title:'Entrega el parte a SAT',text:'Completa los requisitos del cierre, finaliza y sincroniza. El trabajo pasará a revisión de SAT; firmar por sí solo no cierra el parte.',route:work+'?vista=close',target:'.technician-close-review',goal:'completed_work'},
  {title:'Comprueba la recepción en SAT',text:'Cambia a SAT para revisar lo realizado por el técnico. Los datos y las respuestas siguen en esta misma empresa de prueba.',route:'/app/partes',target:'.page-head',role:'SAT'}
 ];
 if(session.role==='SAT') return [
  {title:'Crea tu primer cliente',text:'Pulsa Crear cliente e introduce una razón social ficticia. Guarda el formulario: este paso se completa cuando el cliente existe.',route:'/app/clientes',target:'.page-head',goal:'clients'},
  {title:'Añade el centro de trabajo',text:'Abre el cliente y añade su centro, o usa Centros. Es el lugar donde se realizará el trabajo; usa una dirección ficticia.',route:'/app/centros',target:'.page-head',goal:'sites'},
  {title:'Recibe una solicitud',text:'Crea una reparación, instalación o visita de mantenimiento. Puedes seleccionar equipo, crearlo o continuar sin equipo conocido; ninguna opción debe bloquear el aviso.',route:'/app/partes',target:'.page-head',goal:'works'},
  {title:'Asigna el técnico',text:'En el parte abre Gestionar asignaciones y elige a Alex Demo, o al técnico Demo disponible. Asigna la visita de hoy para encontrarla en Mi jornada.',route:'/app/partes',target:'.page-head',goal:'assignments'},
  {title:'Realiza el trabajo como técnico',text:'Cambia a Técnico para abrir este mismo parte. La guía de campo te acompañará con checks, fotos, trabajo y horas.',route:'/app/tecnico',target:'.journey-card',role:'Tecnico'},
  {title:'Revisa el trabajo recibido',text:'De vuelta en SAT comprueba la revisión, horas y materiales. Aprueba y envía a Facturación cuando corresponda; la guía nunca valida por ti.',route:'/app/partes',target:'.page-head',goal:'sat_approved'},
  {title:'Explora el contrato de mantenimiento',text:'En Mantenimientos puedes seleccionar equipos, periodo y visitas. Cada visita genera su parte y continúa el mismo circuito.',route:'/app/modulos/mantenimientos',target:'.flow-hero'},
  {title:'Continúa en Oficina',text:'Cambia a Oficina y sigue desde el parte revisado hasta la factura y el cobro de prueba.',route:'/app/modulos/facturacion',target:'.page-head',role:'Oficina'}
 ];
 if(session.role==='Oficina') return [
  {title:'Recibe un trabajo revisado',text:'Tienes un parte ficticio listo para facturar. Si vienes de SAT también verás los trabajos que hayas enviado a Facturación.',route:'/app/partes',target:'.page-head'},
  {title:'Comprueba los conceptos',text:'Abre el parte y revisa horas, materiales, costes e importe aprobado. El ejemplo incluye 2 h a 45 €/h y un kit de 55 €, antes de impuestos.',route:'/app/partes',target:'.page-head'},
  {title:'Prepara la factura',text:'En Facturación selecciona el parte y prepara su borrador. Verifica cliente, conceptos, impuestos y vencimiento. Puedes editar el borrador antes de emitir.',route:'/app/modulos/facturacion',target:'.page-head',goal:'invoices'},
  {title:'Registra un cobro de prueba',text:'Emite la factura de simulación y registra un cobro total o parcial. Usa una referencia ficticia: no se realiza ningún cargo bancario.',route:'/app/modulos/facturacion',target:'.page-head',goal:'payments'},
  {title:'Comprueba los pendientes',text:'En Cobros verás importes pendientes, vencimientos y retrasos. Comprueba cómo cambia el saldo después del pago que has registrado.',route:'/app/modulos/cobros',target:'.flow-hero'},
  {title:'Observa el resultado',text:'Cambia a Gerencia para estudiar la actividad y el impacto económico de los trabajos.',route:'/app/modulos/rentabilidad',target:'.flow-hero',role:'Gerencia'}
 ];
 if(session.role==='Gerencia') return [
  {title:'Explora una empresa con actividad',text:'Hay 12 trabajos ficticios repartidos en las últimas semanas, varios clientes y costes registrados. También se conserva cualquier trabajo creado en otros perfiles.',route:'/app/inicio',target:'.page-head'},
  {title:'Compara margen y costes',text:'En Rentabilidad filtra por cliente y trabajo. Compara mantenimientos rentables con reparaciones que incluyen un coste externo no repercutido. Abre el parte para rastrear los importes.',route:'/app/modulos/rentabilidad',target:'.flow-hero'},
  {title:'Analiza el tiempo',text:'Abre Resumen y elige Últimos 3 meses para incluir todo el ejemplo. Compara horas y costes por empleado; interpreta los resultados junto al tipo de trabajo.',route:'/app/gerencia',target:'.page-head'},
  {title:'Haz un estudio de costes',text:'En los estudios del Resumen revisa las fuentes, define horas disponibles y costes generales ficticios y guarda un escenario. No confundas horas registradas con productividad: hacen falta horas de presencia y una referencia de trabajo.',route:'/app/gerencia',target:'.page-head'},
  {title:'Conecta los números con el trabajo',text:'Cambia a SAT para crear un trabajo propio y después a Técnico y Oficina. Así puedes seguir el origen de los costes hasta la facturación.',route:'/app/partes',target:'.page-head',role:'SAT'}
 ];
 return [
  {title:'Crea una oportunidad real de prueba',text:'Crea primero un cliente ficticio. Cada visitante trabaja en su propia empresa temporal.',route:'/app/clientes',target:'.page-head',goal:'clients'},
  {title:'Prepara un presupuesto',text:'Añade conceptos, cantidades y precios. Guarda el borrador y revisa el margen antes de enviarlo en esta simulación.',route:'/app/modulos/presupuestos',target:'.page-head'},
  {title:'Coordina la ejecución con SAT',text:'Cambia a SAT para explorar cómo continúa el trabajo después del presupuesto.',route:'/app/partes',target:'.page-head',role:'SAT'}
 ];
}
