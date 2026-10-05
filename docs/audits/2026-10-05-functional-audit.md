# Auditoría funcional — 5 de octubre de 2026

Primera entrega de correcciones verificadas. Trabajo realizado en `main`, sin ramas adicionales. Esta entrega no equivale a una certificación completa de todos los módulos o de los datos de producción.

## Hallazgos corregidos

| Área | Fallo observado en código | Corrección |
| --- | --- | --- |
| Sesiones y permisos | La caché de consultas podía conservar resultados del usuario anterior o de permisos anteriores. | Las consultas se separan por identidad, empresa, roles y permisos; se vacía la caché y se reinician las pantallas al cambiar el acceso. |
| Documentos privados | Las URL firmadas se conservaban entre sesiones y una respuesta tardía podía reponerlas. | Se invalida la caché al cambiar de acceso y se descartan respuestas de la sesión anterior. |
| Técnico sin conexión | La cola del dispositivo no aislaba el autor; editar durante una sincronización podía dar por enviado el contenido nuevo. | Cola por perfil y empresa, revisión única por edición y escritura condicionada a la revisión enviada. Se conservan los registros antiguos sin autor y se avisa de su recuperación pendiente. |
| Guardado técnico | Un rechazo por permisos o validación podía presentarse como un guardado sin conexión. | Solo los fallos identificados de conexión activan el guardado local; los demás errores se muestran. |
| Parte devuelto por SAT | Asignación y ficha/listado técnico usaban estados diferentes. El listado exigía además un centro aunque el parte no lo tuviera. | La ficha usa la regla común de trabajo activo; la migración 163 añade el estado devuelto y permite un centro ausente. No reactiva asignaciones finalizadas. |
| Avisos | Un destinatario vacío podía dejar un aviso sin destinatarios; elegir una persona mantenía también el rol SAT predeterminado. | Se valida el destino antes de crear y se da prioridad a la persona seleccionada; se eliminan destinatarios repetidos. |
| Facturas de proveedor | Un fallo al preparar líneas podía dejar un borrador parcial y el reintento crear otro. | Identificador estable para recuperar la cabecera, bloqueo de envíos simultáneos y acceso al borrador parcial para revisarlo. Se comprueba el proveedor del pedido antes de crear. |
| Pagos y cobros | Los manejadores podían aceptar dos envíos antes de actualizar el estado visual. | Bloqueo inmediato mientras la operación está pendiente; el detalle se reinicia al cambiar de factura. |
| Resumen de pagos | Un fallo de consulta se mostraba como una lista sin facturas. | Estado de carga, mensaje de error y botón para reintentar. El panel de lectura no solicita cuentas de tesorería a quien no puede verlas. |
| Fechas | Algunos formularios y filtros usaban la fecha UTC, que puede ser el día anterior en España. | Fecha local en formularios y servicios; límite temporal del día convertido desde medianoche local. |
| Ventanas y móvil | Ventanas superpuestas podían desbloquear el fondo antes de cerrar la última. | Bloqueo compartido del desplazamiento y control de teclado para el diálogo superior. Crear factura usa el diálogo común. |
| Superadmin | La ruta de plantillas no incluía Superadmin en su regla. | Acceso añadido, conservando el bloqueo de perfiles inactivos o eliminados. |
| Funciones internas SQL | Dos ayudantes de checks carecían de restricción explícita de ejecución directa por clientes. | Migración 162 retira la ejecución directa; las operaciones públicas autorizadas siguen llamándolos internamente. |

## Aplicación en Supabase

El commit y el push no ejecutan migraciones. El usuario ha confirmado la aplicación completa de ambos archivos, en este orden:

1. `supabase/migrations/162_restrict_internal_check_helpers.sql`.
2. `supabase/migrations/163_returned_technical_work_visibility.sql`.

Ambos archivos se pueden volver a ejecutar. No contienen modificaciones de partes, facturas, pagos o stock. Para comprobar los permisos internos tras 162, usar `supabase/verification/verify_162_internal_check_helpers.sql`. Aplicación de 162 y 163 confirmada por el usuario el 5 de octubre. La migración 161 ya se había confirmado anteriormente. La comprobación independiente de los permisos efectivos requiere ejecutar el archivo de verificación.

## Verificación

- Suite completa: **1.561 pruebas superadas**, sin fallos.
- Compilación TypeScript y build de producción correctos. Permanece el aviso de tamaño del paquete principal; no es un fallo de compilación.
- Pruebas de comportamiento nuevas para separación de cachés, cambio de sesión, URL firmadas tardías, cola persistente con IndexedDB real simulado, sincronización concurrente y edición durante el envío, clasificación de errores de conexión, destinatarios de avisos y recuperación de borradores.
- Pruebas de permisos, asignaciones y sintaxis de las migraciones nuevas.
- Navegador de producción, lectura: Avisos, Vehículos, PRL, Documentación, Compras y Facturas de proveedor abren sin error visible. En el ancho inspeccionado de 1.016 px no se observó desbordamiento horizontal de la página. No se crearon pagos, facturas, consumos ni certificados para realizar esta comprobación.
- Revisión sintáctica histórica: el parser pudo leer 158 de los 162 archivos disponibles en ese momento. Falló internamente por memoria en cuatro archivos antiguos (055, 060, 110, 123); ese resultado no demuestra un error SQL. La sintaxis externa tampoco comprueba por sí sola las relaciones, los permisos efectivos o todas las instrucciones PL/pgSQL en una base de datos real.

## Aspectos que siguen pendientes de auditoría

- Comprobar los permisos efectivos tras 162 y la visibilidad real de una devolución con asignación activa tras 163.
- Completar las correcciones desplegadas en móvil con la sesión apropiada. En escritorio se ha verificado el nuevo diálogo de factura: sin desbordamiento horizontal, textarea no redimensionable, fondo bloqueado durante la apertura y desplazamiento restaurado al cancelar.
- La preparación de factura y la creación de aviso todavía usan más de una petición. El borrador parcial ya se puede recuperar sin recrearlo, pero conviene convertir la operación completa en una transacción de base de datos.
- La creación de pagos se protege frente a envíos concurrentes de la misma pantalla; falta estudiar una clave de operación persistente que cubra reintentos tras pérdida de respuesta o desde varias pestañas.
- La recuperación de cambios locales antiguos sin autor exige un procedimiento asistido; no se atribuyen automáticamente a otro usuario ni se borran.
- Completar la matriz de permisos con sesiones de Técnico, SAT, Oficina, Gerencia y Superadmin. Abrir una pantalla no demuestra que todas sus escrituras estén autorizadas correctamente.
- Ejecutar `supabase/verification/audit_operational_integrity.sql` sobre la base de datos real y revisar sus diez contadores. Es una transacción de solo lectura que comprueba stock, claves repetidas, consumos, vínculos previstos, importes, pagos, avisos y asignaciones invisibles; no repara datos por suposición.


## Segunda revisión de permisos y datos reales

- Se bloquean las capacidades basadas en roles para perfiles inactivos o eliminados; también se bloquean sus workspaces y módulos. Partes y checks comprueban la empresa, con la excepción global de Superadmin activo. Asignaciones eliminadas o canceladas no conceden lectura al técnico.
- Crear avisos vuelve a estar disponible para Superadmin y Oficina, de acuerdo con las políticas existentes del servidor.
- La ejecución en Supabase de audit_operational_integrity.sql, confirmada mediante la tabla aportada por el usuario, devuelve cero en nueve comprobaciones y **24 consumos con datos de stock incoherentes**. Esto no prueba por sí solo un stock incorrecto: la migración 094 añadió el almacén canónico sin backfill histórico. Se ha preparado audit_material_consumption_details.sql para distinguir los casos, sin modificar saldos. El diagnóstico detallado sigue pendiente.
- Suite completa tras esta revisión: 1.557 pruebas; build correcto.


## Trazabilidad de los 24 consumos

El detalle aportado por el usuario muestra 24 consumos creados en agosto de 2026: todos tienen estado validated, descuento positivo, almacén nulo y cero movimientos canónicos asociados. Son compatibles con datos anteriores al modelo por almacén; no se ha demostrado un descuento duplicado actual ni se ha inventado un almacén para ellos. La pantalla explicará «Descuento registrado sin trazabilidad por almacén» y conservará la cantidad registrada.

La migración 164 añade una protección para nuevas inserciones o cambios de cantidades/descuentos incoherentes. Conserva los históricos existentes y permite cambiar sus notas o precios sin alterar la identidad y cantidades de stock. No ajusta saldos ni compensa consumos. Incluye pruebas transaccionales sobre una tabla temporal; el usuario ha confirmado su ejecución completa con «Success. No rows returned», lo que también verifica las pruebas temporales del trigger en el esquema real. Los 24 casos siguen siendo una revisión histórica pendiente, no incidencias borradas artificialmente del diagnóstico.


Verificación final de esta entrega: 1.561 pruebas superadas, build correcto y migración 164 aplicada con sus pruebas temporales de aceptación/rechazo incluidas. No se han cambiado cantidades de los 24 históricos ni saldos para hacer desaparecer el contador.

## Búsquedas con signos de puntuación

Se corrige el filtro OR compartido: comas, puntos, dos puntos, paréntesis, comillas y barras inversas se incluyen dentro de un valor entre comillas, con los escapes de PostgREST. Antes podían romper la consulta o introducir condiciones adicionales. Se conserva el comportamiento previo de las búsquedas simples y sus comodines.

Referencia: https://docs.postgrest.org/en/v16/references/api/url_grammar.html#reserved-characters. Cinco pruebas usan el cliente Supabase real con transporte simulado, incluida una cadena que intentaba añadir una condición. Verifican la URL enviada; queda pendiente comprobar el parser de producción. Suite completa: **1.566 pruebas superadas**, build correcto. No requiere migración.

## Preparación de creación transaccional de avisos

La migración 165 prepara `dmp_create_alert_atomic`: inserta cabecera y destinatarios en la misma transacción, valida destinatarios activos de la empresa, elimina destinos repetidos y serializa reintentos por identificador de operación. Usa SECURITY INVOKER y mantiene RLS y permisos de tabla; no concede nuevas capacidades sobre esas tablas. Un reintento devuelve únicamente el aviso de la misma empresa y autor, no eliminado. La instalación no crea avisos ni modifica registros existentes.

Verificadas sintaxis SQL y PL/pgSQL, con dos pruebas adicionales. Pendientes: aplicación en Supabase, prueba de permisos/transacción real y conexión del formulario al RPC. La interfaz conserva todavía el servicio anterior; no se declara resuelta la creación atómica hasta completar esos pasos.

Actualización: el usuario confirma aplicación completa de 165 con «Success». El formulario pasa a usar el RPC con un identificador estable por apertura y bloqueo inmediato de envíos simultáneos. Si falla la conexión, conserva los campos para reintentar el mismo envío. Tres pruebas de servicio verifican repetición del identificador tras respuesta perdida, rechazo de destinos vacíos y ausencia de fallback a inserciones separadas. No se ha realizado todavía una creación de prueba en producción ni se cubre recuperación tras cerrar el formulario o desde otra pestaña.
