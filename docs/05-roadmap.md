# DoorManager Pro - Roadmap

## 1. Objetivo

Este roadmap define una evolucion tecnica y funcional realista para DoorManager Pro como plataforma web responsive/PWA. El objetivo es construir un producto demostrable, seguro y profesional, no una aplicacion Java Swing de escritorio.

El enfoque recomendado es establecer primero la base tecnica full-stack, despues seguridad y datos centralizados, y finalmente los modulos operativos con especial atencion al checklist visual interactivo.

## 2. Principios de ejecucion

- Priorizar calidad sobre cantidad de funcionalidades.
- Mantener la arquitectura simple pero bien separada.
- Implementar seguridad desde el inicio.
- Versionar base de datos con Flyway desde la primera migracion.
- Documentar decisiones relevantes.
- Cubrir con tests las reglas criticas.
- Disenar responsive desde el inicio.
- Validar permisos siempre en backend.
- Evitar funcionalidades futuras hasta que el MVP este estable.

## 3. Fase 0 - Vision y documentacion tecnica

Objetivo: actualizar el proyecto hacia plataforma web profesional responsive/PWA.

Entregables:

- README actualizado.
- Requisitos funcionales actualizados.
- Requisitos de seguridad actualizados.
- Modelo de datos actualizado.
- Arquitectura web/PWA actualizada.
- Documentacion de checklist interactivo.
- Documentacion de acceso multidispositivo.

Criterios de salida:

- La documentacion ya no plantea Java Swing como objetivo.
- El stack full-stack esta definido.
- Los modulos de montaje, mantenimiento y checklist estan descritos.

## 4. Fase 1 - Base tecnica backend

Objetivo: crear una base backend limpia y segura para la API REST.

Entregables:

- Estructura inicial Maven con Java 21 y Spring Boot.
- Configuracion base de perfiles.
- Dependencias principales.
- Configuracion inicial de PostgreSQL.
- Docker Compose para base de datos local.
- Flyway configurado.
- Swagger/OpenAPI configurado.
- Estructura de paquetes inicial.

Criterios de salida:

- La aplicacion backend arranca localmente.
- La base de datos se levanta con Docker.
- Flyway ejecuta migraciones iniciales.
- Swagger esta disponible en entorno local.

## 5. Fase 2 - Seguridad, usuarios, roles y permisos

Objetivo: implementar autenticacion, autorizacion y control de permisos.

Entregables:

- Modelo de roles.
- Modelo de permisos.
- Modelo de usuarios.
- Migraciones iniciales de roles, permisos y usuarios.
- Password hashing con BCrypt.
- Login con JWT.
- Filtro de autenticacion JWT.
- Reglas de autorizacion por rol y permiso.
- Endpoint de usuario autenticado.
- Gestion basica de usuarios por ADMIN.
- Tests de login y autorizacion.

Criterios de salida:

- Un usuario puede autenticarse con credenciales validas.
- Un usuario inactivo no puede autenticarse.
- Los endpoints protegidos rechazan peticiones sin token.
- Los roles y permisos limitan correctamente el acceso.
- Las respuestas no exponen hashes de password.

## 6. Fase 3 - Base frontend responsive/PWA

Objetivo: crear la aplicacion web que consumira la API.

Entregables:

- Proyecto React con TypeScript y Vite.
- Tailwind CSS configurado.
- Rutas principales.
- Layout responsive base.
- Login integrado con API.
- Gestion inicial de sesion.
- Cliente HTTP para API REST.
- Configuracion PWA inicial.
- Manifest, iconos y service worker basico.

Criterios de salida:

- El frontend arranca localmente.
- Puede iniciar sesion contra el backend.
- La interfaz se adapta a escritorio, movil y tablet.
- La PWA es instalable visualmente en entorno compatible.

## 7. Fase 4 - Clientes e instalaciones

Objetivo: implementar la base del negocio.

Entregables:

- CRUD de clientes.
- Busqueda y paginacion de clientes.
- Desactivacion logica de clientes.
- CRUD de instalaciones.
- Busqueda y paginacion de instalaciones.
- Relacion cliente-instalaciones.
- Pantallas responsive para clientes e instalaciones.
- Validaciones de entrada.
- Tests de servicios y controladores principales.

Criterios de salida:

- No se puede crear una instalacion sin cliente valido.
- Se puede consultar el detalle de un cliente con sus instalaciones.
- Los listados soportan paginacion.
- Los errores de validacion son claros y consistentes.

## 8. Fase 5 - Puertas y equipos

Objetivo: registrar y consultar los activos tecnicos mantenidos por la empresa.

Entregables:

- CRUD de equipos.
- Relacion instalacion-equipos.
- Tipos y estados de equipo.
- Busqueda por instalacion, tipo, estado y numero de serie.
- Desactivacion logica de equipos.
- Pantalla de ficha tecnica del equipo.
- Acceso al historial operativo del equipo.
- Validaciones de integridad.
- Tests de reglas principales.

Criterios de salida:

- No se puede crear un equipo sin instalacion valida.
- Se puede consultar el historico operativo desde el equipo.
- Los equipos desactivados no desaparecen del historico.

## 9. Fase 6 - Intervenciones

Objetivo: gestionar trabajos tecnicos y averias.

Entregables:

- CRUD de intervenciones.
- Asignacion de tecnico.
- Estados de intervencion.
- Prioridades.
- Filtros por cliente, instalacion, equipo, tecnico, estado, prioridad y fechas.
- Cambio controlado de estado.
- Registro de solucion aplicada.
- Pantallas responsive de listado y detalle.
- Tests de cambios de estado y permisos.

Criterios de salida:

- Una intervencion siempre pertenece a cliente e instalacion.
- Si se informa equipo, debe pertenecer a la instalacion indicada.
- Un tecnico solo puede actualizar intervenciones asignadas segun permisos.
- Una intervencion finalizada conserva fecha de cierre y solucion aplicada.

## 10. Fase 7 - Comprobaciones de montaje y mantenimiento

Objetivo: implementar los procesos tecnicos de comprobacion por puerta/equipo.

Entregables:

- Modelo de plantillas de comprobacion.
- Zonas iniciales de puerta.
- Comprobaciones de montaje.
- Comprobaciones de mantenimiento.
- Estados de comprobacion.
- Estados por zona: correcto, pendiente, revisar y averia.
- Observaciones por zona.
- Registro de tecnico y fecha/hora.
- Validacion o firma si procede.
- Permisos especificos sobre comprobaciones.
- Tests de reglas de comprobacion.

Criterios de salida:

- Cada comprobacion pertenece a una puerta/equipo.
- Cada puerta/equipo conserva su propio historial de checks.
- Cada zona es unica dentro de una comprobacion.
- Solo usuarios autorizados pueden consultar o modificar comprobaciones.

## 11. Fase 8 - Checklist visual interactivo

Objetivo: ofrecer una experiencia visual diferencial para tecnicos.

Entregables:

- Esquema visual inicial de puerta.
- Zonas pulsables sobre el esquema.
- Apertura de comprobacion al pulsar una zona.
- Indicadores visuales de estado por zona.
- Formulario responsive para estado, observaciones, fotos, fecha y tecnico.
- Subida de fotografias por zona.
- Vista de historial de checks por equipo.
- Tests de componentes criticos.

Criterios de salida:

- El checklist se puede usar en movil, tablet y escritorio.
- Pulsar una parte de la puerta abre la comprobacion correspondiente.
- El estado visual de cada zona refleja los datos guardados.
- Las fotografias quedan asociadas a la zona correcta.

## 12. Fase 9 - Dashboard y experiencia operativa

Objetivo: ofrecer una vision operativa inicial del sistema.

Entregables:

- Endpoint `/api/v1/dashboard/summary`.
- Conteo de clientes activos.
- Conteo de instalaciones activas.
- Conteo de equipos activos.
- Conteo de intervenciones pendientes y urgentes.
- Conteo de comprobaciones pendientes.
- Conteo de checks con averia o a revisar.
- Ultimas intervenciones y comprobaciones registradas.
- Dashboard responsive.
- Tests de agregacion basica.

Criterios de salida:

- El dashboard responde rapidamente con datos agregados.
- La informacion respeta permisos del usuario autenticado.
- Las consultas estan optimizadas con indices adecuados.

## 13. Fase 10 - Docker, demo y portfolio

Objetivo: elevar el proyecto a una presentacion profesional.

Entregables:

- Dockerfile backend.
- Dockerfile frontend.
- Docker Compose completo.
- README completo de ejecucion.
- Documentacion de arquitectura actualizada.
- Coleccion de ejemplos de uso de API.
- Capturas o guia de Swagger.
- Datos semilla para demo.
- Tests de seguridad adicionales.
- Revision de logs y errores.
- Limpieza de codigo y nombres.

Criterios de salida:

- El proyecto puede ejecutarse siguiendo el README.
- La API puede probarse desde Swagger.
- El frontend puede probarse desde navegador.
- Hay datos de ejemplo suficientes para una demo.
- Los tests principales pasan.
- La documentacion explica decisiones tecnicas y de negocio.

## 14. Mejoras futuras

Funcionalidades candidatas tras el MVP:

- Sincronizacion offline parcial para tecnicos.
- Firma digital avanzada de partes.
- Generacion de PDF.
- Notificaciones por email o push.
- Planificador de revisiones recurrentes.
- Calendario de intervenciones.
- Gestion de contratos de mantenimiento.
- Gestion de materiales y stock.
- Facturacion o integracion con ERP.
- Auditoria avanzada.
- Multiempresa o multi-tenant.
- Informes avanzados.

## 15. Orden recomendado de implementacion

1. Base Spring Boot, Docker, PostgreSQL y Flyway.
2. Roles, permisos, usuarios y autenticacion JWT.
3. Base React, TypeScript, Vite, Tailwind CSS y PWA.
4. Clientes.
5. Instalaciones.
6. Equipos.
7. Intervenciones.
8. Comprobaciones de montaje y mantenimiento.
9. Checklist visual interactivo.
10. Dashboard.
11. Tests, documentacion, Docker completo y datos demo.

Este orden reduce riesgos porque primero establece seguridad e infraestructura, despues entidades base y finalmente flujos operativos diferenciales.
