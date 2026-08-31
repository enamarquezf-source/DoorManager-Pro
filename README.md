# DoorManager Pro

DoorManager Pro es una plataforma web de gestion operativa para empresas de instalaciones, mantenimiento y servicios tecnicos. Reune la coordinacion SAT, el trabajo del personal tecnico de campo, la actividad comercial y la gestion de oficina sobre una base de datos comun conectada a Supabase.

El producto nacio a partir de necesidades reales del sector de puertas industriales y automaticas, que continua siendo un caso de uso principal y de referencia. Su nucleo debe ser reutilizable por empresas que instalan, mantienen o reparan cualquier tipo de equipo o instalacion tecnica. El nombre DoorManager Pro se mantiene como marca del producto.

## Web publica

https://doormanager-pro.pages.dev/

## Problema que resuelve

Muchas empresas tecnicas gestionan en herramientas separadas la informacion de clientes, centros, equipos o instalaciones, partes, tecnicos, checks, incidencias, fotografias, documentos, materiales, almacenes, presupuestos y facturacion. Esto dificulta conocer el estado real de cada intervencion y conservar su historial.

DoorManager Pro conecta esa operativa para ofrecer trazabilidad de cada cliente, centro, equipo o instalacion e intervencion, desde el aviso inicial hasta la validacion, la facturacion y el historial posterior.

## Flujo conceptual

```text
Cliente
  -> Centro
    -> Equipo / Instalacion
      -> Aviso / Expediente
        -> Parte
          -> Tecnico
            -> Materiales y recursos
              -> Validacion
                -> Facturacion
                  -> Historial
```

La cadena es un modelo operativo general y no esta acoplada al concepto de puerta.

## Sectores objetivo

DoorManager Pro esta orientado a adaptarse a distintos servicios tecnicos y verticales configurables, por ejemplo:

- Instalacion y mantenimiento industrial.
- Puertas automaticas e industriales.
- Electricidad y automatizacion.
- Climatizacion y HVAC.
- Proteccion contra incendios.
- Ascensores y elevacion.
- Instalaciones hidraulicas y neumaticas.
- Energia y cargadores.
- SAT multimarca.
- Servicios tecnicos con personal de campo.

Esta lista muestra posibles verticales de aplicacion; no implica soporte funcional completo para todos ellos. Las particularidades de cada actividad deben resolverse mediante tipos de equipo, configuracion, plantillas de checks, reglas de negocio y verticales especificas.

## Modulos principales

- **SAT:** coordinacion operativa de avisos, expedientes, partes, tecnicos, equipos, checks y documentacion.
- **Tecnico:** trabajo en campo, jornada, partes asignados, checks, incidencias, horas, materiales, fotografias, firmas y trabajo offline.
- **Comercial:** clientes, oportunidades y presupuestos, con conversion de necesidades tecnicas en actividad comercial.
- **Oficina:** administracion, facturacion, compras, proveedores, documentacion y soporte operativo.
- **Gerencia:** vision global de operaciones, actividad comercial, costes, calidad e indicadores.

Cada modulo trabaja con su perspectiva y permisos sobre un nucleo comun de informacion. La plataforma informa y traza; la empresa decide.

## Funciones actuales

Las capacidades actualmente consolidadas incluyen:

- Autenticacion con Supabase Auth, perfiles y roles.
- Clientes, centros, equipos e instalaciones.
- Expedientes, partes, avisos, checks, incidencias y documentos.
- Registro de horas, materiales, recursos y costes operativos.
- Fotografias y firmas.
- Checks por tipo de equipo mediante plantillas y configuracion.
- Trabajo tecnico offline con cola local y sincronizacion manual.
- Stock operativo canonico por `warehouse_stock`, organizado por almacen.
- Movimientos de stock, apertura inicial y reconciliacion de stock.
- Rutas protegidas, menus por workspace y permisos adaptados a cada rol.

La informacion tecnica y economica estan relacionadas, pero son distintas: las horas registradas y el material consumido son hechos tecnicos u operativos; el precio de venta y la facturacion son un tratamiento economico posterior, sujeto a validacion.

La facturacion estructurada, junto con compras, proveedores y recepciones, permanece en evolucion. Las pantallas de preparacion no se presentan como CRUD completo ni como modulos terminados. El campo `materials.stock_quantity` se conserva por compatibilidad con datos legacy, pero no es la autoridad del stock operativo actual.

## Caso de uso de referencia: puertas automaticas

El repositorio contiene checks, imagenes, plantillas, configuraciones y nomenclaturas desarrolladas inicialmente para el sector de puertas industriales y automaticas. Entre ellas se encuentran el check visual de puerta seccional, la imagen de referencia y la configuracion `sectionalDoorHotspots`.

Estas implementaciones son verticales de referencia sobre un nucleo generico. Sirven para validar el modelo con un caso real sin limitar la plataforma a puertas automaticas.

## Offline y sincronizacion manual

El modo offline esta reservado al trabajo tecnico en campo. Los datos capturados sin cobertura se guardan en almacenamiento persistente del dispositivo y el tecnico decide cuando sincronizarlos mediante `Sincronizar`. La cola debe conservar pendientes, progreso, errores y reintentos sin duplicados ni perdida de datos.

## Integracion con Supabase

El frontend utiliza Supabase para autenticacion, perfiles, datos de negocio y RPC:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`

No se usa clave de servicio en frontend. Las claves reales se configuran fuera del repositorio, por ejemplo en Cloudflare Pages y `.env.local`, ignorado por Git.

La aplicacion usa RLS, vistas y RPC para mantener permisos por empresa y rol. El frontend no debe sustituir Supabase por datos locales salvo en la cola offline del tecnico.

## Despliegue y tecnologias

El proyecto se despliega en Cloudflare Pages conectado a la rama `main`:

- Framework: React / Vite.
- Build command: `npm run build`.
- Output directory: `dist`.
- Tecnologias: React, TypeScript, React Router, Supabase JS, PostgreSQL, RLS, vistas, RPC y Cloudflare Pages.

## Instalacion local

```bash
npm install
```

Crear `.env.local` con valores reales propios:

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

## Estructura y referencias del vertical inicial

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
docs/
```

La imagen limpia de produccion del check seccional esta en `public/checks/seccional-industrial.png`. Las referencias anotadas de desarrollo, si se versionan, deben ir en `docs/references/`.

## Estado y limitaciones conocidas

El proyecto esta conectado a Supabase y Cloudflare Pages, con autenticacion real, servicios por dominio, dashboards por rol, permisos centralizados, rutas protegidas, detalle de parte, codigos automaticos y check visual responsive.

- Algunos modulos comerciales, administrativos y de gerencia tienen pantalla propia de preparacion, pero no CRUD completo especifico todavia.
- La verificacion manual completa depende de usuarios reales existentes en Supabase Auth.
- El warning de Vite por chunks superiores a 500 kB no bloquea el despliegue; se preve code splitting futuro.
- No existe script `lint` en `package.json` actualmente.
- La cola offline sincroniza bloques de check, intervencion tecnica y materiales usados. Fotografias y firmas quedan guardadas localmente y preparadas para completar su sincronizacion remota especifica.

## Direccion de evolucion

- Facturacion estructurada de partes.
- Proveedores, compras y recepciones.
- Stock distribuido, reservas y transferencias.
- Configurabilidad de equipos y plantillas por sector.
- Reglas de negocio y verticales configurables.
- Modularizacion y mejora del rendimiento.
- Ampliacion de pruebas automatizadas de permisos, servicios y responsive.
- Completar la cola offline para fotografias, firmas y otros datos del tecnico.

## Seguridad

- `.env.local`, `node_modules/` y `dist/` estan ignorados por Git.
- `.env.example` solo contiene nombres de variables vacias.
- No deben subirse claves reales, tokens, contrasenas ni cadenas privadas de conexion.

## Autor

Francisco Javier Ena Marquez.
