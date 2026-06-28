# DoorManager Pro - Clientes y proveedores

| Campo | Valor |
| --- | --- |
| Version | 0.3 |
| Estado | Vivo |
| Fecha | 2026-06-28 |
| Autor | Francisco Javier Ena Marquez |
| Ultima modificacion | 2026-06-28 |

## Indice

Este documento mantiene su estructura actual.

## Referencias cruzadas

- `docs/PRODUCT_BIBLE.md`.
- `docs/KNOWLEDGE_BASE/README.md`.

## Proximos desarrollos

- Añadir centros, grupos de carga y responsables industriales al modelo de cliente.

## 1. Objetivo

Documentar los modulos de clientes y proveedores como base comercial, operativa y administrativa.

## 2. Clientes

Tipos:

- Particulares.
- Empresas.
- Comunidades.
- Administradores de fincas.

Debe gestionar:

- Datos fiscales.
- Contactos.
- Telefonos.
- Emails.
- Direcciones.
- Instalaciones.
- Puertas.
- Historial.
- Facturacion.
- Presupuestos.
- Avisos.
- Partes.
- Documentos.

## 3. Contactos y direcciones

- Un cliente puede tener varios contactos.
- Un cliente puede tener varias direcciones.
- Las direcciones pueden ser fiscales, instalaciones o correspondencia.
- Cada instalacion puede tener contacto propio.

## 4. Proveedores

Debe gestionar:

- Nombre proveedor.
- CIF/NIF.
- Contactos.
- Telefono.
- Email.
- Direccion.
- Materiales suministrados.
- Marcas.
- Referencias.
- Tarifas.
- Pedidos.
- Albaranes.
- Facturas de proveedor.

## 5. Relacion con materiales y stock

- Un proveedor suministra varios materiales.
- Un material puede tener varios proveedores.
- Las tarifas pueden cambiar en el tiempo.
- Los materiales usados en partes pueden descontar stock.
- Los pedidos y albaranes alimentan stock.

## 6. Criterios de aceptacion

- Un cliente agrupa contactos, direcciones, instalaciones y puertas.
- Un proveedor agrupa materiales, marcas y tarifas.
- Los materiales usados en partes pueden relacionarse con proveedor y stock.
