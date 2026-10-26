import type { DemoStep } from './model';
const benefits: Record<string,string> = {
  clients:'Un cliente conecta sus centros, equipos y todo su historial de trabajo.',
  sites:'El técnico sabrá dónde acudir y qué equipos encontrará allí.',
  works:'El aviso se convierte en trabajo trazable para todo el equipo.',
  assignments:'SAT y el técnico trabajan sobre el mismo parte, sin duplicar información.',
  checks:'Cada componente conserva su resultado: un defecto no afecta a los demás.',
  photos:'La evidencia queda vinculada al equipo y al problema concreto.',
  work_notes:'SAT podrá entender la intervención sin perseguir notas o mensajes.',
  times:'Las horas alimentan los costes del trabajo con su tarifa vigente.',
  signatures:'La firma queda registrada junto al trabajo realizado.',
  completed_work:'El trabajo vuelve a SAT para su revisión y continúa su recorrido.',
  invoices:'La factura conserva el vínculo con el trabajo del que procede.',
  payments:'Un cobro registrado actualiza los importes pendientes y vencimientos.',
  catalog_materials:'Una ficha conecta precios, compras, existencias y consumos.',
  suppliers:'El proveedor queda disponible para pedidos y documentos de compra.',
  purchase_orders:'Puedes seguir qué has pedido y qué queda por recibir.',
  ordered_purchases:'Confirmar el pedido no inventa existencias en el almacén.',
  purchase_receipts:'El stock se incorpora desde la recepción confirmada.',
  work_materials:'El consumo del parte conecta los recursos utilizados con su coste.',
};
export function guideCopy(step:DemoStep) {
 const tasks:Record<string,[string,string]>={
  clients:['Crea un cliente ficticio. Puedes usar los datos de ejemplo y cambiarlos. Al guardar pasaremos a su centro.','Crear cliente'],
  sites:['Elige el cliente que acabas de crear, añade su centro y guarda.','Crear centro'],
  works:['Crea el trabajo de ese cliente y centro. Puedes continuar sin conocer el equipo.','Crear parte'],
  assignments:['Abre Gestionar asignaciones, elige al técnico Demo y guarda la visita.','Asignar este parte'],
  checks:['Elige un resultado y después los componentes afectados. Explica cada defecto; los demás pueden quedar favorables.','Abrir comprobaciones'],
  photos:['Añade una imagen ficticia y guarda. Quedará preparada para enviarse al finalizar.','Ir a fotos'],
  work_notes:['Escribe qué has hecho y pulsa Guardar. No hace falta enviarlo aparte para continuar.','Escribir trabajo realizado'],
  times:['Añade las horas de esta intervención y guarda el registro.','Añadir horas'],
  signatures:['Registra una firma ficticia, sin datos personales reales.','Ir a la firma'],
  completed_work:['Revisa el resumen y finaliza el parte. Se enviará todo lo pendiente a SAT.','Ver resumen de cierre'],
  sat_approved:['Comprueba el trabajo recibido y envíalo a Facturación desde la revisión SAT.','Revisar este parte'],
  invoices:['Selecciona este parte en Facturación, revisa los conceptos y prepara la factura ficticia.','Ir a facturación'],
  payments:['Emite la factura de prueba y registra el dinero recibido. No hay ningún cargo bancario real.','Ir a la factura'],
  catalog_materials:['Crea un material con sus precios. Las existencias se registran por separado.','Crear material'],
  suppliers:['Crea un proveedor ficticio; puedes usar los datos de ejemplo.','Crear proveedor'],
  purchase_orders:['Crea un pedido y añade al menos una línea de material.','Crear pedido'],
  ordered_purchases:['Revisa el pedido y confírmalo. Esto todavía no añade existencias.','Abrir el pedido'],
  purchase_receipts:['Registra las unidades recibidas y confirma la recepción.','Recibir material'],
 };
 const navigation:Record<string,string>={'Tu jornada preparada':'Abrir mi parte','Un aviso, tres equipos':'Abrir mi parte','Consulta el aviso':'Abrir los checks','Revisión componente a componente':'Abrir los checks','De campo a Oficina':'Abrir parte para facturar','Cobros a la vista':'Ver calendario de cobros','Entiende el margen':'Ver rentabilidad','Compara margen y costes':'Ver rentabilidad','Comprueba los conceptos':'Revisar conceptos','Analiza el tiempo':'Ver horas por empleado','Haz un estudio de costes':'Ver estudios de costes'};
 return { action:tasks[step.goal??'']?.[0]??step.text.split(/(?<=[.!?])\s/)[0],cta:tasks[step.goal??'']?.[1]??navigation[step.title]??'Ir a esta tarea', benefit:step.role?'Cambia de perspectiva conservando la misma empresa y sus datos de prueba.':benefits[step.goal??'']??'Abre los registros y sigue el origen de la información, en lugar de quedarte solo con un resumen.' };
}
