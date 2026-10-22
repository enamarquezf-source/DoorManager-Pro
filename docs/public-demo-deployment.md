# DMP · Demo pública

## Estado

El proyecto Supabase separado facilitado para esta demo es
`https://xlhzyhotzfflemjnqvqn.supabase.co`.
La consulta anónima al recurso `companies` devuelve 404: todavía no está
disponible el esquema DMP mediante la API. No se ha instalado SQL remoto ni
copiado ningún registro de la instalación actual.

Cloudflare ha creado un Worker llamado `demo-doormanager-pro`, conectado a
`enamarquezf-source/DoorManager-Pro`, rama `main`. La captura inicial muestra
un despliegue correcto y ninguna variable de compilación configurada.

**El despliegue del frontend no acredita que la demo pública esté preparada.**
Faltan el arranque limpio del esquema, las sesiones temporales, su aislamiento,
caducidad y eliminación, el tutorial y el escenario técnico. No usar cuentas
compartidas para sustituir ese mecanismo.

## Configurar el Worker

En el Worker nuevo, abrir Settings → Build. Configurar:

| Campo | Valor |
|---|---|
| Build command | `npm run build` |
| Deploy command | `npx wrangler deploy --config wrangler.demo.jsonc` |
| Root directory | `/` |
| VITE_SUPABASE_URL | URL del proyecto nuevo indicada arriba |
| VITE_SUPABASE_PUBLISHABLE_KEY | Clave pública del proyecto nuevo |

Las dos variables VITE deben existir en las **variables de compilación**:
Vite las incorpora al JavaScript durante el build. Las variables de ejecución
del Worker no sustituyen ese paso. Después de guardarlas se necesita un build
nuevo. No se utilizan contraseñas de base de datos ni claves secretas en VITE.

`wrangler.demo.jsonc` sirve `dist` y aplica fallback SPA para las rutas internas.
Es una configuración explícita del Worker de la demo; Cloudflare Pages de la
instalación actual conserva su configuración y variables independientes.

Para desarrollo local, copiar `.env.demo.example` a `.env.demo.local`, rellenar
la clave pública y usar `npx vite --mode demo`. La plantilla no activa por sí
sola sesiones públicas ni modifica la base remota.

## Experiencia acordada

La portada permite elegir Gerencia, Oficina, SAT, Comercial o Técnico. No se
ofrece acceso público como superadmin. Cada visitante obtiene una identidad y
un espacio temporal propio; compartir una cuenta entre visitantes no cumple
este diseño.

- Gerencia, Oficina, SAT y Comercial: sin datos de negocio; bienvenida adaptada.
- Técnico: un cliente y centro ficticios, un parte asignado y checks sin revisar
  de puerta seccional, puerta corredera y barrera automática. Fotos y respuestas
  comienzan vacías; cada componente se evalúa por separado.
- El técnico prueba revisión, defecto, explicación, foto, trabajo realizado,
  horas, firma y sincronización.
- Finalizar la demo revoca el acceso y solicita limpieza de los datos remotos y
  locales. Cerrar una pestaña no garantiza un evento de salida: la limpieza por
  caducidad debe ejecutarse en el servidor y permitir reintentos.
- Dos visitantes simultáneos no ven ni modifican los datos del otro. Varias
  pestañas de la misma sesión se consideran el mismo visitante.
- La limpieza incluye registros dependientes, archivos Storage, identidades
  temporales y cachés locales. Los fallos de borrado se reintentan; no se muestra
  una confirmación de eliminación completa antes de completarla.
- Facturas y nóminas se identifican como simulaciones; la demo no invoca envíos
  externos ni operaciones de cobro reales.

La configuración existente de una empresa operadora por instalación necesita
adaptación en el proyecto de demo antes de admitir varios espacios a la vez.
La clave pública no permite instalar el esquema ni administrar Auth; esa fase
se ejecutará mediante SQL Editor y despliegue de funciones en el proyecto nuevo.

## Referencias

- [Build configuration de Workers](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/)
- [Rutas SPA en Workers](https://developers.cloudflare.com/workers/static-assets/routing/single-page-application/)
- [Identidades anónimas en Supabase](https://supabase.com/docs/guides/auth/auth-anonymous)
