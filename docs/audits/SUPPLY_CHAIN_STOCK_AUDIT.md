# Auditoria completa de abastecimiento, compras y stock

## Alcance y restricciones

Auditoria estatica del repositorio actual. No se ha modificado codigo productivo, no se ha creado ni aplicado migration, no se ha ejecutado SQL remoto, no se ha hecho commit y no se ha hecho push.

Se revisaron las migraciones, el esquema inicial, seed, servicios, UI, permisos, tests y la documentacion fundacional y operativa relacionada con proveedores, solicitudes, compras, stock, costes y trazabilidad.

## DOCUMENTOS LEIDOS

- `docs/PROJECT_DNA.md`
- `docs/CONSTITUTION.md`
- `docs/PRODUCT_BIBLE.md`
- `docs/BUSINESS_RULES.md`
- `docs/SECURITY.md`
- `docs/audits/FOUNDATIONAL_ALIGNMENT_AUDIT.md`
- `docs/audits/STOCK_CURRENT_AUDIT.md`
- `docs/03-modelo-datos.md`
- `docs/01-requisitos-funcionales.md`
- `docs/DATABASE_SCHEMA.md`
- `docs/17-clientes-proveedores.md`
- `docs/OPERATIONS/SUPPLIERS_PURCHASING_AND_STOCK.md`
- `docs/OPERATIONS/STOCK_RELIABILITY.md`
- `docs/OPERATIONS/MATERIAL_REQUESTS.md`
- `docs/OPERATIONS/TECHNICAL_HISTORY_AND_SEARCH.md`
- `supabase/migrations/001_initial_dmp_schema.sql`
- `supabase/migrations/006_check_templates_and_offline_material_sync.sql`
- `supabase/migrations/010_security_rls_integrity_transactions.sql`
- `supabase/migrations/011_harden_legacy_rpc_and_views.sql`
- `supabase/migrations/012_rls_critical_policy_cleanup.sql`
- `supabase/migrations/020_check_sync_end_to_end.sql`
- `supabase/migrations/022_security_lifecycle_controls.sql`
- `supabase/migrations/023_work_order_operations_and_controlled_delete.sql`
- `supabase/migrations/024_operational_assignment_and_time_materials_fix.sql`
- `supabase/migrations/035_material_stock_control.sql`
- `supabase/migrations/052_material_lifecycle_rate_traceability.sql`
- `supabase/migrations/055_test_data_purge_controls.sql`
- `supabase/migrations/058_fix_work_order_material_economics.sql`
- `supabase/migrations/075_material_stock_write_boundary.sql`
- `supabase/seed.sql`
- `src/services/materialsService.ts`
- `src/services/dashboardService.ts`
- `src/services/workOrdersService.ts`
- `src/services/technicianOfflineService.ts`
- `src/auth/permissions.ts`
- `src/App.tsx`
- `src/db/materialsModule.test.ts`
- `src/db/materialStock075.test.ts`

## PREGUNTA CENTRAL: DE DONDE VIENE EL STOCK

### Respuesta corta

El saldo que usa el runtime moderno no procede de una compra, recepcion o factura de proveedor. Procede de:

1. `materials.stock_quantity`, inicialmente `0` por defecto.
2. El RPC `dmp_create_material_with_stock(jsonb)`, que crea el material con saldo cero y, si se informa stock inicial positivo, genera una entrada manual mediante `dmp_adjust_material_stock`.
3. El RPC `dmp_adjust_material_stock(...)`, que permite entradas, salidas, ajustes, devoluciones y correcciones manuales a usuarios autorizados.
4. El RPC efectivo `dmp_upsert_work_order_material(jsonb)` de 035/058, que genera una salida al registrar consumo de material de catalogo.
5. Las devoluciones/correcciones de consumo y los controles de purga, que generan retornos mediante las funciones de stock existentes.

No se ha encontrado un flujo implementado de compra, recepcion, albaran, factura de proveedor o importacion que alimente el stock moderno.

### Diferencia importante entre los dos modelos

El esquema inicial tiene `warehouse_stock.quantity`, pero el runtime moderno de Materials usa `materials.stock_quantity`. El `seed.sql` inserta cantidades en `warehouse_stock` y no informa `materials.stock_quantity`, por lo que el dato demo presenta saldo por almacen distinto del saldo que consulta la UI moderna. No se ha encontrado trigger ni proceso de conciliacion entre ambos.

## PROVEEDORES

### Modelo

Existe `public.suppliers` en `001_initial_dmp_schema.sql:691-702` con:

- `id`.
- `company_id` obligatorio.
- `name` obligatorio.
- `tax_id`.
- `email`.
- `phone`.
- `active`.
- `created_at`, `updated_at` y `deleted_at`.

### UI, services y routes

- `dashboardService.getOfficeDashboardData()` consulta `suppliers` por empresa.
- La navegacion muestra un modulo `proveedores`.
- `moduleMeta.proveedores` solo enlaza a Documentos.
- `loadModuleRows()` trata `proveedores` como una lista documental generica.
- No existe `suppliersService`, formulario de proveedor, alta, edicion, archivado, contacto ni route de ficha especifica.

### Permisos y RLS

- El proveedor esta ligado a `company_id` en el esquema.
- Hay policies de proveedor detectadas solo indirectamente en las policies iniciales/globales; no se ha encontrado una capa funcional moderna de escritura.
- La consulta de dashboard aplica `company_id` desde el frontend; la seguridad efectiva debe confirmarse en staging con `pg_policies`.

### Estado

**PARCIAL / PLACEHOLDER.** Existe la tabla minima y un registro demo, pero no existe el modulo funcional de proveedor descrito por la documentacion.

Faltan identidad fiscal completa, direccion, contactos, email de facturacion, condiciones de pago, referencias, marcas, tarifas, descuentos, plazos, documentos y observaciones como modelo operativo separado.

## MATERIAL <-> PROVEEDOR

### Relacion real

No existe ninguna relacion implementada entre `materials` y `suppliers`:

- `materials` no tiene `supplier_id`.
- No existe `material_suppliers`.
- No existe `supplier_materials`.
- No existe `supplier_product_references` fisica.
- No existe tarifa de compra por proveedor.
- `stock_movements.supplier_id` existe en el modelo inicial, pero no esta conectado a un flujo de entrada operativo.

### Estado

**NO IMPLEMENTADO.**

La documentacion fundacional recomienda explicitamente que un proveedor suministre varios materiales, que un material tenga varios proveedores y que existan tarifas/referencias cambiantes. Por tanto, `materials.provider_id` como relacion unica no encaja con el modelo objetivo. La direccion conceptual correcta es N:M con datos por proveedor: referencia, unidad de compra, precio, descuento, plazo, MOQ, disponibilidad, preferencia e historico.

## PEDIDOS

### Tablas y flujo

No existe en el esquema fisico actual ninguna tabla `purchase_orders`, `purchase_order_lines`, `supplier_orders` ni equivalente funcional de pedido de compra.

No existe RPC, service o UI funcional para crear, aprobar, emitir, enviar, confirmar o recibir pedidos.

El modulo `compras` es un placeholder documental y el dashboard cuenta `material_requests` como solicitudes abiertas, no como pedidos emitibles.

### Solicitud de material

`public.material_requests` existe en `001_initial_dmp_schema.sql:760-770` con:

- `company_id`.
- `work_order_id` opcional.
- `requested_by`.
- `status` en `Pendiente`, `Aprobada`, `Preparada`, `Entregada`, `Cancelada`.
- `needed_by`, `notes`, fechas y `deleted_at`.

La policy permite al tecnico crear una solicitud para un parte asignado. No hay `material_id`, cantidad, proveedor, expediente, equipo, linea, destino, prioridad ni relacion con pedido. La solicitud es una cabecera minima, no un pedido ni una necesidad de reposicion completa.

### RB-049 y RB-050

- RB-049: **NO IMPLEMENTADO**. No hay pedido vinculable a expediente, parte, equipo o stock general, ni lineas de pedido.
- RB-050: la prohibicion de compra automatica esta documentada, pero no existe flujo de compra al que aplicar una autorizacion humana.

## ALBARANES / RECEPCION

### Modelo

No existe tabla ni RPC para `goods_receipts`, `goods_receipt_lines`, `delivery_notes`, `receipts` o recepciones parciales.

### Efecto sobre stock

No existe entrada de stock asociada a una recepcion real. El unico efecto moderno demostrable es:

- alta con stock inicial manual en `dmp_create_material_with_stock`;
- ajuste manual en `dmp_adjust_material_stock`.

Por tanto, DMP no distingue hoy pedido, recepcion fisica y factura proveedor.

### Estado

**NO IMPLEMENTADO.**

El modelo conceptual si define `GoodsReceipt` y `GoodsReceiptLine` y exige entregas totales/parciales, pero no existe runtime.

## FACTURA PROVEEDOR

### Modelo real

No existe `supplier_invoices`, `supplier_invoice_lines`, `purchase_invoices` ni otra entidad de factura de proveedor.

Las tablas `invoices` e `invoice_work_orders` pertenecen a la facturacion al cliente. La UI y services de billing trabajan con cliente, parte, IVA, emision, cobros, anulaciones y snapshot fiscal del emisor. No hay proveedor, numero de factura proveedor, albaran, pedido ni coste de compra.

### Estado

**NO IMPLEMENTADO.**

El modelo conceptual si menciona `SupplierInvoice` y `SupplierInvoiceLine`, pero no existe una pieza fisica que permita una factura agrupar varios pedidos/albaranes sin perder trazabilidad por linea.

## STOCK

### Tablas actuales

#### Modelo inicial

`001_initial_dmp_schema.sql` define:

- `materials`, con catalogo, `cost`, `price`, `minimum_stock` y `active`.
- `warehouses`, con almacen por empresa.
- `warehouse_stock`, con `warehouse_id`, `material_id`, `quantity` y `reserved_quantity`.
- `stock_movements`, con almacen, material, tipo, cantidad, parte, proveedor, actor y fecha.
- `material_requests`, como solicitud minima.

#### Modelo moderno efectivo

035 añade:

- `materials.stock_quantity`.
- `materials.stock_controlled`.
- `materials.allow_negative_stock`.
- `materials.last_stock_movement_at`.
- `work_order_materials.stock_deducted_quantity`.
- `material_stock_movements`.

`material_stock_movements` conserva material, parte, linea usada, presupuesto, tipo, cantidad, saldo anterior, saldo nuevo, coste unitario, motivo, origen, actor, fecha y borrado logico.

### Tipos de movimiento

En el modelo inicial: `Entrada`, `Salida`, `Reserva`, `Devolucion`, `Ajuste`, `Consumo en parte`.

En el modelo moderno: `initial`, `in`, `out`, `adjustment`, `return`, `correction`.

No se han encontrado tipos modernos especificos para transferencia entre almacenes, liberacion de reserva, defectuoso, recepcion de compra o salida por ubicacion.

### Entrada

La entrada solo esta implementada como accion manual:

- al crear material con stock inicial;
- mediante ajuste manual `in`.

No se vincula a proveedor, pedido, albaran, recepcion, factura, lote, almacen o documento externo.

### Salida

La salida moderna se produce al consumir un material de catalogo en un parte:

- `dmp_upsert_work_order_material` de 035/058 llama `dmp_apply_material_stock_movement(..., 'out', ...)`.
- La salida ocurre al guardar/sincronizar la linea, antes de validacion SAT/Oficina.
- La correccion devuelve el descuento anterior y aplica el nuevo.
- La eliminacion logica devuelve el descuento.

Esto incumple RB-019 aunque el movimiento sea atomico y auditable.

### Idempotencia

`local_change_id` tiene indice unico para `work_order_materials` y protege reintentos de la linea. No existe idempotencia de entrada de compra, recepcion, factura proveedor, lote o movimiento por documento. Tampoco existe una transicion persistente `pending -> validated` para consumo.

### Estado

**PARCIAL y dividido en dos modelos incompatibles en la practica.** El movimiento moderno de saldo por material funciona, pero no es stock distribuido y no tiene origen de abastecimiento.

## COSTE

### Fuente real actual

La respuesta actual es una combinacion de **A y E**:

- En alta de material de catalogo, `058` resuelve `unit_cost` desde `materials.cost` en servidor.
- Un administrador puede enviar un `unit_cost` explicito y el servidor lo acepta como override.
- En material manual, `unit_cost = 0` salvo que otro flujo lo complete posteriormente.
- El movimiento de salida guarda `material_stock_movements.unit_cost` usando `materials.cost` o el coste resuelto.
- La vista economica calcula material con `used_quantity * unit_cost`.

No existe coste por lote, ultimo coste de proveedor, coste medio, factura proveedor ni coste landed/distribuido.

### Cadena exacta

`materials.cost` → `dmp_upsert_work_order_material` 058 → snapshot `work_order_materials.unit_cost` → `total_cost` → `v_work_order_economic_summary.material_cost` → `real_cost_amount`/margen.

La salida de stock tambien guarda un snapshot de coste en `material_stock_movements.unit_cost`, pero no hay una entrada de compra que lo origine. `materials.price` es precio de venta y no debe usarse como coste.

### Riesgo

El coste del parte representa el coste de ficha o un override administrativo, no necesariamente el coste real de adquisicion. Cambiar el coste de ficha no reescribe historicos de forma automatica, pero tampoco existe una capa de coste de entrada que permita explicar cada unidad consumida.

## LOTE / TRAZABILIDAD DE ENTRADA

**NO EXISTE.**

No hay lotes, capas de coste, unidades serializadas, entradas individualizadas, fecha de recepcion, proveedor real, documento de compra o asignacion de coste por unidad.

Caso 20 unidades a 27,50 y 10 posteriores a 30,00: DMP no puede demostrar que coste corresponde a la unidad consumida. No se decide todavia FIFO/LIFO/medio; simplemente falta el modelo de entrada necesario para cualquier politica futura.

## MATERIAL MANUAL

### Flujo actual

Hay dos comportamientos historicos/efectivos:

1. El flujo moderno permite `material_id = null` y exige `description`. Guarda la descripcion en `work_order_materials`; no crea material de catalogo ni movimiento de stock. Su coste queda en `0` en 058 salvo override administrativo.
2. Los RPC legacy `record_work_order_material_usage` y `sync_work_order_material_usage` buscan por descripcion y, si no encuentran coincidencia, crean automaticamente una fila en `materials` con coste y precio por defecto `0`, y luego crean el uso del parte.

El servicio offline moderno `syncOfflineMaterial` llama a `dmp_upsert_work_order_material`, pero transforma el texto offline en `description` y no aporta `material_id`; por tanto no crea una salida moderna de stock para ese material manual. El flujo online de catalogo si puede crear salida inmediata.

### Facturacion y conciliacion

El material manual llega a la economia del parte con coste cero y puede aparecer como linea de material en la preparacion de factura cliente si tiene importe de venta positivo; no existe reconciliacion posterior con proveedor, catalogo, compra o coste real.

### Riesgos

- Dos flujos pueden tratar la misma descripcion de forma distinta.
- El legacy puede contaminar catalogo con materiales creados implicitamente.
- La descripcion libre no identifica proveedor, referencia, unidad de compra ni coste.
- El coste cero puede inflar margen y ocultar coste real.
- No existe conciliacion segura posterior sin inventar datos.

## ALMACENES Y FURGONETAS

### Estado real

Existen `warehouses` y `warehouse_stock` en el esquema inicial y un almacen demo en `seed.sql`. No existe modelo de furgonetas, ubicaciones secundarias operativas, obra/cliente, stock defectuoso o `stock_locations`/`vehicle_stock_locations`.

El runtime moderno usa un saldo global en `materials.stock_quantity`, no `warehouse_id`. `dmp_apply_material_stock_movement` bloquea la fila de `materials` y no recibe almacen de origen/destino.

### Clasificacion

**PARCIAL como esquema inicial; NO IMPLEMENTADO como stock distribuido operativo.**

Comparacion RB-053: incumplimiento funcional P1. La documentacion conceptual describe almacenes, furgonetas, ubicaciones de cliente/obra, reservas y defectuosos, pero no existen en el runtime moderno.

## RESERVAS

### Estado real

Solo existe:

- `warehouse_stock.reserved_quantity`.
- Tipo historico `Reserva` en `stock_movements`.
- Documentacion conceptual de `stock_reservations`.

No se ha encontrado tabla `stock_reservations`, RPC, service, UI o proceso para reservar, liberar, reasignar o auditar una reserva. `reserved_quantity` no esta conectado a `materials.stock_quantity` ni a disponibilidad calculada moderna.

### Comportamiento

No se puede demostrar que una reserva reduzca disponible, reduzca fisico, genere movimiento, sea reasignable o genere necesidad de reposicion.

**NO IMPLEMENTADO.** RB-055 y RB-056 siguen siendo requisitos conceptuales.

## REPOSICION

### Deteccion

`materials.minimum_stock` existe y la UI calcula indicadores de bajo stock. No existe tabla `replenishment_needs`, lineas de necesidad, RPC, service ni proceso que cree una necesidad cuando consumo/ajuste/reserva baja del minimo.

### Propuesta automatica

No existe propuesta de compra ni consolidacion por material, expediente, parte, fecha, prioridad o ubicacion. No existe creacion automatica de pedido.

**NO IMPLEMENTADO.** La unica parte cumplida es el dato de minimo y el indicador visual. Esto es consistente con RB-050 en cuanto a no comprar automaticamente, pero falta detectar y proponer.

## DEVOLUCIONES / GARANTIA DE PROVEEDOR

No existe modelo implementado de:

- devolucion a proveedor;
- material defectuoso;
- abono;
- sustitucion de proveedor;
- garantia de proveedor.

Las funciones de `return` y `correction` de `material_stock_movements` son retornos/correcciones internos de stock por uso de parte, no devoluciones documentadas al proveedor. No hay referencia a pedido, albaran, factura proveedor o motivo logístico de devolucion.

**NO IMPLEMENTADO.** Condiciona el diseño futuro porque una devolucion debe poder sacar material de una ubicacion, conservar la entrada original y no confundirse con un retorno de consumo tecnico.

## HISTORICOS

Los materiales existentes sin proveedor, documento o origen deben conservarse como historico valido. No debe inventarse una compra ni una recepcion.

Compatibilidad conceptual recomendada:

- origen `legacy` o `desconocido`;
- apertura inicial cuando exista evidencia de inventario inicial;
- coste desconocido o coste de ficha claramente marcado;
- documento externo opcional;
- no backfill ficticio de proveedor, lote, factura o ubicacion.

El seed actual demuestra precisamente la necesidad de separar datos demo/legacy: crea proveedor, materiales, almacen y `warehouse_stock`, pero no crea una entrada documentada de stock moderno.

## CADENA ACTUAL

### Abastecimiento real demostrado

```text
Proveedor
  -> tabla public.suppliers minima, sin flujo de compra
  -> NO IMPLEMENTADO: relacion material-proveedor
  -> NO IMPLEMENTADO: purchase_order / purchase_order_line
  -> NO IMPLEMENTADO: goods_receipt / albaran
  -> NO IMPLEMENTADO: supplier_invoice
  -> Entrada manual:
       dmp_create_material_with_stock(stock inicial)
       o dmp_adjust_material_stock(movimiento manual 'in')
  -> public.materials.stock_quantity
  -> NO IMPLEMENTADO: stock por almacen moderno / disponibilidad / reserva
  -> dmp_upsert_work_order_material(jsonb)
  -> public.work_order_materials
  -> Para catalogo controlado: dmp_apply_material_stock_movement('out') inmediato
  -> public.material_stock_movements
  -> work_order_materials.unit_cost desde materials.cost o override admin
  -> v_work_order_economic_summary.material_cost
  -> work_orders.real_cost_amount y margen
  -> Factura cliente solo si el parte resulta facturable
```

### Rama legacy offline

```text
Tecnico escribe descripcion
  -> sync_work_order_material_usage / record_work_order_material_usage legacy
  -> busca materials por descripcion
  -> si no existe, puede crear material catalogo con coste 0
  -> work_order_materials
  -> sin recepcion, proveedor, documento ni coste de compra
```

La rama moderna offline usa el RPC moderno, conserva `local_change_id` e intenta ser idempotente, pero no tiene validacion diferida de stock.

## CADENA OBJETIVO

```text
Proveedor
  -> relacion N:M proveedor-material
  -> propuesta/necesidad de reposicion opcional
  -> pedido de compra opcional, siempre con autorizacion humana
  -> confirmacion del proveedor opcional
  -> recepcion/albaran real, total o parcial
  -> entrada trazable a ubicacion de stock
  -> coste de entrada/documento real
  -> disponibilidad, reservas y necesidades
  -> solicitud/consumo tecnico
  -> validacion SAT/Oficina segun politica
  -> salida de stock desde ubicacion real
  -> coste snapshot del consumo
  -> componente instalado/historial tecnico cuando proceda
  -> factura proveedor posterior o agrupada
  -> factura cliente si el trabajo es facturable
```

No todos los pasos son obligatorios en todos los casos:

- Puede existir entrada inicial o compra urgente sin pedido formal, pero debe quedar documentada y autorizada.
- Un albaran/recepcion puede existir antes de la factura proveedor.
- La factura proveedor puede agrupar varios pedidos y varias recepciones.
- Un pedido puede tener N recepciones y N albaranes.
- Una recepcion parcial debe aumentar solo la cantidad recibida/stock validado, no la cantidad pedida.
- La factura proveedor puede ser posterior y no debe ser requisito para reconocer la recepcion fisica.
- Una necesidad de stock general no necesita expediente o parte.

## MATERIAL Y PROVEEDOR

La propuesta N:M encaja con el modelo real y con la Biblia:

- un proveedor suministra varios materiales;
- un material puede tener varios proveedores;
- cada proveedor puede usar una referencia distinta;
- los precios y descuentos cambian con el tiempo;
- puede existir proveedor preferente sin convertirlo en unico proveedor valido.

No se recomienda `materials.provider_id` como unica relacion obligatoria. El material es catalogo interno; la oferta, referencia y condicion de compra pertenecen a la relacion material-proveedor y a sus historicos.

## COSTE DE ENTRADA

La futura fuente de verdad debe ser la entrada documental real, no el precio orientativo de `materials.cost`.

Una entrada debe poder conservar, cuando exista:

- proveedor real;
- cantidad documentada;
- unidad y conversion si procede;
- precio real de compra;
- descuentos, portes, recargos y costes imputables;
- documento y fecha;
- almacen/ubicacion destino;
- lote o unidad individual si procede.

Impacto:

- `work_order_materials.unit_cost` debe ser snapshot del coste elegido por la politica vigente al validar el consumo.
- `material_stock_movements.unit_cost` debe explicar el coste de la salida, no solo copiar un precio de ficha.
- `real_cost_amount` debe incluir el coste real del consumo aunque el parte sea garantia.
- Los margenes deben separar coste interno de venta facturable.
- Una factura cliente no debe sustituir el documento de compra ni la entrada de stock.

## FACTURA DE COMPRA Y ALBARAN: CASO PARCIAL

Caso: pedido de 10 motores, proveedor entrega 6 hoy y 4 mañana, factura posterior.

El modelo minimo futuro debe permitir:

1. Un `purchase_order` con una linea de 10.
2. Una o varias confirmaciones del proveedor.
3. Una primera recepcion/albaran con 6 y fecha real.
4. Una segunda recepcion/albaran con 4 y fecha real.
5. Entradas de stock separadas o relacionadas con cada recepcion.
6. Una factura proveedor posterior que agrupe el pedido y las recepciones.
7. Trazabilidad por linea de factura hacia recepcion, pedido y material, sin obligar a que una factura corresponda a una sola entrega.
8. Diferencia visible entre pedido, confirmado, recibido, facturado, utilizado y devuelto.

No debe crearse stock por las 10 unidades al emitir el pedido. Deben entrar 6 y luego 4 cuando exista evidencia de recepcion/entrada validada.

## GAPS P0/P1

### P0

- **P0-001:** el consumo tecnico de material de catalogo crea salida oficial antes de validacion SAT/Oficina, incumpliendo RB-019.
- **P0-002:** no existe fuente de stock de abastecimiento trazable. El saldo moderno puede nacer de una entrada manual sin proveedor, recepcion o documento.

### P1

- **P1-001:** `materials.stock_quantity` y `warehouse_stock.quantity` son saldos paralelos sin reconciliacion demostrada.
- **P1-002:** no existe material-proveedor N:M ni referencia/precio historico de proveedor.
- **P1-003:** no existe pedido ni autorizacion humana operativa de compra.
- **P1-004:** no existe recepcion/albaran parcial separado del pedido.
- **P1-005:** no existe factura de proveedor separada de factura cliente.
- **P1-006:** no existe stock distribuido moderno por almacen, furgoneta, obra o ubicacion.
- **P1-007:** no existe reserva reasignable ni disponibilidad calculada.
- **P1-008:** no existe necesidad de reposicion ni consolidacion.
- **P1-009:** no existe lote/capa de coste/unidad de entrada.
- **P1-010:** material manual puede quedar con coste cero o contaminar catalogo por RPC legacy.
- **P1-011:** no existe devolucion o garantia de proveedor documentada.

## DEPENDENCIAS

La validacion diferida de consumo y el abastecimiento no deben diseñarse como bloques completamente independientes:

1. Primero debe fijarse el concepto canonico de stock y el limite entre `materials.stock_quantity` y `warehouse_stock`.
2. Despues debe fijarse la entidad de movimiento/entrada trazable por ubicacion, aunque la primera entrega funcional sea minima.
3. La validacion tecnica de consumo puede implementarse sobre el stock canonico minimo, pero no debe inventar proveedor, recepcion o lote inexistentes.
4. Proveedores y relacion material-proveedor deben preceder a pedidos.
5. Recepciones deben preceder a entradas de compra.
6. Factura proveedor puede implementarse despues de pedidos/recepciones porque llega posteriormente y puede agruparlos.
7. Garantias parciales deben ir despues de que consumo, coste real y cobertura tecnica/comercial tengan fuentes claras.

## PROPUESTA DE ROADMAP

### 094: stock canonico minimo y consumo diferido

- Resolver la autoridad del stock canonico.
- Separar uso tecnico pendiente de salida oficial.
- Implementar estados de consumo e idempotencia de validacion.
- Mantener movimientos legacy sin inventar origen.
- No mezclar garantias parciales.

### 095: abastecimiento base

- Proveedor funcional y relacion N:M material-proveedor.
- Necesidad de material y solicitud pendiente enriquecida.
- Pedido de compra y lineas con autorizacion humana.
- Recepcion/albaran parcial y entrada trazable al stock canonico.
- Coste de entrada y snapshots.
- Compatibilidad `legacy/origen desconocido`.

### 096: distribucion, reservas y fiabilidad

- Almacen central, secundarios, furgonetas y ubicaciones.
- Transferencias y reservas reasignables.
- Stock teorico, contado, disponible, pendiente y discrepancia.
- Necesidades de reposicion, consolidacion y fiabilidad.

### Siguientes

- Facturas de proveedor y asignaciones de costes.
- Devoluciones, defectuoso, abonos y garantia de proveedor.
- Lotes, unidades serializadas y politica de coste por entrada.
- Integracion completa con historial tecnico y componentes instalados.
- Garantias parciales de cliente despues de resolver la separacion tecnica/comercial ya detectada.

### Justificacion de la secuencia

La alternativa A, empezar por proveedores/compras completas, no debe preceder a una decision minima de stock porque una recepcion necesita saber que saldo y que ubicacion actualiza. La alternativa B es la mas segura: 094 establece la frontera de consumo/validacion y el saldo canonico minimo; 095 añade el origen de abastecimiento sobre esa base; 096 completa la distribucion. La garantia parcial queda despues de tener costes y consumos con semantica estable.

## MIGRATION 094 ACTUAL

La migration anterior de garantia parcial permanece congelada. No se ha tocado, ejecutado ni publicado. No debe renombrarse ni reutilizarse silenciosamente como migration de abastecimiento o stock.

## SQL PROBE

### Necesario: si, para confirmar runtime efectivo antes de implementar

No se ha ejecutado ningun probe. Para cerrar la incertidumbre de policies, funciones, triggers, indices y cantidades reales en staging se necesitara un probe read-only posterior que devuelva un unico result set y no invoque RPCs mutadoras.

El probe debe comprobar como minimo:

- tablas y columnas efectivas de suppliers/materials/warehouses/warehouse_stock/stock_movements/material_stock_movements/material_requests/invoices;
- funciones efectivas de stock y material;
- policies RLS de dichas tablas;
- permisos `proacl` de funciones y tablas;
- indices de `local_change_id`;
- triggers sobre materials y work_order_materials;
- existencia real de cualquier tabla de compras, recepciones o facturas proveedor;
- recuentos y discrepancias entre `materials.stock_quantity` y `warehouse_stock.quantity`.

No se crea el archivo en esta auditoria porque el objetivo era determinar el modelo de repositorio y la instruccion exige no crear SQL salvo necesidad posterior.

## GIT

- `HEAD`: `7a567bac0360a7e4b08c7fa3bb5714910dd7c111`
- `origin/main`: `7a567bac0360a7e4b08c7fa3bb5714910dd7c111`
- Divergencia: `0 0`
- Branch: `main`
- Remote: `https://github.com/enamarquezf-source/DoorManager-Pro.git`
- Worktree: contiene cambios locales previos tracked y untracked; no se han descartado ni modificado por esta auditoria.
- Informe protegido: `INFORME_CONTINUIDAD_GPT_DOORMANAGER_PRO.md`, intacto.
- Unico archivo creado por esta auditoria: `docs/audits/SUPPLY_CHAIN_STOCK_AUDIT.md`.

## DECISION FINAL

**AUDITORIA DE ABASTECIMIENTO COMPLETA — ESPERANDO DISEÑO**

El repositorio contiene un catalogo de materiales, una tabla minima de proveedores, un modelo inicial de almacenes y movimientos, solicitudes de material y un mecanismo moderno de saldo global y movimientos de consumo. No contiene una cadena real de abastecimiento.

El stock moderno nace hoy de acciones manuales o del seed/estado previo, no de recepciones documentadas. El consumo de catalogo se descuenta demasiado pronto. El diseño correcto debe comenzar por un stock canonico minimo y consumo diferido en 094, construir abastecimiento trazable en 095, y dejar distribucion avanzada y garantias para fases posteriores.
