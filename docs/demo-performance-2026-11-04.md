# Arranque de demo · 04/11/2026

El informe móvil aportado registraba 72 de rendimiento, FCP/LCP de 4,4 s, TBT 0 y CLS 0. No hay todavía una medición Lighthouse posterior; no se atribuye una nueva puntuación a estos cambios.

La portada de un visitante nuevo carga una entrada independiente. La aplicación completa, sus estilos y la preparación del service worker comienzan al entrar. Una sesión existente abre la aplicación habitual; las rutas internas siguen cargando la aplicación con su soporte offline. La disponibilidad y la comprobación de acceso continúan siendo obligatorias.

La compilación separa 9,32 KB de estilos de portada (2,61 KB gzip) de 210,42 KB de estilos de aplicación (39,17 KB gzip). El bloque principal de aplicación ronda 884 KB (221 KB gzip) y deja de ser necesario para mostrar la portada. Son tamaños de artefactos, no el total transferido ni una medición de tiempo en 4G. React e iconos siguen siendo dependencias de entrada y los servicios de acceso se cargan tras montar la portada.

La demo incorpora metadescripción y robots.txt real. Las rutas /app y /actualizar se excluyen del rastreo; esto no constituye control de acceso.

Validación: compilaciones habitual y demo correctas; 351 archivos y 1.952 pruebas correctas. Incluye inicio, fallo y reintento sin perder rol, y recuperación de sesión sin crear otro visitante. Vista previa de producción comprobada en escritorio y móvil sin desbordamiento horizontal. La vista previa local carece de la clave Turnstile del dominio público, por lo que la entrada real debe verificarse tras publicar.

Se guarda también supabase/demo/010_roles_rls.sql: el usuario ya aplicó la corrección de roles en la base de demo y confirmó cero tablas públicas sin RLS. No repetir la instalación del esquema ni ejecutar esta corrección en Pro.

Pendiente: repetir PageSpeed sobre la versión publicada, comprobar acceso público con Turnstile y continuar la aceptación del recorrido propio desde SAT. Mantener los estilos de landing.css acordes con los estilos de portada de public-demo.css al editar el diseño.
