import type { DemoStep } from './model';
const benefits: Record<string,string> = {
  clients:'Un cliente conecta sus centros, equipos y todo su historial de trabajo.',
  sites:'El técnico sabrá dónde acudir y qué equipos encontrará allí.',
  works:'El aviso se convierte en trabajo trazable para todo el equipo.',
  assignments:'SAT y el técnico trabajan sobre el mismo parte, sin duplicar información.',
  checks:'Cada componente conserva su resultado: un defecto no afecta a los demás.',
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
  clients:['Crea un cliente ficticio. Puedes usar los datos de ejemplo y cambiarlos. Al guardar, la guía continuará automáticamente.','Crear cliente'],
  sites:['Elige el cliente que acabas de crear, añade su centro y guarda.','Crear centro'],
  works:['Crea el trabajo de ese cliente y centro. Selecciona o crea un equipo para practicar los checks. Si el cliente no sabe qué equipo es, puedes continuar sin identificarlo.','Crear parte'],
  assignments:['Abre Gestionar asignaciones, elige al técnico Demo y guarda la visita.','Asignar este parte'],
  checks:['Abre un equipo y una sección. Si corresponde, marca Todo favorable, confirma el bloque y pulsa Finalizar check al acabar. '+(step.title==='Revisión componente a componente'?'En esta visita basta un equipo.':'Repite con todos los equipos del parte.'),'Continuar revisión'],
  work_notes:['Escribe qué has hecho y pulsa Guardar. No hace falta enviarlo aparte para continuar.','Escribir trabajo realizado'],
  times:['Completar parte → Registro → Horas. Pulsa Añadir horas; indica Inicio y Fin o Duración manual minutos, y guarda.','Abrir formulario de horas'],
  signatures:['Cierre → Firma. Escribe un nombre ficticio, dibuja en el recuadro, marca la casilla de confirmación y pulsa Guardar firma.','Ir a la firma paso a paso'],
  completed_work:['Completar parte → Cierre. Revisa el resumen, pulsa Finalizar parte y confirma con Enviar a revisión. Espera a que se envíe a SAT para continuar.','Abrir Cierre y revisar el envío'],
  sat_approved:['Pulsa Enviar a destino, selecciona Facturación y confirma.','Revisar este parte'],
  invoices:['En Facturación, localiza el parte que revisaste. Pulsa Preparar factura y verifica los conceptos del borrador.','Ir a facturación'],
  payments:['Abre el borrador que preparaste, emítelo y pulsa Registrar cobro. Introduce un importe y una referencia ficticios. No hay ningún cargo bancario real.','Ir a la factura'],
  catalog_materials:['Crea un material con sus precios. Las existencias se registran por separado.','Crear material'],
  suppliers:['Crea un proveedor ficticio; puedes usar los datos de ejemplo.','Crear proveedor'],
  work_materials:['Completar parte → Registro → Material utilizado. Pulsa Añadir material, selecciona material y almacén e introduce la cantidad utilizada. Guarda el consumo.','Abrir el registro de materiales'],
  purchase_orders:['Crea un pedido y añade al menos una línea de material.','Crear pedido'],
  ordered_purchases:['Pulsa Marcar pedido tras revisar las líneas. Esto todavía no añade existencias.','Abrir el pedido'],
  purchase_receipts:['Pulsa Registrar recepción, indica las unidades y confirma. Guardar borrador no añade stock.','Recibir material'],
 };
 const reading:Record<string,string>={'Registra la factura del proveedor':'Abre la factura desde tu compra: DMP copia sus artículos e importes. Revisa el borrador, pulsa Registrar factura y después Registrar pago. Si has creado un borrador manual vacío, añade sus líneas antes de registrarlo.','Comprueba los conceptos':'Abre el parte y localiza Revisión económica. Si ya está aprobada, puedes consultar los importes. Si está pendiente y tienes permisos, decide qué conceptos se cobran y aprueba la revisión.','Prepara un presupuesto':'Crea el presupuesto y añade al menos una línea con cantidad y precio. La guía continúa al guardar la línea.','Explora el contrato de mantenimiento':'Pulsa Nuevo contrato, elige cliente, equipos y periodo, y guarda el plan.','Explora una empresa con actividad':'Abre un trabajo de la lista para consultar su actividad.','Haz un estudio de costes':'Pulsa Analizar periodo si aún no hay datos. Revisa los costes y guarda el estudio para continuar.'};
 const navigation:Record<string,string>={'Registra el envío del presupuesto':'Registrar envío de prueba','Simula la aceptación del cliente':'Ir al estado del presupuesto','Convierte el presupuesto en trabajo':'Generar parte del presupuesto','Tu jornada preparada':'Abrir mi parte','Un aviso, tres equipos':'Abrir mi parte','Consulta el aviso':'Abrir los checks','Revisión componente a componente':'Abrir los checks','De campo a Oficina':'Abrir parte para facturar','Recibe un trabajo revisado':'Abrir ejemplo de Oficina','Cobros a la vista':'Ver calendario de cobros','Entiende el margen':'Ver rentabilidad','Compara margen y costes':'Ver rentabilidad','Comprueba los conceptos':'Revisar conceptos','Analiza el tiempo':'Ver horas por empleado','Haz un estudio de costes':'Ver estudios de costes'};
 const quoteConversion=step.title==='Convierte el presupuesto en trabajo';
 return { action:quoteConversion?'Pulsa Generar parte. Revisa cliente y centro; SAT asignará al técnico después.':tasks[step.goal??'']?.[0]??reading[step.title]??step.text,cta:quoteConversion?'Generar parte del presupuesto':tasks[step.goal??'']?.[1]??navigation[step.title]??'Abrir esta pantalla', benefit:step.role?'Cambia de perspectiva conservando la misma empresa y sus datos de prueba.':benefits[step.goal??'']??'Abre los registros y sigue el origen de la información, en lugar de quedarte solo con un resumen.' };
}
