# DoorManager Pro - Arquitectura inicial

## 1. Objetivo

DoorManager Pro se construira como una aplicacion backend profesional basada en Java 21 y Spring Boot. La arquitectura debe priorizar seguridad, mantenibilidad, claridad de responsabilidades, testabilidad y capacidad de evolucionar hacia funcionalidades mas avanzadas.

El MVP se centrara en una API REST documentada con OpenAPI, persistencia en PostgreSQL, migraciones con Flyway y autenticacion basada en JWT.

## 2. Stack tecnologico previsto

- Java 21
- Spring Boot
- Maven
- PostgreSQL
- Spring Data JPA
- Flyway
- Spring Security
- JWT
- Swagger/OpenAPI
- Docker
- JUnit
- Mockito

## 3. Estilo arquitectonico

Se propone una arquitectura por capas con separacion clara entre API, aplicacion, dominio e infraestructura.

Capas principales:

- API: controladores REST, DTOs, validaciones de entrada y documentacion OpenAPI.
- Aplicacion: casos de uso, servicios transaccionales y orquestacion.
- Dominio: entidades, reglas de negocio, enumeraciones y excepciones de negocio.
- Infraestructura: repositorios JPA, configuracion de seguridad, persistencia, migraciones y adaptadores tecnicos.

Esta estructura permite mantener el MVP simple sin renunciar a una organizacion limpia y escalable.

## 4. Modulos funcionales

Modulos iniciales:

- Auth
- Users
- Customers
- Installations
- Equipment
- Interventions
- Reviews
- Dashboard
- Common

Responsabilidades:

| Modulo | Responsabilidad |
| --- | --- |
| Auth | Login, generacion y validacion de JWT, contexto de seguridad |
| Users | Gestion de usuarios internos y roles |
| Customers | Gestion de clientes |
| Installations | Gestion de instalaciones por cliente |
| Equipment | Gestion de puertas y equipos |
| Interventions | Gestion de trabajos tecnicos |
| Reviews | Gestion de revisiones periodicas |
| Dashboard | Indicadores operativos basicos |
| Common | Errores, utilidades, auditoria, paginacion y respuestas compartidas |

## 5. Estructura de paquetes recomendada

Estructura orientativa:

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
  reviews
    api
    application
    domain
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

La estructura puede ajustarse durante la implementacion si el tamaño real del MVP aconseja simplificarla.

## 6. API REST

La API debe exponerse bajo versionado:

```text
/api/v1
```

Endpoints iniciales previstos:

```text
POST   /api/v1/auth/login

GET    /api/v1/users
POST   /api/v1/users
GET    /api/v1/users/{id}
PUT    /api/v1/users/{id}
PATCH  /api/v1/users/{id}/activate
PATCH  /api/v1/users/{id}/deactivate

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

GET    /api/v1/reviews
POST   /api/v1/reviews
GET    /api/v1/reviews/{id}
PUT    /api/v1/reviews/{id}
PATCH  /api/v1/reviews/{id}/complete

GET    /api/v1/dashboard/summary
```

Requisitos de API:

- Usar DTOs de entrada y salida.
- No exponer entidades JPA directamente.
- Aplicar validacion con Bean Validation.
- Usar paginacion en listados.
- Mantener formato de errores consistente.
- Documentar endpoints con Swagger/OpenAPI.

## 7. Seguridad

Spring Security sera el punto central de autenticacion y autorizacion.

Componentes previstos:

- Security configuration.
- Authentication controller.
- Authentication service.
- JWT provider.
- JWT authentication filter.
- UserDetailsService propio.
- PasswordEncoder con BCrypt.
- Reglas de autorizacion por endpoint y rol.

Flujo de autenticacion:

1. El usuario envia email y password a `/api/v1/auth/login`.
2. El backend valida credenciales.
3. El backend comprueba que el usuario esta activo.
4. El backend genera un JWT firmado con expiracion.
5. El cliente usa el token en la cabecera `Authorization: Bearer <token>`.
6. El filtro JWT valida el token en cada peticion protegida.
7. Spring Security establece el contexto del usuario autenticado.

## 8. Persistencia

La persistencia se implementara con Spring Data JPA sobre PostgreSQL.

Criterios:

- Entidades JPA separadas de DTOs.
- Repositorios por agregado o entidad principal.
- Consultas derivadas para casos simples.
- JPQL o specifications para filtros mas complejos.
- Transacciones en servicios de aplicacion.
- Migraciones de esquema mediante Flyway.

Consideraciones:

- Evitar relaciones bidireccionales innecesarias.
- Controlar cargas LAZY para evitar problemas de rendimiento.
- Evitar exponer entidades serializadas directamente.
- Definir indices desde migraciones.
- Mantener consistencia entre validaciones de aplicacion y restricciones de base de datos.

## 9. Gestion de errores

La aplicacion debe centralizar errores mediante un manejador global.

Tipos de errores previstos:

- Errores de validacion.
- Recurso no encontrado.
- Conflicto de negocio.
- Acceso no autorizado.
- Permisos insuficientes.
- Error interno inesperado.

Formato recomendado:

```json
{
  "timestamp": "2026-06-28T10:00:00Z",
  "status": 404,
  "error": "RESOURCE_NOT_FOUND",
  "message": "El recurso solicitado no existe",
  "path": "/api/v1/customers/123"
}
```

## 10. Testing

El proyecto debe incluir pruebas desde fases tempranas.

Tipos de pruebas:

- Unitarias para servicios de aplicacion.
- Unitarias para reglas de dominio.
- Tests de controladores con MockMvc.
- Tests de seguridad para autorizacion y autenticacion.
- Tests de repositorios cuando haya consultas no triviales.

Herramientas:

- JUnit
- Mockito
- Spring Boot Test
- MockMvc

Prioridades iniciales:

- Auth y seguridad.
- Validaciones de entrada.
- Reglas de creacion de entidades relacionadas.
- Cambios de estado de intervenciones y revisiones.
- No exposicion de informacion sensible.

## 11. Docker y entornos

Docker se usara para facilitar ejecucion local y demostracion profesional.

Componentes previstos:

- Contenedor de aplicacion Spring Boot.
- Contenedor PostgreSQL.
- Docker Compose para entorno local.

Perfiles recomendados:

- local
- test
- prod

Variables de entorno candidatas:

- DATABASE_URL
- DATABASE_USERNAME
- DATABASE_PASSWORD
- JWT_SECRET
- JWT_EXPIRATION_MINUTES
- SPRING_PROFILES_ACTIVE

## 12. Observabilidad inicial

Para el MVP se recomienda incluir:

- Logs estructurados basicos.
- Logging de errores controlado.
- Actuator en perfil local o protegido.
- Health check para base de datos.

No se recomienda incorporar herramientas complejas de observabilidad hasta que exista una necesidad real.

## 13. Escalabilidad futura

La arquitectura debe permitir evolucionar hacia:

- Frontend web independiente.
- Aplicacion movil para tecnicos.
- Adjuntos y fotografias de intervenciones.
- Firma digital.
- Notificaciones por email.
- Planificacion avanzada.
- Integracion con ERP o facturacion.
- Multiempresa o multi-tenant.
- Auditoria avanzada.

El MVP no debe sobredisenarse para todos estos escenarios, pero si evitar decisiones que bloqueen su incorporacion futura.
