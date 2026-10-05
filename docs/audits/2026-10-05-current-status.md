# Estado actual de la auditoría

Fecha: 5 de octubre de 2026. Rama de trabajo: main. Este documento resume el estado actual; el informe funcional conserva el historial de entregas y sus comprobaciones.

La auditoría integral sigue abierta. Un build correcto o una prueba simulada no demuestra por sí solo que todos los permisos y las operaciones funcionan en producción.

| Requisito | Evidencia disponible | Trabajo pendiente |
| --- | --- | --- |
| Separación entre perfiles y empresas | Caché por ámbito de acceso, invalidación de URL privadas, reglas de perfiles activos, comprobaciones de empresa y pruebas automatizadas de identidad. | Matriz real de lectura y escritura de Técnico, SAT, Oficina, Gerencia y Superadmin. |
| Funciones internas de checks protegidas | Migración 162 aplicada y resultado real del verificador: ambas funciones existen, son SECURITY DEFINER, search_path=public y los tres permisos de ejecución directa son false. | Comprobar flujos públicos autorizados; la protección de ejecución directa queda verificada. |
| Trabajo técnico visible y asignable según estado | 161 y 163 aplicadas; pruebas de estados y asignaciones. Diego abre PAR-2026-000041 desde Mi jornada. | Ejecución real de devolución SAT, reasignación y sincronización en varios contextos autorizados. |
| Avisos completos y recuperables | 165 actualizada aplicada. Prueba dirigida solo a Marta creada, abierta y cerrada; código AVI-2026-000002 comprobado. | Reintento concurrente y pérdida de respuesta reales; matriz de eliminación por rol. |
| Stock consistente y sin descuentos duplicados | Nueve de diez contadores de integridad en cero. 164 aplicada con pruebas temporales de aceptación/rechazo. | Determinar almacén e historia de los 24 consumos antiguos sin trazabilidad; no inventar ni compensar saldos para ocultarlos. |
| Creación conjunta de facturas proveedor | 167 aplicada; formulario conectado a una sola función SECURITY INVOKER con cabecera, líneas y asignaciones. Pruebas de sintaxis y llamada/reintento. | Rollback y concurrencia reales en PostgreSQL con datos de prueba autorizados; conservar operación tras cerrar el formulario. |
| Pagos y cobros sin repetición del mismo envío | 166 aplicada, formularios conectados, identificador y contenido persistentes por propietario, recuperación de facturas ya pagadas y bloqueo entre pestañas con Web Locks. Pruebas de respuesta perdida y aislamiento. | Reintento real de una operación financiera autorizada. Identificadores distintos siguen representando operaciones distintas. |
| Documentos privados y adjuntos | Invalidación de URL por cambio de identidad; adjuntos de factura conservan ruta en reintentos y reconocen conflictos de almacenamiento. | Subida real autorizada, recuperación tras cerrar la pantalla y revisión de objetos huérfanos. |
| Vehículos y PRL | 160 aplicada. Recuperación de altas 168 preparada y publicada: recibo privado y gestor persistente por empresa/perfil/tipo, 13 pruebas específicas. | 168 confirmada aplicada; formulario conectado al gestor persistente. Falta verificar permisos y operaciones con sesiones reales. El usuario autorizó pruebas de vehículo y aviso, no altas de certificados PRL. |
| Técnico cómodo en móvil | Sesión Diego comprobada a ancho CSS efectivo 325. Tarjeta abre trabajo; ficha sin desbordamiento, cabecera estática, único botón fijo de salto. Botones de 44 px y firma con texto de 16 px verificados tras despliegue 9d6efdb. Horas/materiales abiertos y cancelados sin escribir datos. | Medir el último ajuste de texto de formularios; cámara, firma, teclado y sincronización en dispositivo físico. |
| Otros perfiles cómodos en escritorio | El usuario confirma que SAT, Oficina, Gerencia y Superadmin se usarán desde ordenador. | Aplicar y comprobar el patrón común de listados/fichas con tareas reales; no ampliar ahora el rediseño móvil de esos perfiles. |
| Recuperación sin conexión | IndexedDB por perfil/empresa y revisión; recuperación y sincronización con bloqueo compartido. Pruebas de dos instancias e IndexedDB compartido. | Procedimiento asistido para registros antiguos sin propietario y prueba en dos pestañas/dispositivo reales. |

Migraciones confirmadas por el usuario en esta fase: 161, 162, 163, 164, 165 actualizada, 166 y 167. La confirmación de instalación no sustituye la comprobación funcional posterior.

La última compilación de código, f832ca8, es correcta. Sigue la advertencia conocida del tamaño del paquete principal. No se han registrado pagos, horas, materiales, firmas ni facturas reales para las pruebas de esta fase.

Suite completa comprobada después de f832ca8: 1.597/1.597 pruebas superadas. El informe histórico detalla el alcance de cada prueba y sus límites.

169 confirmada aplicada por el usuario: motivo opcional en aprobación económica. No se han aprobado partes durante esta comprobación.

168 y 169: el usuario confirma dos respuestas Success. Ficha SAT/escritorio medida a ancho CSS 1028: sin desbordamiento horizontal, acciones y campos de 44 px, texto de 16 px. Se retiran los accesos de reasignación del bloque Equipo asignado cuando el estado ya no permite asignar. No se han alterado asignaciones reales.
