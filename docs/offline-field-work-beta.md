# Trabajo de campo sin cobertura · BETA

## Activación

1. Mantener aplicadas las migraciones anteriores, incluidas 181 y 182. Aplicar `183_offline_field_operations.sql` en Supabase.
2. Compilar con `npm run build` y servir `dist` por HTTPS. Para comprobarlo en el mismo ordenador: `npm run preview -- --host 127.0.0.1 --port 4173 --strictPort`.
3. Entrar como técnico con cobertura. **Mi jornada** descarga automáticamente el paquete completo si todavía no existe, es de otro día o cambia el listado local de asignaciones. Esperar a la confirmación; **Cargar todos los partes** permite reintentar y **Actualizar jornada** fuerza una nueva descarga.
4. Completar una prueba real en modo avión antes de usarlo en campo.

El servidor de desarrollo de Vite no instala el service worker: permite probar datos locales, pero no representa la reapertura offline de producción. El puerto de preview tiene almacenamiento y sesión diferentes del puerto 5173. La primera entrada en cada dispositivo y origen requiere conexión.

## Recorrido

La descarga prepara los partes asignados, sus equipos y checks completos, los checks pendientes del técnico, materiales activos de la empresa (paginados), almacenes y existencias de referencia, opciones de trabajadores, conceptos de desplazamiento/recursos, historial técnico, fotos, firmas previas y documentos vinculados al parte. Los archivos con URL temporal se guardan como contenido local; una descarga fallida no deja la marca de jornada completa. Los documentos generales ajenos al parte y los históricos completos de checks no se descargan íntegramente.

Las lecturas de esos recursos usan IndexedDB primero. La primera carga de **Mi jornada** espera al paquete completo, incluidos los partes y checks que no se hayan abierto nunca. El estado de preparación se guarda junto al listado que usa la pantalla; volver a ella no depende de que se vuelva a ejecutar una petición. Una jornada completa del día se reutiliza sin repetir la descarga al cambiar de pantalla; **Actualizar jornada** actualiza explícitamente la copia. Los botones para abrir partes se habilitan al terminar; un fallo muestra **Descarga incompleta** y permite reintentar, sin afirmar que el paquete está disponible offline.

En la pantalla técnica, trabajo realizado, horas, consumos, desplazamientos/recursos, decisiones de conceptos, checks, incidencias, fotos, firmas y solicitudes de cierre se guardan en la cola local, con o sin conexión. Las horas, consumos, firmas y fotos locales se reconstruyen al reabrir el parte. Los registros locales pendientes no permiten editar/eliminar desde los botones destinados a registros del servidor. Las eliminaciones de registros ya enviados requieren conexión. Los costes definitivos y las existencias se validan en el servidor al enviar; el stock descargado es una referencia, no una reserva.

**Enviar trabajo** utiliza la cola existente. Envía primero los resultados y adjuntos, después los cierres de checks y al final el cierre técnico. Un cierre espera al resto de operaciones de su ámbito. Una caída de red interrumpe el lote y conserva lo restante. No se envían cambios automáticamente al recuperar cobertura.

## Garantías y límites

- Datos locales separados por empresa y perfil. La sesión recuperada debe pertenecer al mismo usuario y tener un perfil verificado en los últimos siete días. Cerrar sesión retira ese acceso local; no borra trabajo pendiente.
- La app puede abrirse sin conexión después de instalarse la caché de la versión compilada. Las nuevas versiones esperan al cierre de las pestañas existentes para evitar recargar formularios abiertos.
- Las operaciones nuevas usan recibos atómicos en Supabase: repetir una operación confirmada devuelve su recibo sin volver a insertar. La protección existente de fotos, firmas y bloques se conserva.
- Se comparan versiones al modificar horas, costes, materiales y bloques de check, y el contenido previo al modificar trabajo realizado o decisiones de conceptos. Una reasignación o conflicto conserva la operación para revisión; no se fuerza su sobrescritura.
- La revocación de acceso se verifica al reconectar; un dispositivo desconectado no puede conocer cambios posteriores a la descarga.
- El navegador debe permitir IndexedDB y Cache Storage. Borrar datos del navegador, perder el dispositivo o usar modo privado puede eliminar copias locales. La persistencia solicitada al navegador reduce la expulsión automática, pero no equivale a una copia de seguridad.
- Un archivo de más de 20 MB bloquea la preparación completa para evitar una falsa confirmación de disponibilidad. Las fotos nuevas conservan su límite de 10 MB.

## Prueba de aceptación en dispositivo

1. Preparar jornada y anotar la fecha de descarga. Abrir un parte y comprobar sus equipos y checks.
2. Activar modo avión, cerrar la pestaña y reabrir la misma URL del mismo origen.
3. Abrir un bloque que no se hubiera visitado antes; marcar un componente con defecto y otro favorable, añadir observación y foto y guardar.
4. Registrar horas, material, desplazamiento, trabajo realizado y firma. Reabrir y comprobar que siguen visibles.
5. Solicitar cierre de check y parte; comprobar que aparecen pendientes de enviar.
6. Recuperar cobertura y pulsar Enviar trabajo. Verificar resultados en SAT, sin duplicados.
7. Interrumpir un envío y reintentarlo. Comprobar que se conserva la cola y no se duplican horas/consumos.
8. Repetir con otro usuario/empresa y comprobar aislamiento. Cambiar una asignación o un bloque desde otra sesión y comprobar el conflicto al enviar.

Las pruebas automatizadas cubren el repositorio local, aislamiento, restauración del perfil, reconstrucción del trabajo, preparación incompleta, arranque del service worker con red caída y SQL de recibos/conflictos. No sustituyen esta prueba de móvil contra Supabase, pendiente tras aplicar la migración y publicar la versión compilada.
