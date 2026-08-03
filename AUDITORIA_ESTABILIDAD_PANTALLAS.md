# Auditoria de estabilidad de pantallas

Fecha: 2026-08-03

## Alcance

- Se reviso el origen del pantallazo blanco detectado en el detalle de partes.
- Se estabilizo la cronologia de actividad para que React no renderice objetos como hijos.
- Se anadieron limites de error globales y locales en pantallas complejas.
- Se reviso el flujo de sesion y redireccion existente para confirmar que no redirige antes de inicializar la sesion.
- Se anadieron pruebas unitarias y de renderizado SSR sin dependencias nuevas.

## Correcciones aplicadas

- `src/shared/workOrderPresentation.ts`: nuevo tipo `ActivityEvent`, normalizacion defensiva de eventos y descarte de filas sin fecha real.
- `src/shared/timelineViews.tsx`: componente `ActivityTimeline` para eventos estructurados y `Timeline` legacy seguro ante valores no textuales.
- `src/App.tsx`: el detalle de parte usa `ActivityTimeline` y se anadieron `AppErrorBoundary` global y boundaries locales para fichas de cliente, centro, equipo, parte, check, bloque de check y fichas operativas.
- `src/shared/workOrderPresentation.test.ts`: cobertura de eventos estructurados, nulos e incompletos.
- `src/shared/timelineViews.test.tsx`: renderizado real con `react-dom/server` para actividad estructurada y timeline legacy.

## Sesion y redirecciones

- `ProtectedLayout` sigue esperando `initialized` antes de decidir carga, login o error de perfil.
- `LoginPage` solo redirige cuando `loginAuthState` confirma sesion inicializada y perfil disponible.
- Los errores de perfil se muestran en pantalla propia con cierre de sesion, sin bucles de redireccion.
- No se han introducido llamadas con `service_role`, cambios de RLS ni permisos globales para `authenticated`.

## Verificacion ejecutada

- `npx tsc -b --pretty false`: correcto.
- `npm test`: correcto, 27 archivos y 119 tests.

## Limitaciones

- No hay Playwright declarado en `package.json`; no se anadio dependencia nueva.
- No se ejecuto navegacion E2E contra Supabase real desde este entorno.
- La migracion SQL 021 sigue pendiente de aplicacion manual en Supabase y no se ha ejecutado desde este entorno.
