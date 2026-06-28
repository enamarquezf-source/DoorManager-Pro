# DoorManager Pro - Modelo de datos inicial

## 1. Objetivo

Este documento define el modelo de datos inicial para DoorManager Pro como plataforma web centralizada. El objetivo es disponer de una estructura relacional clara, normalizada y preparada para gestionar clientes, instalaciones, puertas/equipos, usuarios, roles, permisos, intervenciones y comprobaciones tecnicas con historial por equipo.

La base de datos prevista es PostgreSQL, gestionada mediante migraciones Flyway y accedida desde Spring Data JPA.

## 2. Principios de modelado

- Identificadores tecnicos simples y estables.
- Relaciones explicitas mediante claves foraneas.
- Restricciones de integridad a nivel de base de datos.
- Eliminacion logica en entidades de negocio relevantes.
- Campos de auditoria basicos.
- Enumeraciones controladas desde la aplicacion.
- Indices en claves foraneas y filtros frecuentes.
- Historial por puerta/equipo.
- Unicidad de checks por equipo, tipo de comprobacion y zona cuando aplique.
- Nombres consistentes y orientados a negocio.

## 3. Entidades principales

Entidades del MVP:

- users.
- roles.
- permissions.
- role_permissions.
- customers.
- installations.
- equipment.
- interventions.
- inspection_templates.
- inspection_template_zones.
- inspections.
- inspection_items.
- inspection_photos.

Entidades auxiliares futuras posibles:

- audit_logs.
- documents.
- maintenance_contracts.
- notifications.
- signatures.

## 4. Tabla users

Representa usuarios internos de la plataforma.

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

| Campo | Tipo | Restricciones | Descripcion |
| --- | --- | --- | --- |
| id | UUID | PK | Identificador unico |
| name | VARCHAR(50) | NOT NULL, UNIQUE | Nombre tecnico del rol |
| description | VARCHAR(255) | NULL | Descripcion funcional |
| created_at | TIMESTAMP WITH TIME ZONE | NOT NULL | Fecha de creacion |
| updated_at | TIMESTAMP WITH TIME ZONE | NOT NULL | Fecha de actualizacion |

Valores iniciales:

- ADMIN.
- RESPONSABLE_TECNICO.
- TECNICO.
- CONSULTA.

## 6. Tabla permissions

Representa permisos atomicos de la plataforma.

| Campo | Tipo | Restricciones | Descripcion |
| --- | --- | --- | --- |
| id | UUID | PK | Identificador unico |
| code | VARCHAR(100) | NOT NULL, UNIQUE | Codigo tecnico del permiso |
| description | VARCHAR(255) | NULL | Descripcion funcional |
| created_at | TIMESTAMP WITH TIME ZONE | NOT NULL | Fecha de creacion |
| updated_at | TIMESTAMP WITH TIME ZONE | NOT NULL | Fecha de actualizacion |

Permisos iniciales candidatos:

- USERS_MANAGE.
- CUSTOMERS_READ.
- CUSTOMERS_WRITE.
- EQUIPMENT_READ.
- EQUIPMENT_WRITE.
- INTERVENTIONS_READ.
- INTERVENTIONS_WRITE.
- INSPECTIONS_READ.
- INSPECTIONS_WRITE.
- INSPECTIONS_VALIDATE.
- PHOTOS_UPLOAD.

## 7. Tabla role_permissions

Relaciona roles con permisos.

| Campo | Tipo | Restricciones | Descripcion |
| --- | --- | --- | --- |
| role_id | UUID | PK, FK roles(id) | Rol |
| permission_id | UUID | PK, FK permissions(id) | Permiso |

## 8. Tabla customers

Representa clientes de la empresa instaladora o mantenedora.

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

## 9. Tabla installations

Representa ubicaciones fisicas donde existen puertas o equipos.

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

- OPERATIVA.
- CON_INCIDENCIAS.
- FUERA_DE_SERVICIO.
- PENDIENTE_REVISION.

## 10. Tabla equipment

Representa puertas automaticas y equipos asociados.

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

- PUERTA_CORREDERA.
- PUERTA_BATIENTE.
- PUERTA_SECCIONAL.
- PUERTA_ENROLLABLE.
- BARRERA_AUTOMATICA.
- PERSIANA_AUTOMATICA.
- OTRO.

## 11. Tabla interventions

Representa trabajos tecnicos, averias, mantenimientos o instalaciones.

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

## 12. Tabla inspection_templates

Representa plantillas de comprobacion reutilizables por tipo de equipo y tipo de proceso.

| Campo | Tipo | Restricciones | Descripcion |
| --- | --- | --- | --- |
| id | UUID | PK | Identificador unico |
| name | VARCHAR(150) | NOT NULL | Nombre de plantilla |
| equipment_type | VARCHAR(50) | NOT NULL | Tipo de equipo al que aplica |
| inspection_type | VARCHAR(50) | NOT NULL | MONTAJE o MANTENIMIENTO |
| active | BOOLEAN | NOT NULL | Estado activo/inactivo |
| created_at | TIMESTAMP WITH TIME ZONE | NOT NULL | Fecha de creacion |
| updated_at | TIMESTAMP WITH TIME ZONE | NOT NULL | Fecha de actualizacion |

## 13. Tabla inspection_template_zones

Representa zonas interactivas definidas en una plantilla.

| Campo | Tipo | Restricciones | Descripcion |
| --- | --- | --- | --- |
| id | UUID | PK | Identificador unico |
| template_id | UUID | FK inspection_templates(id), NOT NULL | Plantilla asociada |
| zone_code | VARCHAR(80) | NOT NULL | Codigo tecnico de zona |
| label | VARCHAR(120) | NOT NULL | Etiqueta visible |
| description | TEXT | NULL | Descripcion de comprobacion |
| display_order | INTEGER | NOT NULL | Orden visual |
| active | BOOLEAN | NOT NULL | Estado activo/inactivo |

Zonas iniciales:

- MOTOR.
- CUADRO_MANIOBRA.
- FOTOCELULAS.
- GUIAS.
- HOJAS_MOVILES.
- RADAR_DETECTOR.
- SELECTOR_FUNCIONES.
- BATERIA.
- FINALES_CARRERA.
- SISTEMA_ANTIAPLASTAMIENTO.
- CERRADURA_DESBLOQUEO_MANUAL.

Restriccion recomendada:

- UNIQUE(template_id, zone_code).

## 14. Tabla inspections

Representa una comprobacion concreta realizada o planificada sobre una puerta/equipo.

| Campo | Tipo | Restricciones | Descripcion |
| --- | --- | --- | --- |
| id | UUID | PK | Identificador unico |
| equipment_id | UUID | FK equipment(id), NOT NULL | Puerta/equipo comprobado |
| template_id | UUID | FK inspection_templates(id), NOT NULL | Plantilla usada |
| intervention_id | UUID | FK interventions(id), NULL | Intervencion relacionada |
| assigned_user_id | UUID | FK users(id), NULL | Tecnico asignado |
| type | VARCHAR(50) | NOT NULL | MONTAJE o MANTENIMIENTO |
| status | VARCHAR(50) | NOT NULL | Estado general |
| scheduled_at | TIMESTAMP WITH TIME ZONE | NULL | Fecha planificada |
| started_at | TIMESTAMP WITH TIME ZONE | NULL | Inicio real |
| completed_at | TIMESTAMP WITH TIME ZONE | NULL | Finalizacion |
| validated_by_user_id | UUID | FK users(id), NULL | Usuario validador |
| validated_at | TIMESTAMP WITH TIME ZONE | NULL | Fecha de validacion |
| general_observations | TEXT | NULL | Observaciones generales |
| created_at | TIMESTAMP WITH TIME ZONE | NOT NULL | Fecha de creacion |
| updated_at | TIMESTAMP WITH TIME ZONE | NOT NULL | Fecha de actualizacion |

Estados iniciales:

- PENDIENTE.
- EN_CURSO.
- FINALIZADA.
- VALIDADA.
- CANCELADA.

Indices recomendados:

- idx_inspections_equipment_id sobre equipment_id.
- idx_inspections_assigned_user_id sobre assigned_user_id.
- idx_inspections_type sobre type.
- idx_inspections_status sobre status.
- idx_inspections_scheduled_at sobre scheduled_at.

## 15. Tabla inspection_items

Representa el resultado de comprobar una zona concreta de la puerta.

| Campo | Tipo | Restricciones | Descripcion |
| --- | --- | --- | --- |
| id | UUID | PK | Identificador unico |
| inspection_id | UUID | FK inspections(id), NOT NULL | Comprobacion asociada |
| zone_code | VARCHAR(80) | NOT NULL | Zona comprobada |
| status | VARCHAR(50) | NOT NULL | Estado de la zona |
| observations | TEXT | NULL | Observaciones |
| checked_at | TIMESTAMP WITH TIME ZONE | NULL | Fecha y hora de comprobacion |
| checked_by_user_id | UUID | FK users(id), NULL | Tecnico responsable |
| validation_required | BOOLEAN | NOT NULL | Indica si requiere validacion |
| validated_by_user_id | UUID | FK users(id), NULL | Usuario validador |
| validated_at | TIMESTAMP WITH TIME ZONE | NULL | Fecha de validacion |
| created_at | TIMESTAMP WITH TIME ZONE | NOT NULL | Fecha de creacion |
| updated_at | TIMESTAMP WITH TIME ZONE | NOT NULL | Fecha de actualizacion |

Estados por zona:

- CORRECTO.
- PENDIENTE.
- REVISAR.
- AVERIA.

Restriccion recomendada:

- UNIQUE(inspection_id, zone_code).

## 16. Tabla inspection_photos

Representa fotografias adjuntas a una zona comprobada.

| Campo | Tipo | Restricciones | Descripcion |
| --- | --- | --- | --- |
| id | UUID | PK | Identificador unico |
| inspection_item_id | UUID | FK inspection_items(id), NOT NULL | Zona comprobada asociada |
| file_name | VARCHAR(255) | NOT NULL | Nombre original o normalizado |
| content_type | VARCHAR(100) | NOT NULL | Tipo MIME |
| storage_path | VARCHAR(500) | NOT NULL | Ruta o clave de almacenamiento |
| size_bytes | BIGINT | NOT NULL | Tamano del archivo |
| uploaded_by_user_id | UUID | FK users(id), NOT NULL | Usuario que sube la foto |
| uploaded_at | TIMESTAMP WITH TIME ZONE | NOT NULL | Fecha de subida |

## 17. Relaciones principales

- Un cliente puede tener muchas instalaciones.
- Una instalacion pertenece a un cliente.
- Una instalacion puede tener muchos equipos.
- Un equipo pertenece a una instalacion.
- Una intervencion pertenece a un cliente y a una instalacion.
- Una intervencion puede estar asociada a un equipo concreto.
- Una comprobacion pertenece siempre a un equipo concreto.
- Una comprobacion puede estar asociada a una intervencion.
- Una comprobacion contiene muchos items de zona.
- Cada item representa una zona unica dentro de una comprobacion.
- Cada item puede tener cero o muchas fotografias.
- Un usuario pertenece a un rol.
- Un rol tiene muchos permisos.

## 18. Reglas de integridad

- No debe existir una instalacion sin cliente.
- No debe existir un equipo sin instalacion.
- No debe existir una comprobacion sin equipo.
- Una intervencion debe estar asociada siempre a cliente e instalacion.
- El equipo de una intervencion debe pertenecer a la instalacion indicada.
- El equipo de una comprobacion debe pertenecer a una instalacion existente.
- Cada zona debe ser unica dentro de una misma comprobacion.
- Las fotografias deben pertenecer a un item de comprobacion existente.
- Los emails de usuarios deben ser unicos.
- El CIF/NIF de clientes debe ser unico cuando se informe.

## 19. Auditoria tecnica

Campos recomendados para entidades principales:

- created_at.
- updated_at.
- created_by.
- updated_by.

Para el MVP se consideran obligatorios `created_at` y `updated_at`. Los campos `created_by` y `updated_by` se recomiendan si no incrementan excesivamente la complejidad inicial.

## 20. Estrategia con Flyway

Migraciones iniciales sugeridas:

- V1__create_roles_and_permissions.sql.
- V2__create_users_table.sql.
- V3__create_customers_table.sql.
- V4__create_installations_table.sql.
- V5__create_equipment_table.sql.
- V6__create_interventions_table.sql.
- V7__create_inspection_templates.sql.
- V8__create_inspections_tables.sql.
- V9__insert_initial_roles_permissions.sql.
- V10__insert_initial_inspection_template_zones.sql.

Las migraciones deben ser incrementales, revisables y no destructivas siempre que sea posible.
