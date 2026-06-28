# DoorManager Pro - Acceso multidispositivo

## 1. Objetivo

DoorManager Pro debe poder utilizarse desde ordenador, movil y tablet. El acceso multidispositivo se resolvera mediante una plataforma web responsive y PWA, no mediante una aplicacion Java Swing de escritorio ni una app movil nativa inicial.

Todos los dispositivos accederan a la misma API REST segura y a una base de datos PostgreSQL centralizada.

## 2. Principios

- Un unico backend centralizado.
- Una unica base de datos PostgreSQL como fuente de verdad.
- Un frontend web responsive para todos los dispositivos.
- PWA instalable visualmente en dispositivos compatibles.
- Seguridad basada en JWT, roles y permisos.
- Datos sensibles protegidos en backend.
- Experiencia adaptada a oficina y trabajo de campo.

## 3. Dispositivos objetivo

### Ordenador

Uso principal:

- Administracion.
- Gestion de clientes e instalaciones.
- Gestion de usuarios y permisos.
- Consulta de dashboard.
- Revision de historiales.
- Planificacion y seguimiento.

### Tablet

Uso principal:

- Consulta de fichas tecnicas.
- Comprobaciones en campo.
- Checklist visual interactivo.
- Registro de observaciones y fotografias.
- Validacion de trabajos.

### Movil

Uso principal:

- Consulta rapida de trabajos asignados.
- Registro de checks.
- Captura de fotografias.
- Actualizacion de estados.
- Consulta de informacion tecnica esencial.

## 4. Arquitectura de acceso

```text
Ordenador / Movil / Tablet
  Navegador o PWA instalada
        |
        | HTTPS
        v
Frontend React responsive
        |
        | API REST + JWT
        v
Backend Spring Boot
        |
        v
PostgreSQL centralizado
```

El frontend no se conectara directamente a la base de datos. Toda operacion pasara por la API REST, donde se aplicaran validaciones, reglas de negocio y permisos.

## 5. PWA

La PWA debe permitir que el usuario instale DoorManager Pro visualmente en el escritorio o pantalla de inicio del dispositivo.

Requisitos iniciales:

- Manifest con nombre, descripcion, iconos y color principal.
- Iconos adecuados para movil y escritorio.
- Service worker configurado de forma controlada.
- Pantalla responsive al abrirse instalada.
- HTTPS en entornos reales.

Limitaciones iniciales:

- No se plantea sincronizacion offline compleja en el MVP.
- La base de datos centralizada seguira siendo la fuente de verdad.
- El cache no debe almacenar informacion sensible sin decision explicita.

## 6. Responsive design

La interfaz debe disenarse desde el inicio para tres rangos principales:

- Escritorio: pantallas amplias, tablas, paneles laterales y dashboard completo.
- Tablet: controles tactiles amplios, formularios comodos y checklist visual destacado.
- Movil: navegacion simplificada, acciones principales visibles y formularios optimizados.

Requisitos:

- Evitar pantallas que solo funcionen en escritorio.
- Usar componentes adaptables.
- Priorizar legibilidad y areas tactiles suficientes.
- Reducir friccion en operaciones de campo.
- Mantener accesibilidad basica con etiquetas, contraste y navegacion clara.

## 7. Sesion y seguridad

Requisitos:

- El usuario debe iniciar sesion con credenciales.
- El backend emite JWT con expiracion.
- El frontend envia el token en peticiones protegidas.
- Los permisos se aplican en backend.
- El frontend debe mostrar u ocultar opciones segun permisos recibidos.
- El cierre de sesion debe limpiar estado local sensible.
- En entornos reales debe usarse HTTPS.

## 8. Base de datos centralizada

Todos los dispositivos accederan a los mismos datos mediante la API.

Ventajas:

- Historial unico por puerta/equipo.
- Informacion consistente entre oficina y campo.
- Control centralizado de usuarios y permisos.
- Backups y mantenimiento centralizados.
- Evita duplicidades y versiones locales divergentes.

## 9. Casos de uso multidispositivo

### Tecnico en movil

1. Inicia sesion.
2. Consulta trabajos asignados.
3. Abre una puerta/equipo.
4. Completa checklist interactivo.
5. Adjunta fotografias.
6. Guarda comprobacion en la API centralizada.

### Responsable en tablet

1. Consulta comprobaciones pendientes.
2. Revisa zonas con averia o a revisar.
3. Valida una comprobacion si tiene permisos.
4. Consulta historial del equipo.

### Administrador en escritorio

1. Gestiona usuarios, roles y permisos.
2. Consulta dashboard.
3. Revisa clientes, instalaciones y equipos.
4. Supervisa intervenciones y comprobaciones.

## 10. Criterios de aceptacion

- La aplicacion puede abrirse desde navegador en ordenador, movil y tablet.
- La interfaz se adapta correctamente a cada tamano de pantalla.
- La PWA puede instalarse visualmente en dispositivos compatibles.
- Todos los dispositivos consultan la misma informacion centralizada.
- Los permisos se respetan independientemente del dispositivo usado.
- El checklist interactivo es utilizable en pantalla tactil y escritorio.
