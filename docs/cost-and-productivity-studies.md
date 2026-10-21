# Estudios de costes y productividad

## Activación

Aplicar `supabase/migrations/175_cost_and_productivity_studies.sql` y después `supabase/migrations/176_cost_study_work_coverage.sql`; si la 175 ya está aplicada, ejecutar solo la 176. Ejecutar sus verificaciones: `supabase/verification/verify_175_cost_studies.sql` y `supabase/verification/verify_176_cost_study_work_coverage.sql`. Desplegar después el frontend. La 176 no se ha aplicado al Supabase remoto como parte de la implementación local.

La sección **Estudios de costes y productividad** está en Gerencia / Control económico (`/app/gerencia` y `/app/modulos/informes`). Se muestra exclusivamente a perfiles activos con rol Gerencia o Superadmin. El servidor exige los mismos roles y obtiene la empresa del perfil autenticado; no admite una empresa suministrada por el navegador. Los estudios incluyen costes laborales sensibles: SAT, Oficina, Comercial y Técnico no tienen acceso a ellos.

La pantalla abre ahora un panel de **Costes y productividad** con dos ámbitos: **Empresa** y **Equipo**. Empresa muestra coste global, facturación, saldo, actividad diaria y un desglose de costes seleccionable; en materiales y recursos permite abrir los partes con mayor coste. Equipo permite buscar, ordenar y filtrar empleados con datos pendientes, seleccionar una persona y consultar sus partes. Los datos manuales están en el desplegable **Completar costes, jornada y objetivos**. El resumen anterior sigue disponible en **Resumen de partes y clientes**.

La ocupación de empresa suma horas imputadas y presencia exclusivamente de empleados con presencia positiva informada. La eficiencia global divide la suma de estándares entre las horas directas de trabajo terminado de empleados con eficiencia calculable. No promedia porcentajes individuales ni incorpora denominadores desconocidos. Ambos indicadores muestran cuántos empleados cubren. La vista Empresa corresponde a la empresa autenticada, sin combinar datos de instalaciones distintas.

**Gasto de personal** tiene un acceso visible encima de las vistas Empresa/Equipo y otro en el detalle del concepto Personal. Abre los campos de coste completo del periodo por empleado. No es el catálogo de técnicos: «Personal» como gasto es una categoría económica.

Las duraciones principales se presentan en horas y minutos. El desplegable **Cómo se suman las horas** permite consultar cada imputación por fecha, empleado y parte, con filtro de persona y páginas de 25 registros. Se suman horas de persona: dos técnicos trabajando dos horas equivalen a cuatro horas de personal. Los campos manuales y CSV siguen usando horas decimales, identificadas en los campos; 1,5 horas equivale a 1 h 30 min. Las horas de garantía son un subconjunto del total, no un sumando adicional.

En navegación se ha retirado la entrada duplicada Personal; Técnicos conserva el listado técnico. La antigua ruta `/app/modulos/personal` redirige a Técnicos. Informes duplicaba Resumen en el menú de Gerencia: se conserva Resumen y la ruta antigua de Informes sigue funcionando.

## Cobertura de partes desde la migración 176

La consulta original de la 175 incluía metadatos de partes únicamente si tenían horas en el periodo. La 176 incluye también partes con consumo de material, recursos, factura emitida, fecha de finalización o programación en el intervalo. Los importes y las horas mantienen las mismas fuentes; incluir un parte sin horas no inventa horas ni costes.

La sección **Partes de la empresa en el periodo** permite filtrar todos los incluidos, con horas, facturados y terminados; muestra contadores, búsqueda y páginas de 20 registros. Los grupos se solapan y no deben sumarse. Una factura con varias líneas del mismo parte lo cuenta una sola vez mediante EXISTS, y no multiplica ni las horas ni el total de facturas.

«Con horas» se refiere a `work_date`. «Facturados» exige una relación activa en `invoice_work_orders` con una factura emitida en el intervalo, no borrador ni cancelada; no se deduce del estado económico global del parte. «Terminados» exige estado terminado al tomar la captura y `finished_at` en el intervalo, convertido a fecha Europe/Madrid. No permite atribuir a un periodo partes históricos sin fecha de finalización. «Todos los incluidos» puede incluir también partes programados aún sin actividad. El acceso Año actual amplía el estudio desde enero hasta hoy; se mantiene el máximo de 366 días.

Las capturas anteriores no se modifican. Si no tienen `work_scope_version: 2`, el frontend identifica su cobertura limitada y muestra «Sin desglose» para los grupos que no puede reconstruir, en lugar de presentar ceros falsos. Para usar la cobertura ampliada, aplicar la 176 y actualizar datos en un estudio nuevo.

## Preparar un estudio

1. Elegir un intervalo de hasta 366 días y cargar datos. Cambiar las fechas reinicia las hipótesis introducidas.
2. Introducir el coste laboral **completo** del periodo para cada empleado: salario, cotizaciones empresariales y otros costes laborales. Añadir también personal de oficina y personas sin partes.
3. Introducir horas retribuidas y de presencia efectiva del mismo periodo. Estos datos son manuales: DMP aún no es un registro de presencia completo. Vacío significa desconocido; cero es una confirmación explícita.
4. Para eficiencia, documentar las horas estándar equivalentes a las tareas directas completadas y registradas en el intervalo. Si un parte cruza periodos, incluir solo el estándar correspondiente a las tareas del intervalo, y explicar la base. No introducir la duración global de un equipo como si correspondiera íntegramente a cada persona.
5. Añadir gastos generales no incluidos en otros conceptos y, opcionalmente, presupuesto de coste. Documentar pendientes e hipótesis.
6. Guardar la captura o exportar CSV. Guardar obtiene otra vez las fuentes desde el servidor; prevalecen los datos de esa captura, que pueden diferir de la vista previa si hubo cambios concurrentes. Un estudio guardado es inmutable; para recalcular se crea otro.

## Fuentes y cálculos, versión 1

Las fuentes se recogen en una llamada SQL consistente y sin el límite de filas de una consulta de tabla. Se conservan IDs y datos relevantes, no fotos ni documentos. Las tablas de origen siguen siendo la autoridad operativa.

- Horas: `work_order_time_entries.work_date`, con importes históricos `total_cost`.
- Materiales consumidos: `work_order_materials.used_at`, excluyendo entradas eliminadas.
- Recursos: `work_order_cost_entries.incurred_at`, excluyendo entradas eliminadas.
- Facturas: `invoices.issue_date`, usando `subtotal` sin IVA y excluyendo borradores y canceladas. No representa cobros ni reconocimiento contable de ingresos.
- Los costes históricos de partes archivados se conservan en el estudio si sus entradas siguen existiendo. Los datos purgados no se pueden reconstruir.
- Personal: coste completo declarado por empleado. Si falta, se utiliza el coste imputado de sus horas y se marca la ausencia. **No se suman ambos costes**.
- Coste estudiado: personal + materiales consumidos + recursos + gastos generales adicionales.
- Desviación: coste estudiado menos presupuesto, cuando se define. Positivo significa sobrecoste.
- Saldo: facturado sin IVA menos costes estudiados. **No es beneficio contable**, margen de todos los trabajos ni tesorería. Las fechas de facturación pueden diferir de las de ejecución.
- Ocupación: horas imputadas, incluidos desplazamientos, divididas por presencia efectiva. Vacío o denominador cero produce «Sin dato». Si las imputaciones superan la presencia o esta supera las horas retribuidas, se pide revisión; no se recorta artificialmente al 100 %.
- Horas directas: todas las horas imputadas excepto `desplazamiento`.
- Eficiencia: horas estándar declaradas / horas directas del intervalo de partes con estado `Finalizado tecnicamente`, `Enviado` o `Cerrado` **en la captura**. El estándar es una hipótesis manual documentada, no una calificación automática ni un estándar homologado.
- Coste por hora retribuida/directa: coste completo dividido entre esas horas. Sin coste completo o con denominador cero, «Sin dato».
- Garantía: horas de partes marcados en garantía en la captura. No implica responsabilidad del empleado, repetición de avería ni calidad de la ejecución.

Los costes vacíos y a cero quedan señalados. El sistema no puede detectar nóminas, empleados, gastos ni horas que nunca se hayan registrado. La empresa debe comprobar la cobertura antes de sacar conclusiones. Las compras de almacén no se añaden al consumo: hacerlo duplicaría costes.

## Seguridad y recuperación

La tabla `cost_productivity_studies` solo permite SELECT mediante RLS para Gerencia/Superadmin de su propia empresa. No hay escritura directa desde el navegador. La RPC valida importes, intervalo, duplicados, pertenencia de empleados y base de los estándares; obtiene fuentes e identidad por su cuenta. No acepta un snapshot de fuentes del cliente.

Cada guardado utiliza un UUID de operación. Un reintento idéntico devuelve la captura original y no genera duplicados ni actualiza sus fuentes. Reutilizar ese UUID con otros datos se rechaza. Se conserva `created_by`, fecha y versión de cálculo. Los cambios de versión futuros deben mantener el cálculo de las capturas de versión 1.

El historial muestra los 100 estudios más recientes y sus rangos. El CSV identifica si es vista previa o guardado, la fecha de captura, los criterios y los conceptos generales introducidos. No se envía a terceros desde DMP.

## Verificación antes de uso real

Además de pruebas de fórmulas y análisis sintáctico SQL/PLpgSQL, ejecutar en un entorno de pruebas:

1. Con Gerencia de empresa A, cargar un periodo con datos conocidos, más de 1000 registros y costes de un parte archivado; contrastar las sumas con SQL.
2. Guardar, cambiar datos operativos y abrir de nuevo: la captura original debe mantenerse.
3. Reintentar el mismo UUID con el mismo payload y después con otro payload: debe devolver el original en el primer caso y rechazar el segundo.
4. Con empresa B, intentar leer el ID de A e introducir un empleado de A: no debe devolver la captura ni permitir el guardado.
5. Con SAT, Oficina, Comercial, Técnico, usuario inactivo y anónimo, intentar SELECT y ambas RPC: no debe haber acceso a los estudios ni a sus fuentes.
6. Intentar INSERT/UPDATE/DELETE directos con usuario autenticado: deben rechazarse.
7. Revisar en escritorio y móvil carga, cambios de periodo, guardado, reapertura y exportación de los estudios.

La verificación estructural no sustituye estas pruebas con sesiones autenticadas. Falta ejecutar esta lista contra Supabase real antes de publicar la funcionalidad.
