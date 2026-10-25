# DMP · Demo pública: estado y continuación

## Estado actual · recorridos completos

El usuario ya instaló el esquema en 13 bloques, 002 y 004 en el proyecto
Supabase xlhzyhotzfflemjnqvqn. Configuró Auth anónimo, Turnstile, la función de
limpieza, su secreto y el cron. La demo llegó a abrir un parte técnico real.
La instalación actual mantiene su conexión y sus datos independientes.

El cambio entre perfiles y los escenarios económicos de 005 ya están disponibles
en el backend de demo (journeys=2 comprobado por HTTP). La ampliación actual añade
el recorrido independiente Materiales y compras. El usuario confirmó la ejecución
de `supabase/demo/006_demo_procurement_guide.sql`. No reinstalar los bloques de esquema.

La portada presenta los perfiles y explica que la demo es una muestra parcial.
La guía añade una marca pulsante sobre acciones identificadas, sin bloquear clics;
se retira al abrir formularios y respeta movimiento reducido. Revisada visualmente
en escritorio y móvil, con prueba local de apertura de formulario.
Presupuestos usa la visibilidad SAT/Oficina de su propio departamento, evitando que
el valor por defecto `commercial=false` lo oculte a esos perfiles. No requiere SQL.

Historial de equipos de muestra: ejecutar `supabase/demo/007_demo_equipment_history.sql`
solo en el proyecto de demo, después de 006. Añade dos visitas anteriores a cada
equipo `EQ-DEMO-*` (seis antecedentes en el escenario técnico), claramente ficticias,
no facturables y sin horas ni materiales económicos. Conserva las respuestas del
parte actual. Incluye sesiones vivas existentes y las nuevas; reinstalar no duplica.
Después, en una sesión ya descargada, actualizar/preparar de nuevo la jornada para
renovar el historial local. No borrar datos locales pendientes.
Pruebas de historial y recorridos: 10 correctas; incluyen lectura con RLS de técnico,
aislamiento entre visitantes, idempotencia, conservación del parte actual y purga.

Validación actual: 326 archivos / 1.852 pruebas correctas. Incluye el pedido con
líneas, recepción confirmada, stock real, aislamiento y limpieza, además del ciclo
SAT–Técnico–SAT y la facturación. La compilación del frontend se verifica antes
de subir los cambios.
La aceptación remota en móvil, con fotos y firma en Storage, sigue pendiente.

## Referencia de instalación inicial (esquema, 002 y servicios ya configurados)



1. En el proyecto Supabase NUEVO, abrir SQL Editor. Generar el instalador con
   `npm run demo:prepare-schema` y ejecutar el archivo indicado:
   `node_modules/.cache/dmp-demo/001-empty-schema.sql`.
   El instalador exige una base sin empresas ni usuarios de Auth. No ejecutarlo
   en el proyecto de la instalación actual.
2. Ejecutar `supabase/demo/002_public_demo.sql` en ese mismo proyecto nuevo.
3. Desplegar `supabase/functions/public-demo-cleanup/index.ts` junto con
   `supabase/functions/_shared/demoCleanup.ts`. Con Supabase CLI autenticada:
   `supabase functions deploy public-demo-cleanup --project-ref xlhzyhotzfflemjnqvqn --no-verify-jwt`.
   La función valida el JWT del visitante o el secreto del programador por sí misma.
4. Ejecutar el PASO 1 de `supabase/demo/003_schedule_cleanup.sql` y guardar el
   secreto generado en Edge Function Secrets como `DMP_DEMO_CLEANUP_SECRET`.
   Después ejecutar el PASO 2 del archivo para programar la limpieza cada cinco
   minutos. No compartir ese secreto ni ponerlo en variables VITE.
5. Activar acceso anónimo en Supabase Auth. Configurar Turnstile/CAPTCHA en Auth
   con su clave secreta. Crear su clave pública para el dominio de la demo y
   añadir `VITE_DEMO_TURNSTILE_SITE_KEY` a las variables de compilación del Worker.
6. Realizar una activación controlada y probar dos visitantes con navegadores o
   perfiles independientes: aislamiento de lecturas/escrituras, técnico con tres
   checks, fotos, horas, materiales y firma. Finalizar una sesión y verificar
   borrado de registros, archivos e identidad sin afectar a la otra. Comprobar
   también expiración, limpieza programada y reintento tras un fallo. Desactivar
   de nuevo si alguna prueba falla. La activación está comentada en el PASO 3.
7. Solo tras esa aceptación, mantener activada la demo y promocionarla.

Revisar todavía en remoto los grafos de borrado con documentos económicos,
la caducidad y los límites de capacidad, y la limpieza local con varias pestañas.

## Worker de Cloudflare

URL: https://demo-doormanager-pro.enamarquezf.workers.dev/
Repositorio: `enamarquezf-source/DoorManager-Pro`, rama `main`.

| Campo | Valor |
|---|---|
| Build command | `npm run build` |
| Deploy command | `npx wrangler deploy --config wrangler.demo.jsonc` |
| Root directory | `/` |
| VITE_SUPABASE_URL | `https://xlhzyhotzfflemjnqvqn.supabase.co` |
| VITE_SUPABASE_PUBLISHABLE_KEY | Clave pública del proyecto nuevo |
| VITE_DEMO_TURNSTILE_SITE_KEY | Clave pública de Turnstile pendiente |

Las dos variables Supabase se han visto guardadas y presentes en el frontend
remoto anterior. Cada cambio de variables necesita una nueva compilación.
No usar contraseñas de base de datos ni claves de servicio en VITE.
Si aparece una versión anterior por la PWA, usar `/actualizar.html` en la demo.

## Experiencia preparada

Gerencia, Oficina, SAT y Comercial empiezan sin datos de negocio. Técnico recibe
un cliente y centro ficticios, un parte propio y revisiones sin rellenar de
puerta seccional, corredera y barrera. No hay acceso público como superadmin.

Cada sesión tiene 30 minutos de inactividad y un máximo de dos horas.
Finalizar revoca el acceso y solicita limpieza remota y local. Cerrar una pestaña
no garantiza una llamada al servidor: las sesiones abandonadas dependen del cron.
Los fallos de limpieza se conservan para reintento. La demo identifica las
operaciones como simulaciones.

## Referencias

- https://supabase.com/docs/guides/auth/auth-anonymous
- https://supabase.com/docs/guides/auth/auth-captcha
- https://developers.cloudflare.com/turnstile/get-started/client-side-rendering/
- https://developers.cloudflare.com/workers/ci-cd/builds/configuration/

## Continuación nocturna · 23 de octubre de 2026

Comprobaciones HTTP realizadas sobre el proyecto nuevo y el Worker:

- Worker: HTTP 200; el JavaScript publicado ya contiene la portada «Probar DMP»
  y la conexión al proyecto de demo.
- `/rest/v1/companies`: HTTP 404, PGRST205; el esquema sigue sin instalar.
- `/auth/v1/settings`: HTTP 200; `anonymous_users` sigue desactivado.
- `/functions/v1/public-demo-cleanup`: HTTP 404; función todavía no desplegada.
- No se ha acreditado una clave Turnstile configurada en la compilación remota.

Bloqueo de acceso: no hay conectores Supabase/Cloudflare, sesión de navegador
administrativo accesible, token administrativo Supabase, contraseña de base de
 datos ni CLI autenticada disponibles. La clave pública facilitada sirve para
el cliente, pero no para instalar tablas, cambiar Auth o desplegar funciones.
No se ha modificado la instalación actual ni se ha activado la demo incompleta.

Trabajo independiente completado: añadidas pruebas de límite absoluto de sesión,
heartbeat que no revive una sesión caducada, selección de sesiones expiradas para
limpieza y capacidad que cuenta también sesiones pendientes de borrar. Resultado:
los cuatro archivos de pruebas de demo pasan, 17 pruebas. La validación completa
anterior sigue siendo 320 archivos / 1.823 pruebas; no se ha repetido toda la suite
por estos dos casos nuevos, que no modifican código de ejecución.

Siguiente acción necesaria: abrir el panel del proyecto nuevo con acceso de
administración y seguir los pasos 1 a 5 de este documento. No enviar contraseñas o
claves secretas al chat. Después realizar la aceptación remota del paso 6.
La continuación automática era puntual y se elimina al cerrar esta ejecución.

## Si SQL Editor indica «Query is too large»

El archivo único puede superar el límite del editor. `npm run demo:prepare-schema`
también genera `node_modules/.cache/dmp-demo/sql-editor/01-schema.sql` hasta
`13-schema.sql` (la cantidad puede cambiar con futuras migraciones).
Ejecutar cada archivo completo en una consulta independiente, en orden numérico,
esperando Success antes de continuar. Los bloques llevan transacción y control
de orden: un bloque fallido se revierte; no repetir bloques ya correctos.
No crear usuarios durante la instalación. Se ha verificado localmente la ejecución
consecutiva de los 13 bloques generados, todos inferiores a 180 KB, hasta step=13.
Después del último bloque continuar con `supabase/demo/002_public_demo.sql`.
El rechazo por tamaño ocurre antes de ejecutar el archivo único.

## Reparación del recorrido técnico

Después de 002, ejecutar `supabase/demo/004_technician_demo_repairs.sql` en el
proyecto de demo. Repara el permiso de lectura de equipos vinculados a checks
asignados y crea una tarifa ficticia de 22 EUR/h de coste y 45 EUR/h de venta para
las sesiones técnicas existentes y futuras. No borra partes ni respuestas.
El frontend añade referencias visuales de seccional y corredera y muestra la
referencia desplegada inicialmente en la demo. Las imágenes son referencias del
tipo de equipo, no fotos reales de una instalación del visitante.
Para una sesión ya descargada, volver a preparar/actualizar la jornada tras la
actualización del frontend, de modo que se reemplace la copia local incompleta.
Después, reintentar el registro fallido de horas sin crear otro duplicado.

## Alta de clientes por perfil y orden de los checks

Aplicar `supabase/migrations/185_client_creation_operational_roles.sql` al proyecto
de demo para permitir el alta y edición de clientes a Gerencia, Oficina, SAT y
Comercial. Mantiene el ámbito de empresa y no concede estos permisos al técnico.
La prueba de integración genera código, crea y edita un cliente con cada uno de
los cuatro perfiles bajo RLS y comprueba que no pueden insertar en otra empresa.
El frontend muestra primero el componente y debajo la comprobación en la lista
de ítems y la selección de afectados; el resumen también identifica componentes.
No se intercambian ni reescriben los datos guardados de las plantillas.

## Recorridos completos de demo (versión journeys=2)

Instalar `supabase/demo/005_demo_role_journeys.sql` únicamente en el Supabase de
la demo, después de 002 y 004. El archivo es transaccional y puede repetirse.
No necesita reinstalar el esquema, no borra sesiones y no activa la demo por sí solo.
El frontend detecta `journeys: 2` en `dmp_demo_status`; sin ese SQL conserva la
entrada antigua y no muestra un cambio de rol que el backend no soporte.

- SAT comienza sin clientes ni trabajos, con tres tipos de equipo y plantillas,
  un técnico asignable y una caja ficticia para probar cobros posteriormente.
- Cambiar perfil conserva empresa, cliente y parte. Cada rol tiene su propio
  perfil de empleado y permisos; solo uno está enlazado al Auth del visitante.
  El cambio de Técnico se bloquea si quedan cambios locales pendientes de envío.
- Oficina dispone de un trabajo revisado y facturable: 2 horas a 45 EUR/h y un kit
  a 55 EUR, subtotal 145 EUR. El coste base es 44 EUR de horas y 30 EUR de material.
  Generar borrador, emitir y cobrar usa los RPC reales, sin cargos bancarios.
- Gerencia dispone de 12 trabajos en las últimas 12 semanas, 3 clientes,
  3 empleados, 12 registros de horas/materiales, costes externos en reparaciones
  con pérdida, 3 facturas (cobrada, vencida y futura) y 9 nóminas simuladas.
  Los importes proceden de las tablas y vistas económicas, no de gráficos fijos.
  Las nóminas usan importes explícitamente ficticios (coste empresa 2600 EUR/mes);
  no son un cálculo de convenio ni documentos oficiales. Para estudios completos,
  seleccionar Últimos 3 meses y revisar/introducir horas disponibles y referencias
  de rendimiento. Las horas por sí solas no acreditan productividad.
- Los escenarios se añaden una sola vez al entrar por primera vez en cada rol.
  Oficina y Gerencia no borran trabajos creados por SAT durante la misma prueba.
- La guía reconoce acciones guardadas mediante `dmp_demo_progress`, mantiene el
  avance por perfil y permite omitir. No guarda, firma, revisa ni factura por el
  usuario. En móvil arranca compacta y permite desplegar la ayuda.

Verificación local añadida: SAT crea/assigna y cambia a Técnico conservando el
parte bajo RLS; Oficina prepara/emite factura y registra cobro; Gerencia calcula
márgenes positivos/negativos con varios empleados; los reingresos no duplican
escenarios; se borra el grafo completo sin afectar al otro visitante; la caducidad
impide cambiar roles. Las tareas técnicas solo cuentan acciones de su propio
parte, no las del historial económico de Gerencia.

Aceptación remota pendiente tras instalar 005 y actualizar frontend: completar el
cierre técnico con foto/firma y sincronización, revisar como SAT y continuar en
Oficina; probar la guía a anchuras de móvil y confirmar limpieza con Storage real.

## Corrección de alta en listas vacías

El contenedor ListPage ocultaba todos sus hijos cuando el listado estaba vacío,
incluido el diálogo de creación. Por eso SAT podía tener permisos correctos en
SQL y seguir sin abrir Crear cliente. StateBlock ahora permite conservar los hijos
en los listados durante el estado vacío, carga y error; las fichas de detalle
mantienen el comportamiento de esperar a sus datos.
Pruebas de interfaz: abrir el formulario desde cero, guardar el primer registro,
y conservar el borrador al refrescar o fallar la carga. La corrección es del
frontend: actualizar la app tras el despliegue, sin otra instalación SQL.

## Actualización verificable y portada compacta

El servidor ya publicaba la corrección de listas vacías. Una prueba adicional
monta ClientsPage y su formulario real (incluido el portal y el asistente) bajo
SAT y Comercial y confirma que Crear cliente abre y cierra correctamente.
No se ha observado todavía el código activo dentro del navegador del usuario.

Se localizaron dos defectos independientes en las actualizaciones del Worker:
versiones etiquetadas siempre 0.1.0-local y build-info.json servido desde la caché
del shell. La versión ahora incluye un identificador por compilación cuando no
hay SHA; el comprobador compara también builtAt y el worker no intercepta el
manifiesto ni los archivos del actualizador. La página actualizar.html verifica
mediante MessageChannel que el worker activo coincide con el publicado; si sigue
el antiguo o no responde, informa del error en vez de volver silenciosamente a
la app anterior. Se conservan Auth, IndexedDB y los cambios pendientes.

La portada reduce cabecera, título, separaciones y tarjetas para mostrar texto y
selección de rol al principio. Los portales de formularios de la demo se sitúan
por encima de la guía y del selector de perfil.

Tras el despliegue, abrir actualizar.html?volver=%2Fapp%2Fclientes en LA MISMA
pestaña/navegador donde se reproduce el problema y pulsar Actualizar DMP. La
verificación de activación es obligatoria antes del retorno. Si continúa el
fallo con la versión verificada, recoger la captura o el error de esa pantalla;
no atribuirlo a permisos ni afirmar que se ha reproducido en el navegador real.

## Guía de materiales y compras

Instalar `supabase/demo/006_demo_procurement_guide.sql` después de 005 únicamente
en la demo. Añade un almacén vacío (sin inventar existencias) para sesiones nuevas
y existentes y amplía las métricas de tareas. Es repetible y conserva los datos.

La guía permite elegir Trabajo y facturación o Materiales y compras, con avance
independiente por recorrido y perfil. SAT crea el material y deriva la compra a
Oficina. Oficina/Gerencia recorren material, proveedor, pedido con líneas,
confirmación del pedido, recepción confirmada, stock y factura de proveedor.
Después se puede probar el consumo como Técnico y validarlo en SAT.
No se cambian permisos: Comercial se deriva a Oficina para gestionar compras.

Los materiales ficticios sembrados para informes no completan el alta solicitada.
Un pedido vacío y una recepción en borrador tampoco completan sus tareas. La guía
solo avanza automáticamente estando en la pantalla del paso, para no saltar la
comprobación de stock desde la recepción. Puede omitirse cualquier paso y cambiar
entre recorridos sin perder el trabajo. Pedir mercancía no crea stock; confirmar
la recepción sí. Comprar existencias no supone imputarlas dos veces al parte.

Prueba con los RPC reales: material, proveedor, pedido de 5 unidades a 30 EUR,
línea, pedido confirmado, recepción en borrador sin stock, confirmación y saldo 5.
También se prueba aislamiento, borrado del grafo de compras y reinstalación de 006.
