# Auditoría de interfaz y revisión SAT

Cambios preparados en el código local el 4 de octubre de 2026.

## Interfaz

- Navegación lateral compacta en grafito y selección con acento ámbar.
- Cabecera superior como referencia de página; rutas y encabezados repetidos eliminados visualmente. Se conservan acciones y cabeceras de ficha.
- Materiales: toda la fila es un enlace accesible por teclado, sin botón Detalles; nombre, código, características y existencias distribuidos en columnas adaptables.
- Checks: toda la fila abre la ficha; cliente y centro se obtienen de su parte asociado en una consulta agrupada. Las acciones de ciclo de vida pasan a la ficha y mantienen sus permisos.
- Columnas de Materiales y buscador superior sin mínimos rígidos que fuerzan el desbordamiento del documento.
- Indicadores y acciones del inicio con jerarquía, colores de estado y controles coherentes.

## SAT

La función de cola de la migración 089 acepta cualquier estado operativo con `sat_review_status = pending`, mientras que la operación de revisión solo admite `Finalizado tecnicamente` o `Devuelto por SAT`, con revisión `pending` o `returned`.

La migración 148 alinea ambos criterios y mantiene filtros de empresa, permisos, exclusión de facturados y las colas comercial/facturación. No cambia estados de partes históricos. La consulta `supabase/verification/diagnose_sat_queue_148.sql` permite identificar incoherencias antes de cualquier corrección de datos.

Los errores de revisión se muestran dentro del diálogo abierto, además del mensaje de la ficha, para que no queden ocultos tras el fondo modal.

Esta inconsistencia es verificable en el código; no se ha confirmado que sea la causa de los cinco partes de la captura. Es necesario ejecutar el diagnóstico autorizado en la base de datos y reproducir el error con la sesión correspondiente.

## Validación y pendientes

La compilación de producción y las 1406 pruebas existentes pasan tras los cambios de interfaz. La migración y el diagnóstico tienen comprobación adicional de sintaxis SQL.

El control del navegador continúa fallando por `windows sandbox failed: setup refresh had errors`. No se ha podido verificar visualmente el resultado ni probar navegación o validación SAT con datos reales. No se puede garantizar ausencia de solapamientos sin esa comprobación.

No se ha publicado la interfaz ni aplicado la migración a la base de datos remota. Antes de publicar: comprobar Inicio, Materiales, Checks y fichas a 1280, 993, 768 y 390 píxeles; navegación por teclado; menús plegados; nombres largos; filtros; gestión y archivado dentro de la ficha. Aplicar la migración con el flujo de despliegue del proyecto y revisar el diagnóstico de los partes afectados.
