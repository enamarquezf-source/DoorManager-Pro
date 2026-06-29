# DoorManager Pro - Modelo de datos conceptual

| Campo | Valor |
| --- | --- |
| Version | 0.4 |
| Estado | Conceptual |
| Fecha | 2026-06-28 |
| Autor | Francisco Javier Ena Marquez |
| Ultima modificacion | 2026-06-29 |

## Indice

Este documento mantiene la numeracion de modelo conceptual. Debe evolucionar con la taxonomia tecnica y Gemelo Digital definidos en `docs/KNOWLEDGE_BASE/`.

## Referencias cruzadas

- `docs/PRODUCT_BIBLE.md`.
- `docs/KNOWLEDGE_BASE/README.md`.
- `docs/KNOWLEDGE_BASE/10_DIGITAL_TWIN.md`.
- `docs/OPERATIONS/SUPPLIERS_PURCHASING_AND_STOCK.md`.
- `docs/OPERATIONS/STOCK_RELIABILITY.md`.
- `docs/OPERATIONS/TECHNICAL_HISTORY_AND_SEARCH.md`.
- `docs/REPORTING/EXPORTS_AND_TEMPLATES.md`.
- `docs/PORTALS/CLIENT_PORTAL.md`.

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

Entidades conceptuales:

- suppliers.
- supplier_contacts.
- supplier_product_references.
- materials.
- supplier_material_rates.
- warehouses.
- stock_locations.
- vehicle_stock_locations.
- stock_movements.
- stock_reservations.
- stock_counts.
- stock_discrepancies.
- stock_reliability_scores.
- replenishment_needs.
- replenishment_need_lines.
- purchase_orders.
- purchase_order_lines.
- supplier_confirmations.
- goods_receipts.
- goods_receipt_lines.
- supplier_invoices.
- supplier_invoice_lines.
- external_cost_allocations.
- purchase_proposals.
- purchase_proposal_lines.
- supplier_returns.
- serialized_stock_units.
- quantity_stock_items.

Relaciones:

- Un proveedor suministra materiales.
- Un material puede tener varias tarifas por proveedor.
- Los movimientos de stock reflejan entradas, salidas, ajustes y uso en partes.
- Una factura de proveedor puede agrupar varios pedidos, albaranes, expedientes y partes sin eliminar trazabilidad por linea.
- Una unidad individualizada puede tener UUID, numero de serie, proveedor, factura, coste, ubicacion, estado y movimientos.
- Un consumible se controla por referencia, cantidad, unidad de medida, ubicacion, reservas, minimos y fiabilidad.

Invariantes:

- DMP no aprueba, emite ni envia pedidos sin accion expresa de usuario autorizado.
- La unidad economica inicial depende de la documentacion real del proveedor.
- No se crea desglose economico ficticio cuando el proveedor factura un equipo completo con precio unico.
- Los ajustes de stock conservan usuario, fecha, ubicacion, cantidad anterior, cantidad contada, diferencia, motivo y aprobacion si la empresa la exige.
- La implementacion fiscal, contable y documental debera validarse posteriormente segun normativa aplicable.

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
- Las lineas de factura de proveedor pueden relacionarse con pedido, expediente, parte, equipo, instalacion o gasto general.
- Los costes adicionales pueden asignarse de forma completa, manual, porcentual, por importe, como gasto general o mediante reglas configurables.

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

## 19. Entidades conceptuales ampliadas

Esta seccion no define un esquema fisico definitivo. Documenta responsabilidades, relaciones e invariantes para futuras fases.

### Proveedores, compras y costes

- Supplier: entidad principal de proveedor con identidad legal/fiscal, condiciones, contactos, marcas, tarifas, descuentos, plazos, estado, documentos y observaciones.
- SupplierContact: contacto de proveedor para compras, facturacion, soporte u otros usos.
- SupplierProductReference: referencia de proveedor para un material o producto, con precios, descuentos, portes, plazos, disponibilidad e historico de compras/incidencias.
- PurchaseOrder y PurchaseOrderLine: pedido y lineas vinculables a expediente, parte, equipo o stock general.
- SupplierConfirmation: confirmacion de proveedor con fecha prevista, cantidades confirmadas, entrega total/parcial, referencia, modificaciones y observaciones.
- GoodsReceipt y GoodsReceiptLine: recepcion o albaran real de material, total o parcial.
- SupplierInvoice y SupplierInvoiceLine: factura de proveedor tal como se recibe, sin alterarla artificialmente.
- ExternalCostAllocation: asignacion de portes, gruas, transporte, servicios externos, descuentos, recargos u otros costes a pedido, expediente, parte, equipo, instalacion o gasto general.
- PurchaseProposal y PurchaseProposalLine: propuesta preparada por DMP para revision humana; no es pedido aprobado.
- SupplierReturn: devolucion a proveedor con material, cantidad, pedido, albaran, factura, proveedor, motivo, estado, documentos, fechas y responsable.

### Stock distribuido

- Warehouse: almacen central o secundario.
- StockLocation: ubicacion de stock, incluida ubicacion de cliente u obra.
- VehicleStockLocation: furgoneta tratada como almacen movil controlable.
- StockMovement: entrada, salida, traslado, ajuste, consumo o devolucion trazable.
- StockReservation: reserva reasignable por usuarios autorizados.
- StockCount: recuento fisico por ubicacion.
- StockDiscrepancy: diferencia entre stock teorico y contado.
- StockReliabilityScore: indice informativo de fiabilidad: alta, media, baja o sin verificar.
- ReplenishmentNeed y ReplenishmentNeedLine: necesidad de reposicion generada por stock negativo o por debajo del minimo; no crea pedido automaticamente.
- SerializedStockUnit: unidad individualizada con UUID, codigo interno, numero de serie, proveedor, factura, coste, ubicacion, estado y movimientos.
- QuantityStockItem: consumible controlado por referencia, cantidad, unidad de medida, ubicacion, reservas, minimos y fiabilidad.

### Historial tecnico

- InstalledComponent: componente instalado en un equipo, con origen logistico cuando exista.
- ComponentRepair: reparacion sobre el mismo componente.
- ComponentReplacement: sustitucion de un componente por otro, conservando componente sustituido, componente nuevo, fecha, parte, tecnico, causa, pruebas y resultado.

La logistica registra compra, pedido, albaran, factura, entrega, devolucion, sustitucion, garantia de proveedor y stock. El historial tecnico registra instalacion, reparacion, sustitucion, prueba y resultado. Ambas areas se relacionan, pero no se mezclan.

### Referencias externas e implantacion

- ExternalReference: referencia generica a sistema anterior o externo, con sistema de origen, identificador externo, numero de OT/pedido/factura/expediente, enlace, observaciones y estado de migracion.
- CompanyCapability: capacidad o feature flag activa para una empresa.
- ImplementedModuleRight: derecho de uso de modulo implantado, separado de alojamiento, soporte, mantenimiento, integraciones y nuevas ampliaciones.

### Portal, reporting y plantillas

- ClientPortalUser: usuario individual del portal cliente.
- ClientPortalPermission: permiso de portal por organizacion, centro, expediente, documento, accion o alcance configurable.
- ExportTemplate: plantilla personalizable de informe o exportacion.
- ReportExport: exportacion generada con filtros, permisos, alcance, empresa, usuario, fecha y hora.
- PhotoReportSelection: seleccion de fotografias para PDF: todas, solo relevantes o ninguna.

Invariantes transversales:

- Toda busqueda, portal, exportacion e informe debe respetar permisos y aislamiento de datos.
- Las decisiones configurables no deben convertirse en bloqueos obligatorios salvo politica empresarial definida.
- DMP informa, ayuda y conserva trazabilidad; la empresa decide.
