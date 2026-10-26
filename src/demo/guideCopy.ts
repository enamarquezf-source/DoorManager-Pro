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
 return { action:step.text.split(/(?<=[.!?])\s/)[0], benefit:step.role?'Cambia de perspectiva conservando la misma empresa y sus datos de prueba.':benefits[step.goal??'']??'Abre los registros y sigue el origen de la información, en lugar de quedarte solo con un resumen.' };
}
