# DoorManager Pro - Suppliers, Purchasing and Stock

| Campo | Valor |
| --- | --- |
| Version | 0.1 |
| Estado | Conceptual |
| Fecha | 2026-06-29 |
| Autor | Francisco Javier Ena Marquez |
| Ultima modificacion | 2026-06-29 |

## 1. Proposito

Documentar proveedores, compras, recepciones, facturas de proveedor, stock distribuido y trazabilidad economica.

## 2. Proveedores

Los proveedores son entidad principal para compras, facturacion, stock, trazabilidad, costes y obligaciones documentales.

La ficha debe admitir identidad legal y fiscal, contactos, correo de facturacion, condiciones de pago, datos bancarios cuando proceda, referencias suministradas, marcas, tarifas, descuentos, plazos, estado, documentos y observaciones.

## 3. Flujo de compras

```text
Proveedor -> Pedido de compra -> Albaran o recepcion -> Entrada o destino del material -> Factura del proveedor -> Coste real -> Consumo o instalacion -> Facturacion al cliente cuando corresponda
```

DMP debe diferenciar lo pedido, confirmado, recibido, facturado, utilizado, devuelto o sobrante.

Los pedidos pueden crearse para expediente, parte concreto, equipo o stock general. Una factura de proveedor puede agrupar varios pedidos, albaranes, expedientes y partes sin eliminar trazabilidad original de cada linea.

## 4. Autorizacion humana

DMP puede detectar necesidades, consolidarlas, comparar proveedores, proponer cantidades, preparar pedidos, generar PDF, preparar correos y mostrar una vista previa.

DMP nunca debe aprobar una compra automaticamente, emitir un pedido sin autorizacion ni enviar un pedido sin accion expresa de usuario autorizado.

## 5. Comparacion y confirmacion de proveedores

Para un mismo material, DMP podra mostrar referencias del proveedor, precios, descuentos, portes, recargos, plazos, condiciones de pago, disponibilidad, compras anteriores e incidencias.

DMP informa y compara, pero no selecciona automaticamente proveedor.

Tras enviar un pedido, debe poder registrarse fecha prevista de entrega, cantidades confirmadas, entrega total o parcial, referencia del proveedor, modificaciones y observaciones. Si no confirma en plazo esperado, se genera aviso de seguimiento sin bloquear compras alternativas.

## 6. Entradas, entregas parciales y costes

La unidad economica y de stock inicial depende de como el material entra documentalmente. DMP no debe inventar desglose economico interno cuando el proveedor facture un equipo completo con un unico precio.

Las entregas parciales pueden seguirse internamente como confirmado, pendiente, recibido, cancelado o sustituido. La factura del proveedor se registra exactamente como la emita el proveedor.

Las facturas pueden incluir portes, alquileres, gruas, transporte, servicios externos, embalajes, descuentos, recargos, tasas u otros costes justificados.

## 7. Devoluciones y sustituciones de proveedor

DMP debe permitir registrar devoluciones con material, cantidad, pedido, albaran, factura, proveedor, motivo, estado, documentos, fechas y responsable. DMP no reclama ni ejecuta automaticamente la devolucion.

Si el proveedor sustituye una unidad, la original queda sustituida o devuelta, la nueva unidad es distinta, ambas quedan relacionadas y la garantia de la nueva unidad se basa en su fecha real de entrega.

## 8. Separacion logistica y tecnica

Logistica registra compra, pedido, albaran, factura, entrega, devolucion, sustitucion, garantia de proveedor y stock.

El historial tecnico registra componente instalado, equipo destino, parte, fecha de instalacion, tecnico, causa, pruebas, resultado y componente sustituido.

## 9. Documentos relacionados

- `docs/17-clientes-proveedores.md`.
- `docs/18-facturacion.md`.
- `docs/03-modelo-datos.md`.
- `docs/OPERATIONS/STOCK_RELIABILITY.md`.
