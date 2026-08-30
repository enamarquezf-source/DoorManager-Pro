# Probe final de bootstrap y conciliacion de stock

## Alcance

Analisis de contexto previo a inicializar `warehouse_stock` como modelo canonico. No se ha ejecutado SQL remoto, no se ha modificado migration ni codigo productivo, no se ha hecho commit y no se ha hecho push.

## PROBE

- Archivo: `supabase/verification/probe_stock_bootstrap_context_094.sql`
- Read-only: si.
- Result set: unico, con secciones `WAREHOUSES`, `WAREHOUSE_STOCK_EXISTING`, `MISMATCH_CONTEXT` y `STOCK_MODEL_COUNTS`.
- No invoca RPCs mutadoras.
- Incluye `to_jsonb(w)` para conservar cualquier campo real adicional del warehouse sin asumir columnas `type`, `default` o `principal` que no existen en el esquema conocido.
- `movement_balance`: no se calcula; se muestran conteo, fechas y tipos.
- Validacion local: `parsed_statements = 1` con `pg-query-emscripten`.

## Resultado remoto ya disponible

El probe de conciliacion anterior informa:

- 26 materiales `MATERIALS_ONLY`.
- 3 materiales `MISMATCH`.
- 0 `MATCH`.
- 0 `WAREHOUSE_ONLY`.
- `movement_balance = NULL` en todos.

Mismatch recibido:

| Material | `materials.stock_quantity` | `warehouse_stock_total` | Filas warehouse |
| --- | ---: | ---: | ---: |
| `MAT-CAB-001` | 275 | 120 | 1 |
| `MAT-CON-001` | 10 | 3 | 1 |
| `MAT-FOT-001` | 4 | 6 | 1 |

Este resultado no permite inicializar automaticamente todos los `materials.stock_quantity` ni considerar reconciliado el stock distribuido.

## WAREHOUSE MODEL

### Tablas

`001_initial_dmp_schema.sql` define `warehouses`, `warehouse_stock` y `stock_movements`.

### Campos relevantes

- `warehouses`: `id`, `company_id`, `code`, `name`, `address`, `active`, `deleted_at`.
- `warehouse_stock`: `warehouse_id`, `material_id`, `quantity`, `reserved_quantity`, `company_id`.
- `stock_movements`: `warehouse_id`, `material_id`, `movement_type`, `quantity`, `work_order_id`, `supplier_id`, `created_by`, `created_at`.

No existen en el esquema conocido columnas explicitas `type`, `is_default`, `is_primary` o equivalente en `warehouses`. El nombre/codigo puede sugerir funcion, pero no constituye una autoridad funcional suficiente.

### Warehouse principal demostrable

**No en el runtime remoto con la evidencia actual.**

El seed local crea un warehouse demo `ALM-CENTRAL` / `Almacen central`, pero eso solo prueba el origen de los datos demo del repositorio, no que ese warehouse sea el almacen principal operativo de la company remota ni que sea el origen de los consumos historicos.

El nuevo probe mostrara todos los warehouses, su empresa, estado y registro JSON completo para resolver esta decision sin asumirlo.

## MISMATCH ORIGIN

### `MAT-CAB-001`

- El material y el codigo aparecen en `supabase/seed.sql` como dato demo.
- El valor `120` de `warehouse_stock` aparece explicitamente en seed para el warehouse `ALM-CENTRAL`.
- El valor `275` no aparece en migrations, seed, fixtures ni tests revisados.
- Clasificacion del origen: `DEMO/SEED` para `120`; `PRODUCTIVE-UNKNOWN` para `275`.
- No hay evidencia local que demuestre si `275` procede de alta manual, ajuste, importacion u otra operacion remota.

### `MAT-CON-001`

- El material y el codigo aparecen en `supabase/seed.sql` como dato demo.
- El valor `3` de `warehouse_stock` aparece explicitamente en seed para `ALM-CENTRAL`.
- El valor `10` no aparece en migrations, seed, fixtures ni tests revisados.
- Clasificacion del origen: `DEMO/SEED` para `3`; `PRODUCTIVE-UNKNOWN` para `10`.
- No hay evidencia local del origen remoto del valor `10`.

### `MAT-FOT-001`

- El material y el codigo aparecen en `supabase/seed.sql` como dato demo.
- El valor `6` de `warehouse_stock` aparece explicitamente en seed para `ALM-CENTRAL`.
- El valor `4` no aparece en migrations, seed, fixtures ni tests revisados.
- Clasificacion del origen: `DEMO/SEED` para `6`; `PRODUCTIVE-UNKNOWN` para `4`.
- No hay evidencia local del origen remoto del valor `4`.

### Conclusión de origen

Los tres valores del warehouse (`120`, `3`, `6`) tienen origen demo/seed demostrable. Los tres valores globales remotos (`275`, `10`, `4`) son productivos desconocidos desde la evidencia local. No se debe elegir uno de los dos saldos automaticamente ni convertir la diferencia en un ajuste.

## MOVIMIENTOS

El esquema permite que `stock_movements` relacione warehouse, material, proveedor y parte, pero no hay escrituras modernas de runtime que actualicen `warehouse_stock`. El seed tampoco crea movimientos para las tres filas demo.

`material_stock_movements` tiene saldo anterior/nuevo, pero pertenece al modelo global `materials.stock_quantity` y no contiene warehouse. No puede explicar de forma determinista una cantidad por almacen.

Por eso el probe final no suma balances. Solo muestra movimientos asociados y sus fechas/tipos; `movement_balance` sigue siendo `NULL`.

## BOOTSTRAP OPTIONS

### A) Migrar legacy a warehouse existente

No aprobarla todavia. Solo seria valida si el probe demuestra un warehouse funcionalmente general, de la misma company, activo y adecuado para absorver legacy, y si existe una regla humana para resolver los mismatches.

### B) Mantener legacy temporalmente

Es la opcion segura inmediata. Mantiene `materials.stock_quantity` y `warehouse_stock` sin afirmar que sean equivalentes, clasifica las diferencias y evita inventar origen o ajustar stock sin evidencia.

### C) Crear proceso explicito de apertura inicial

Es la opcion recomendada para la consolidacion posterior. Debe ser una operacion autorizada y auditable, con warehouse elegido expresamente, cantidad contada/aceptada, motivo de apertura, actor, fecha y referencia de conciliacion. No debe deducir cantidades automaticamente de los mismatches.

### D) Otra opcion

Si el probe demuestra que los warehouses actuales son solo demo o que faltan warehouses operativos, mantener B y preparar C con un almacen funcional definido por la empresa. No crear un warehouse ficticio desde 094.

### Recomendacion

**B ahora, C como transicion aprobable despues del probe.** No migrar automaticamente los 26 `MATERIALS_ONLY` ni resolver los 3 mismatches con una regla global.

## DECISION

`warehouse_stock.quantity` sigue siendo el candidato correcto a saldo canonico por ubicacion, pero la inicializacion no esta autorizada con la evidencia actual.

El contexto remoto requerido debe obtenerse ejecutando posteriormente `probe_stock_bootstrap_context_094.sql`. Hasta entonces:

- no se asume `ALM-CENTRAL` como almacen operativo;
- no se sobreescriben cantidades;
- no se recalculan balances historicos;
- no se generan movimientos de apertura;
- no se elimina `materials.stock_quantity`;
- no se implementa 094.

**PROBE DE BOOTSTRAP 094 PREPARADO — ESPERANDO EJECUCION REMOTA**
