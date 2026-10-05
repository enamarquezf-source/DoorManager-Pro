# Estado actual de la auditoría

Fecha: 5 de octubre de 2026. Rama de trabajo: main. Este documento resume el estado actual; el informe funcional conserva el historial de entregas y sus comprobaciones.

La auditoría integral sigue abierta. Un build correcto o una prueba simulada no demuestra por sí solo que todos los permisos y las operaciones funcionan en producción.

| Requisito | Evidencia disponible | Trabajo pendiente |
| --- | --- | --- |
| Separación entre perfiles y empresas | Caché por ámbito de acceso, invalidación de URL privadas, reglas de perfiles activos, comprobaciones de empresa y pruebas automatizadas de identidad. | Matriz real de lectura y escritura de Técnico, SAT, Oficina, Gerencia y Superadmin. |
| Funciones internas de checks protegidas | Migración 162 aplicada por el usuario y restricciones explícitas de ejecución. | Resultado independiente de verify_162_internal_check_helpers.sql solicitado al usuario. |
| Trabajo técnico visible y asignable según estado | 161 y 163 aplicadas; pruebas de estados y asignaciones. Diego abre PAR-2026-000041 desde Mi jornada. | Ejecución real de devolución SAT, reasignación y sincronización en varios contextos autorizados. |
| Avisos completos y recuperables | 165 actualizada aplicada. Prueba dirigida solo a Marta creada, abierta y cerrada; código AVI-2026-000002 comprobado. | Reintento concurrente y pérdida de respuesta reales; matriz de eliminación por rol. |
| Stock consistente y sin descuentos duplicados | Nueve de diez contadores de integridad en cero. 164 aplicada con pruebas temporales de aceptación/rechazo. | Determinar almacén e historia de los 24 consumos antiguos sin trazabilidad; no inventar ni compensar saldos para ocultarlos. |
| Creación conjunta de facturas proveedor | 167 aplicada; formulario conectado a una sola función SECURITY INVOKER con cabecera, líneas y asignaciones. Pruebas de sintaxis y llamada/reintento. | Rollback y concurrencia reales en PostgreSQL con datos de prueba autorizados; conservar operación tras cerrar el formulario. |
| Pagos y cobros sin repetición del mismo envío | 166 aplicada, formularios conectados, identificador y contenido persistentes por propietario, recuperación de facturas ya pagadas y bloqueo entre pestañas con Web Locks. Pruebas de respuesta perdida y aislamiento. | Reintento real de una operación financiera autorizada. Identificadores distintos siguen representando operaciones distintas. |
| Documentos privados y adjuntos | Invalidación de URL por cambio de identidad; adjuntos de factura conservan ruta en reintentos y reconocen conflictos de almacenamiento. | Subida real autorizada, recuperación tras cerrar la pantalla y revisión de objetos huérfanos. |
| Vehículos y PRL | Módulos y permisos revisados en entregas anteriores; 160 aplicada y eliminación preparada. | Verificar íntegramente permisos y operaciones con sesiones reales. El usuario autorizó pruebas de vehículo y aviso, no altas de certificados PRL. |
| Técnico cómodo en móvil | Sesión Diego comprobada a ancho CSS efectivo 325. Tarjeta abre trabajo; ficha sin desbordamiento, cabecera estática, único botón fijo de salto. Botones de 44 px y firma con texto de 16 px verificados tras despliegue 9d6efdb. Horas/materiales abiertos y cancelados sin escribir datos. | Medir el último ajuste de texto de formularios; cámara, firma, teclado y sincronización en dispositivo físico. |
| Otros perfiles cómodos en escritorio | El usuario confirma que SAT, Oficina, Gerencia y Superadmin se usarán desde ordenador. | Aplicar y comprobar el patrón común de listados/fichas con tareas reales; no ampliar ahora el rediseño móvil de esos perfiles. |
| Recuperación sin conexión | IndexedDB por perfil/empresa y revisión; recuperación y sincronización con bloqueo compartido. Pruebas de dos instancias e IndexedDB compartido. | Procedimiento asistido para registros antiguos sin propietario y prueba en dos pestañas/dispositivo reales. |

Migraciones confirmadas por el usuario en esta fase: 161, 162, 163, 164, 165 actualizada, 166 y 167. La confirmación de instalación no sustituye la comprobación funcional posterior.

La última compilación de código, f832ca8, es correcta. Sigue la advertencia conocida del tamaño del paquete principal. No se han registrado pagos, horas, materiales, firmas ni facturas reales para las pruebas de esta fase.

Suite completa comprobada después de f832ca8: 1.597/1.597 pruebas superadas. El informe histórico detalla el alcance de cada prueba y sus límites.
