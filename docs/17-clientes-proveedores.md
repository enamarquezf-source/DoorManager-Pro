# DoorManager Pro - Clientes y proveedores

| Campo | Valor |
| --- | --- |
| Version | 0.4 |
| Estado | Vivo |
| Fecha | 2026-06-28 |
| Autor | Francisco Javier Ena Marquez |
| Ultima modificacion | 2026-06-29 |

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

Los proveedores son entidad principal para compras, facturacion, stock, trazabilidad, costes y obligaciones documentales. La implementacion fiscal y contable debera validarse posteriormente segun normativa aplicable.

La ficha del proveedor debe admitir:

- Identidad legal y fiscal.
- Contactos.
- Correo de facturacion.
- Condiciones de pago.
- Datos bancarios cuando proceda.
- Referencias suministradas.
- Marcas.
- Tarifas.
- Descuentos.
- Plazos.
- Estado.
- Documentos.
- Observaciones.

## 4.1 Compras y trazabilidad

Flujo general:

```text
Proveedor -> Pedido de compra -> Albaran o recepcion -> Entrada o destino del material -> Factura del proveedor -> Coste real -> Consumo o instalacion -> Facturacion al cliente cuando corresponda
```

DMP debe diferenciar lo pedido, confirmado, recibido, facturado, utilizado, devuelto o sobrante.

DMP puede detectar necesidades, consolidarlas, comparar proveedores, proponer cantidades, preparar pedidos, generar PDF, preparar correos y mostrar vista previa. Nunca debe aprobar una compra automaticamente, emitir un pedido sin autorizacion ni enviar un pedido sin accion expresa de usuario autorizado.

Una factura de proveedor puede agrupar varios pedidos, albaranes, expedientes y partes sin eliminar trazabilidad original de cada pedido y linea.
- Pedidos.
- Albaranes.
- Facturas de proveedor.

## 5. Relacion con materiales y stock

- Un proveedor suministra varios materiales.
- Un material puede tener varios proveedores.
- Las tarifas pueden cambiar en el tiempo.
- Los materiales usados en partes pueden descontar stock.
- Los pedidos y albaranes alimentan stock.
- Los pedidos pueden vincularse a expediente, parte, equipo o stock general.
- Las devoluciones a proveedor se registran y siguen, pero DMP no reclama ni ejecuta automaticamente la devolucion.

## 6. Criterios de aceptacion

- Un cliente agrupa contactos, direcciones, instalaciones y puertas.
- Un proveedor agrupa materiales, marcas y tarifas.
- Los materiales usados en partes pueden relacionarse con proveedor y stock.
- Ninguna compra se envia sin usuario autorizado.
