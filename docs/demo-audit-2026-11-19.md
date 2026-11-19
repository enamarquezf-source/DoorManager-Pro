# Revisión real de Demo y documentos · 18–19 de noviembre de 2026

## Alcance y límites

Se han usado los cinco perfiles con datos ficticios en la Demo pública. Las operaciones de facturación y cobro son simuladas. No se han realizado operaciones de negocio en Pro ni cambios de configuración del ordenador durante esta revisión.

Esto documenta circuitos concretos. No equivale a verificar todas las combinaciones posibles de permisos, dispositivos, cancelaciones o concurrencia.

## Pruebas en navegador

| Perfil / recorrido | Resultado observado |
| --- | --- |
| Gerencia, guía individual | Apertura del parte, rentabilidad, periodo de tres meses, análisis y guardado del estudio, cambio a SAT. |
| SAT, guía individual | Alta de cliente y centro, equipo, parte, asignación de Alex, recepción del cierre, valoración de horas y envío a Facturación. La exploración opcional del contrato queda pendiente en esta sesión. |
| Técnico, guía individual | Check completo de tres bloques, otro check cerrado con bloques sin revisar, trabajo realizado, 90 minutos, firma ficticia y cierre enviado a SAT. |
| Oficina, guía individual | Preparación y emisión de FAC-2026-000004 por 81,68 €, cobro ficticio total, estado Cobrada y saldo pendiente 0 €. Calendario de cobros abre y prepara la siguiente misión. |
| Comercial, guía individual | Cliente, presupuesto PRE-2026-000001, línea con coste 25 €/venta 45 €, registro de envío a example.invalid, aceptación ficticia, alta de centro desde la creación del parte conservando datos, generación de PAR-2026-000002 y cambio a SAT. |
| Descubrir DMP, repetición | Apertura del parte preparado, check de tres bloques, trabajo, horas, 10 km, firma, entrega técnica y entrada en SAT. Interrupción al comprobar la descarga PDF en SAT. No se completó esta repetición hasta el estudio final. |

La espera de descarga del navegador perdió la conexión con la herramienta; la sesión temporal caducó. La descarga remota no se considera verificada. El motor PDF sí se ha probado y sus páginas se han renderizado e inspeccionado localmente.

## Fallos corregidos y publicados

- Una misión podía heredar recuentos de la anterior y saltar factura/cobro. La instantánea de progreso está vinculada a la misión, el perfil y el parte actual.
- El cambio Comercial → SAT contaba asignaciones de otros trabajos. La comprobación usa exclusivamente el parte y empresa de la guía, excluye asignaciones canceladas o eliminadas y espera su asignación real.
- A 576 px la guía tapaba el botón de guardado de bloques. El modo compacto incluye anchuras hasta 760 px y la confirmación queda separada de la barra.
- Al reabrir Descubrir DMP se reconoce un check ya finalizado del parte preparado.
- Una ficha de responsable SAT apuntaba al mismo parte. Se anuncian fichas operativas únicamente para roles que tienen esa pantalla; se elimina el enlace circular.
- Guardar la misma firma queda bloqueado tras la primera confirmación y durante el guardado. Los reintentos conservan el identificador local; Nueva firma inicia otra captura.
- Al regresar a la portada desde la aplicación no se cargaban los estilos de la lista del recorrido. Esto mostraba la numeración nativa junto a 01–04 y pegaba las palabras. La propia portada importa ahora su hoja de estilos, sea cual sea la entrada.

## Documentos

- Se añade Descargar parte PDF desde el detalle de gestión. Carga el detalle completo al solicitarlo para evitar exportar datos parciales de la vista rápida.
- Se añade Descargar presupuesto PDF y Descargar factura PDF junto a las opciones de impresión existentes.
- Se conservan los informes de checks y los estudios de costes existentes. El modo técnico conserva la restricción de informes solicitada anteriormente.
- Diseño A4 con cabecera, emisor y cliente, tablas, total destacado, continuación de tablas y páginas numeradas. Se han inspeccionado imágenes renderizadas de los tres tipos de PDF.
- Los documentos de cliente excluyen costes internos, márgenes, notas SAT y el documento identificativo del firmante. El parte lista las conformidades registradas y remite al original conservado; no recrea una firma.
- La factura toma el snapshot fiscal guardado. Las etiquetas de borrador no convierten un borrador en una factura emitida.
- La impresión de factura oculta las demás secciones de la pantalla y mantiene cabeceras de tabla en páginas siguientes.

## Validación

- Compilación TypeScript y Vite correcta.
- 130 pruebas focalizadas pasaron antes de publicar los PDF y las correcciones de guía.
- Suite general: 2.095 casos correctos y un caso obsoleto que exigía literalmente un mensaje sobre una fase futura de facturación. Se actualizó al flujo vigente; sus 19 pruebas pasaron después.
- Cinco pruebas de la entrada pública y compilación pasaron tras corregir la hoja de estilos.
- Comprobada la versión pública de Demo y Pro con las mejoras PDF. La corrección posterior de portada se verifica por separado durante su despliegue.

## Pendiente de cobertura

Completar nuevamente Descubrir DMP desde SAT hasta el estudio final, repetir Mi recorrido completo de principio a fin con la última versión, recorrer compras por todos los roles y el contrato opcional, y comprobar las descargas y el diálogo de impresión en navegador tras recuperar la verificación de acceso. No se presentan como pruebas realizadas en esta sesión.
