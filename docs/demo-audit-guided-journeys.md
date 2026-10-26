# Auditoría de los dos modos de demo

Revisión en curso: visita rápida y recorrido propio. El usuario ha pedido sustituir el avance manual por acompañamiento automático.

## Cambios preparados

- Avance tras nuevos registros guardados; no cuenta los datos precargados ni una recarga de página como trabajo completado.
- Sigue aperturas de parte/check y navegación explícita a secciones posteriores. Cambiar de perfil sigue siendo una acción identificable, no una mutación financiera automática.
- Mantiene abierta la pantalla actual al cambiar la instrucción. No cierra ni envía formularios por el visitante.
- Guía compacta por defecto, pausa y reducción al abrir formularios, marcas contextuales.
- 009_demo_inventory_examples.sql: proveedor y tres materiales, precios y existencias iniciales ficticias con movimientos canónicos; conserva modificaciones y consumos al reinstalar. Instalación remota pendiente de confirmación del propietario.

## Verificación automatizada

339 archivos y 1.889 pruebas pasan. Compilación correcta. Incluye prueba SQL real en PGlite de idempotencia, conservación del stock y rechazo de empresas no temporales; no sustituye la verificación en el Supabase remoto.

## Verificación pública

Pendiente de completar y registrar los resultados del recorrido después de publicar esta revisión. No afirmar que todas las opciones de la aplicación funcionan a la perfección a partir de las pruebas automatizadas.

## Envío automático al finalizar

Petición ampliada: finalizar cualquier check envía todos los pendientes de su parte; finalizar el parte envía también el cierre final. Se conservan ámbitos por empresa/perfil y parte. Orden probado con IndexedDB real y backend simulado: bloque → foto → horas → cierre de check → cierre de parte. El fallo de foto conserva las operaciones e impide confirmar el cierre. Los cierres explícitos llevan autoSync y se reintentan al recuperar conexión/foco; no se envían borradores de otros partes. Los mensajes distinguen guardado local y envío confirmado.
El propietario confirmó la instalación remota de 009 con Success. Datos de inventario pendientes de comprobar desde la UI.
Visita rápida: apertura de parte avanza de 1 a 2; apertura de check avanza a Oficina; apertura del parte listo para facturar avanza a Cobros. Comprobados historial, tipos de equipo, selección de un defecto con otros favorables, foto de componente persistida y sincronización de dos operaciones con 0 fallos. Siguen pendientes las etapas restantes de esta auditoría.
