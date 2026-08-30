# Diseno 094: stock canonico minimo y consumo diferido

## Alcance y restricciones

Documento de diseño previo. No se ha creado ni aplicado migration, no se ha ejecutado SQL remoto, no se ha modificado codigo productivo, no se ha hecho commit y no se ha hecho push.

Se preservan todos los cambios locales existentes y permanece congelada la migration anterior de garantia parcial.

## STOCK CANONICO

### Elegido

`public.warehouse_stock.quantity` debe ser el saldo fisico canonico por material y almacen.

### Evidencia

`001_initial_dmp_schema.sql` ya define:

- `warehouses` con `company_id`, codigo, nombre, direccion y estado.
- `warehouse_stock` con `warehouse_id`, `material_id`, `quantity` y `reserved_quantity`.
- restriccion unica `(warehouse_id, material_id)`.
- indice por `(company_id, material_id)`.
- `stock_movements` con `warehouse_id`, `material_id`, cantidad, tipo, proveedor, parte, actor y fecha.

Este modelo contiene la dimension necesaria para 095/096: un material puede existir en varios almacenes y el movimiento ya puede identificar origen geografico. `materials.stock_quantity` solo contiene un saldo global y no puede representar almacen central, furgoneta, obra o traslado.

### Por que

- Es el unico modelo existente que expresa `material + warehouse`.
- Permite que una salida de un parte afecte al almacen real de origen.
- Permite futuras transferencias entre almacenes sin inventar un tercer modelo.
- Es compatible con reservas por almacen mediante `reserved_quantity`, aunque 094 no las implementa.
- Permite añadir en 095 recepciones y entradas con destino concreto.
- Permite añadir en 096 furgonetas, ubicaciones y fiabilidad.

### Modelo descartado como canonico

`materials.stock_quantity` se descarta como saldo autoritativo porque:

- no tiene `warehouse_id`;
- sus lecturas actuales muestran un saldo global como si fuera disponibilidad;
- sus escrituras modernas proceden de ajustes y consumos de parte, no de movimientos por ubicacion;
- no puede representar stock central frente a furgoneta;
- no puede soportar traslado, reserva por ubicacion o consumo desde origen real.

### Compatibilidad

No se elimina `materials.stock_quantity` en 094. Se clasifica como **legacy/compatibilidad temporal** y deja de ser autoritativo.

La estrategia recomendada es:

1. 094 no escribe `materials.stock_quantity` para nuevos consumos validados.
2. 094 adapta el flujo de consumo y los lectores de stock que formen parte de la implementación posterior para consultar `warehouse_stock`.
3. Durante la transición puede mantenerse un valor global de compatibilidad solo si existe una rutina explícita, transaccional y auditable de derivación desde `warehouse_stock`; no se permite escribir dos saldos independientes.
4. Hasta que esa derivación exista, `materials.stock_quantity` se marca conceptualmente como legacy y no debe presentarse como disponibilidad fiable.
5. Su retirada o deprecación física queda para una fase posterior, cuando el probe confirme cobertura y todas las lecturas estén migradas.

## `materials.stock_quantity`

### Futuro

Legacy/derivado temporal. No fuente de verdad. No se usa para decidir disponibilidad de una ubicacion.

### Readers actuales

- `src/App.tsx`: catalogo de materiales del parte, estadisticas, bajo stock, valor de stock, formulario de ajuste y texto de stock actual.
- `src/services/quotesService.ts`: catalogo de materiales para presupuestos.
- `src/services/materialsService.ts`: listado de materiales y movimientos modernos.
- `supabase/migrations/035_material_stock_control.sql`: RPC de stock y control de saldo.
- `supabase/migrations/052_material_lifecycle_rate_traceability.sql`: ciclo de vida de materiales especificos.
- `supabase/migrations/058_fix_work_order_material_economics.sql`: no usa el saldo para coste, pero conserva la salida moderna.
- verificaciones y tests de 035, 052, 075 y material economics.

### Writers actuales

- `dmp_create_material_with_stock`: crea con `stock_quantity = 0` y luego puede generar entrada manual.
- `dmp_adjust_material_stock`: entrada, salida, ajuste, devolucion o correccion manual.
- `dmp_apply_material_stock_movement`: actualiza directamente `materials.stock_quantity` e inserta `material_stock_movements`.
- `dmp_upsert_work_order_material`: salida inmediata para catalogo controlado y retorno/correccion al editar.
- `dmp_delete_work_order_material` y funciones de purga: retornos o limpieza de movimientos.
- `052` actualiza tambien el ciclo de material especifico al cambiar el saldo.

### Triggers

No se ha encontrado un trigger que derive `materials.stock_quantity` desde `warehouse_stock` o desde movimientos. El saldo se modifica directamente dentro de RPCs.

### Dependencias

Depende de `materials`, `work_order_materials`, `material_stock_movements`, coste de ficha y permisos modernos. No depende de `warehouses` para la operacion moderna.

### Tenant

Tiene `company_id`; las RPCs modernas comprueban empresa actual y las policies limitan por tenant en las ramas revisadas.

### Warehouse support

Nulo. No hay almacen en la columna, en el consumo moderno ni en `material_stock_movements`.

### Audit

`material_stock_movements` conserva anterior/nuevo, cantidad, tipo, fuente, actor, motivo y timestamps. Es una auditoria moderna de un saldo global, no un ledger distribuido completo.

### Risk

Alto: la UI presenta este saldo como stock disponible y el consumo puede descontarlo sin conocer origen. Mantenerlo como autoritativo bloquearia el roadmap de almacenes y furgonetas.

## `warehouse_stock`

### Futuro

Saldo fisico por `(warehouse_id, material_id)`, fuente canonica de cantidad en 094/095/096.

### Readers

- `seed.sql` lo carga como datos demo.
- `001_initial_dmp_schema.sql` lo define e indexa.
- `010_security_rls_integrity_transactions.sql` define lectura backoffice.
- `057_fix_quote_purge_runtime.sql` lo consulta al purgar materiales.
- tests de consolidacion y runtime lo consideran parte del modelo.

No existe lector funcional de disponibilidad en `src`.

### Writers

No se ha encontrado service, UI, RPC o trigger de runtime que actualice `warehouse_stock.quantity`.

El seed inserta directamente cantidades, pero no crea movimientos de entrada. Esto confirma que el esquema existe sin flujo operativo.

### Triggers

No se ha encontrado trigger que sincronice `warehouse_stock` con `stock_movements`, `materials.stock_quantity` o `material_stock_movements`.

### Dependencias

Depende de `warehouses` y `materials`. `stock_movements` tiene FK logica a la misma ubicacion, pero no hay integridad adicional demostrada entre `stock_movements.company_id` y las empresas de warehouse/material mediante constraints compuestas.

### Tenant

Tiene `company_id`; `warehouse_id` y `material_id` son FKs simples. La policy de lectura encontrada limita a empresa y roles backoffice. Las escrituras funcionales no existen.

### Warehouse support

Si. Es la razon principal para elegirlo. El modelo actual permite varias filas por material y almacen.

### Audit

El saldo no tiene `previous_quantity`, `new_quantity`, actor ni timestamp de movimiento en la propia fila. La auditoria dependera de `stock_movements` y de operaciones transaccionales.

### Risk

Alto mientras no se cierre la frontera de escritura: si 094 empieza a actualizar `warehouse_stock` sin movimiento asociado, se repetira el problema de saldo sin origen. La actualizacion y el movimiento oficial deben ocurrir juntos.

## MOVIMIENTOS

### Rol

`stock_movements` es el ledger/log funcional candidato para el stock distribuido porque ya contiene `warehouse_id`, `material_id`, proveedor, parte, cantidad, tipo, actor y timestamp.

`material_stock_movements` es el historial moderno del saldo global legacy. No puede ser ledger canonico futuro porque no contiene almacen y su saldo anterior/nuevo se refiere a `materials.stock_quantity`.

### Autoridad

El movimiento no debe ser la unica cantidad actual ni debe reconstruirse historicamente por sumatoria en 094. El repositorio no demuestra cobertura completa:

- hay saldos iniciales en `warehouse_stock` sin movimientos en seed;
- hay ajustes con semantica de saldo final en el modelo moderno;
- existen modelos antiguos y modernos paralelos;
- no existe entrada de compra documentada.

### Balance fiable

**No**, el balance por sumatoria historica no es fiable para migrar automaticamente. La estrategia minima debe ser:

- `warehouse_stock.quantity` como snapshot de saldo fisico actual;
- cada nueva operacion modifica snapshot y movimiento en la misma transaccion;
- el movimiento conserva origen, destino si aplica, cantidad, motivo, actor, documento y timestamp;
- las discrepancias historicas se clasifican para revision, no se corrigen por inferencia.

## ALMACEN ORIGEN

### Como se resuelve hoy

No se puede resolver de forma fiable. El consumo tecnico actual solo conserva material/descripcion, cantidad, parte, usuario y fecha. `work_order_materials` no tiene `warehouse_id`; el parte no tiene una ubicacion de stock de origen; no existe asignacion de furgoneta ni stock movil.

### Gaps

- No hay almacen asignado al tecnico.
- No hay almacen por parte.
- No hay transferencia central → furgoneta.
- No hay reserva que determine origen.
- No hay ubicacion de obra/cliente.
- `material_stock_movements` no tiene warehouse.

### Decision necesaria

**Si.** La validacion no debe descontar de un almacen arbitrario ni asumir almacen central.

Para 094 hay dos opciones validas:

1. **Transicion restringida:** permitir validar solo consumos con un `warehouse_id` explicito y autorizado por SAT/Oficina. Si no existe, el consumo permanece pendiente.
2. **Politica temporal configurable:** permitir que una empresa defina un almacen de origen por defecto para una operacion concreta, dejando actor, politica y motivo auditados. Esto no debe ser una suposicion global de codigo.

La opcion 1 es mas segura y respeta Zero Trust. El caso furgoneta queda pendiente de 096: cuando exista una transferencia y asignacion fiable, la salida debe afectar a la furgoneta, no al almacen central.

## CONSUMO

### Tabla

Para minimizar cambios y no crear un tercer modelo, el hecho de consumo inicial puede seguir en `work_order_materials`, ampliado con estado y vinculo a movimiento. La alternativa de tabla de hechos separada queda abierta para 095 si se necesita historial inmutable de correcciones.

### Estado

Minimo obligatorio:

- `pending` al registrar el tecnico.
- `validated` cuando SAT/Oficina autoriza y se crea la salida oficial.

No se añaden `rejected` ni `corrected` en 094: no son imprescindibles para el problema P0 y sus semanticas deben decidirse con el flujo de devoluciones/correcciones.

### Campos minimos de diseño

- estado de validacion con default `pending` para nuevas lineas;
- `validated_at` nullable;
- `validated_by` nullable;
- `stock_warehouse_id` nullable, obligatorio al validar material controlado;
- `stock_movement_id` nullable, unico cuando exista;
- clave local/idempotente existente preservada;
- snapshot de cantidad y material ya existente;
- auditoria de transicion con actor, motivo y resultado.

El nombre fisico exacto queda para la migration despues de validar compatibilidad de esquema.

### Validacion

La RPC de validacion debe ser transaccional:

1. Cargar y bloquear la linea de consumo.
2. Comprobar `company_id` y actor activo.
3. Exigir estado `pending`; si ya es `validated`, devolver el resultado existente sin repetir movimiento.
4. Comprobar material de catalogo no archivado y `stock_controlled`.
5. Exigir y validar almacen de origen cuando el material sea controlado.
6. Bloquear la fila `(warehouse_id, material_id)` de `warehouse_stock`.
7. Comprobar cantidad y politica de stock negativo.
8. Actualizar `warehouse_stock.quantity`.
9. Insertar exactamente un `stock_movements` de tipo `Consumo en parte`, asociado a parte, linea y actor.
10. Guardar `stock_movement_id`, `validated_by` y `validated_at`.
11. Registrar auditoria.
12. Confirmar todo o hacer rollback completo.

SAT/Oficina son autoridad base. Gerencia/Superadmin pueden ser override. Tecnico no valida. Comercial no valida por defecto.

### Idempotencia

La primera llamada con una clave local crea/actualiza el consumo pendiente. Una revalidacion de un consumo ya validado debe devolver el mismo movimiento por `stock_movement_id`. Una llamada con el mismo identificador y payload incompatible debe producir conflicto, no otro descuento.

## HISTORICOS

### Corte determinista

El corte debe ser semantico por estado de schema, no por fecha magica:

- migracion 094 deja las filas existentes con el comportamiento historico intacto;
- nuevas filas creadas por la version 094 reciben `pending` mediante default/trigger de schema;
- filas existentes con `stock_deducted_quantity > 0` no se vuelven a descontar y se consideran historicamente afectadas/validadas solo a efectos de no repetir stock;
- filas existentes sin descuento no se deben validar automaticamente; quedan clasificadas como legacy o pendientes de revision según evidencia.

Si la migration necesita backfill de estado, debe diferenciar filas preexistentes y nunca llamar a una RPC de salida. No se reconstruye saldo desde movimientos incompletos.

## COSTE

### Modelo transitorio

Se mantiene `materials.cost` como fuente economica transitoria del coste de nuevas lineas catalogadas, y `work_order_materials.unit_cost` como snapshot. El coste no se recalcula para historicos.

En 094 no se implementan lotes, coste medio, FIFO/LIFO, compras ni facturas de proveedor. El coste debe rotularse conceptualmente como **COSTE TRANSITORIO DE FICHA**, no como coste real de recepcion.

### Deuda 095

095 debe conectar proveedor, recepcion, entrada en `warehouse_stock`, precio real documentado y snapshot de coste. La validacion de consumo no debe cerrar esa deuda inventando proveedor o precio de compra.

## MATERIAL MANUAL

El tecnico puede registrar descripcion y cantidad. El resultado es evidencia tecnica en `work_order_materials` con estado `pending` y coste transitorio cero/no determinado.

- No crea SKU ficticio.
- No crea proveedor ficticio.
- No crea movimiento de stock.
- No afecta al stock canonico.
- No bloquea el cierre tecnico solo por falta de catalogo.
- Queda pendiente de conciliacion administrativa.

La rama legacy que crea materiales de catalogo por descripcion debe quedar fuera de la nueva frontera y marcarse como deuda de compatibilidad; 094 no debe depender de ella para validar stock.

## PROBE

### Necesario

**Si.** El repositorio no puede probar cantidades remotas, diferencias entre modelos, almacenes existentes ni movimientos efectivos.

### Archivo

`supabase/verification/probe_stock_model_reconciliation_094.sql`

El probe es read-only, no llama RPCs mutadoras y devuelve un unico result set con material, saldo global legacy, total por almacenes, numero de filas, saldo de movimientos solo como dato no fiable y clasificacion.

### Validacion SQL

Debe revisarse con `pg-query-emscripten` antes de usarlo. No se ejecuta desde este trabajo. La consulta no debe crear tablas, escribir datos, conceder permisos ni alterar schema.

## MODELO 094 FINAL

### Schema minimo

- Mantener `warehouse_stock` como saldo canonico por ubicacion.
- Mantener `materials.stock_quantity` sin eliminar, marcado legacy/compatibilidad.
- Añadir estado `pending/validated` a nuevas lineas de consumo.
- Añadir fechas/actores de validacion.
- Añadir almacen de origen de consumo.
- Añadir referencia unica al movimiento oficial.
- Añadir restricciones de tenant y consistencia de movimiento/linea.
- No crear `canonical_stock`, `stock_v2`, `new_inventory` ni tabla paralela de saldo.

### RPC

- `dmp_submit_work_order_material`: registra consumo y nunca modifica stock.
- `dmp_validate_work_order_material`: valida y crea salida atomica en `warehouse_stock` + `stock_movements`.
- Mantener una ruta de compatibilidad controlada solo si existen consumidores legacy; no permitir que la ruta legacy vuelva a descontar stock durante la transición.

### Triggers

No se necesita trigger de saldo global. Las operaciones de stock deben estar encapsuladas en RPCs transaccionales. Solo puede usarse trigger de default/validacion de estado si no oculta decisiones ni crea movimientos automaticamente.

### Frontend

- Tecnico conserva la captura online/offline actual.
- No muestra controles de inventario ni almacenes administrativos innecesarios.
- El texto debe indicar `Material utilizado · Pendiente de validar stock`.
- SAT/Oficina reciben listado de consumos pendientes y pueden validar tras seleccionar/resolver el almacen de origen.
- La UI nunca sustituye las comprobaciones backend.
- Material manual se muestra como no catalogado y pendiente de conciliacion, sin SKU artificial.

### Tests

El diseño requiere tests de:

- parser de migration y probes;
- alta online/offline sin cambio de `warehouse_stock`;
- reintento idempotente sin duplicar consumo;
- validacion doble sin duplicar salida;
- rechazo o estado no valido sin movimiento;
- tenant y roles SAT/Oficina/Gerencia/Superadmin/Tecnico/Comercial;
- falta de almacen de origen sin descuento arbitrario;
- falta de saldo con rollback;
- material manual sin stock ni SKU;
- historicos con `stock_deducted_quantity > 0` sin redescuento;
- correccion posterior como deuda explícita para la siguiente fase.

## DEPENDENCIAS 095/096

### Preparado para 095

- `warehouse_stock` ya representa destino de entrada.
- `stock_movements` ya contiene `warehouse_id` y `supplier_id`.
- 095 puede añadir proveedor-material N:M, pedidos, recepciones y facturas proveedor sin crear saldo alternativo.
- La recepcion debe actualizar la fila de almacen y crear movimiento de entrada en la misma transaccion.
- La factura proveedor puede llegar despues y agrupar pedidos/recepciones.

### Preparado para 096

- Multiples almacenes ya son parte del modelo.
- Una furgoneta puede implementarse como `warehouse` o ubicacion movil configurable sin cambiar la autoridad del saldo.
- Transferencias deben modificar origen/destino y dejar movimiento trazable.
- Reservas deben usar `reserved_quantity` o entidad de reserva futura, sin tocar fisico.
- Disponibilidad futura sera fisico menos reservado; 094 no calcula ni persiste esa semantica.
- Fiabilidad, discrepancias y reposicion se apoyaran en movimientos y recuentos posteriores.

## RIESGOS

### P0

- Consumo tecnico actual descuenta el saldo global antes de validacion; 094 debe sustituir esa frontera antes de activar el nuevo diseño.
- Validar sin almacen de origen produciria stock falso. No se permite asumir almacen central.
- Mantener dos saldos escritos por separado produciria divergencia silenciosa.

### P1

- Seed y datos historicos pueden tener `warehouse_stock` sin movimientos.
- Los lectores frontend actuales usan `materials.stock_quantity` y deben migrarse o quedar explicitamente legacy.
- `stock_movements` tiene modelo de ledger incompleto: no hay anterior/nuevo, idempotencia ni escritura transaccional moderna demostrada.
- El coste de ficha no es coste real de recepcion.
- La rama legacy offline puede crear materiales catalogo por descripcion.
- No existe actualmente UI de validacion de consumos.
- No existe asignacion de furgoneta o almacen al tecnico.

## GIT

- `HEAD`: `7a567bac0360a7e4b08c7fa3bb5714910dd7c111`
- `origin/main`: `7a567bac0360a7e4b08c7fa3bb5714910dd7c111`
- Divergencia: `0 0`
- Branch: `main`
- Remote: `https://github.com/enamarquezf-source/DoorManager-Pro.git`
- Worktree: conserva cambios locales previos tracked y untracked; no se han descartado ni sobrescrito.
- Informe protegido: `INFORME_CONTINUIDAD_GPT_DOORMANAGER_PRO.md`, intacto.
- Borrador antiguo de garantia: `docs/drafts/094_partial_warranty_billing.sql`, NO APLICAR; diseño superado por auditoria fundacional y pendiente de rediseño.

## DECISION

**DISEÑO 094 STOCK CANÓNICO COMPLETO — ESPERANDO VALIDACIÓN**

La fuente canonica debe ser `warehouse_stock.quantity` por material y almacen. `materials.stock_quantity` queda temporalmente como legacy/compatibilidad y no debe seguir siendo un saldo autoritativo.

094 debe separar captura tecnica y salida oficial: nuevas lineas quedan `pending`; SAT/Oficina validan; solo una validacion transaccional con almacen de origen resoluble actualiza `warehouse_stock` y crea un unico `stock_movements`. Si no se puede determinar el almacen, el consumo permanece pendiente. No se implementan reservas, compras, recepciones, facturas proveedor, lotes ni garantias en este diseño.
