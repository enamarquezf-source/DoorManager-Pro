# DoorManager Pro - Arquitectura

## 1. Objetivo

DoorManager Pro se construira como una plataforma web profesional responsive/PWA. La arquitectura debe permitir acceso desde ordenador, movil y tablet, con datos centralizados, API REST segura, permisos por usuario y una experiencia visual adecuada para tecnicos de campo y usuarios de oficina.

El proyecto ya no se plantea como aplicacion Java Swing de escritorio. La solucion objetivo se compone de backend Java 21 con Spring Boot, frontend React con TypeScript, PostgreSQL centralizado, PWA instalable y despliegue mediante Docker.

## 2. Stack tecnologico previsto

### Backend

- Java 21.
- Spring Boot.
- Spring Web.
- Spring Data JPA.
- Spring Security.
- JWT.
- PostgreSQL.
- Flyway.
- Swagger/OpenAPI.
- JUnit.
- Mockito.

### Frontend

- React.
- TypeScript.
- Vite.
- Tailwind CSS.
- PWA con manifest, service worker y assets instalables.

### Infraestructura

- Docker.
- Docker Compose.
- Variables de entorno.
- HTTPS en entornos reales.
- GitHub Actions como mejora futura para CI.

## 3. Vista de alto nivel

```text
Ordenador / Movil / Tablet
  Navegador moderno o PWA instalada
        |
        | HTTPS + JSON + JWT
        v
Frontend React + TypeScript + Vite + Tailwind CSS
        |
        | API REST versionada
        v
Backend Java 21 + Spring Boot
  Controllers -> Services -> Repositories
  Security -> JWT -> Roles/Permisos
        |
        v
PostgreSQL centralizado
```

Todos los dispositivos consumen la misma API y acceden a la misma base de datos centralizada. No debe existir almacenamiento local como fuente principal de verdad.

## 4. Estilo arquitectonico backend

Se propone una arquitectura por capas con separacion clara entre API, aplicacion, dominio e infraestructura.

Capas principales:

- API: controladores REST, DTOs, validaciones de entrada y documentacion OpenAPI.
- Aplicacion: casos de uso, servicios transaccionales y orquestacion.
- Dominio: entidades, reglas de negocio, enumeraciones y excepciones de negocio.
- Infraestructura: repositorios JPA, configuracion de seguridad, persistencia, migraciones y adaptadores tecnicos.

Esta estructura permite mantener el MVP simple sin renunciar a una organizacion limpia y escalable.

## 5. Arquitectura frontend

El frontend sera una aplicacion web responsive construida con React, TypeScript, Vite y Tailwind CSS.

Responsabilidades principales:

- Gestion de rutas protegidas.
- Login y mantenimiento de sesion.
- Consumo de API REST.
- Renderizado responsive para escritorio, movil y tablet.
- Pantallas de gestion administrativa y operativa.
- Checklist visual e interactivo por puerta/equipo.
- Visualizacion de estados de checks por zona.
- Captura y subida de fotografias.
- Integracion PWA para instalacion visual.

El frontend podra ocultar acciones no autorizadas, pero no debe asumir responsabilidad final de seguridad. Las reglas criticas se validaran en backend.

## 6. Modulos funcionales

Modulos iniciales:

- Auth.
- Users.
- RolesPermissions.
- Customers.
- Installations.
- Equipment.
- Interventions.
- Inspections.
- Checklist.
- Photos.
- Dashboard.
- Common.

Responsabilidades:

| Modulo | Responsabilidad |
| --- | --- |
| Auth | Login, generacion y validacion de JWT, contexto de seguridad |
| Users | Gestion de usuarios internos |
| RolesPermissions | Roles, permisos y autorizacion funcional |
| Customers | Gestion de clientes |
| Installations | Gestion de instalaciones por cliente |
| Equipment | Gestion de puertas y equipos |
| Interventions | Gestion de trabajos tecnicos |
| Inspections | Comprobaciones de montaje y mantenimiento |
| Checklist | Zonas interactivas, estados y reglas del checklist visual |
| Photos | Adjuntos fotograficos asociados a checks |
| Dashboard | Indicadores operativos basicos |
| Common | Errores, utilidades, auditoria, paginacion y respuestas compartidas |

## 7. Estructura de paquetes backend recomendada

```text
com.doormanagerpro
  auth
    api
    application
    domain
    infrastructure
  users
    api
    application
    domain
    infrastructure
  rolespermissions
    api
    application
    domain
    infrastructure
  customers
    api
    application
    domain
    infrastructure
  installations
    api
    application
    domain
    infrastructure
  equipment
    api
    application
    domain
    infrastructure
  interventions
    api
    application
    domain
    infrastructure
  inspections
    api
    application
    domain
    infrastructure
  checklist
    api
    application
    domain
  photos
    api
    application
    infrastructure
  dashboard
    api
    application
  common
    api
    config
    error
    security
    persistence
```

La estructura puede ajustarse durante la implementacion si el tamano real del MVP aconseja simplificarla.

## 8. Estructura frontend recomendada

```text
src
  app
  routes
  features
    auth
    customers
    installations
    equipment
    interventions
    inspections
    checklist
    dashboard
  shared
    api
    components
    hooks
    layout
    styles
  pwa
```

La organizacion debe favorecer componentes reutilizables, pantallas responsive y separacion entre logica de API y presentacion.

## 9. API REST

La API debe exponerse bajo versionado:

```text
/api/v1
```

Endpoints iniciales previstos:

```text
POST   /api/v1/auth/login
GET    /api/v1/auth/me

GET    /api/v1/users
POST   /api/v1/users
GET    /api/v1/users/{id}
PUT    /api/v1/users/{id}
PATCH  /api/v1/users/{id}/activate
PATCH  /api/v1/users/{id}/deactivate

GET    /api/v1/roles
GET    /api/v1/permissions

GET    /api/v1/customers
POST   /api/v1/customers
GET    /api/v1/customers/{id}
PUT    /api/v1/customers/{id}
PATCH  /api/v1/customers/{id}/deactivate

GET    /api/v1/installations
POST   /api/v1/installations
GET    /api/v1/installations/{id}
PUT    /api/v1/installations/{id}
PATCH  /api/v1/installations/{id}/deactivate

GET    /api/v1/equipment
POST   /api/v1/equipment
GET    /api/v1/equipment/{id}
PUT    /api/v1/equipment/{id}
PATCH  /api/v1/equipment/{id}/deactivate

GET    /api/v1/interventions
POST   /api/v1/interventions
GET    /api/v1/interventions/{id}
PUT    /api/v1/interventions/{id}
PATCH  /api/v1/interventions/{id}/status

GET    /api/v1/inspections
POST   /api/v1/inspections
GET    /api/v1/inspections/{id}
PUT    /api/v1/inspections/{id}
PATCH  /api/v1/inspections/{id}/status
POST   /api/v1/inspections/{id}/validate

GET    /api/v1/equipment/{id}/inspection-history
GET    /api/v1/inspections/{id}/items
PUT    /api/v1/inspections/{id}/items/{itemId}
POST   /api/v1/inspection-items/{itemId}/photos

GET    /api/v1/dashboard/summary
```

Requisitos de API:

- Usar DTOs de entrada y salida.
- No exponer entidades JPA directamente.
- Aplicar validacion con Bean Validation.
- Usar paginacion en listados.
- Mantener formato de errores consistente.
- Documentar endpoints con Swagger/OpenAPI.
- Aplicar autorizacion por rol, permiso y recurso.

## 10. Seguridad

Spring Security sera el punto central de autenticacion y autorizacion.

Componentes previstos:

- Security configuration.
- Authentication controller.
- Authentication service.
- JWT provider.
- JWT authentication filter.
- UserDetailsService propio.
- PasswordEncoder con BCrypt.
- Reglas de autorizacion por endpoint, rol, permiso y recurso.

Flujo de autenticacion:

1. El usuario envia email y password a `/api/v1/auth/login`.
2. El backend valida credenciales.
3. El backend comprueba que el usuario esta activo.
4. El backend genera un JWT firmado con expiracion.
5. El cliente usa el token en la cabecera `Authorization: Bearer <token>`.
6. El filtro JWT valida el token en cada peticion protegida.
7. Spring Security establece el contexto del usuario autenticado.

## 11. Persistencia

La persistencia se implementara con Spring Data JPA sobre PostgreSQL.

Criterios:

- Entidades JPA separadas de DTOs.
- Repositorios por agregado o entidad principal.
- Consultas derivadas para casos simples.
- JPQL o specifications para filtros mas complejos.
- Transacciones en servicios de aplicacion.
- Migraciones de esquema mediante Flyway.
- Indices para historiales por equipo, estados y fechas.

## 12. Checklist interactivo

El checklist sera una funcionalidad central del producto.

Principios:

- Cada puerta/equipo tiene su propio historial de comprobaciones.
- Cada comprobacion se compone de zonas interactivas.
- Cada zona registra estado, observaciones, fotografias, fecha, tecnico y validacion si procede.
- El frontend representa las zonas sobre un dibujo o esquema de puerta.
- El backend conserva la verdad del estado y permisos.

## 13. PWA y acceso multidispositivo

La PWA debe permitir instalacion visual en dispositivos compatibles sin convertirse en app nativa.

Requisitos arquitectonicos:

- Manifest configurado.
- Iconos y nombre de aplicacion.
- Service worker controlado.
- Responsive design desde el inicio.
- API centralizada como fuente de datos.
- HTTPS en despliegue real.

## 14. Docker y entornos

Docker se usara para facilitar ejecucion local y demostracion profesional.

Componentes previstos:

- Contenedor de backend Spring Boot.
- Contenedor de frontend React servido como build estatico.
- Contenedor PostgreSQL.
- Docker Compose para entorno local.

Perfiles recomendados:

- local.
- test.
- prod.

Variables de entorno candidatas:

- DATABASE_URL.
- DATABASE_USERNAME.
- DATABASE_PASSWORD.
- JWT_SECRET.
- JWT_EXPIRATION_MINUTES.
- SPRING_PROFILES_ACTIVE.
- FRONTEND_API_BASE_URL.

## 15. Testing

El proyecto debe incluir pruebas desde fases tempranas.

Tipos de pruebas:

- Unitarias para servicios de aplicacion.
- Unitarias para reglas de dominio.
- Tests de controladores con MockMvc.
- Tests de seguridad para autorizacion y autenticacion.
- Tests de repositorios cuando haya consultas no triviales.
- Tests frontend de componentes criticos como login y checklist.

Prioridades iniciales:

- Auth y seguridad.
- Validaciones de entrada.
- Reglas de creacion de entidades relacionadas.
- Cambios de estado de intervenciones y comprobaciones.
- Permisos sobre checks.
- No exposicion de informacion sensible.

## 16. Observabilidad inicial

Para el MVP se recomienda incluir:

- Logs estructurados basicos.
- Logging de errores controlado.
- Actuator en perfil local o protegido.
- Health check para base de datos.

No se recomienda incorporar herramientas complejas de observabilidad hasta que exista una necesidad real.

## 17. Escalabilidad futura

La arquitectura debe permitir evolucionar hacia:

- Sincronizacion offline parcial para tecnicos.
- Firma digital avanzada.
- Generacion de PDF.
- Notificaciones por email o push.
- Planificacion avanzada.
- Integracion con ERP o facturacion.
- Multiempresa o multi-tenant.
- Auditoria avanzada.
- Almacenamiento externo de adjuntos.

El MVP no debe sobredisenarse para todos estos escenarios, pero si evitar decisiones que bloqueen su incorporacion futura.
