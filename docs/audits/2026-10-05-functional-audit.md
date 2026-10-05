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

- Suite completa: **1.543 pruebas superadas**, sin fallos.
- Compilación TypeScript y build de producción correctos. Permanece el aviso de tamaño del paquete principal; no es un fallo de compilación.
- Pruebas de comportamiento nuevas para separación de cachés, cambio de sesión, URL firmadas tardías, cola persistente con IndexedDB real simulado, sincronización concurrente y edición durante el envío, clasificación de errores de conexión, destinatarios de avisos y recuperación de borradores.
- Pruebas de permisos, asignaciones y sintaxis de las migraciones nuevas.
- Navegador de producción, lectura: Avisos, Vehículos, PRL, Documentación, Compras y Facturas de proveedor abren sin error visible. En el ancho inspeccionado de 1.016 px no se observó desbordamiento horizontal de la página. No se crearon pagos, facturas, consumos ni certificados para realizar esta comprobación.
- Revisión sintáctica histórica: el parser pudo leer 158 de los 162 archivos disponibles en ese momento. Falló internamente por memoria en cuatro archivos antiguos (055, 060, 110, 123); ese resultado no demuestra un error SQL. La sintaxis externa tampoco comprueba por sí sola las relaciones, los permisos efectivos o todas las instrucciones PL/pgSQL en una base de datos real.

## Aspectos que siguen pendientes de auditoría

- Comprobar los permisos efectivos tras 162 y la visibilidad real de una devolución con asignación activa tras 163.
- Probar las correcciones desplegadas en móvil y escritorio con la sesión apropiada; la revisión de producción anterior al despliegue no verifica el código nuevo.
- La preparación de factura y la creación de aviso todavía usan más de una petición. El borrador parcial ya se puede recuperar sin recrearlo, pero conviene convertir la operación completa en una transacción de base de datos.
- La creación de pagos se protege frente a envíos concurrentes de la misma pantalla; falta estudiar una clave de operación persistente que cubra reintentos tras pérdida de respuesta o desde varias pestañas.
- La recuperación de cambios locales antiguos sin autor exige un procedimiento asistido; no se atribuyen automáticamente a otro usuario ni se borran.
- Completar la matriz de permisos con sesiones de Técnico, SAT, Oficina, Gerencia y Superadmin. Abrir una pantalla no demuestra que todas sus escrituras estén autorizadas correctamente.
- Completar comprobaciones de integridad de stock, asignaciones e importes sobre la base de datos real, sin reparar cantidades o importes por suposición.
