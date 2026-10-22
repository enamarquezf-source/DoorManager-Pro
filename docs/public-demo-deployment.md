# DMP · Demo pública: estado y continuación

## Estado guardado

Código preparado: portada con cinco roles, tutorial por perfil, sesiones temporales
por visitante, escenario técnico con tres tipos de equipos y limpieza con reintentos.
La demo solo se activa en el frontend conectado a
https://xlhzyhotzfflemjnqvqn.supabase.co. La instalación actual conserva su conexión.

Validación local: `npm run build` correcto; 320 archivos y 1.823 pruebas correctas.
Las pruebas incluyen instalación limpia, aislamiento de empresas y borrado del
escenario técnico sin borrar la otra sesión. No acreditan el funcionamiento remoto
de Auth, CAPTCHA, Edge Functions, Storage o cron.

**No está lista para promoción pública.** No se ha instalado SQL remoto ni
configurado Auth o la función de limpieza. La configuración SQL empieza desactivada.

## Próximos pasos, en orden

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
