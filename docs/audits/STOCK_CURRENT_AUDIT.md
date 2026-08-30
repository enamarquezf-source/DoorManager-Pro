# Auditoria del flujo actual de materiales y stock

## Alcance

Auditoria estatica realizada contra el repositorio actual, sin ejecutar SQL remoto, sin aplicar migrations y sin modificar codigo productivo. Se revisaron el esquema inicial, las migrations 006, 010, 020, 023, 024, 035, 052, 058 y 075, los servicios frontend de partes y sincronizacion offline, la UI de tecnico y la matriz de permisos.

## Modelo actual

### Datos

- `public.materials.stock_quantity` es el saldo material actual.
- `public.material_stock_movements` registra movimientos `initial`, `in`, `out`, `adjustment`, `return` y `correction`.
- `public.work_order_materials` registra el uso real del parte, incluyendo material de catalogo o material manual.
- `work_order_materials.stock_deducted_quantity` indica cuanto saldo oficial se desconto por esa linea.
- `local_change_id` tiene indice unico por empresa y parte, no existe una entidad de consumo pendiente ni un estado de validacion.

### Alta y correccion

`dmp_upsert_work_order_material(jsonb)`:

1. Comprueba que el usuario puede operar el parte.
2. Resuelve material de catalogo y snapshots economicos en la version efectiva de 058.
3. Inserta o actualiza `work_order_materials`.
4. Para material controlado, llama inmediatamente a `dmp_apply_material_stock_movement(..., 'out', ...)`.
5. Guarda `stock_deducted_quantity`.

En una correccion, primero devuelve al stock el descuento anterior y despues aplica el nuevo descuento. En una eliminacion logica, `dmp_delete_work_order_material` tambien devuelve el stock y deja auditoria en `audit_log`.

### Offline

La cola IndexedDB usa estados `pending`, `syncing`, `synced`, `failed` y `blocked`, recupera sincronizaciones interrumpidas y conserva reintentos. El tipo `material` se envia mediante `workOrdersService.syncOfflineMaterial`, que llama al mismo RPC de alta y por tanto genera una salida oficial de stock durante la sincronizacion, sin paso posterior de validacion.

La deduplicacion local del dispositivo evita reemplazar varias veces el mismo cambio en la cola. El backend protege `local_change_id` con un indice unico. Sin embargo, la idempotencia es de alta/actualizacion de la linea, no de un proceso de validacion de consumo ni de un movimiento pendiente separado.

## Cumplimientos

- El stock no se puede actualizar directamente mediante el permiso de tabla concedido en 075.
- Los movimientos directos estan bloqueados por RLS y se generan desde funciones `security definer`.
- El movimiento bloquea la fila de `materials`, comprueba saldo negativo y registra saldo anterior y nuevo.
- La correccion y eliminacion de una linea vinculada al stock generan devolucion trazable.
- Se mantienen separados `unit_cost` y `unit_price` en la version efectiva de 058.
- El material manual no crea movimiento de stock porque no tiene `material_id` de catalogo.
- El acceso operativo al parte se limita por empresa, rol, estado activo y asignacion tecnica.
- La cola offline no elimina automaticamente datos por un fallo de sincronizacion.

## Incumplimientos y riesgos

### P0-001: el tecnico descuenta stock oficial antes de validacion

`dmp_upsert_work_order_material` ejecuta la salida `out` tanto en alta como en sincronizacion offline. La UI de tecnico permite anadir material y presenta la operacion como guardada, mientras el saldo global ya cambia. Esto contradice RB-019 y el invariante INV-011: el tecnico registra uso real, pero SAT u Oficina deben validar antes del movimiento oficial.

### P1-001: no existe estado persistente de validacion del consumo

No hay una fila o columnas que distingan de forma durable `pendiente`, `validado`, `rechazado` o `corregido`. `stock_deducted_quantity` expresa el efecto ya aplicado, no una decision de validacion. Tampoco existe una RPC especifica para que SAT/Oficina acepten o rechacen una linea de consumo.

### P1-002: correccion tecnica puede producir movimientos oficiales

Editar una linea devuelve el descuento previo y aplica el nuevo en la misma RPC. Aunque la operacion sea atomica y trazable, un tecnico autorizado a editar su consumo puede cambiar el stock oficial sin aprobacion posterior.

### P1-003: idempotencia insuficiente para el futuro flujo diferido

`local_change_id` evita duplicar la linea activa, pero no modela una clave de negocio para la decision de validacion ni garantiza que una doble solicitud de validacion produzca una sola transicion/movimiento. El diseño nuevo debe hacer idempotente la transicion, no solo el upsert offline.

### P1-004: el control de stock sigue siendo global por material

El esquema inicial conserva `stock_movements`, `warehouses` y `warehouse_stock`, pero el flujo moderno auditado usa `materials.stock_quantity` y `material_stock_movements`. No se ha demostrado una conciliacion entre ambos modelos ni una ubicacion/almacen del consumo. El riesgo afecta a trazabilidad logistica futura, aunque no bloquea el registro de uso por parte.

### P2-001: permisos de lectura son amplios para backoffice

SAT, Gerencia y Oficina pueden consultar movimientos de stock; esto es coherente con la operacion actual, pero el modelo no diferencia lectura de saldo, lectura de coste y lectura de historial. Debe mantenerse como decision explicita al diseñar la validacion.

### P2-002: las politicas antiguas no son evidencia suficiente del runtime

Las migrations posteriores redefinen funciones y politicas. El resultado efectivo debe verificarse en staging con introspeccion de `pg_proc`, `pg_policies`, indices, triggers y constraints antes de aplicar una migration de transicion.

## Matriz de responsabilidades actual

| Accion | Tecnico | SAT | Oficina | Gerencia/Superadmin |
| --- | --- | --- | --- | --- |
| Registrar uso real | Si, por asignacion | Si | Si | Si |
| Editar su linea | Si | Si | Si | Si |
| Editar linea de otro trabajador | No | Si | No segun RPC efectiva | Si |
| Generar salida oficial al guardar | Indirectamente si el material tiene stock | Si | Si | Si |
| Ajustar stock manual | No | Si | Si | Si |
| Validar consumo pendiente | No existe | No existe RPC especifica | No existe RPC especifica | No existe RPC especifica |

La matriz de frontend coincide en lo esencial con el backend para administrar materiales, pero la ausencia de una accion de validacion hace imposible cumplir la separación exigida por RB-019.

## Propuesta prospectiva para migration 094

La 094 nueva debe ser exclusivamente de validacion diferida de materiales y no debe mezclar garantias parciales. Las garantias corregidas se reorganizaran posteriormente en 095.

### Modelo minimo recomendado

Agregar a `work_order_materials` o, preferiblemente, crear una tabla de hechos de consumo vinculada a la linea:

- `consumption_status`: `pending`, `validated`, `rejected`, `superseded`.
- `consumption_local_change_id` o clave idempotente equivalente.
- `submitted_by`, `submitted_at`.
- `validated_by`, `validated_at`.
- `rejected_by`, `rejected_at`, `rejection_reason`.
- snapshot de material, unidad, cantidad y coste al registrar/validar.
- referencia al movimiento oficial creado por la validacion.

La alternativa de tabla separada es preferible si se quiere conservar correcciones como hechos inmutables y evitar que una edicion reescriba la intencion tecnica original.

### RPCs requeridas

- `dmp_submit_work_order_material`: registra o actualiza el consumo tecnico, sin tocar `materials.stock_quantity` ni insertar movimiento oficial.
- `dmp_validate_work_order_material`: solo SAT/Oficina y roles superiores autorizados; cambia `pending` a `validated` de forma idempotente y crea exactamente una salida oficial.
- `dmp_reject_work_order_material`: solo SAT/Oficina y roles superiores; exige motivo y no toca stock.
- `dmp_correct_validated_work_order_material`: crea compensacion/devolucion y nuevo consumo validable, o exige nueva validacion, pero nunca reescribe silenciosamente el historial.

### Reglas de transaccion

- Bloqueo de la linea de consumo y del material dentro de la misma transaccion.
- Una unica transicion valida desde `pending`.
- Una unica referencia de movimiento oficial por consumo validado.
- Reintento con la misma clave idempotente devuelve el mismo resultado.
- Reintento con la misma clave y payload incompatible produce conflicto explicito.
- Rechazo no crea movimiento.
- Toda correccion conserva el hecho anterior y registra motivo/actor.

### Compatibilidad historica

- Las lineas existentes con `stock_deducted_quantity > 0` deben migrarse como `validated`, enlazando el movimiento existente cuando sea determinable.
- Las lineas existentes sin descuento oficial deben clasificarse como `pending` o `legacy_unclassified`, nunca validarse automaticamente si no hay evidencia.
- No se deben generar movimientos historicos nuevos por inferencia de `materials.stock_quantity`.
- Debe existir un informe de filas ambiguas antes de cerrar la transicion.

### Verificacion obligatoria en staging

1. Alta tecnica online y offline sin cambio de stock.
2. Reintento offline doble sin duplicar consumo.
3. Validacion doble sin duplicar movimiento.
4. Rechazo con motivo y sin movimiento.
5. Correccion antes y despues de validar.
6. Falta de stock al validar con rollback completo.
7. Separacion por `company_id` y permisos por rol.
8. Material manual, material no controlado y material archivado.
9. Auditoria reconstruible de actor, fechas, cantidades y saldos.

## Conclusion

El sistema actual tiene un mecanismo de stock atomico y trazable, pero aplicado en el punto equivocado del proceso. El bloqueo de producto es P0: no debe diseñarse ni aplicarse la nueva garantia hasta separar registro tecnico, validacion operativa y movimiento oficial. La siguiente migration 094 debe resolver exclusivamente esa frontera y dejar la garantia parcial para 095.
