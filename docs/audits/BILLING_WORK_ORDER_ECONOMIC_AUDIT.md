# Billing Work Order Economic Audit

## Alcance y evidencia

Auditoria de `PAR-2026-000028` y `FAC-2026-000011`. Esta segunda fase usa los resultados remotos proporcionados por el Product Owner y los contrasta con el codigo y las migraciones del repositorio.

No se ejecuto SQL remoto ni local. No se modificaron datos, migraciones, RPCs ni reglas fundacionales.

### Hechos remotos confirmados

| Concepto | Cantidad | Coste | Venta | Total venta |
|---|---:|---:|---:|---:|
| Horas | 6 h | 22 EUR/h | 110 EUR/h | 660 EUR |
| Desplazamiento | 1 ud | 35 EUR | 55 EUR | 55 EUR |
| TS970 / `MAT-000010` | 1 ud | 200 EUR snapshot | 0 EUR snapshot | 0 EUR |

- `contributes_to_sale=false` para desplazamiento y material.
- Coste real: `132 + 35 + 200 = 367 EUR`.
- Venta: `660 EUR`.
- Margen: `293 EUR`.
- Factura: subtotal `660 EUR`, IVA `138.60 EUR`, total `798.60 EUR`.
- `invoice_work_orders`: una fila generica por `660 EUR`.
- `fiscal_snapshot`: una linea generica por `660 EUR`.
- Warning: desglose economico incompleto.
- Auditoria `INVOICE_DRAFT_CREATE`: `line_count=2`, `desglose_real=true`.

## CONTRIBUCIÓN A VENTA

### Semantica actual

`contributes_to_sale` existe en `rate_catalog`, `quote_lines`, `work_order_materials`, `work_order_time_entries` y `work_order_cost_entries`.

- En catalogo de tarifas, decide si el concepto puede contribuir a venta y se copia al snapshot de coste/servicio.
- En materiales y horas, el RPC `dmp_set_work_order_entry_billing` lo cambia junto con `source`: `additional` si es vendible fuera de presupuesto, `manual` si no.
- En costes auxiliares, lo asignan los RPCs de conceptos/tarifas y se conserva en el snapshot.
- En lineas de presupuesto, representa una propiedad de la linea, pero las lineas del presupuesto aceptado se facturan por su propio importe, no por un filtro de `quote_lines.contributes_to_sale`.
- Para consumos y horas existentes en partes con presupuesto, `073` los normaliza como `source='quote'` y `contributes_to_sale=false`.

### Clasificacion

`PARTIAL / BROKEN SEMANTICALLY`.

La bandera es canónica en el camino de adicionales y en costes auxiliares, pero no es una condición uniforme de venta operativa. En `067/068/073`, el cálculo sin presupuesto suma todas las horas por `total_price`, aunque `contributes_to_sale=false`; materiales también se suman por `total_price`; solo los costes auxiliares aplican `source <> 'quote' and contributes_to_sale`.

Por eso las horas del caso entran en venta aunque tengan la bandera a `false`. El comportamiento actual es una mezcla de snapshot de precio y bandera parcial, no un contrato único.

## HORAS

El `660` queda explicado por el snapshot de horas:

```text
duration_minutes / 60 * hourly_price
6 * 110 = 660 EUR
```

El código que lo persiste es `dmp_finalize_work_order_technical` en `073`/`068`:

```sql
select round(coalesce(sum(total_price),0),2)
into v_operational_sale
from (
  select total_price
  from public.work_order_materials
  where ...
  union all
  select total_price
  from public.work_order_time_entries
  where ...
  union all
  select total_price
  from public.work_order_cost_entries
  where ...
    and source <> 'quote'
    and contributes_to_sale
) x;
```

La rama de `work_order_time_entries` no filtra `contributes_to_sale`. En consecuencia, hoy `hourly_price > 0` y `total_price > 0` bastan de hecho para incluir horas en la venta operativa. Esto parece una deuda técnica: la UI sí permite marcar horas adicionales en ciertos partes, pero el cierre sin presupuesto no exige una decisión económica explícita por entrada.

## DESPLAZAMIENTO

El desplazamiento remoto tiene `unit_price=55`, `total_price=55`, pero `contributes_to_sale=false`. No entra en el `sale_amount` porque la fórmula auxiliar canónica de `073` aplica:

```sql
source <> 'quote' and contributes_to_sale
```

`cost_type='desplazamiento'` solo clasifica el coste interno; no fuerza venta. `unit_price=55` tampoco basta por sí solo.

Para que entre en una venta operativa debería existir un snapshot explícitamente vendible: `source` compatible, `unit_price=55`, `total_price=55` y `contributes_to_sale=true`. El coste interno de `35` seguiría conservándose aparte.

## MATERIAL TS970

El material tiene snapshot de coste `200`, pero `unit_price=0`, `total_price=0` y `contributes_to_sale=false`. El catálogo actual `materials.price=350` no debe usarse retrospectivamente: el importe histórico debe proceder del snapshot del parte.

El modelo existente ya permite establecer el snapshot mediante `work_order_materials.unit_price` y sus triggers/RPCs calculan `total_price`. La UI de material permite seleccionar catalogo y copiar su precio, y permite editar precio a perfiles con acceso económico; sin embargo, no existe una revisión económica clara y separada que confirme simultáneamente precio vendible y bandera por cada consumo.

La recomendación es conservar `200` como coste real y decidir explícitamente si el consumo es vendible. Si lo fuera en el momento de uso, habría que fijar entonces el precio histórico acordado, no leer `350` ahora.

## SALE_AMOUNT

La función canónica de cierre técnico es `dmp_finalize_work_order_technical`, cuya versión final relevante está en `073_fix`/`068`:

```text
real_cost = sum(material.total_cost + time.total_cost + cost.total_cost)

accepted_quote = latest accepted quote taxable_base/subtotal_sale/subtotal
additional_sale = additional snapshots with source='additional' and contributes_to_sale
operational_sale = material.total_price
                + time.total_price
                + auxiliary.total_price where source <> 'quote' and contributes_to_sale

if warranty or not billable:
  sale = 0
else if accepted_quote exists:
  sale = accepted_quote + additional_sale
else:
  sale = operational_sale
```

En el cierre se congelan `sale_amount`, `estimated_sale_amount`, `quoted_sale_amount`, `additional_sale_amount`, `real_cost_amount` y `margin_amount` en `work_orders`, y se registra auditoria.

El flujo de factura no recalcula esa economía: `dmp_prepare_invoice_from_work_order` consume `work_orders.sale_amount` como `v_sale`.

## REVISIÓN HUMANA

- SAT puede ver horas, materiales, costes auxiliares, flags SAT y el resumen económico según permisos.
- SAT puede registrar/editar horas, materiales y costes por RPC, pero la revisión SAT actual se centra en destino, flags y comentario; no es una tabla de decisiones económicas por concepto.
- Comercial ve la venta calculada y confirma el envío a Facturación con comentario obligatorio.
- Oficina recibe la economía cerrada y conserva preparación/edición/emisión de facturas; no modifica la revisión económica por concepto.
- La decisión adicional existe para horas/materiales/costes mediante `dmp_set_work_order_entry_billing`, pero no hay una pantalla unificada que muestre coste, precio venta, facturable, cantidad y total de cada componente y exija confirmación.
- 099 deja en `ECONOMIC_REVIEW_APPROVE` el antes/después de precio, total, `contributes_to_sale` y `source` de cada línea; no existen triggers genéricos de auditoría para estas tablas.

Gap real: la revisión humana valida el parte agregado, no una reconciliación explícita de cada concepto vendible. La decisión recomendada debe ejecutarse antes de congelar `sale_amount`.

## INVOICE_WORK_ORDERS

DDL base en `074` y ampliaciones en `078`:

- PK: `id uuid`.
- FK: `company_id -> companies`, `invoice_id -> invoices`, `work_order_id -> work_orders`.
- Campos: `description`, `quantity`, `unit_price`, `discount`, `subtotal`, `tax_rate`, `tax_amount`, `total_amount`, `created_at`, `deleted_at`.
- Indice: `(company_id, invoice_id)` para filas activas.
- 099 elimina `invoice_work_orders_active_work_unique` y crea `invoice_work_orders_active_work_lookup(company_id, work_order_id)` para permitir múltiples líneas del mismo parte.
- RLS activo; lectura para roles económicos; INSERT/UPDATE/DELETE directo denegado, escritura mediante RPC.

### Multiples lineas

Todas las líneas estructuradas de un parte llevan su mismo `work_order_id`; la idempotencia se resuelve con `FOR UPDATE`, devolución del borrador existente y rechazo de varias facturas activas distintas. 099 limita el borrador a un único parte.

El modelo es reutilizable para presentación detallada de horas, material y desplazamiento porque ya tiene cantidad, precio unitario, descuento y totales. Su limitación es de trazabilidad: no tiene `source_type`, `source_id` ni `line_kind`. Esos campos no deben añadirse automáticamente; primero debe decidirse si el `fiscal_snapshot` y el `description` son suficientes para la presentación final.

## LINE_COUNT=2 Y WARNING

El origen está en `079_invoice_draft_detail_and_idempotent_prepare.sql`:

1. En parte sin presupuesto, el procedimiento intenta insertar líneas positivas de materiales, horas y costes.
2. Incrementa `v_line_count` y pone `v_has_detail=true` por cada línea insertada.
3. Calcula `v_detail_total`.
4. Si `not v_has_detail` o `v_detail_total <> v_sale`, elimina todas las líneas activas.
5. Inserta una línea genérica por `v_sale` y añade el warning.
6. La auditoría escribe el `line_count` acumulado y `desglose_real=v_has_detail`, sin recalcularlos después del fallback.

Con los datos remotos, la explicación coherente es:

```text
línea 1: horas = 660 EUR
línea 2: desplazamiento = 55 EUR
subtotal provisional = 715 EUR
sale_amount = 660 EUR
fallback genérico = 660 EUR
```

Así, `line_count=2` significa líneas candidatas insertadas antes del fallback, no líneas finales de factura. `desglose_real=true` significa que se encontró algún detalle positivo, no que ese detalle sobreviviera ni que representara exactamente el importe fiscal. Es una contradicción de nomenclatura/auditoría y una pérdida de trazabilidad, no una diferencia de subtotal final.

## EMISIÓN Y WARNING

El warning se activa cuando el detalle no existe o su suma no coincide con `v_sale`. La emisión posterior, `dmp_issue_invoice`, solo verifica que haya una línea válida, totales positivos y partes asociados válidos; no bloquea por warning ni exige reconciliación detallada.

### Decisión recomendada

**Opción B: permitir override explícito con motivo obligatorio y auditoría.**

- A bloquear siempre: protege integridad, pero impide facturar legítimamente conceptos agrupados/comerciales.
- B override auditado: distingue una agrupación consciente de una pérdida accidental de detalle.
- C warning actual: demasiado débil porque permite emitir sin decisión humana.

El override debe guardar actor, motivo, importe reconciliado y estado del detalle. No se implementa en esta fase.

## ECONOMÍA INTERNA Y PRESENTACIÓN AL CLIENTE

El diseño recomendado separa dos niveles sin duplicar la economía:

- Economía interna: `work_order_time_entries`, `work_order_materials`, `work_order_cost_entries`, con coste, snapshot de venta, bandera, origen y auditoría.
- Presentación fiscal: `invoice_work_orders`, con líneas detalladas, agrupadas o comerciales según decisión humana; `invoices.fiscal_snapshot` congela la representación emitida.

`invoice_work_orders` puede representar la presentación final, pero no debe ser la fuente de coste real ni sustituir los snapshots del parte.

## FLUJOS PROPUESTOS

### Sin presupuesto

```text
Parte
-> snapshots técnicos de horas/materiales/auxiliares
-> revisión económica por concepto
-> congelar sale_amount y margen
-> preparar líneas invoice_work_orders
-> override auditado si se agrupa
-> emitir y congelar fiscal_snapshot
```

Un consumo usado no implica automáticamente consumo vendible. Debe ser posible coste positivo con venta cero.

### Con presupuesto

```text
Presupuesto aceptado
-> conceptos incluidos identificados como quote
-> consumos incluidos no se vuelven a facturar
-> adicionales explícitos con source='additional' y contributes_to_sale=true
-> accepted_quote + additional_sale
```

Las decisiones `utilizado`/`no_utilizado` y las relaciones con `quote_line_id` distinguen incluido, extra y no realizado. No se debe volver a cobrar un consumo incluido en el presupuesto.

### Contrato y garantía

El modelo debe conservar coste real aunque la venta sea cero:

- horas registradas con venta `0`;
- material consumido con venta `0`;
- desplazamiento con venta `0`;
- garantía/no facturable con `sale_amount=0` pero costes intactos.

`used` no debe equivaler a `billable`.

## MATRIZ DE DECISIÓN

| Tema | Estado actual | Opción A | Opción B | Recomendación | Migration |
|---|---|---|---|---|---|
| `contributes_to_sale` | Parcial; horas sin filtro en no-quote | Ignorar bandera | Aplicarla uniformemente por snapshot | B | Sí, una consolidada |
| Snapshot de precio | Existe, pero UI/revisión no es uniforme | Leer catálogo actual | Congelar precio al registrar/decidir | B | No estructural; sí RPC si cambia flujo |
| Revisión económica | Agregada por parte | Mantener flags | Revisión por concepto con resumen | B | Sí para persistir decisión si se exige |
| `sale_amount` | Se congela en cierre técnico | Mantener fórmula actual | Fórmula uniforme con bandera | B | Sí |
| `invoice_work_orders` | Líneas económicas sin source trace | Nueva tabla | Reutilizar tabla existente | Reutilizar; valorar trace solo si necesario | No inicialmente |
| Líneas múltiples | Bloqueadas por `work_order_id` único; null permite extras | Quitar índice | Asociar solo primera y extras null | Mantener ahora; revisar modelo de relación | No ahora |
| Source trace | `description` y snapshots; sin `source_type/id` | Añadir campos | Usar fiscal snapshot/description | B: no añadir hasta requisito real | No ahora |
| Warning | Permite emitir sin override | Bloquear siempre | Override con motivo | B | Sí |
| Agrupación cliente | Fallback genérico automático | Detalle obligatorio | Agrupación elegida y auditada | B | Sí |
| Presupuesto | Aceptado + adicionales | Recalcular consumos incluidos | Separar quote/additional | B, ya modelado conceptualmente | No nueva tabla |
| Contrato | Coste y venta se pueden separar | `used=billable` | Coste independiente de venta | B | No |
| Garantía | Venta cero y coste conservado | Bloquear todo | Permitir coste sin venta | B | No estructural |

## ARQUITECTURA FINAL PROPUESTA

- Tablas actuales: `work_orders`, `work_order_time_entries`, `work_order_materials`, `work_order_cost_entries`, `quotes`, `quote_lines`, `invoices`, `invoice_work_orders`, `audit_log` y catálogo/versiones de tarifas.
- Tabla nueva: **no necesaria** para resolver el caso conocido.
- Migraciones necesarias para implementar la recomendación: **una migración consolidada**, no una cadena de hotfixes, porque habría que alinear fórmula, revisión y override de emisión.
- En esta fase: **una migration consolidada aplicada correctamente en Supabase remoto**.

## CONTRATO FINAL DE IMPLEMENTACIÓN

Este apartado fija el diseño implementado y publicado. La migration 099 fue aplicada correctamente en Supabase remoto; PostgreSQL local no está disponible.

### 1. Fuente de verdad y snapshots

- `work_order_time_entries`, `work_order_materials` y `work_order_cost_entries` conservan los hechos operativos y sus snapshots de coste/venta.
- `materials.price`, tarifas actuales o líneas de catálogo nunca recalculan retrospectivamente un parte cerrado o facturado.
- `sale_amount`, `real_cost_amount` y `margin_amount` se congelan en el cierre económico; una revisión posterior solo puede producir una transición auditada o un nuevo documento, nunca una mutación silenciosa.
- `invoices.fiscal_snapshot` es la fuente de verdad de la representación fiscal emitida. No se reescribe por cambios posteriores en el parte o catálogo.

### 2. Fórmula única de venta

La migration debe hacer que el mismo predicado gobierne cierre, revisión y preparación de factura:

```text
cost_amount = sum(material.total_cost + time.total_cost + auxiliary.total_cost)

if warranty or billable=false:
  sale_amount = 0
else if accepted_quote exists:
  sale_amount = accepted_quote_snapshot +
                sum(additional entries where contributes_to_sale=true)
else:
  sale_amount = sum(material.total_price where contributes_to_sale=true) +
                sum(time.total_price where contributes_to_sale=true) +
                sum(auxiliary.total_price where contributes_to_sale=true)
```

- La condición `contributes_to_sale=true` es obligatoria en las tres familias cuando se calcula venta operativa.
- `used`, `registered` o `total_price>0` no significan `billable`.
- Un coste puede ser positivo con venta cero; esto aplica a garantía, contrato, gesto comercial, desplazamiento no vendible y material no repercutido.
- Con presupuesto aceptado, una línea incluida no se suma otra vez como consumo operativo; solo se suman adicionales explícitos y vendibles.
- El snapshot de la venta debe conservar origen, decisión de facturación, cantidad, precio unitario, total, referencia a presupuesto cuando exista y actor/fecha de la decisión.

### 3. Estados y transición económica

La revisión económica debe integrarse en los estados existentes sin crear un flujo paralelo:

```text
Finalizado tecnicamente
  -> SAT aprobado / devuelto
  -> Comercial pendiente / aprobado (solo si SAT enruta a Comercial)
  -> Facturacion pendiente
  -> economia congelada
  -> borrador de factura
  -> factura emitida
```

- SAT registra hechos y valoración técnica: garantía probable, material/hora usados, flags y observaciones.
- El Comercial asignado decide normalmente `facturar`, `no_facturar`, `facturar_parcialmente`, `gesto_comercial` o `garantia`.
- Gerencia y `superadmin` no sustituyen silenciosamente al Comercial: solo pueden usar un override si la política vigente lo permite, con motivo obligatorio y auditoría específica.
- Oficina prepara y emite fiscalmente; no decide por defecto la cobertura comercial.
- Para venta cero por garantía/no facturable debe conservarse la economía interna, pero no se debe generar factura positiva desde ese parte.
- Toda transición inválida debe fallar de forma atómica antes de modificar snapshots o crear una factura.

### 4. Revisión por concepto

La revisión debe mostrar en una única vista, para cada entrada positiva o relevante:

| Dato | Obligatorio |
|---|---:|
| Familia y descripción | Sí |
| Cantidad y unidad | Sí |
| Coste unitario y coste total | Sí |
| Precio de venta unitario y total | Sí |
| `source` / presupuesto relacionado | Sí |
| `contributes_to_sale` | Sí |
| Resultado (`incluido`, `adicional`, `no vendible`, `no realizado`) | Sí |
| Observación y actor de decisión | Cuando haya cambio u override |

La confirmación de parte debe persistir una auditoría con valores anteriores y nuevos, actor, fecha, motivo y resultado de la reconciliación. El comentario agregado de SAT/Comercial no sustituye esta evidencia.

### 5. Facturación y fallback

- `invoice_work_orders` se reutiliza para las líneas finales; no se crea otra tabla en esta fase.
- Se retira el índice que impedía varias líneas activas del mismo `work_order_id`; la primera línea conserva la asociación estructural y las demás quedan asociadas por factura y descripción/snapshot.
- Las líneas adicionales pueden usar `work_order_id=null`, pero la relación con el parte debe quedar en la descripción/snapshot hasta que exista un requisito de trazabilidad estructurada.
- La preparación debe generar detalle únicamente con conceptos ya reconciliados y cuyo subtotal coincida con el `sale_amount` congelado.
- Si no coincide, no debe etiquetar el resultado como `desglose_real`. Debe dejar el borrador en estado que requiera decisión explícita.
- No se crea fallback genérico automáticamente. Un borrador inconsistente conserva sus líneas candidatas y solo puede emitirse mediante override con motivo, actor, importe esperado/real y estado auditados.
- `dmp_issue_invoice` debe rechazar un borrador con fallback no aprobado o warning sin resolver; debe seguir permitiendo agrupación aprobada.
- Tras emitir, la factura y sus líneas quedan congeladas fiscalmente; la corrección posterior requiere el flujo fiscal aplicable, no editar el parte histórico.

### 6. Contrato de la migración única

La implementación futura debe seguir este orden transaccional, con preflight y postflight en la misma migración o en verificaciones explícitamente asociadas:

1. Detectar partes con snapshots incompletos, `contributes_to_sale` nulo/incoherente, facturas borrador con warning y facturas emitidas afectadas.
2. No alterar facturas emitidas ni recalcularlas desde catálogo.
3. Normalizar solo estados/snapshots no fiscales y registrar cada corrección en `audit_log`.
4. Actualizar el cálculo de cierre para usar el predicado uniforme.
5. Persistir la decisión económica por concepto usando columnas existentes cuando sea suficiente; añadir estructura solo si el preflight demuestra que el snapshot actual no permite reconstruirla.
6. Ajustar revisión SAT/Comercial/Oficina y permisos, incluyendo override separado y auditado.
7. Ajustar preparación/emisión de factura y eliminar la falsa señal `desglose_real` tras fallback.
8. Ejecutar postflight: invariantes de importes, unicidad de asociación, no modificación fiscal y ausencia de facturas positivas desde partes no facturables.

La migración no debe resolver en paralelo el movimiento oficial de stock del técnico (`RB-019`), compras, reservas o reposición. Esos incumplimientos pertenecen a un cambio operativo separado para no mezclar trazabilidad logística con el cierre económico.

### 7. Matriz de permisos objetivo

| Acción | Técnico | SAT | Comercial asignado | Oficina | Gerencia / superadmin |
|---|---:|---:|---:|---:|---:|
| Registrar hechos técnicos | Sí | Sí | No | No | Según política |
| Corregir snapshot de coste | No | Sí | No | No | Override auditado |
| Decidir vendible/no vendible | No | Propuesta | Sí | No | Override auditado |
| Aprobar fallback/desglose | No | No | Sí, si afecta decisión comercial | Ejecuta decisión | Override auditado |
| Preparar borrador | No | No | No | Sí | Sí |
| Editar líneas de borrador | No | No | Según política, sin cambiar economía del parte | Sí | Sí |
| Emitir factura | No | No | No | Sí | Sí |

### 8. Criterios de aceptación

- El caso `PAR-2026-000028` conserva coste `367`, venta `660`, margen `293` y factura subtotal `660` sin leer el catálogo actual de TS970.
- Una hora con `total_price>0` y `contributes_to_sale=false` no aumenta `sale_amount` en un parte sin presupuesto.
- Un desplazamiento con precio snapshot positivo y flag falso no entra en venta, pero sí en coste.
- Un material consumido con coste positivo y venta cero conserva ambos snapshots correctamente.
- Un presupuesto aceptado no duplica líneas incluidas; un adicional explícito sí se suma cuando es vendible.
- Una discrepancia entre detalle y `sale_amount` no puede emitirse sin override, motivo y auditoría.
- Un Comercial no asignado no puede aprobar como autoridad normal; un override superior queda distinguible y auditado.
- Una factura emitida no cambia al modificar catálogo, parte o snapshots posteriores.
- El cierre y la emisión son idempotentes y no crean asociaciones activas duplicadas.

### 9. Límites de la implementación preparada

- No ejecutar ni aplicar SQL local o remoto.
- No crear tablas nuevas; la migration preparada añade únicamente metadatos mínimos a `work_orders` e `invoices`.
- No corregir todavía el flujo completo de stock, compras o reposición.
- No introducir un Business Rules Engine; las políticas siguen siendo configuración futura.

## IMPLEMENTACIÓN PUBLICADA

### Paquete

- Migration única: `supabase/migrations/099_economic_review_and_structured_billing.sql`.
- Preflight read-only: `supabase/verification/preflight_economic_review_099.sql`.
- Postflight read-only: `supabase/verification/postflight_economic_review_099.sql`.
- Panel de revisión: `src/components/EconomicReviewPanel.tsx`.
- Helpers/test de economía: `src/shared/economicReview.ts` y `src/db/economicReview099.test.ts`.
- Servicios actualizados: `src/services/workOrdersService.ts` y `src/services/billingService.ts`.
- Integración de panel: `src/App.tsx`.

### Cambios materializados

- `dmp_calculate_work_order_economics(uuid)` es la autoridad SQL única para coste, venta y margen.
- `dmp_review_work_order_economic(uuid,jsonb,text)` congela precios de venta, conserva `source`, aplica `contributes_to_sale` y guarda antes/después de líneas con auditoría.
- Con presupuesto, solo los adicionales con `source='additional'` y `contributes_to_sale=true` suman fuera del presupuesto; sin presupuesto, se excluye `source='quote'`.
- Un precio, cantidad o total nulo/cero bloquea la aprobación de un concepto marcado como vendible.
- `invoice_work_orders_active_work_unique` se sustituye por un índice de consulta no único.
- Preparación conserva el detalle cuando hay mismatch y marca `economic_detail_status='inconsistent'`.
- Emisión revalida elegibilidad, revisión, economía actual y suma de líneas; bloquea stale mismatch salvo `p_override=true` con motivo y rol de Oficina, Gerencia o superadmin.
- La emisión exige que todas las líneas activas tengan el mismo `work_order_id`; no repara enlaces nulos o ajenos.
- El audit de emisión conserva `old_data` y registra `expected_amount=v_current_sale`, `actual_amount=v_subtotal` más los valores anteriores.
- Se preserva la overload legacy `dmp_issue_invoice(uuid)` mediante wrapper seguro sobre el contrato de override.
- Se preservan las RPC de borrado de borradores 092/093 y la elegibilidad 091.
- No se crea tabla de liquidación ni `invoice_lines`.

### Estado de validación

- Preflight/postflight/migration: parseados correctamente por `pg-query-emscripten`; no ejecutados contra una base de datos.
- PostgreSQL local: `NO_PSQL_LOCAL`.
- Tests: `136` archivos y `950` tests pasan.
- Build: `npm.cmd run build` pasa; Vite mantiene únicamente el warning existente de tamaño de chunks.
- `git diff --check`: correcto; solo informa la conversión normalizada LF/CRLF de archivos modificados.
- Garantía parcial: permanece fuera de este contrato; el helper cliente queda alineado con 091 y el diseño congelado de garantías.
- Calculador económico: tenant-scoped mediante `assert_member_of_current_company`; sin `EXECUTE` directo para `authenticated`, por lo que Técnico no puede invocarlo como RPC administrativa.
- Preflight: histórico de `audit_log` y constraint actual se comparan con el allow-set de 099 antes de aplicar.
- SQL remoto: preflight y postflight ejecutados correctamente; todos los checks remotos son `true`.
- Migration: aplicada correctamente en Supabase remoto.
- Git: publicación final en curso; el commit y el push se registran tras completar el protocolo de publicación.

## CONCLUSIÓN

El importe de `660 EUR` está soportado por las 6 horas a `110 EUR/h`. El desplazamiento de `55 EUR` y el TS970 de venta cero no forman parte de `sale_amount`; sus costes sí forman parte del coste real. 099 conserva todas las líneas estructuradas asociadas al parte y exige excepción auditada cuando el detalle no coincide con el importe aprobado.

El defecto prioritario no es crear otra tabla: es unificar la semántica de `contributes_to_sale`, hacer explícita la revisión económica y convertir el fallback genérico en una decisión auditada.

**IMPLEMENTACIÓN ECONÓMICA 099 PUBLICADA Y ALINEADA CON SUPABASE**
