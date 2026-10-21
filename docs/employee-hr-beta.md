# Ficha laboral y nóminas BETA

## Activación

Después de las migraciones 175 y 176, ejecutar `supabase/migrations/177_employee_hr_beta.sql` y `supabase/verification/verify_177_employee_hr_beta.sql`. La 177 no se ha aplicado al Supabase remoto en esta implementación. No volver a ejecutar la 176 después de la 177: esta última incorpora un envoltorio de las fuentes operativas para conservar también la información de nóminas en los estudios.

En Gerencia o Superadmin, entrar en **Técnicos** o **Comerciales** y abrir una persona. La sección **Costes, nóminas y contratos** aparece exclusivamente para esos dos roles. No está disponible para SAT, Oficina, Comercial o Técnico.

## Condiciones laborales

Referencia editable de convenio, provincia, contrato, salario bruto mensual, cotización empresarial estimada, otros costes, precio bruto de hora extra, jornada semanal, horario habitual y vacaciones anuales en días laborables o naturales. El horario es descriptivo; todavía no es un calendario de turnos ni un sistema de fichaje. Las cantidades se configuran, no se deducen automáticamente del convenio.

Comercio del Metal aparece como referencia inicial para la prueba solicitada. Debe concretarse el ámbito territorial y convenio antes de implementar cálculos oficiales. Los valores económicos iniciales son cero y deben cumplimentarse, no representan mínimos legales.

Se conserva el historial de versiones por fecha de vigencia. «Corregir condiciones» modifica una versión existente con auditoría; «Nueva versión de condiciones» permite introducir otra fecha de inicio. Solo puede haber una versión por empleado y fecha. No se recalculan retroactivamente tarifas de partes ni estudios ya guardados.

## Nóminas: dos vías

1. **Simulación BETA:** salario base + complementos + horas extra × precio bruto = bruto; neto = bruto menos deducciones introducidas; coste empresarial = bruto + cotizaciones empresariales + otros costes. Las cuotas y deducciones se introducen manualmente. Se genera un PDF marcado «PRUEBA INTERNA — SIN VALIDEZ COMO NÓMINA OFICIAL» y se guarda con el registro mensual.
2. **Nómina real:** registrar los importes del recibo ya calculado y adjuntar el PDF original. El archivo es obligatorio. No se emite un documento de prueba como si fuera oficial.

Cada empleado admite un registro de cada tipo por mes completo: la simulación de octubre y la nómina real de octubre son registros distintos. Los registros de nómina son inmutables y la unicidad mensual impide duplicar costes al reintentar. Los importes se vuelven a calcular en servidor; un resultado económico suministrado por el navegador no es la autoridad. La operación conserva UUID en reintentos de la misma carga.

No se calculan todavía IRPF, bases, topes, tipos legales, pagas extras, antigüedad, bajas, bonificaciones o liquidaciones. Las horas extra se introducen expresamente; no se infieren de las horas normales de los partes. Las condiciones actuales precargan referencias para generar una prueba y deben revisarse para el mes elegido. Las horas de presencia son datos registrados manualmente, no se inventan a partir del horario.

El motor oficial solicitado es una ampliación pendiente, separada del simulador autorizado para la beta. Deberá resolver convenio y provincia concretos, categorías, contratos, jornada, conceptos salariales, situación del trabajador, reglas de IRPF y Seguridad Social versionadas por fecha, incidencias y validación de cálculos. Referencias primarias consultadas: [modelo de recibo salarial del BOE](https://www.boe.es/buscar/doc.php?id=BOE-A-2014-11637), [algoritmos de retenciones de la AEAT](https://www3.agenciatributaria.gob.es/Sede/Retenciones.shtml) y [cotización del Régimen General](https://www.seg-social.es/wps/portal/wss/internet/Trabajadores/CotizacionRecaudacionTrabajadores/10721/10957/9932/4315/4316?changeLanguage=es). No se han incorporado tipos fiscales de esas fuentes al simulador.

## Contratos y vacaciones

Los contratos admiten título, fechas, notas y PDF original. Se conservan en el mismo expediente privado del empleado, sin aparecer en Documentos generales.

Las vacaciones permiten fechas, días explícitos, unidad y estados planificadas/aprobadas/canceladas. Se pueden aprobar o cancelar desde el historial, con auditoría. No se permite solapar dos periodos aprobados de una persona. Un periodo no puede cruzar de año: registrar cada año por separado. Se muestran días aprobados en la misma unidad de la referencia anual; no se mezclan días laborables y naturales. No se calcula devengo proporcional ni festivos ni se bloquea la agenda operativa automáticamente.

## Estudios de empresa

Al **Analizar / actualizar datos**, se incorporan automáticamente las nóminas disponibles. El modo predeterminado de la beta admite reales y simuladas, dando prioridad a la real cuando ambas existen para el mismo empleado y mes. El mensaje de resumen indica el número de registros, empleados, importe de nóminas y cuántos son reales o simulados. En **Gasto de personal, jornada y objetivos → Costes desde las fichas de empleados** se puede limitar a reales o simuladas. Cambiar esa selección recalcula inmediatamente los costes automáticos; no sustituye un coste que el usuario haya introducido manualmente. Los campos de horas modificados manualmente también se conservan al actualizar.

Los selectores rápidos y el periodo inicial abarcan meses completos (incluido el mes actual hasta su último día), de modo que sus nóminas mensuales pueden entrar. Un intervalo personalizado que termine el 21 no incorpora una nómina que termina el 31: no se prorratea ni se atribuye el mes entero a un periodo parcial. El mensaje explica esa ausencia.

Si solo hay nóminas para algunos meses del intervalo, se incorporan esos importes y se conservan las horas valoradas de los meses **sin nómina**, con cobertura parcial visible. Las horas correspondientes a meses con nómina no se suman otra vez. Las ratios basadas en horas de nómina solo se precargan si hay cobertura continua de todo el intervalo; no se inventan horas para meses sin datos. Los empleados con nómina pero sin horas en partes también entran en el coste de empresa.

Se usa el coste empresarial, nunca el neto pagado. Las simulaciones y nóminas reales del mismo empleado y mes no se suman entre sí. Los registros automáticos llevan origen y cobertura en los inputs del estudio. Las capturas guardadas siguen congeladas: para recoger nóminas posteriores, crear un estudio nuevo.

## Privacidad y comprobaciones

Los datos están en `employee_hr_records`, con RLS y sin escritura directa autenticada. Las RPC obtienen la empresa del actor y comprueban la pertenencia del empleado. Gerencia y Superadmin pueden leer expedientes de su propia empresa. El bucket `dmp-hr` es privado, admite solo PDF de hasta 10 MB y utiliza rutas empresa/empleado/operación. Hay guardas restrictivas además de las políticas de acceso para que otras políticas permisivas del proyecto no expongan el bucket. Los archivos registrados no se sobrescriben ni se borran desde la aplicación. Los enlaces de lectura firmados caducan al minuto.

Probar con sesiones reales antes de publicar: Gerencia y Superadmin de la empresa A, los demás roles de A, Gerencia de B y anónimo; intentar lectura de fichas, tabla directa, PDF y fuentes del estudio, así como introducir empleados o rutas de B. Verificar dos registros del mismo mes, reintento después de fallo de conexión, PDF inválido, vacaciones solapadas y preservación de estudios anteriores. La verificación estructural y el parser SQL no sustituyen estas pruebas contra Supabase.
