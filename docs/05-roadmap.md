# DoorManager Pro - Roadmap inicial

## 1. Objetivo

Este roadmap define una evolucion tecnica y funcional realista para DoorManager Pro, priorizando un MVP solido, seguro y presentable como proyecto profesional de portfolio.

El enfoque recomendado es construir primero una base backend robusta y documentada, validar los flujos principales y despues ampliar funcionalidades.

## 2. Principios de ejecucion

- Priorizar calidad sobre cantidad de funcionalidades.
- Mantener la arquitectura simple pero bien separada.
- Implementar seguridad desde el inicio.
- Versionar base de datos con Flyway desde la primera migracion.
- Documentar decisiones relevantes.
- Cubrir con tests las reglas criticas.
- Evitar funcionalidades futuras hasta que el MVP este estable.

## 3. Fase 0 - Preparacion del proyecto

Objetivo: crear una base tecnica limpia para empezar el desarrollo.

Entregables:

- Estructura inicial Maven con Java 21 y Spring Boot.
- Configuracion base de perfiles.
- Dependencias principales.
- Configuracion inicial de PostgreSQL.
- Docker Compose para base de datos local.
- Flyway configurado.
- Swagger/OpenAPI configurado.
- Estructura de paquetes inicial.
- README inicial orientado a portfolio.

Criterios de salida:

- La aplicacion arranca localmente.
- La base de datos se levanta con Docker.
- Flyway ejecuta migraciones iniciales.
- Swagger esta disponible en entorno local.

## 4. Fase 1 - Seguridad y usuarios

Objetivo: implementar la base de autenticacion, autorizacion y gestion de usuarios.

Entregables:

- Modelo de roles.
- Modelo de usuarios.
- Migraciones iniciales de roles y usuarios.
- Password hashing con BCrypt.
- Login con JWT.
- Filtro de autenticacion JWT.
- Reglas de autorizacion por rol.
- Endpoint de usuario autenticado.
- Gestion basica de usuarios por ADMIN.
- Tests de login y autorizacion.

Criterios de salida:

- Un usuario puede autenticarse con credenciales validas.
- Un usuario inactivo no puede autenticarse.
- Los endpoints protegidos rechazan peticiones sin token.
- Los roles limitan correctamente el acceso.
- Las respuestas no exponen hashes de password.

## 5. Fase 2 - Clientes e instalaciones

Objetivo: implementar la base del negocio: clientes e instalaciones.

Entregables:

- CRUD de clientes.
- Busqueda y paginacion de clientes.
- Desactivacion logica de clientes.
- CRUD de instalaciones.
- Busqueda y paginacion de instalaciones.
- Relacion cliente-instalaciones.
- Validaciones de entrada.
- Tests de servicios y controladores principales.

Criterios de salida:

- No se puede crear una instalacion sin cliente valido.
- Se puede consultar el detalle de un cliente con sus instalaciones mediante endpoints especificos.
- Los listados soportan paginacion.
- Los errores de validacion son claros y consistentes.

## 6. Fase 3 - Puertas y equipos

Objetivo: registrar y consultar los activos tecnicos mantenidos por la empresa.

Entregables:

- CRUD de equipos.
- Relacion instalacion-equipos.
- Tipos y estados de equipo.
- Busqueda por instalacion, tipo, estado y numero de serie.
- Desactivacion logica de equipos.
- Validaciones de integridad.
- Tests de reglas principales.

Criterios de salida:

- No se puede crear un equipo sin instalacion valida.
- Se puede consultar el historico operativo futuro desde el equipo.
- Los equipos desactivados no desaparecen del historico.

## 7. Fase 4 - Intervenciones

Objetivo: gestionar trabajos tecnicos y averias.

Entregables:

- CRUD de intervenciones.
- Asignacion de tecnico.
- Estados de intervencion.
- Prioridades.
- Filtros por cliente, instalacion, equipo, tecnico, estado, prioridad y fechas.
- Cambio controlado de estado.
- Registro de solucion aplicada.
- Tests de cambios de estado y permisos.

Criterios de salida:

- Una intervencion siempre pertenece a cliente e instalacion.
- Si se informa equipo, debe pertenecer a la instalacion indicada.
- Un tecnico solo puede actualizar intervenciones asignadas segun permisos.
- Una intervencion finalizada conserva fecha de cierre y solucion aplicada.

## 8. Fase 5 - Revisiones

Objetivo: gestionar revisiones periodicas de equipos.

Entregables:

- CRUD de revisiones.
- Estados de revision.
- Resultado de revision.
- Filtros por cliente, instalacion, equipo, tecnico, estado y fechas.
- Consulta de revisiones pendientes y vencidas.
- Finalizacion de revision.
- Tests de reglas de revision.

Criterios de salida:

- Una revision siempre pertenece a un equipo valido.
- El equipo debe pertenecer a la instalacion indicada.
- Se pueden detectar revisiones vencidas.
- Una revision realizada registra resultado y fecha de realizacion.

## 9. Fase 6 - Dashboard basico

Objetivo: ofrecer una vision operativa inicial del sistema.

Entregables:

- Endpoint `/api/v1/dashboard/summary`.
- Conteo de clientes activos.
- Conteo de instalaciones activas.
- Conteo de equipos activos.
- Conteo de intervenciones pendientes y urgentes.
- Conteo de revisiones pendientes y vencidas.
- Ultimas intervenciones registradas.
- Tests de agregacion basica.

Criterios de salida:

- El dashboard responde rapidamente con datos agregados.
- La informacion respeta permisos del usuario autenticado.
- Las consultas estan optimizadas con indices adecuados.

## 10. Fase 7 - Endurecimiento y portfolio

Objetivo: elevar el proyecto a una presentacion profesional.

Entregables:

- README completo.
- Documentacion de arquitectura actualizada.
- Coleccion de ejemplos de uso de API.
- Capturas o guia de Swagger.
- Tests de seguridad adicionales.
- Docker Compose completo.
- Datos semilla para demo.
- Revision de logs y errores.
- Limpieza de codigo y nombres.

Criterios de salida:

- El proyecto puede ejecutarse siguiendo el README.
- La API puede probarse desde Swagger.
- Hay datos de ejemplo suficientes para una demo.
- Los tests principales pasan.
- La documentacion explica decisiones tecnicas y de negocio.

## 11. Mejoras futuras

Funcionalidades candidatas tras el MVP:

- Frontend web con panel administrativo.
- App movil o PWA para tecnicos.
- Adjuntos y fotografias por intervencion.
- Firma digital de partes de trabajo.
- Generacion de PDF.
- Notificaciones por email.
- Planificador de revisiones recurrentes.
- Calendario de intervenciones.
- Gestion de contratos de mantenimiento.
- Gestion de materiales y stock.
- Facturacion o integracion con ERP.
- Auditoria avanzada.
- Multiempresa o multi-tenant.
- Informes avanzados.

## 12. Orden recomendado de implementacion

1. Base Spring Boot, Docker, PostgreSQL y Flyway.
2. Roles, usuarios y autenticacion JWT.
3. Clientes.
4. Instalaciones.
5. Equipos.
6. Intervenciones.
7. Revisiones.
8. Dashboard.
9. Tests, documentacion y datos demo.

Este orden reduce riesgos porque primero establece seguridad e infraestructura, despues entidades base y finalmente flujos operativos.
