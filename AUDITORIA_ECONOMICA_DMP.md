# Auditoria Economica DoorManager Pro

## Fuentes Reales
- `quotes`: cabecera de presupuesto. Totales persistidos: `subtotal_cost`, `subtotal_sale`, `discount_type`, `discount_value`, `discount_amount`, `taxable_base`, `tax_amount`, `total_amount`, `estimated_margin`.
- `quote_lines`: lineas de presupuesto. Coste: `quantity * unit_cost`. Venta sin IVA: `quantity * unit_price`. IVA se calcula desde venta neta de descuento.
- `work_orders`: estado operativo y economico del parte. Campos economicos: `economic_status`, `billable`, `warranty`, `estimated_sale_amount`, `invoiced_amount`, `paid_amount`.
- `work_order_materials`: materiales reales usados. Cantidad real: `used_quantity`. Coste unitario: `unit_cost` si existe; si no, `materials.cost`. No existe columna `quantity`.
- `work_order_time_entries`: horas reales. Coste: `duration_minutes / 60 * hourly_cost`.
- `work_order_cost_entries`: recursos auxiliares. Coste: `quantity * unit_cost`.
- `clients`: agregacion por cliente, siempre filtrada por `company_id` y RLS.

## Formulas Validadas
- Presupuesto coste: suma de `quote_lines.total_cost`.
- Presupuesto venta sin IVA: suma de `quote_lines.total_price`.
- Descuento: porcentaje sobre venta sin IVA o importe fijo, limitado a la venta.
- Base imponible: `subtotal_sale - discount_amount`.
- IVA: suma proporcional de IVA sobre lineas despues de descuento.
- Total cliente: `taxable_base + tax_amount`.
- Beneficio presupuesto: `taxable_base - subtotal_cost`. El IVA nunca entra en beneficio.
- Coste real parte: materiales + horas + costes auxiliares.
- Venta parte: `estimated_sale_amount`, o presupuesto aceptado/ejecutado asociado sin IVA, o venta directa de lineas operativas si existe.
- Margen parte: `sale_amount - real_cost`.
- Cliente coste acumulado: suma de coste real de partes.
- Cliente venta acumulada: suma de presupuestos aceptados/ejecutados sin IVA.
- Cliente beneficio: venta acumulada sin IVA menos coste acumulado.
- Garantias: coste real de partes `warranty` o `economic_status = 'garantia'`.
- Pendiente facturar: partes terminados o marcados `pendiente_facturar` sin `invoiced_amount`.

## Problemas Encontrados
- `v_management_metrics` inicial sumaba `q.total`, que incluye IVA, como importe aceptado. Eso contaminaba ventas y podia confundirse con beneficio.
- `v_client_economic_summary` de `039` unia partes y presupuestos en el mismo `SELECT`, lo que podia multiplicar importes si un cliente tenia varios partes y varios presupuestos.
- `039` ya habia sido corregida para usar `used_quantity`; se confirma que `work_order_materials.quantity` no existe.
- La UI de Gerencia mostraba `Ventas periodo` desde `accepted_quote_amount`; ahora se etiqueta y alimenta como venta sin IVA.

## Correcciones Aplicadas
- Nueva migracion `040_validate_economic_calculations.sql`.
- Reemplaza `v_work_order_economic_summary` con columnas claras: `real_cost`, `sale_amount`, `margin_amount`, `margin_percentage`.
- Reemplaza `v_client_economic_summary` con agregados laterales separados para partes y presupuestos, evitando duplicidades por joins.
- Reemplaza `v_management_metrics` para separar `sale_amount`, `tax_amount`, `total_amount`, `real_cost`, `margin_amount`, `margin_percentage`.
- UI de Gerencia muestra venta sin IVA, coste real, margen, garantias y pendiente facturar.

## Estado
- No se han creado datos ficticios.
- No se usa `service_role`.
- Las vistas nuevas usan `security_invoker = true`.
- Los calculos quedan preparados para dashboards, pero cobros reales quedan pendientes hasta el modulo de cobros.
