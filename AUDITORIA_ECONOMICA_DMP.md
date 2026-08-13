# Auditoria Economica DoorManager Pro

## Fuentes Reales
- `quotes`: cabecera de presupuesto. Totales persistidos: `subtotal_cost`, `subtotal_sale`, `discount_type`, `discount_value`, `discount_amount`, `taxable_base`, `tax_amount`, `total_amount`, `estimated_margin`.
- `quote_lines`: lineas de presupuesto. Coste: `quantity * unit_cost`. Venta sin IVA: `quantity * unit_price`. IVA se calcula desde venta neta de descuento.
- `work_orders`: estado operativo y economico del parte. Campos economicos: `economic_status`, `billable`, `warranty`, `estimated_sale_amount`, `invoiced_amount`, `paid_amount`.
- `work_order_materials`: materiales reales usados. Cantidad real: `used_quantity`. Coste unitario: `unit_cost` si existe; si no, `materials.cost`. No existe columna `quantity`.
- `work_order_time_entries`: horas reales. Coste: `duration_minutes / 60 * hourly_cost`.
- `work_order_cost_entries`: recursos auxiliares. Coste: `quantity * unit_cost`.
- `clients`: agregacion por cliente, siempre filtrada por `company_id` y RLS.

## Esquema Real Auditado
- `work_orders`: `id`, `company_id`, `code`, `client_id`, `site_id`, `main_equipment_id`, `title`, `type`, `status`, `scheduled_date`, `finished_at`, `sent_at`, `created_at`, `deleted_at`, `economic_status`, `billable`, `warranty`, `estimated_sale_amount`, `real_cost_amount`, `estimated_margin_amount`, `invoiced_amount`, `paid_amount`.
- `work_order_materials`: `company_id`, `work_order_id`, `planned_quantity`, `used_quantity`, `unit_price`, `unit_cost`, `total_cost`, `total_price`, `used_at`, `deleted_at`.
- `work_order_time_entries`: `company_id`, `work_order_id`, `work_date`, `duration_minutes`, `hourly_cost`, `hourly_price`, `total_cost`, `total_price`.
- `work_order_cost_entries`: `company_id`, `work_order_id`, `cost_type`, `quantity`, `unit_cost`, `unit_price`, `total_cost`, `total_price`, `incurred_at`, `deleted_at`.
- `quotes`: `company_id`, `client_id`, `work_order_id`, `status`, `issue_date`, `subtotal`, `tax_amount`, `total`, `subtotal_cost`, `subtotal_sale`, `discount_amount`, `total_amount`, `estimated_margin`, `taxable_base`, `created_at`, `deleted_at`.

## Vistas Economicas
- `v_work_order_economic_summary.real_cost_amount`: `material_summary.material_cost + time_summary.time_cost + cost_summary.auxiliary_cost`.
- `v_work_order_economic_summary.sale_amount`: `work_orders.estimated_sale_amount` si es mayor que cero; si no, presupuesto aceptado/ejecutado asociado (`quotes.taxable_base`, `subtotal_sale` o `subtotal`); si no, venta operativa calculada desde materiales, horas y costes auxiliares. En garantia o no facturable se fuerza a cero.
- `v_work_order_economic_summary.margin_amount`: `sale_amount - real_cost_amount`.
- `v_client_economic_summary.real_cost_amount`: suma de `v_work_order_economic_summary.real_cost_amount` agrupada previamente por `company_id, client_id`.
- `v_client_economic_summary.sale_amount`: presupuestos aceptados/ejecutados agrupados previamente por `company_id, client_id`; si no existen, venta de partes agrupada.
- `v_client_economic_summary.margin_amount`: `sale_amount - real_cost_amount`.
- `v_management_metrics.work_orders_this_month`: cuenta partes por `scheduled_date`, que es la fecha operativa real confirmada del parte.
- `v_management_metrics.real_cost`: suma de costes reales desde `v_work_order_economic_summary` agrupada por `company_id`.
- `v_management_metrics.sale_amount`: suma de presupuestos aceptados/ejecutados sin IVA agrupada por `company_id`.

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
- El error `column "created_at" does not exist` se produjo porque `v_management_metrics` consultaba `created_at` sobre `v_work_order_economic_summary`, una vista que no expone esa columna, no sobre `work_orders` directamente.
- La causa raiz de la cadena de errores fue crear vistas economicas desde supuestos parciales de esquema y desde columnas proyectadas por otras vistas, en lugar de definir una capa economica estable desde las tablas reales y sus columnas confirmadas.

## Correcciones Aplicadas
- Nueva migracion `040_validate_economic_calculations.sql`.
- Reemplaza `v_work_order_economic_summary` con columnas claras: `real_cost`, `sale_amount`, `margin_amount`, `margin_percentage`.
- Reemplaza `v_client_economic_summary` con CTEs agregados separados para partes y presupuestos, evitando duplicidades por joins.
- Reemplaza `v_management_metrics` para separar `sale_amount`, `tax_amount`, `total_amount`, `real_cost`, `margin_amount`, `margin_percentage`.
- Usa `scheduled_date` como fecha operativa de parte para estadisticas de mes.
- Recalcula costes desde columnas reales: `used_quantity * unit_cost`, `duration_minutes / 60 * hourly_cost`, `quantity * unit_cost`.
- UI de Gerencia muestra venta sin IVA, coste real, margen, garantias y pendiente facturar.

## Estado
- No se han creado datos ficticios.
- No se usa `service_role`.
- Las vistas nuevas usan `security_invoker = true`.
- Los calculos quedan preparados para dashboards, pero cobros reales quedan pendientes hasta el modulo de cobros.
