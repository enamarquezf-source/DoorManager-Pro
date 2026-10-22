# Checks: resultados por componente

Aplicar 181 y después 182. Si la 181 ya está aplicada, ejecutar solo 182.
Comprobar con `supabase/verification/verify_check_components_181_182.sql`.

Al abrir una zona, cada componente conserva su resultado individual. No se hereda
el defecto de la zona. El resultado de la zona resume la revisión.

Para una incidencia:

1. Elegir problema leve, no favorable o favorable tras intervención.
2. Seleccionar únicamente el componente afectado.
3. Describir qué le ocurre. Se puede indicar una descripción común si afecta a
   varios elementos o escribir un detalle diferente para cada uno.
4. Adjuntar las fotos dentro de la tarjeta del componente. Las fotos generales de
   la zona siguen disponibles, diferenciadas de las del componente.
5. Marcar individualmente los demás componentes como favorables o confirmar todos
   los restantes mediante la opción conjunta. Sin confirmación quedan sin revisar.
6. Guardar y sincronizar.

Los borradores conservan identificadores reales de componente, notas y fotos.
La cola sincroniza el bloque antes de las fotos. Las fotos se enlazan con el
resultado del componente del mismo check y empresa. El servidor valida de nuevo
las relaciones; un identificador de otro check no permite adjuntar una foto.

La versión 2 comprueba que existe el esquema 182 antes de sincronizar, para no
enviar resultados individuales a una función antigua que los aplique a todo el
bloque. Si falta una migración, el cambio queda local y se puede reintentar.

Los resultados históricos no se reescriben automáticamente: no puede inferirse
con seguridad qué elementos estaban realmente defectuosos. Reabrir y guardar una
zona corrige sus resultados conforme a la selección confirmada por el usuario.

Las pruebas ejecutan las funciones PostgreSQL sobre PGlite e incluyen el registro
de fotos original. Storage no se sube en esas pruebas; se comprueba el registro de
archivo, su vínculo y los límites de empresa y check.
