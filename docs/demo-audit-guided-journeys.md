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

## Auditoría pública de 27/10/2026

Prueba manual en el navegador, desde portada como visitante nuevo. Solo empresa temporal de la demo; sin modificar la instalación Pro.

### Recorrido propio comprobado

- SAT: cliente «Prueba completa DMP · ficticia», centro, parte PAR-2026-000001, alta rápida de puerta seccional y asignación a Alex Demo. El técnico recibió el parte y su check descargado automáticamente.
- Check: rodillos con defecto leve y observación/foto; paneles y bisagras favorables; accionamiento y seguridad favorables. Respuestas independientes correctas.
- Primer cierre automático del check dejó 5 operaciones pendientes sin intentos. Reintento manual envió 5/5, cero fallos. Se corrigió la espera del lock en el cierre explícito. La recuperación automática posterior a actualizar envió el cierre del parte y los registros pendientes.
- Técnico: trabajo realizado, 90 minutos, 1 rodillo de almacén, 25 km y firma ficticia. Datos recibidos por SAT. El cierre técnico persistió; no equivale a aprobación económica.
- SAT envió a Facturación. Oficina decidió los tres conceptos y aprobó: material 8 € de coste/16 € de venta; horas 33 €/67,50 €; desplazamiento 7,50 €/15 €. Total coste 48,50 €, venta 98,50 €, margen 50 €.
- Factura FAC-2026-000001 emitida por 119,19 € con IVA, vencimiento 10/11/2026. Cobro simulado registrado en Caja de simulación: 119,19 € cobrado, 0 € pendiente. Calendario de Oficina confirmó cero pendientes.
- Gerencia mostró el mismo caso como cobrado, coste 48,50 €, venta 98,50 €, margen 50 €. Resumen incluyó el trabajo en el periodo. Estudio «Auditoría DMP · escenario ficticio» guardado, con presencia y estándar introducidos explícitamente; no se afirma productividad sin referencia.
- Compras: proveedor «Proveedor auditoría · ficticio», pedido PED-2026-000001 de dos rodillos a 8 €, recepción REC-2026-000001 confirmada. Stock 6→8, movimiento +2 enlazado a pedido/recepción. El consumo técnico todavía requiere validación y no descontó stock antes de ella.
- Factura de proveedor FPR-2026-000001 / SIM-PROV-001, base 16 €, IVA 3,36 €, total 19,36 €, registrada y vinculada a pedido/recepción.

### Errores encontrados y correcciones

- Condicional de error vacío generaba un paso «Información adicional» sin campos: se excluyen cadenas vacías del asistente.
- Guía consumía una cabecera de la pantalla anterior o de carga en vez de esperar al botón Crear: espera ruta y acción concretas; prueba de regresión con carga diferida.
- Cierre explícito competía con sincronización de fondo y devolvía pendientes inmediatamente: espera el lock sin robarlo. Prueba de concurrencia y pruebas de orden/dependencias conservadas.
- Mensaje de error de cierre aparecía duplicado: se muestra una sola vez.
- Técnico veía un error de bloqueo después de un cierre correcto: mensaje de trabajo entregado y regreso a jornada, sin reabrir acceso.
- Guía de Oficina se atascaba sobre el mismo parte ya abierto: detecta aprobación económica confirmada y explica decidir conceptos antes de aprobar.
- Resumen apuntaba a una cabecera inexistente: apunta al panel de estudios.
- Guardar estudio avanzaba antes de confirmar persistencia: ahora espera evento de guardado correcto.
- Cambiar de recorrido podía reutilizar evidencia de la misión anterior: instancia de guía por recorrido.
- Apertura del material recibido y registro confirmado de factura de proveedor no hacían avanzar: reconocidos.
- Enlace de factura proveedor desde pedido usaba supplier_id de props inexistente: utiliza el proveedor del pedido cargado.

### Límites y pendientes de cobertura

Esto verifica un circuito concreto y no demuestra ausencia de todos los errores. No se han probado exhaustivamente todas las combinaciones de permisos, cancelación/anulación, importación masiva, impagos parciales, producción Pro ni concurrencia de dos visitantes en esta sesión. Las pruebas automáticas de aislamiento y SQL complementan, pero no sustituyen esas pruebas remotas.
La visita rápida se había comprobado en la sesión anterior; queda repetirla con la última publicación y verificar móvil. También queda comprobar nuevamente un primer cierre de check tras la corrección del lock, sin reintento manual, y validar el consumo pendiente desde SAT.
### Repetición posterior a las correcciones

- Primer cierre de un check nuevo CHK-2026-000002 probado desde móvil: tres bloques favorables, Finalizar → Confirmar, envío automático de bloques y cierre; retorno al parte con «Check finalizado y sincronizado» y tarjeta Finalizado. Sin pulsar Enviar trabajo ni reintento manual. Queda cubierta la repetición pendiente del lock para un cierre nuevo; la foto se había verificado en el circuito anterior.
- Vista móvil 390×844: navegación del técnico, tarjetas y guía compacta comprobadas. Evidencia local en node_modules/.cache/dmp-demo/audit-mobile-check-synced.png.
- Pruebas completas: 347 archivos, 1.915 pruebas. Una prueba antigua exigía literalmente el enlace defectuoso con props.supplier_id; se actualizó al proveedor del pedido cargado y sus 3 casos pasan. Las otras 1.914 pruebas pasaron en la ejecución completa.
- Visita rápida repetida hasta 6/6 en móvil: parte, check, ejemplo de Oficina, calendario y rentabilidad, con avances por las acciones del visitante. Detectado y corregido que el CTA «Ver calendario de cobros» señalaba el hero en lugar de abrir el calendario real. Regresión del objetivo concreto y compilación correctas.
- Validación SAT del consumo confirmada: pendientes 1→0 y stock del rodillo 8→7. Queda cerrada esa comprobación.
- Alta de material desde SAT falló por permiso; búsqueda confirmó que no dejó una ficha parcial. RBAC y servidor conceden SAT lectura y validación, no materials.create. Se oculta Crear material en ese perfil y su guía conduce a Oficina, sin ampliar permisos. Repetido desde Oficina: MAT-000001 «Material auditoría Oficina · ficticio» creado correctamente, con proveedor inicial y cantidad inicial cero.
- Pendientes de cobertura ampliada: presupuestos comerciales completos, contratos/visitas de mantenimiento, importación masiva, cancelaciones y concurrencia remota entre visitantes. No se deben presentar estos ámbitos como auditados por este recorrido.

## Revisión de usabilidad de 28/10/2026

- La guía técnica completa ya no considera un componente guardado como un check terminado: usa checks Realizado y cierres locales explícitos. Mantiene la instrucción hasta Finalizar check; prueba de regresión para bloque parcial y cierre.
- Dentro de un check señala el siguiente bloque Sin revisar; al acabar los bloques señala Finalizar check. En el detalle de bloque señala el grupo de resultados sin elegir uno por el visitante.
- Ir a la firma enfoca Nombre firmante; no intenta guardar una firma vacía. Material utilizado abre su sección y señala Añadir material.
- Objetivos concretos para Enviar a destino, Marcar pedido, Registrar recepción, Añadir línea, últimos tres meses, guardar estudio y registro de factura de proveedor.
- Rentabilidad y existencias apuntan a registros pulsables. Las operaciones de aprobación, cobro, emisión/registro y cierre conservan confirmación del visitante; la guía señala sus controles sin ejecutarlas al detectar datos.
- La guía puede continuar dentro de los checks sin redirigir al parte. Una búsqueda de control pendiente se cancela al cambiar de misión y deja de bloquear el CTA tras ocho segundos.
- Instrucciones breves con nombres exactos de los botones; actualización de instrucciones anunciada mediante aria-live polite.
- Verificación: 347 archivos / 1.920 pruebas pasaron antes de añadir dos regresiones adicionales; las 53 pruebas finales de demo y la compilación pasan. El primer intento de suite tuvo falta de memoria; repetición con dos workers correcta.
- Se continúa la comprobación pública de los recorridos tras publicar. No se amplía esta evidencia a combinaciones de cancelaciones, importación o concurrencia no recorridas.
- Ampliación: Presupuestos comerciales y contrato de mantenimiento avanzan tras confirmación de guardado, no por pulsar Guardar. La última misión de cada recorrido permite terminar la guía. Tres regresiones adicionales: 56 pruebas de demo correctas; compilación correcta.
- Visita rápida pública repetida el 28/10: abrir trabajo, abrir check, consultar parte de Oficina, calendario real y trabajo desde Rentabilidad → 6/6 sin pulsar Siguiente. Los cambios de perfil siguen siendo explícitos.
