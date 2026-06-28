# DoorManager Pro - Modelo de datos conceptual

| Campo | Valor |
| --- | --- |
| Version | 0.3 |
| Estado | Conceptual |
| Fecha | 2026-06-28 |
| Autor | Francisco Javier Ena Marquez |
| Ultima modificacion | 2026-06-28 |

## Indice

Este documento mantiene la numeracion de modelo conceptual. Debe evolucionar con la taxonomia tecnica y Gemelo Digital definidos en `docs/KNOWLEDGE_BASE/`.

## Referencias cruzadas

- `docs/PRODUCT_BIBLE.md`.
- `docs/KNOWLEDGE_BASE/README.md`.
- `docs/KNOWLEDGE_BASE/10_DIGITAL_TWIN.md`.

## Proximos desarrollos

- Derivar entidades v0.4 para Grupo de Carga, Posicion Fisica y Knowledge Base.
- Crear diagrama ER conceptual.

## 1. Objetivo

Definir una base de datos robusta con PostgreSQL para DoorManager Pro, preparada para operativa empresarial, offline-first, auditoria, seguridad, documentos, partes, presupuestos, facturacion, proveedores, stock y backups.

## 2. Principios de base de datos

- UUID en entidades criticas y sincronizables.
- Claves primarias en todas las tablas.
- Claves foraneas para integridad referencial.
- Indices en busquedas frecuentes y claves foraneas.
- Restricciones de unicidad donde aplique.
- Campos de auditoria.
- Borrado logico en entidades de negocio.
- Control de versiones para sincronizacion offline.
- Separacion entre metadatos de archivos y binarios.
- Migraciones versionadas con Flyway.

Campos comunes recomendados:

- id UUID PRIMARY KEY.
- created_at.
- updated_at.
- created_by_user_id.
- updated_by_user_id.
- deleted_at cuando aplique.
- active o deleted boolean cuando aplique.
- version BIGINT para entidades sincronizables.

## 3. Seguridad y usuarios

Tablas:

- users.
- roles.
- permissions.
- role_permissions.
- user_sessions.
- audit_logs.

Relaciones:

- Un usuario tiene rol principal.
- Un rol tiene muchos permisos.
- La auditoria referencia usuario y recurso afectado.

Indices:

- users.email UNIQUE.
- roles.name UNIQUE.
- permissions.code UNIQUE.
- audit_logs.created_at.
- audit_logs.entity_type, audit_logs.entity_id.

## 4. Clientes y contactos

Tablas:

- customers.
- customer_contacts.
- addresses.
- customer_addresses.

Campos clave de customers:

- tipo: PARTICULAR, EMPRESA, COMUNIDAD, ADMINISTRADOR_FINCAS.
- business_name.
- tax_id.
- email.
- phone.
- billing_notes.
- rgpd_consent_reference cuando aplique.

Reglas:

- Un cliente puede tener varios contactos.
- Un cliente puede tener varias direcciones.
- Una direccion puede ser fiscal, instalacion, envio o contacto.

## 5. Instalaciones y puertas

Tablas:

- installations.
- doors.
- door_types.
- door_components.
- door_component_instances.
- door_history_events.

doors debe incluir:

- installation_id.
- door_type_id.
- code.
- brand.
- model.
- serial_number.
- operational_status.
- installation_date.
- version.

door_components define componentes tipo: motor, guias, muelles, fotocelulas, finales de carrera, cerradura, cuadro, bandas, radar, semaforos.

## 6. Documentos, manuales, fotos y firmas

Tablas:

- manuals.
- documents.
- photos.
- signatures.
- file_assets.

file_assets debe guardar:

- storage_provider.
- storage_key.
- file_name.
- content_type.
- size_bytes.
- checksum.
- encrypted.
- uploaded_by_user_id.
- uploaded_at.

Regla:

- Las tablas funcionales referencian file_assets para no duplicar metadatos.

## 7. Tecnicos y equipos de trabajo

Tablas:

- technicians.
- work_teams.
- work_team_members.
- team_status_logs.

Requisitos:

- Un tecnico esta vinculado a un usuario.
- Un equipo puede tener varios tecnicos.
- El dashboard debe consultar estado actual e historico de equipos.

## 8. Proveedores, materiales y stock

Tablas:

- suppliers.
- supplier_contacts.
- supplier_brands.
- materials.
- supplier_material_rates.
- stock_locations.
- stock_movements.
- purchase_orders.
- purchase_order_lines.
- supplier_delivery_notes.
- supplier_invoices.

Relaciones:

- Un proveedor suministra materiales.
- Un material puede tener varias tarifas por proveedor.
- Los movimientos de stock reflejan entradas, salidas, ajustes y uso en partes.

## 9. Avisos e incidencias

Tablas:

- service_requests.
- incidents.
- public_leads.

service_requests puede originarse desde:

- Oficina.
- Tecnico.
- Web publica.
- Cliente existente.

Puede convertirse en:

- Cliente.
- Aviso.
- Presupuesto.
- Parte de trabajo.

## 10. Presupuestos

Tablas:

- quotes.
- quote_lines.
- quote_status_history.

quotes debe incluir:

- customer_id.
- installation_id opcional.
- door_id opcional.
- created_by_user_id.
- type.
- status.
- valid_until.
- subtotal.
- tax_amount.
- total.

quote_lines debe incluir:

- description.
- quantity.
- unit_price.
- discount.
- tax_rate.
- total.

## 11. Partes de trabajo

Tablas:

- work_orders.
- work_order_time_entries.
- work_order_travel_expenses.
- work_order_materials.
- work_order_photos.
- work_order_status_history.
- work_order_corrections.

work_orders debe incluir:

- type.
- status.
- customer_id.
- installation_id.
- door_id.
- quote_id opcional.
- assigned_user_id.
- assigned_team_id.
- loaded_on_mobile_at.
- sent_by_technician_at.
- office_validation_status.
- version.

## 12. Validacion de oficina

Tablas:

- office_validations.
- office_validation_items.
- office_validation_comments.

Debe permitir validar:

- Horas.
- Desplazamiento.
- Materiales.
- Fotos.
- Firma.
- Observaciones.
- Facturable/no facturable.
- Garantia.
- Pendiente de presupuesto.
- Pendiente de segunda visita.

## 13. Facturacion

Tablas:

- invoices.
- invoice_lines.
- invoice_status_history.
- invoice_work_orders.
- invoice_quotes.

Estados:

- PENDIENTE.
- EMITIDA.
- PAGADA.
- VENCIDA.
- ANULADA.

Relaciones:

- Una factura puede venir de uno o varios partes validados.
- Una factura puede referenciar presupuesto.
- Las lineas pueden representar horas, desplazamiento, materiales o conceptos libres.

## 14. Checklist interactivo

Tablas:

- checklist_templates.
- checklist_template_components.
- checklist_runs.
- checklist_responses.

Requisitos:

- Plantillas por tipo de puerta.
- Componentes clicables.
- Respuestas con estado, observaciones, fotos, firma e historial.
- Version para sincronizacion offline.

## 15. Offline-first

Tablas:

- sync_batches.
- sync_events.
- device_registrations.
- offline_payload_logs.
- sync_conflicts.

Requisitos:

- Registrar cargas de trabajos.
- Registrar envios de trabajos.
- Evitar duplicados por UUID.
- Detectar conflictos por version.
- Auditar resultado de cada sincronizacion.

## 16. Backups

Tablas:

- backup_jobs.
- backup_runs.
- backup_restore_tests.

backup_runs debe incluir:

- type: DATABASE, FILES, FULL.
- status.
- started_at.
- finished_at.
- storage_location.
- encrypted.
- checksum.
- error_message.

## 17. Indices recomendados

- Claves foraneas de todas las relaciones.
- customers.tax_id.
- customers.business_name.
- doors.installation_id.
- doors.serial_number.
- work_orders.status.
- work_orders.assigned_user_id.
- work_orders.door_id.
- quotes.status.
- invoices.status.
- sync_batches.user_id, sync_batches.status.
- audit_logs.created_at.

## 18. Reglas criticas

- No existe instalacion sin cliente.
- No existe puerta sin instalacion.
- No existe parte sin cliente y tipo.
- No se factura un parte no validado salvo permiso excepcional.
- No se elimina fisicamente historico tecnico, fiscal o de auditoria sin proceso definido.
- Los archivos deben tener metadatos y control de acceso.
- Las entidades offline deben tener UUID y version.
