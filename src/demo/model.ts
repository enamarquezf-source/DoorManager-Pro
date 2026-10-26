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
export type DemoTour = 'work'|'purchases'|'updates'|'connected'|'discover';
export type DemoStep = { title: string; text: string; route: string; target: string; goal?: string; role?: DemoRole; requiredRole?: DemoRole; finale?: boolean };
export function demoStepDone(step: DemoStep, progress: DemoProgress) { return Boolean(step.goal && Number(progress[step.goal]) > 0); }
export function demoTourSteps(session: DemoSession,tour:DemoTour='work'): DemoStep[] {
 if(tour==='connected') {
  const forRole=(role:DemoRole)=>demoTourSteps({...session,role},'work').map(step=>({...step,requiredRole:role}));
  const sat=forRole('SAT'),tech=forRole('Tecnico'),office=forRole('Oficina'),management=forRole('Gerencia');
  const detail=session.work_order_id?'/app/partes/'+session.work_order_id:'/app/partes';
  return [...sat.slice(0,4),...tech.slice(0,-1),{...sat[5],route:detail},...office.slice(1,5).map((step,index)=>index===0?{...step,route:detail,text:'Revisa el parte que acabas de trabajar: cliente, horas, materiales e importe aprobado. Al entrar en Oficina también se preparan otros ejemplos; usa el cliente y el parte de tu recorrido para mantener el vínculo.'}:index===1?{...step,text:'En Facturación selecciona el parte de tu recorrido enviado por SAT. Revisa cliente, conceptos, impuestos y vencimiento antes de emitir. Si no lo ves, vuelve al parte y comprueba su revisión y envío a Facturación.'}:step),...management.slice(1,4),{title:'Del aviso al resultado',text:'Has llegado al final del recorrido. Revisa qué acciones has guardado y qué pantallas has explorado. Puedes volver a cualquier misión o seguir probando sin perder los datos de tu empresa temporal.',route:'/app/modulos/rentabilidad',target:'.flow-hero',requiredRole:'Gerencia',finale:true}];
 }
 if(tour==='discover') return [
  {title:'Un aviso, tres equipos',text:'Abre el trabajo preparado y consulta cliente, centro y equipos. Es una visita guiada: los datos son ficticios y no necesitas rellenar todo para descubrir el circuito.',route:'/app/tecnico',target:'.journey-card',requiredRole:'Tecnico'},
  {title:'Revisión componente a componente',text:'Abre el parte y sus checks. Consulta el historial del equipo, las comprobaciones y las fotos de referencia. Cada defecto pertenece a su componente; los demás pueden quedar favorables.',route:session.work_order_id?'/app/tecnico/trabajo/'+session.work_order_id+'?vista=checks':'/app/tecnico',target:'.work-order-check-link',requiredRole:'Tecnico'},
  {title:'De campo a Oficina',text:'Abre el parte de ejemplo listo para facturar y revisa sus conceptos. Este es otro caso preparado para mostrar esta etapa sin obligarte a terminar el trabajo técnico anterior.',route:'/app/partes',target:'.page-head',requiredRole:'Oficina'},
  {title:'Cobros a la vista',text:'Consulta los vencimientos y los importes pendientes del ejemplo. Registrar un cobro en DMP no realiza ningún cargo bancario.',route:'/app/modulos/cobros',target:'.flow-hero',requiredRole:'Oficina'},
  {title:'Entiende el margen',text:'Explora los trabajos preparados para Gerencia. Compara venta y coste, filtra por cliente y abre un parte para seguir el origen de los importes. Son ejemplos adicionales, no resultados del trabajo que acabas de ver.',route:'/app/modulos/rentabilidad',target:'.flow-hero',requiredRole:'Gerencia'},
  {title:'Ahora prueba tu propio caso',text:'Ya has visto cómo se conectan campo, oficina y negocio. El recorrido completo te permite crear tus propios datos y seguirlos entre perfiles; esta visita rápida no ha creado ni cerrado trabajos por ti.',route:'/app/modulos/rentabilidad',target:'.flow-hero',requiredRole:'Gerencia',finale:true}
 ];
 if(tour==='updates') return [{title:'Tu DMP, siempre al día',text:'Aprende a comprobar la versión y a actualizar conservando tu trabajo.',route:session.role==='Tecnico'?'/app/tecnico':'/app/inicio',target:'[data-demo-update]'}];
 const work = session.work_order_id ? '/app/tecnico/trabajo/' + session.work_order_id : '/app/tecnico';
 if(tour==='purchases') {
  const material:DemoStep={title:'Crea un material',text:'En Materiales pulsa Crear material. Prueba con Fotocélula de seguridad, unidad ud, coste 30 €, venta 55 € y stock mínimo 2. Activa el control de stock y guarda. Crear la ficha no significa recibir existencias.',route:'/app/modulos/materiales',target:'.section-header',goal:'catalog_materials'};
  if(session.role==='Tecnico')return [
   {title:'Registra el material utilizado',text:'En Completar parte abre Materiales y elige el material que has recibido en el almacén de prueba. Registra solo la cantidad utilizada y sincroniza. No inventes un consumo si no lo has usado.',route:work+'?vista=records',target:'.technician-work-tabs',goal:'work_materials'},
   {title:'Revisa el consumo con SAT',text:'Cambia a SAT para revisar y validar el material del parte. El movimiento de almacén debe corresponder a un consumo validado; no confundas una solicitud pendiente con una salida confirmada.',route:'/app/partes',target:'.page-head',role:'SAT'}
  ];
  if(session.role==='Comercial')return [{title:'Coordina la compra con Oficina',text:'El catálogo puede consultarse desde el perfil autorizado. Cambia a Oficina para crear materiales, proveedores y pedidos sin ampliar los permisos del perfil comercial.',route:'/app/modulos/compras',target:'.flow-hero',role:'Oficina'}];
  if(session.role==='SAT')return [material,
   {title:'Solicita el material a Oficina',text:'Cambia a Oficina y sigue este mismo recorrido: proveedor, pedido, recepción y existencias. Los datos creados aquí se mantienen al cambiar de perfil.',route:'/app/modulos/compras',target:'.flow-hero',role:'Oficina'},
   {title:'Valida el consumo del parte',text:'Cuando el técnico haya registrado el material, abre el parte y revisa el consumo pendiente: material, cantidad y almacén. Valídalo y comprueba el movimiento en Materiales. Puedes volver al recorrido Trabajo y facturación cuando quieras.',route:'/app/partes',target:'.page-head'}];
  return [material,
   {title:'Crea un proveedor',text:'En Proveedores crea Suministros de prueba con datos ficticios. Guarda su ficha. Después puedes vincularlo al material y definir su referencia y precio de compra.',route:'/app/modulos/proveedores',target:'.page-head, .flow-hero',goal:'suppliers'},
   {title:'Prepara el pedido de compra',text:'En Compras pulsa Nuevo pedido. Selecciona el proveedor y Almacén de prueba como destino; añade una línea con tu material, cantidad 5 y precio acordado 30 €. Guarda la línea: un pedido vacío no completa este paso.',route:'/app/modulos/compras',target:'.page-head, .flow-hero',goal:'purchase_orders'},
   {title:'Confirma el pedido',text:'Abre el pedido, revisa sus líneas y márcalo como pedido. En esta demo no se envía ningún encargo real al proveedor. Las existencias todavía no aumentan.',route:'/app/modulos/compras',target:'.page-head, .flow-hero',goal:'ordered_purchases'},
   {title:'Recibe la mercancía',text:'Dentro del pedido abre la recepción. Selecciona Almacén de prueba, una referencia ficticia del albarán y las unidades recibidas. Revisa y confirma la recepción; guardar solo el borrador no incorpora stock.',route:'/app/modulos/compras',target:'.page-head, .flow-hero',goal:'purchase_receipts'},
   {title:'Comprueba las existencias',text:'Vuelve a Materiales y abre el material: comprueba las unidades del almacén y la entrada vinculada a la recepción. El stock debe proceder de la recepción confirmada, no de un ajuste para simularla.',route:'/app/modulos/materiales',target:'.section-header'},
   {title:'Registra la factura del proveedor',text:'En Facturas de proveedor registra un documento ficticio y revisa sus importes y vencimiento. Recibir mercancía y registrar una factura son operaciones distintas; no introduzcas documentos reales.',route:'/app/modulos/facturas-proveedor',target:'.page-head, .flow-hero'},
   session.role==='Gerencia'?{title:'Sigue el coste hasta el trabajo',text:'La compra incorpora existencias; el coste del parte aparecerá cuando se registre el consumo correspondiente. Compara compras, stock y materiales utilizados sin sumar dos veces el mismo gasto.',route:'/app/modulos/rentabilidad',target:'.flow-hero'}:{title:'Utiliza el material en el parte',text:'Cambia a Técnico para registrar material en el trabajo y después vuelve a SAT para revisar su validación. Puedes elegir Trabajo y facturación para continuar con el cierre y la factura al cliente.',route:'/app/tecnico',target:'.journey-card',role:'Tecnico'}
  ];
 }
 if (session.role === 'Tecnico') return [
  {title:'Tu jornada preparada',text:'Abre el parte asignado. Si vienes de SAT, conserva el cliente y el trabajo que acabas de crear. Prepara la jornada para trabajar sin cobertura.',route:'/app/tecnico',target:'.journey-card'},
  {title:'Consulta el aviso',text:'En En campo revisa cliente, centro, equipo y motivo del aviso. Comprueba que tienes la información necesaria antes de empezar.',route:work+'?vista=work',target:'.technician-workstation-head'},
  {title:'Revisa los componentes',text:'Abre un equipo y una sección. Primero verás el componente y debajo qué comprobar. Marca alguno favorable y otro con problema. Guarda y sincroniza la respuesta; después pulsa Siguiente paso en la guía.',route:work+'?vista=checks',target:'.work-order-check-link',goal:'checks'},
  {title:'Documenta el defecto',text:'Selecciona solo el componente afectado, explica qué le ocurre y añade una foto ficticia. Los demás pueden quedar favorables; no heredan el defecto.',route:work+'?vista=checks',target:'.work-order-check-link',goal:'photos'},
  {title:'Explica el trabajo realizado',text:'En Completar parte escribe qué has hecho y guarda. Ejemplo: ajuste de finales de carrera y prueba de seguridad.',route:work+'?vista=records',target:'.technician-work-tabs',goal:'work_notes'},
  {title:'Registra el tiempo',text:'Añade las horas realmente empleadas. Guarda y envía los cambios; si hay un fallo, revísalo en Pendientes antes de continuar.',route:work+'?vista=records',target:'.technician-work-tabs',goal:'times'},
  {title:'Firma de prueba',text:'Revisa el resumen y añade una firma ficticia. No uses firmas o datos personales reales.',route:work+'?vista=close',target:'.technician-close-review',goal:'signatures'},
  {title:'Entrega el parte a SAT',text:'Completa los requisitos del cierre, finaliza y sincroniza. El trabajo pasará a revisión de SAT; firmar por sí solo no cierra el parte.',route:work+'?vista=close',target:'.technician-close-review',goal:'completed_work'},
  {title:'Comprueba la recepción en SAT',text:'Cambia a SAT para revisar lo realizado por el técnico. Los datos y las respuestas siguen en esta misma empresa de prueba.',route:'/app/partes',target:'.page-head',role:'SAT'}
 ];
 if(session.role==='SAT') return [
  {title:'Crea tu primer cliente',text:'Pulsa Crear cliente e introduce una razón social ficticia. Guarda el formulario y, cuando el cliente aparezca en la lista, pulsa Siguiente paso en la guía.',route:'/app/clientes',target:'.page-head',goal:'clients'},
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
