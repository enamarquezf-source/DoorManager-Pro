# DoorManager Pro - Material Requests

| Campo | Valor |
| --- | --- |
| Version | 0.1 |
| Estado | Conceptual |
| Fecha | 2026-06-29 |
| Autor | Francisco Javier Ena Marquez |
| Ultima modificacion | 2026-06-29 |

## Indice

1. Proposito
2. Principios
3. Material previsto y material usado
4. Solicitud de Material Pendiente
5. Datos minimos de recambio
6. Integraciones futuras
7. Documentos relacionados
8. Proximos desarrollos

## 1. Proposito

Documentar la gestion funcional de material pendiente y solicitudes de material.

## 2. Principios

- El tecnico puede solicitar material.
- El tecnico no decide compras ni logistica.
- SAT, almacen, compras u oficina gestionan la decision segun politica empresarial.
- Debe evitarse exceso de datos manuales.
- La solicitud debe quedar trazada.

## 3. Material previsto y material usado

Si una reparacion esta planificada, el material previsto debe venir ya cargado en el parte como `material a usar`.

El tecnico solo confirma lo usado realmente. Si falta material, registra la necesidad y genera o solicita la Solicitud de Material Pendiente segun permisos.

## 4. Solicitud de Material Pendiente

Cuando falta material debe poder crearse una Solicitud de Material Pendiente vinculada a:

- Expediente.
- Parte.
- Equipo.
- Proveedor.

La solicitud permite continuar la trazabilidad entre necesidad tecnica, decision logistica, compra, instalacion y facturacion futura.

## 5. Datos minimos de recambio

Para empezar, en recambios basta con:

- Material.
- Proveedor.
- Fecha de entrega.
- Fecha de instalacion.
- Parte asociado.
- Equipo donde se instala.

No deben exigirse campos manuales innecesarios al tecnico.

## 6. Integraciones futuras

La Solicitud de Material Pendiente debe poder conectarse en el futuro con:

- Pedido.
- Albaran.
- Factura de proveedor.
- Factura al cliente.

## 7. Documentos relacionados

- `docs/PRODUCT_BIBLE.md`.
- `docs/BUSINESS_RULES.md`.
- `docs/OPERATIONS/ALERTS_AND_EXPIRATIONS_CENTER.md`.

## 8. Proximos desarrollos

- Definir estados de solicitud.
- Definir permisos por Workspace.
- Definir relacion con stock, pedidos y facturacion.
