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

## Evidencia de tesorería y actualización de pagos

El panel de pagos de proveedor comprobaba una propiedad que su consulta nunca devolvía y por ello señalaba todos los pagos activos como no vinculados a tesorería. Ahora consulta los movimientos canónicos por `source_type=supplier_payment` y los identificadores de los pagos de la factura. Solo muestra ausencia cuando la consulta autorizada confirma que falta el movimiento; sin permiso de lectura de tesorería no inventa ese diagnóstico. Cuatro pruebas cubren vínculo presente, ausencia confirmada, lectura sin permiso, fallo de consulta y factura sin pagos.

Tras fallo de registro/reversión o de recarga, el panel exige actualizar los pagos antes de otra operación. No permite usar el saldo anterior como si la actualización hubiera terminado correctamente. Esto no sustituye una clave de operación persistente del servidor; los reintentos entre pestañas siguen pendientes de auditoría. No se registraron pagos reales para estas pruebas.

## Comprobación de producción posterior al despliegue

El 5 de octubre se confirma públicamente el despliegue 083d779. La sesión existente de Marta Lopez muestra FPR-2026-000004 registrada, cuatro radares, base 680 €, IVA 142,80 €, total y pagado 822,80 €, pendiente 0 €. El pago aparece activo sin el falso diagnóstico de tesorería ausente. No se registró ni revirtió un pago durante la comprobación.

En Materiales, la búsqueda `9,24` devuelve exclusivamente Motor Elecktromaten TS 9,24, con stock mostrado de 8 unidades. El diálogo Crear aviso abre y cancela sin guardar, con textarea no redimensionable y fondo bloqueado mientras está abierto. Esta comprobación de lectura no verifica la creación atómica real ni los reintentos del servidor. La suite más reciente contiene **1.575 pruebas superadas** y el build es correcto.

## Reintentos de adjuntos de factura

La pantalla generaba una ruta distinta en cada intento aunque el RPC de registro ya era idempotente por ruta (migración 157). Se conserva ahora un identificador por archivo seleccionado, se bloquea inmediatamente el envío simultáneo y se reintenta la misma ruta sin sobrescribir objetos. Los conflictos de objeto existente permiten volver al RPC, que comprueba propietario, factura y origen y recupera el documento existente. Se reconocen tanto 409 como los errores 400 de objeto existente documentados por Supabase: https://supabase.com/docs/guides/storage/uploads/standard-uploads.

Cinco pruebas verifican pérdida de respuesta de registro, reintentos con ambos códigos de conflicto, rechazo de permisos/autenticación y rechazo de identificadores que alteran la ruta. No se eliminan archivos ante respuestas inciertas ni se suben archivos reales en estas pruebas. Quedan pendientes recuperación tras cerrar la pantalla, limpieza asistida de objetos huérfanos y prueba de subida en producción con un documento autorizado.

## Prueba autorizada de aviso en producción

Se creó «PRUEBA AUDITORÍA DMP · guardado de aviso» dirigido únicamente al perfil actual Marta Lopez. La creación produjo una entrada, la apertura marcó la entrada como leída y actualizó el contador del centro de avisos de 1 a 0; después se cerró exclusivamente esa prueba. No se modificaron avisos reales.

La ficha reveló un fallo de la migración 165 inicial: el código quedaba vacío al depender de la generación por trigger. Se corrige la función para llamar explícitamente a `next_dmp_code` dentro de la transacción, después de la recuperación de reintentos, y se verifica de nuevo SQL y PL/pgSQL. Pendiente repetir la 165 actualizada en Supabase y comprobar que un nuevo aviso recibe código AVI. El aviso de prueba anterior se conserva como evidencia, cerrado, con su código vacío; no se reparan registros por suposición.

## Preparación de recuperación persistente de pagos

La migración 166 prepara un registro privado de operaciones y el RPC `dmp_record_payment_once`. Para un mismo identificador, empresa del actor, perfil, tipo y contenido exacto, devuelve el pago ya registrado. Serializa envíos simultáneos de esa operación y llama a los RPC financieros existentes, conservando sus comprobaciones de permisos, factura, saldo, tesorería y auditoría. El pago y su recibo de operación se guardan en la misma transacción. La tabla no permite lectura ni escritura directa a clientes.

Verificadas sintaxis SQL y PL/pgSQL con dos pruebas adicionales. La instalación no modifica pagos, importes ni saldos existentes. Pendientes aplicación de 166, conexión de formularios con conservación del identificador, verificación de fallo/reintento real y reglas de recuperación tras cerrar una pantalla. Dos pagos con identificadores diferentes siguen siendo operaciones distintas: no se bloquean pagos legítimos por coincidir en importe o fecha.

El usuario confirma que ha ejecutado la **166** con «Success». Sigue pendiente conectar los formularios y verificar el flujo real. Aclara que la 165 original estaba aplicada; no queda confirmada todavía la repetición de su versión con generación explícita de código AVI.

## Sincronización técnica entre pestañas

Se añade exclusión mediante Web Locks entre pestañas del mismo origen. Una pestaña no puede enviar una revisión nueva mientras otra sigue enviando la anterior; tampoco marca como interrumpida una sincronización que mantiene el bloqueo. La recuperación de cambios interrumpidos se ejecuta bajo el mismo bloqueo. No se roba el bloqueo de una petición activa y no se borran cambios pendientes.

Una prueba con dos instancias independientes del servicio, IndexedDB compartido y LockManager simulado verifica que el segundo contexto conserva el estado syncing, no envía una edición por adelantado y la sincroniza después del envío anterior. Referencia: https://www.w3.org/TR/web-locks/. En navegadores sin Web Locks se conservan las protecciones previas por revisión y en la pestaña; la exclusión entre pestañas no se considera verificada allí. La prueba no sustituye la validación móvil con dos pestañas reales.

Verificación de esta entrega: **1.583 pruebas superadas**, build correcto y diff sin errores. El usuario confirma también la repetición de la **165 actualizada** con «Success», tras la explicación de que reemplaza la función sin duplicar avisos. Falta comprobar un nuevo código AVI en producción; la 166 permanece pendiente de conexión de formularios.

## Recuperación de pagos conectada y código AVI comprobado

La 165 actualizada está aplicada: se creó la prueba autorizada «PRUEBA AUDITORÍA DMP · código AVI», dirigida exclusivamente a Marta Lopez, y su ficha muestra AVI-2026-000002. Se abrió y cerró únicamente esa prueba. El aviso anterior con código vacío se conserva como evidencia histórica.

Los formularios de cobros de cliente y pagos de proveedor utilizan ahora el RPC de la 166, aplicada por el usuario. Antes de enviar conservan identificador y contenido original en almacenamiento local, separados por empresa, perfil, factura y tipo. Una respuesta incierta permite recuperar el mismo envío después de cerrar o recargar la pantalla; no se envía automáticamente. Se impide cambiar su contenido durante la recuperación. Los errores SQL conocidos que garantizan rechazo permiten corregir los datos y volver a intentar con otra operación. Web Locks evita envíos simultáneos entre pestañas donde está disponible; otros navegadores conservan el bloqueo en la instancia y la idempotencia del servidor para la misma operación.

Seis pruebas de comportamiento verifican pérdida de respuesta, recuperación desde otra instancia, rechazo de contenido distinto, aislamiento de propietario, cambio de sesión, fallo de almacenamiento antes del RPC, rechazo SQL corregible y pagos legítimos distintos con igual importe. No se registraron ni revirtieron pagos reales. No se considera probado todavía un reintento financiero real en producción. Resultado: 1.589/1.589 pruebas, build correcto y git diff --check sin errores. La auditoría completa continúa; los 24 consumos históricos sin trazabilidad requieren evidencia adicional y no se han alterado.

## Acceso a la recuperación de cobros ya completados

Se detectó que el filtro de Cobros retiraba una factura pagada aunque su envío siguiera pendiente de confirmación local; además, Facturación ocultaba el botón cuando ya no quedaba saldo. Se mantiene visible la factura y se ofrece «RECUPERAR ENVÍO PENDIENTE» al perfil autorizado que conserva esa operación. El formulario reutiliza el contenido y el identificador originales. También permite consultar el recibo de una operación anterior si la factura se canceló posteriormente; no habilita un cobro nuevo de una factura cancelada ni de un borrador.

Cuatro pruebas verifican saldo agotado, cancelación posterior, falta de permisos y conservación del filtro habitual para saldos pendientes. Suite completa: 1.593/1.593 pruebas. Build correcto; permanece la advertencia conocida de tamaño del bundle principal. La creación de facturas proveedor desde pedido sigue repartida entre cabecera, líneas y asignaciones: la recuperación actual evita otra cabecera, pero no garantiza atomicidad del conjunto. Este punto continúa abierto.

## Preparación de creación atómica de factura proveedor

Se prepara la migración 167 con dmp_create_supplier_invoice_atomic: cabecera, líneas y asignaciones en una sola transacción; bloqueo por identificador de operación y recuperación por empresa/creador. SECURITY INVOKER mantiene los permisos de tabla, RLS y los triggers existentes de cantidades, importes y coherencia entre proveedor/pedido/recepción. No modifica stock, pagos ni registros existentes al instalarla. Un fallo de una línea o asignación propaga el error y revierte toda la creación.

Dos pruebas adicionales comprueban sintaxis SQL/PLpgSQL y controles estructurales. No equivalen a una prueba de rollback real en PostgreSQL. Pendiente aplicación en Supabase y conexión del formulario; la pantalla publicada continúa usando el flujo anterior hasta confirmar la instalación, para no romper el servicio durante el despliegue.

Preparada también la llamada cliente createDraftAtomic, todavía sin activar en la pantalla. Dos pruebas comprueban el envío conjunto, normalización numérica y reintento del mismo identificador tras respuesta perdida, sin escrituras directas ni fallback parcial. Suite completa: 1.597/1.597 pruebas, build correcto y diff sin errores. Se ha solicitado al usuario aplicar la 167; pendiente su confirmación y la conexión del formulario.

## Conexión del formulario tras confirmar la 167

El usuario confirma «Success. No rows returned» para la 167. Crear factura proveedor utiliza ahora createDraftAtomic con todas las sugerencias del pedido/recepciones. Se eliminan del envío inicial las llamadas separadas addLine y addAllocation; siguen disponibles para la edición explícita de borradores. Ante respuesta perdida se conserva el mismo identificador mientras el formulario siga abierto. La recuperación tras cerrar y volver a abrir ese formulario continúa pendiente: su identificador aún reside en un ref de la instancia.

Verificación posterior a la conexión: 1.597/1.597 pruebas, build correcto, diff sin errores. No se crearon facturas financieras de prueba en producción, por lo que no se afirma verificado un rollback real de las tres tablas ni una creación concurrente real. La instalación está confirmada por el usuario; la atomicidad está implementada en una sola función sin manejo que absorba excepciones.

## Cargas de facturas proveedor y pedido de origen

El listado y el pedido de origen dejan de escribir sus resultados en estado local sin control del orden de llegada. Usan el adaptador useLoad existente, con claves por búsqueda/estado o identificador de pedido y ámbito de acceso. Una respuesta de una clave anterior no reemplaza la selección actual. El envío comprueba que el pedido está cargado y que su identificador coincide con la selección; el botón se bloquea durante carga/error y se ofrece volver a cargar el pedido. Esto evita guardar sin sugerencias por anticiparse a la carga.

Suite completa de la migración de cargas: 1.597 pruebas. Tras añadir los mensajes y recuperación de carga, se verifican las 15 pruebas de facturas proveedor y se recompila. No se afirma probado el orden de respuestas con red real o móvil. No requiere migración nueva.

Referencia de UX propuesta al usuario: Jobber para jornada móvil centrada en visitas/trabajos (https://www.getjobber.com/features/field-service-management-app/), Linear para vistas y filtros guardados (https://linear.app/docs/custom-views), Odoo Field Service para reunir productos, tiempos y hojas de trabajo en la tarea (https://www.odoo.com/es_ES/slides/slide/your-first-field-service-task-6802). Son referencias de patrones, no pruebas de usabilidad de DMP. Pendiente validar un patrón común de ficha y listados con tareas reales y tamaños móviles.

## Comprobación móvil de Avisos y reducción de filtros

Se inspeccionó Avisos en producción mediante viewport solicitado de 390x844. El navegador informó ancho CSS efectivo 325 (la captura refleja el escalado del navegador) y ancho de documento 312; no hubo desbordamiento horizontal del documento. La captura mostró los ocho filtros en cinco filas antes del primer aviso; la cabecera móvil no técnica ocupa unos 120 px CSS. Esto no verifica todavía el trabajo del técnico ni otros módulos.

Se compactan los filtros solo hasta 640 px: Todos, Sin leer y Abiertos en una fila, con selector etiquetado que mantiene todas las opciones, incluidas las secundarias. En escritorio siguen los ocho botones. El selector y los botones mantienen altura mínima de 44 px. No se cambian criterios, permisos ni datos de avisos. Se restauró el viewport después de la inspección. Suite completa: 1.597 pruebas, build correcto y diff sin errores. Pendiente captura y prueba de selección posteriores al despliegue de este ajuste.
