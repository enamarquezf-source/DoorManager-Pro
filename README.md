# DoorManager Pro

DoorManager Pro es una plataforma web profesional para empresas de instalacion y mantenimiento de puertas automaticas.

El proyecto deja de plantearse como una aplicacion de escritorio Java Swing y pasa a definirse como una solucion web responsive/PWA, accesible desde ordenador, movil y tablet, con datos centralizados y control de acceso por usuarios, roles y permisos.

## Objetivo

Construir una aplicacion realista, mantenible y presentable como portfolio profesional que permita gestionar clientes, instalaciones, puertas/equipos, intervenciones, comprobaciones de montaje, comprobaciones de mantenimiento e historiales tecnicos por equipo.

La plataforma debe facilitar el trabajo de oficina, responsables tecnicos y tecnicos de campo desde cualquier dispositivo compatible con navegador moderno.

## Vision del producto

- Plataforma web responsive para escritorio, movil y tablet.
- PWA instalable visualmente en movil y escritorio.
- Backend centralizado con API REST segura.
- Base de datos PostgreSQL unica y compartida por todos los dispositivos.
- Gestion de usuarios, roles y permisos.
- Checklist visual e interactivo por puerta/equipo.
- Historial unico de comprobaciones por cada puerta.
- Documentacion tecnica mediante Swagger/OpenAPI.
- Despliegue reproducible con Docker.

## Funcionalidades previstas

### Modulos principales

- Gestion de clientes.
- Gestion de instalaciones por cliente.
- Gestion de puertas automaticas y equipos.
- Gestion de usuarios, roles y permisos.
- Registro de intervenciones tecnicas.
- Modulo de comprobaciones de montaje.
- Modulo de comprobaciones de mantenimiento.
- Checklist visual e interactivo por puerta.
- Historial de checks por puerta/equipo.
- Dashboard operativo responsive.
- Busqueda, filtrado, paginacion y consulta de historicos.

### Checklist interactivo

Cada puerta debe mostrar un dibujo o esquema interactivo. Al pulsar una zona de la puerta, se abrira la comprobacion correspondiente.

Partes iniciales contempladas:

- Motor.
- Cuadro de maniobra.
- Fotocelulas.
- Guias.
- Hoja u hojas moviles.
- Radar o detector.
- Selector de funciones.
- Bateria.
- Finales de carrera.
- Sistema antiaplastamiento.
- Cerradura o desbloqueo manual.

Cada zona comprobada podra registrar:

- Estado: correcto, pendiente, revisar o averia.
- Observaciones.
- Fotografias.
- Fecha y hora.
- Tecnico responsable.
- Firma o validacion si procede.

## Stack tecnologico previsto

### Backend

- Java 21 LTS.
- Spring Boot.
- Spring Web.
- Spring Data JPA.
- Spring Security.
- JWT.
- PostgreSQL.
- Flyway.
- Swagger/OpenAPI.
- JUnit y Mockito.

### Frontend

- React.
- TypeScript.
- Vite.
- Tailwind CSS.
- PWA con manifest, service worker y assets instalables.

### Infraestructura

- Docker.
- Docker Compose.
- Variables de entorno para configuracion y secretos.
- GitHub Actions como mejora futura para CI.

## Arquitectura prevista

```text
Dispositivo web/PWA
  React + TypeScript + Vite + Tailwind CSS
        |
        | HTTPS / JSON / JWT
        v
API REST Spring Boot
  Controllers -> Services -> Repositories -> Entities/DTOs
        |
        v
PostgreSQL centralizado
```

El frontend no debe contener reglas de seguridad criticas. La autorizacion real se aplicara siempre en el backend mediante Spring Security, roles y permisos.

## Seguridad

- Autenticacion con Spring Security y JWT.
- Passwords cifradas con BCrypt.
- Permisos evaluados en backend.
- Roles iniciales: ADMIN, RESPONSABLE_TECNICO, TECNICO y CONSULTA.
- Restriccion de acceso a comprobaciones segun permisos.
- Validacion de datos de entrada.
- DTOs para evitar exponer datos internos.
- Variables de entorno para credenciales y secretos.
- No se subiran secretos al repositorio.

## Estado del proyecto

Proyecto en fase inicial de diseno y planificacion tecnica.

## Roadmap resumido

- [ ] Definir arquitectura web/PWA y documentacion base.
- [ ] Crear backend Spring Boot con Java 21.
- [ ] Configurar PostgreSQL, Flyway y Docker.
- [ ] Implementar seguridad con usuarios, roles, permisos y JWT.
- [ ] Crear API REST documentada con Swagger/OpenAPI.
- [ ] Crear frontend React, TypeScript, Vite y Tailwind CSS.
- [ ] Implementar PWA instalable.
- [ ] Crear modulos de clientes, instalaciones y equipos.
- [ ] Crear modulos de intervenciones y comprobaciones.
- [ ] Implementar checklist visual interactivo por puerta.
- [ ] Anadir tests automatizados y datos demo.
- [ ] Preparar primera release demostrable.

## Autor

Francisco Javier Ena Marquez

Proyecto desarrollado como portfolio profesional dentro del proceso de formacion y especializacion en desarrollo de aplicaciones multiplataforma.
