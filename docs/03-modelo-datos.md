# DoorManager Pro - Modelo de datos inicial

## 1. Objetivo

Este documento define el modelo de datos inicial para el MVP de DoorManager Pro. El objetivo es disponer de una estructura relacional clara, normalizada y preparada para evolucionar sin comprometer mantenibilidad ni trazabilidad.

La base de datos prevista es PostgreSQL, gestionada mediante migraciones Flyway y accedida desde Spring Data JPA.

## 2. Principios de modelado

- Identificadores tecnicos simples y estables.
- Relaciones explicitas mediante claves foraneas.
- Restricciones de integridad a nivel de base de datos.
- Eliminacion logica en entidades de negocio relevantes.
- Campos de auditoria basicos.
- Enumeraciones controladas desde la aplicacion.
- Indices en claves foraneas y filtros frecuentes.
- Nombres consistentes y orientados a negocio.

## 3. Entidades principales

Entidades del MVP:

- users
- roles
- customers
- installations
- equipment
- interventions
- reviews

Entidades auxiliares futuras posibles:

- permissions
- audit_logs
- documents
- intervention_photos
- maintenance_contracts
- notifications

## 4. Tabla users

Representa usuarios internos de la aplicacion.

Campos propuestos:

| Campo | Tipo | Restricciones | Descripcion |
| --- | --- | --- | --- |
| id | UUID | PK | Identificador unico |
| first_name | VARCHAR(100) | NOT NULL | Nombre |
| last_name | VARCHAR(150) | NOT NULL | Apellidos |
| email | VARCHAR(180) | NOT NULL, UNIQUE | Email de acceso |
| password_hash | VARCHAR(255) | NOT NULL | Password cifrado |
| role_id | UUID | FK roles(id), NOT NULL | Rol asignado |
| active | BOOLEAN | NOT NULL | Estado del usuario |
| last_login_at | TIMESTAMP WITH TIME ZONE | NULL | Ultimo acceso |
| created_at | TIMESTAMP WITH TIME ZONE | NOT NULL | Fecha de creacion |
| updated_at | TIMESTAMP WITH TIME ZONE | NOT NULL | Fecha de actualizacion |

Indices recomendados:

- users_email_unique sobre email.
- idx_users_role_id sobre role_id.
- idx_users_active sobre active.

## 5. Tabla roles

Representa roles funcionales del sistema.

Campos propuestos:

| Campo | Tipo | Restricciones | Descripcion |
| --- | --- | --- | --- |
| id | UUID | PK | Identificador unico |
| name | VARCHAR(50) | NOT NULL, UNIQUE | Nombre tecnico del rol |
| description | VARCHAR(255) | NULL | Descripcion funcional |
| created_at | TIMESTAMP WITH TIME ZONE | NOT NULL | Fecha de creacion |
| updated_at | TIMESTAMP WITH TIME ZONE | NOT NULL | Fecha de actualizacion |

Valores iniciales:

- ADMIN
- RESPONSABLE_TECNICO
- TECNICO
- CONSULTA

## 6. Tabla customers

Representa clientes de la empresa instaladora o mantenedora.

Campos propuestos:

| Campo | Tipo | Restricciones | Descripcion |
| --- | --- | --- | --- |
| id | UUID | PK | Identificador unico |
| business_name | VARCHAR(180) | NOT NULL | Razon social o nombre comercial |
| tax_id | VARCHAR(30) | UNIQUE | CIF/NIF |
| contact_name | VARCHAR(150) | NULL | Persona de contacto |
| phone | VARCHAR(30) | NULL | Telefono principal |
| email | VARCHAR(180) | NULL | Email de contacto |
| fiscal_address | VARCHAR(255) | NULL | Direccion fiscal |
| notes | TEXT | NULL | Observaciones |
| active | BOOLEAN | NOT NULL | Estado activo/inactivo |
| created_at | TIMESTAMP WITH TIME ZONE | NOT NULL | Fecha de creacion |
| updated_at | TIMESTAMP WITH TIME ZONE | NOT NULL | Fecha de actualizacion |

Indices recomendados:

- idx_customers_business_name sobre business_name.
- idx_customers_tax_id sobre tax_id.
- idx_customers_active sobre active.

## 7. Tabla installations

Representa ubicaciones fisicas donde existen puertas o equipos.

Campos propuestos:

| Campo | Tipo | Restricciones | Descripcion |
| --- | --- | --- | --- |
| id | UUID | PK | Identificador unico |
| customer_id | UUID | FK customers(id), NOT NULL | Cliente propietario |
| name | VARCHAR(180) | NOT NULL | Nombre o referencia de instalacion |
| address | VARCHAR(255) | NOT NULL | Direccion |
| city | VARCHAR(120) | NOT NULL | Localidad |
| province | VARCHAR(120) | NULL | Provincia |
| postal_code | VARCHAR(20) | NULL | Codigo postal |
| contact_name | VARCHAR(150) | NULL | Contacto en ubicacion |
| contact_phone | VARCHAR(30) | NULL | Telefono en ubicacion |
| operational_status | VARCHAR(50) | NOT NULL | Estado operativo |
| notes | TEXT | NULL | Observaciones |
| active | BOOLEAN | NOT NULL | Estado activo/inactivo |
| created_at | TIMESTAMP WITH TIME ZONE | NOT NULL | Fecha de creacion |
| updated_at | TIMESTAMP WITH TIME ZONE | NOT NULL | Fecha de actualizacion |

Estados operativos iniciales:

- OPERATIVA
- CON_INCIDENCIAS
- FUERA_DE_SERVICIO
- PENDIENTE_REVISION

Indices recomendados:

- idx_installations_customer_id sobre customer_id.
- idx_installations_city sobre city.
- idx_installations_operational_status sobre operational_status.
- idx_installations_active sobre active.

## 8. Tabla equipment

Representa puertas automaticas y equipos asociados.

Campos propuestos:

| Campo | Tipo | Restricciones | Descripcion |
| --- | --- | --- | --- |
| id | UUID | PK | Identificador unico |
| installation_id | UUID | FK installations(id), NOT NULL | Instalacion asociada |
| type | VARCHAR(50) | NOT NULL | Tipo de equipo |
| brand | VARCHAR(100) | NULL | Marca |
| model | VARCHAR(100) | NULL | Modelo |
| serial_number | VARCHAR(120) | NULL | Numero de serie |
| installation_date | DATE | NULL | Fecha de instalacion |
| operational_status | VARCHAR(50) | NOT NULL | Estado operativo |
| location_description | VARCHAR(255) | NULL | Ubicacion dentro de la instalacion |
| technical_notes | TEXT | NULL | Observaciones tecnicas |
| active | BOOLEAN | NOT NULL | Estado activo/inactivo |
| created_at | TIMESTAMP WITH TIME ZONE | NOT NULL | Fecha de creacion |
| updated_at | TIMESTAMP WITH TIME ZONE | NOT NULL | Fecha de actualizacion |

Tipos iniciales:

- PUERTA_CORREDERA
- PUERTA_BATIENTE
- PUERTA_SECCIONAL
- PUERTA_ENROLLABLE
- BARRERA_AUTOMATICA
- PERSIANA_AUTOMATICA
- OTRO

Indices recomendados:

- idx_equipment_installation_id sobre installation_id.
- idx_equipment_type sobre type.
- idx_equipment_serial_number sobre serial_number.
- idx_equipment_operational_status sobre operational_status.
- idx_equipment_active sobre active.

## 9. Tabla interventions

Representa trabajos tecnicos, averias, mantenimientos o instalaciones.

Campos propuestos:

| Campo | Tipo | Restricciones | Descripcion |
| --- | --- | --- | --- |
| id | UUID | PK | Identificador unico |
| customer_id | UUID | FK customers(id), NOT NULL | Cliente asociado |
| installation_id | UUID | FK installations(id), NOT NULL | Instalacion asociada |
| equipment_id | UUID | FK equipment(id), NULL | Equipo asociado |
| assigned_user_id | UUID | FK users(id), NULL | Tecnico asignado |
| type | VARCHAR(50) | NOT NULL | Tipo de intervencion |
| priority | VARCHAR(50) | NOT NULL | Prioridad |
| status | VARCHAR(50) | NOT NULL | Estado |
| request_date | TIMESTAMP WITH TIME ZONE | NOT NULL | Fecha de solicitud |
| scheduled_date | TIMESTAMP WITH TIME ZONE | NULL | Fecha planificada |
| started_at | TIMESTAMP WITH TIME ZONE | NULL | Inicio real |
| finished_at | TIMESTAMP WITH TIME ZONE | NULL | Finalizacion |
| description | TEXT | NOT NULL | Descripcion del trabajo |
| resolution | TEXT | NULL | Solucion aplicada |
| internal_notes | TEXT | NULL | Observaciones internas |
| created_at | TIMESTAMP WITH TIME ZONE | NOT NULL | Fecha de creacion |
| updated_at | TIMESTAMP WITH TIME ZONE | NOT NULL | Fecha de actualizacion |

Tipos iniciales:

- AVERIA
- MANTENIMIENTO_CORRECTIVO
- MANTENIMIENTO_PREVENTIVO
- INSTALACION
- PUESTA_EN_MARCHA
- INSPECCION
- OTRO

Prioridades iniciales:

- BAJA
- MEDIA
- ALTA
- URGENTE

Estados iniciales:

- PENDIENTE
- ASIGNADA
- EN_CURSO
- FINALIZADA
- CANCELADA

Indices recomendados:

- idx_interventions_customer_id sobre customer_id.
- idx_interventions_installation_id sobre installation_id.
- idx_interventions_equipment_id sobre equipment_id.
- idx_interventions_assigned_user_id sobre assigned_user_id.
- idx_interventions_status sobre status.
- idx_interventions_priority sobre priority.
- idx_interventions_scheduled_date sobre scheduled_date.

## 10. Tabla reviews

Representa revisiones periodicas de equipos o instalaciones.

Campos propuestos:

| Campo | Tipo | Restricciones | Descripcion |
| --- | --- | --- | --- |
| id | UUID | PK | Identificador unico |
| customer_id | UUID | FK customers(id), NOT NULL | Cliente asociado |
| installation_id | UUID | FK installations(id), NOT NULL | Instalacion asociada |
| equipment_id | UUID | FK equipment(id), NOT NULL | Equipo revisado |
| assigned_user_id | UUID | FK users(id), NULL | Tecnico asignado |
| scheduled_date | DATE | NOT NULL | Fecha prevista |
| completed_date | DATE | NULL | Fecha realizada |
| status | VARCHAR(50) | NOT NULL | Estado |
| result | VARCHAR(50) | NULL | Resultado |
| observations | TEXT | NULL | Observaciones |
| next_recommended_date | DATE | NULL | Proxima fecha recomendada |
| created_at | TIMESTAMP WITH TIME ZONE | NOT NULL | Fecha de creacion |
| updated_at | TIMESTAMP WITH TIME ZONE | NOT NULL | Fecha de actualizacion |

Estados iniciales:

- PROGRAMADA
- PENDIENTE
- REALIZADA
- VENCIDA
- CANCELADA

Resultados iniciales:

- CORRECTA
- CORRECTA_CON_OBSERVACIONES
- REQUIERE_INTERVENCION
- NO_REALIZADA

Indices recomendados:

- idx_reviews_customer_id sobre customer_id.
- idx_reviews_installation_id sobre installation_id.
- idx_reviews_equipment_id sobre equipment_id.
- idx_reviews_assigned_user_id sobre assigned_user_id.
- idx_reviews_status sobre status.
- idx_reviews_scheduled_date sobre scheduled_date.

## 11. Relaciones principales

- Un cliente puede tener muchas instalaciones.
- Una instalacion pertenece a un cliente.
- Una instalacion puede tener muchos equipos.
- Un equipo pertenece a una instalacion.
- Una intervencion pertenece a un cliente y a una instalacion.
- Una intervencion puede estar asociada a un equipo concreto.
- Una intervencion puede tener un tecnico asignado.
- Una revision pertenece a un cliente, instalacion y equipo.
- Una revision puede tener un tecnico asignado.
- Un usuario pertenece a un rol.

## 12. Reglas de integridad

- No debe existir una instalacion sin cliente.
- No debe existir un equipo sin instalacion.
- No debe existir una revision sin equipo.
- Una intervencion debe estar asociada siempre a cliente e instalacion.
- El equipo de una intervencion debe pertenecer a la instalacion indicada.
- El equipo de una revision debe pertenecer a la instalacion indicada.
- El cliente asociado a intervenciones y revisiones debe coincidir con el cliente de la instalacion.
- Los emails de usuarios deben ser unicos.
- El CIF/NIF de clientes debe ser unico cuando se informe.

## 13. Auditoria tecnica

Campos recomendados para entidades principales:

- created_at
- updated_at
- created_by
- updated_by

Para el MVP se consideran obligatorios `created_at` y `updated_at`. Los campos `created_by` y `updated_by` se recomiendan si no incrementan excesivamente la complejidad inicial.

## 14. Estrategia con Flyway

Migraciones iniciales sugeridas:

- V1__create_roles_table.sql
- V2__create_users_table.sql
- V3__create_customers_table.sql
- V4__create_installations_table.sql
- V5__create_equipment_table.sql
- V6__create_interventions_table.sql
- V7__create_reviews_table.sql
- V8__insert_initial_roles.sql

Las migraciones deben ser incrementales, revisables y no destructivas siempre que sea posible.
