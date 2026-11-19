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

Quedan pendientes la rama de compras para Técnico en una sesión con un consumo asignado, y la descarga real de PDF y el diálogo de impresión en navegador. El recorrido opcional de contrato ya se comprobó en SAT; Descubrir DMP y Mi recorrido completo se han repetido hasta el estudio final.

## Revisión de seguimiento · 19 de noviembre

- Se repitió en la Demo pública Descubrir DMP de Técnico a Gerencia: checks y cierre con respuestas pendientes, firma única, revisión SAT, factura y cobro ficticios, calendario de cobros, parte para revisar rentabilidad y estudio de costes guardado.
- Se confirmó el despliegue del commit `e1bab14` en Demo y Pro. En Gerencia, «Ver rentabilidad» abre el parte activo y deja preparada la misión de costes siguiente; ya no abre una pantalla que no corresponde a la guía.
- En el filtro «Últimos 3 meses» las fechas cambiaron a 1 de septiembre–30 de noviembre de 2026. La prueba de la guía comprueba también que la misión avanza al realizar esa acción.
- Se comprobó el alta ficticia de cliente y centro desde la guía SAT: formularios de cuatro pasos, revisión previa, guardado y avance de misión. La guía condujo después a «Recibe una solicitud» en Partes y ofreció entrar como SAT al cambiar el perfil.
- Se completó en la Demo pública el recorrido de compras: material, proveedor, pedido con línea, confirmación, recepción, stock de cinco unidades, factura de proveedor de 181,50 € y pago ficticio desde Caja de simulación. La factura conservó su vínculo con PED-2026-000001 y REC-2026-000001; la misión siguiente abrió Rentabilidad.
- Se recorrió la misión opcional de contrato desde SAT. El asistente pasó por cliente/centro, equipos, plan y revisión; calculó cuatro visitas trimestrales (19/11/2026, 19/02/2027, 19/05/2027 y 19/08/2027) y guardó MNT-000001 como borrador. No se activó ni se generaron partes.
- El perfil Técnico de esta sesión no tenía partes pendientes después de las pruebas anteriores. Se observó el estado vacío y no se inventó ningún consumo. Para probar esta rama de compras hace falta repetirla en una sesión Demo con una asignación pendiente.
- La suite general volvió a dejar una prueba de PGlite por encima de 5 s bajo carga; repetida en solitario pasó en 1,84 s. Se elevó a 15 s el límite solo para esa prueba de integración.
- Tras ampliar el timeout de esa prueba de integración, la suite completa pasó: 376 archivos y 2.095 pruebas. `npm run build` terminó correctamente; Vite mantiene el aviso informativo de un chunk mayor de 500 kB.
- Las pruebas de `src/demo`: 119/119 en 19 archivos. Suite general: 2.094/2.095; el único fallo fue que `src/db/deficiencyDeletion190.test.ts` excedió 5 s bajo carga. Repetida aisladamente: 2/2 en 1,74 s.

Queda pendiente repetir de principio a fin las 20 misiones de Mi recorrido completo y probar descarga/impresión desde el navegador. La rama de compras para Técnico también requiere una sesión Demo con trabajo asignado. Por tanto, la revisión cubre los recorridos principales y no todas las combinaciones posibles.

## Revisión de recorridos completa · 19 de noviembre

- Se completaron las 20 misiones públicas de «Mi recorrido completo» con cliente, centro, parte, trabajo, horas, firma ficticia, entrega a SAT, revisión económica, envío a Facturación, factura, cobro y estudio de costes. La guía terminó en 20/20.
- El recorrido partió sin equipo identificado y se verificó que «Continuar sin checks» permite registrar trabajo, horas, firma y finalizar el parte. La pantalla confirmó que se entregó a SAT y que ya no admite cambios del técnico.
- En la guía se detectó texto contradictorio después de la revisión SAT: Oficina volvía a recibir instrucciones de aprobarla. Se corrigió el paso para que Oficina compruebe los importes aprobados antes de preparar la factura.
- La asignación inicial proponía nombres que no corresponden a la identidad del perfil Técnico de esta Demo. Se cambió por Visitante Demo y se comprobó que la visita aparece en Mi jornada.
- En Cobros, la acción «Abrir esta pantalla» desplegaba el calendario. Se actualizó el texto y la etiqueta de acción para indicar «Ver calendario de cobros»; al abrirlo la guía deja preparada la misión siguiente sin cambiar de pantalla.
- Se abrió Comercial, su panel, Oportunidades y Presupuestos. Oportunidades y Presupuestos mostraron estados vacíos; el formulario «Crear presupuesto» cargó clientes y no se envió ni guardó un presupuesto en esta inspección. La lista accesible del navegador marcó las opciones como deshabilitadas, pero el código del selector no aplica ese atributo; se deja pendiente verificar la selección con interacción directa en un navegador que exponga el menú nativo.
- Factura y cobro del recorrido fueron operaciones de datos ficticios en la Demo, sin transacciones bancarias reales.
- Se añadieron tres pruebas de copy/modelo de la guía. Las pruebas `src/demo/guideCopy.test.ts` y `src/demo/DemoGuide.test.tsx` pasaron (53/53); `npm run build` terminó correctamente. Vite mantiene el aviso informativo del chunk principal superior a 500 kB.

## Cobertura pendiente

No se declara exhaustiva la revisión de todas las combinaciones de pantallas/permisos. Sigue pendiente validar la descarga e impresión del PDF de factura en un navegador que exponga el diálogo del sistema.

## Continuación de la revisión · 19 de noviembre

- Se comprobó en Comercial que el selector de cliente de «Crear presupuesto» se habilita al terminar de cargar. La lectura de accesibilidad lo marcaba como deshabilitado, pero la selección directa de «Cliente de auditoría DMP - solo pruebas» funcionó y el formulario actualizó el valor. Se cerró sin guardar el presupuesto.
- Se creó el parte ficticio PAR-2026-000002, asignado a Visitante Demo, para verificar el consumo de material con stock. Técnico encontró la fotocélula de prueba, el almacén mostró 5 unidades y se registró 1 unidad para el parte. El técnico guardó trabajo, firmó con nombre y trazo ficticios (el botón quedó deshabilitado tras guardar una vez) y entregó el parte a SAT.
- SAT recibió el parte y el consumo pendiente. Al validar el consumo, la lista pasó a 0 pendientes y el panel mostró el parte en revisión SAT. No se emitió otra factura.
- La impresión de la factura se intentó desde «Imprimir factura», pero el navegador integrado bloqueó la interacción durante esa acción y no permitió confirmar el diálogo de impresión; por eso no se da por verificada. Los PDF se generaron, renderizaron e inspeccionaron localmente en la revisión anterior.
- La versión pública de Demo sirve `build-info.json` con commit `30c023313411c7ed38b20c8f48eaec0b492489f4`, compilado el 19/11/2026 a las 20:18:10 UTC. Esto confirma que el commit de las correcciones de guía ya está desplegado.
- Las comprobaciones y operaciones de esta sesión se limitaron a datos de demostración ficticios. No se modificó Pro ni la configuración del ordenador.
