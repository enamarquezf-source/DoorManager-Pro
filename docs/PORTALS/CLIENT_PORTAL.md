# DoorManager Pro - Client Portal

| Campo | Valor |
| --- | --- |
| Version | 0.1 |
| Estado | Conceptual |
| Fecha | 2026-06-29 |
| Autor | Francisco Javier Ena Marquez |
| Ultima modificacion | 2026-06-29 |

## 1. Proposito

Documentar el portal seguro del cliente como modulo configurable.

## 2. Visibilidad configurable

El cliente podra consultar unicamente la informacion que la empresa usuaria de DMP decida publicar.

La visibilidad se define mediante acuerdo y configuracion entre proveedor de DMP, empresa usuaria de DMP y politica que esa empresa aplique a sus propios clientes.

Debe poder configurarse:

- Expedientes visibles.
- Centros visibles.
- Pedidos.
- Reparaciones.
- Mantenimientos.
- Documentos.
- Estados.
- Facturas.
- Informes.
- Acciones permitidas.
- Datos pendientes que el cliente pueda completar.

## 3. Seguridad obligatoria

Requisitos:

- Aislamiento estricto entre empresas y clientes.
- Autorizacion comprobada en cada peticion.
- Usuarios individuales.
- Contraseñas protegidas.
- Identificadores no predecibles.
- Permisos por organizacion, centro, expediente y documento.
- Sesiones seguras.
- Auditoria de accesos y descargas.
- Segundo factor configurable.
- Ausencia total de acceso a informacion interna de la empresa usuaria de DMP.

## 4. Entidades conceptuales

- ClientPortalUser.
- ClientPortalPermission.

## 5. Principio

El portal no concede visibilidad por existir el dato. Solo muestra informacion publicada explicitamente por configuracion y permisos.

## 6. Documentos relacionados

- `docs/SECURITY.md`.
- `docs/ARCHITECTURE/WORKSPACE_ARCHITECTURE.md`.
- `docs/03-modelo-datos.md`.
- `docs/REPORTING/EXPORTS_AND_TEMPLATES.md`.
