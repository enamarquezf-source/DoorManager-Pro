# DoorManager Pro

DoorManager Pro es un proyecto de portfolio desarrollado en Java orientado a la gestión de empresas de instalación y mantenimiento de puertas automáticas.

El objetivo del proyecto es construir una aplicación realista, mantenible y profesional que permita gestionar clientes, instalaciones, equipos, revisiones e intervenciones técnicas.

## Motivación

Este proyecto nace a partir de experiencia real en el sector de puertas automáticas. La idea es transformar necesidades habituales del trabajo técnico en una solución software completa, útil y presentable como proyecto profesional para entrevistas de desarrollo Java.

## Funcionalidades previstas

### Versión inicial

- Gestión de clientes.
- Gestión de instalaciones por cliente.
- Registro de puertas automáticas y equipos.
- Registro de averías e intervenciones.
- Planificación de revisiones.
- Dashboard con información principal.
- Búsqueda y filtrado de datos.

### Futuras mejoras

- Gestión de usuarios y roles.
- Firma del cliente.
- Adjuntar fotografías a intervenciones.
- Generación de informes PDF.
- Exportación de datos.
- Calendario avanzado de mantenimientos.
- Estadísticas de averías, revisiones y clientes.
- Aplicación web o móvil para técnicos.

## Tecnologías previstas

- Java 21 LTS
- Spring Boot
- Maven
- PostgreSQL
- Spring Data JPA
- Flyway
- Spring Security
- JWT
- Swagger / OpenAPI
- Docker
- JUnit
- Mockito
- GitHub Actions

## Arquitectura prevista

El proyecto seguirá una arquitectura por capas:

```text
Controller  -> Entrada de peticiones
Service     -> Lógica de negocio
Repository  -> Acceso a base de datos
Entity      -> Modelo persistente
DTO         -> Datos de entrada y salida
Security    -> Autenticación y autorización
```

## Seguridad

La seguridad será una parte importante del proyecto desde el inicio:

- Validación de datos de entrada.
- Protección contra inyección SQL mediante JPA y consultas seguras.
- Contraseñas cifradas cuando se implemente autenticación.
- Roles diferenciados: Administrador, Oficina y Técnico.
- Gestión centralizada de errores.
- Variables de entorno para credenciales y configuración.
- No se subirán secretos ni contraseñas al repositorio.

## Estado del proyecto

Proyecto en fase inicial de diseño y planificación.

## Roadmap

- [ ] Crear estructura base del proyecto Spring Boot.
- [ ] Configurar PostgreSQL y Docker.
- [ ] Crear módulo de clientes.
- [ ] Crear módulo de instalaciones.
- [ ] Crear módulo de equipos/puertas.
- [ ] Crear módulo de intervenciones.
- [ ] Añadir dashboard inicial.
- [ ] Añadir documentación Swagger.
- [ ] Añadir tests automatizados.
- [ ] Preparar primera release.

## Autor

Francisco Javier Ena Márquez

Proyecto desarrollado como portfolio profesional dentro del proceso de formación y especialización en desarrollo de aplicaciones multiplataforma.
