# DoorManager Pro

DoorManager Pro es una plataforma web profesional para empresas instaladoras y mantenedoras de puertas industriales y automaticas. Centraliza SAT, tecnico en campo, gestion comercial, oficina y gerencia sobre una unica base de datos conectada a Supabase.

## Web publica

https://doormanager-pro.pages.dev/

## Problema que resuelve

Muchas empresas de mantenimiento gestionan clientes, partes, checks, incidencias, avisos, fotos, documentacion y presupuestos en herramientas separadas. DoorManager Pro unifica esa operativa para reducir errores, evitar perdida de informacion y dar trazabilidad real a cada equipo instalado.

## Publico objetivo

- Empresas instaladoras de puertas automaticas, industriales, seccionales, enrollables y muelles de carga.
- Departamentos SAT y tecnicos de campo.
- Equipos comerciales que convierten deficiencias en oportunidades.
- Administracion/oficina para documentacion, compras, facturacion y PRL.
- Gerencia para indicadores operativos y comerciales.

## Funciones disponibles

- Autenticacion real con Supabase Auth.
- Perfiles y roles por usuario.
- Dashboards diferentes para SAT, Comercial, Oficina, Gerencia y Tecnico.
- Clientes, centros, equipos, expedientes, partes, checks, deficiencias, avisos y documentos.
- Mi jornada del tecnico con partes asignados.
- Detalle completo del parte con cliente, centro, equipo, asignaciones, historial, materiales, checks, avisos, documentos y deficiencias.
- Cambio de estado del parte mediante RPC de Supabase.
- Creacion de partes, expedientes, checks, avisos y documentos segun permisos.
- Codigos automaticos generados antes de insertar y reforzados en base de datos para clientes, centros, equipos, expedientes, partes, checks, deficiencias, avisos, materiales, almacenes, oportunidades y presupuestos.
- Checks por tipo de equipo con plantillas compatibles y placeholders profesionales cuando no existe imagen final.
- Check visual de puerta seccional con hotspots sobre imagen limpia de produccion.
- Resumen de estados e incidencias del check sin duplicar navegacion.
- Avisos con filtros, lectura, apertura, cierre y reapertura.
- Rutas protegidas y menus adaptados por espacio de trabajo.
- Modulo SAT de tecnicos con perfiles reales, disponibilidad, carga diaria, partes, checks pendientes y accesos operativos.
- Paginas propias para modulos en preparacion, evitando redirecciones falsas a Partes.

## Modulos principales

- SAT: planificacion, trabajos, tecnicos, clientes, centros, equipos, expedientes, partes, checks, deficiencias, documentacion y avisos.
- Tecnico: Mi jornada, checks y avisos.
- Comercial: clientes, oportunidades, presupuestos, contratos, visitas, expedientes, partes, informes comerciales y avisos.
- Oficina: administracion, facturacion, cobros, compras, proveedores, PRL, vehiculos, documentos y avisos.
- Gerencia: resumen, ventas, operaciones, rentabilidad, calidad, clientes, personal, informes y avisos.

## Roles disponibles

- SAT: gestion operativa, creacion y asignacion de partes, checks y avisos.
- Tecnico: solo trabajo operativo asignado, avance de estados, checks e incidencias.
- Comercial: seguimiento comercial, clientes, oportunidades y avisos.
- Oficina: documentacion, compras, administracion y soporte.
- Gerencia: metricas globales e indicadores de gestion.

## Permisos destacados

- El tecnico entra directamente en `Mi jornada`.
- El tecnico no ve acciones administrativas como `Modificar parte` o `Asignar tecnico`.
- El tecnico no puede reasignar recursos ni editar datos administrativos desde la UI.
- El tecnico solo puede abrir partes asignados a su perfil.
- SAT y Gerencia mantienen permisos administrativos sobre partes.
- Los menus se filtran por workspace y rol.

## Integracion con Supabase

El frontend utiliza Supabase para autenticacion, perfiles, datos de negocio y RPC:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`

No se usa clave de servicio en frontend. Las claves reales se configuran fuera del repositorio, por ejemplo en Cloudflare Pages y `.env.local` local ignorado por Git.

La aplicacion usa RLS, vistas y RPC para mantener permisos por empresa y rol. El frontend no debe sustituir Supabase por datos locales salvo en la cola offline del tecnico.

## Offline y sincronizacion manual

El modo offline esta reservado al trabajo tecnico en campo. Los datos operativos que se capturen sin cobertura deben guardarse primero en almacenamiento persistente del dispositivo y sincronizarse manualmente con el boton `Sincronizar` cuando el tecnico lo decida.

La sincronizacion manual debe mostrar pendientes, progreso, sincronizados y fallidos. Si falla, no debe borrar datos locales y debe permitir reintento sin duplicados.

La cola tecnica usa IndexedDB (`doormanager-pro-tecnico`) y consolida cambios por tipo, parte, check y bloque para que la ultima confirmacion prevalezca antes de sincronizar.

## Despliegue

El proyecto se despliega en Cloudflare Pages conectado a la rama `main` del repositorio:

- Framework: React / Vite.
- Build command: `npm run build`.
- Output directory: `dist`.
- Production branch: `main`.

## Tecnologias

- React.
- TypeScript.
- Vite.
- React Router.
- Supabase JS.
- Supabase Auth, PostgreSQL, RLS, vistas y RPC.
- Cloudflare Pages.

## Instalacion local

```bash
npm install
```

Crear `.env.local` local con valores reales propios:

```text
VITE_SUPABASE_URL=
VITE_SUPABASE_PUBLISHABLE_KEY=
```

Ejecutar en desarrollo:

```bash
npm run dev
```

Compilar:

```bash
npm run build
```

## Estructura basica

```text
src/
  App.tsx
  auth/permissions.ts
  checks/config/sectionalDoorHotspots.ts
  lib/supabase/client.ts
  services/
  shared/
public/checks/seccional-industrial.png
supabase/migrations/
supabase/seed.sql
docs/
```

## Imagen del check

La imagen limpia de produccion esta en:

```text
public/checks/seccional-industrial.png
```

Las referencias anotadas de desarrollo, si se versionan, deben ir en `docs/references/` y no sustituir a la imagen limpia.

## Estado actual del desarrollo

El proyecto esta conectado a Supabase y Cloudflare Pages. La version actual incluye autenticacion real, servicios por dominio, dashboards por rol, permisos centralizados, rutas protegidas, detalle completo de parte, codigos automaticos mediante triggers/RPC y check visual responsive.

## Funciones nuevas recientes

- Permisos centralizados en `src/auth/permissions.ts`.
- Menu filtrado por rol y workspace.
- Tecnico limitado a acciones operativas y partes asignados.
- Rutas propias para modulos en preparacion.
- Check con configuracion de hotspots en `src/checks/config/sectionalDoorHotspots.ts`.
- Lista inferior del check convertida en resumen no navegable.
- Botones primarios y modales ajustados para visibilidad y uso tactil.
- Avisos con layout mas legible y sin solapes.
- Login publico sin accesos demo ni credenciales precargadas.
- Asignacion de tecnico mediante desplegable legible que guarda internamente el UUID.
- Bloqueo de scroll de fondo en modales y paneles laterales.
- Formularios de cliente, centro, equipo y check sin campo de codigo manual.
- Generacion previa de codigo automatico en el frontend para inserts directos y triggers/RPC transaccionales como refuerzo en Supabase.
- Formulario de check filtrado por tipo de equipo para evitar plantillas incompatibles.
- Payloads de cliente, centro, equipo, parte y check filtrados para no enviar relaciones agregadas como columnas.
- Modulo SAT `Tecnicos` conectado a perfiles, partes y checks reales de Supabase.
- Checks con seleccion visual previa y persistencia solo al confirmar seleccion o guardar bloque.

## Limitaciones conocidas

- Algunos modulos comerciales, administrativos y de gerencia tienen pantalla propia de preparacion, pero no CRUD completo especifico todavia.
- La verificacion manual completa depende de usuarios reales existentes en Supabase Auth.
- El warning de Vite por chunk superior a 500 kB no bloquea el despliegue, pero recomienda code splitting futuro.
- No existe script `lint` en `package.json` actualmente.
- La cola offline persistente sincroniza bloques de check. Fotos, firmas y materiales quedan guardados localmente y preparados para completar la sincronizacion remota especifica de archivos/materiales.
- Los documentos no tienen columna `code` en el esquema actual; no se ha inventado un codigo sin migracion estructural especifica.

## Proximos pasos

- Completar CRUD especifico de oportunidades, presupuestos, contratos, facturacion, compras, proveedores, PRL y vehiculos.
- Separar `App.tsx` en modulos por dominio.
- Anadir code splitting por rutas.
- Ampliar pruebas automatizadas de permisos, servicios y responsive.
- Completar IndexedDB para fotografias, firmas y cola offline completa del tecnico.

## Seguridad

- `.env.local` esta ignorado por Git.
- `node_modules/` y `dist/` estan ignorados.
- `.env.example` solo contiene nombres de variables vacias.
- No deben subirse claves reales, tokens, contrasenas ni cadenas privadas de conexion.

## Autor

Francisco Javier Ena Marquez.
