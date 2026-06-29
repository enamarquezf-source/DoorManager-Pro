# DoorManager Pro - Facturacion

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
- `docs/13-validacion-oficina.md`.

## Proximos desarrollos

- Relacionar facturacion con garantias y deficiencias aceptadas/rechazadas.

## 1. Objetivo

Documentar un modulo inicial de facturacion preparado para crecer, sin implementar contabilidad avanzada en las primeras fases.

## 2. Alcance inicial

Debe contemplar:

- Facturas a clientes.
- Lineas de factura.
- Relacion con partes validados.
- Relacion con presupuestos.
- Materiales facturables.
- Horas facturables.
- Desplazamiento facturable.
- IVA.
- Estados de factura.
- Facturas de proveedor como documento economico recibido.
- Costes adicionales reales.
- Asignacion de costes a pedido, expediente, parte, equipo, instalacion o gasto general.

La implementacion fiscal, contable y de impuestos debera validarse posteriormente segun normativa aplicable. Este documento no fija requisitos legales concretos.

## 3. Estados

- Pendiente.
- Emitida.
- Pagada.
- Vencida.
- Anulada.

## 4. Origen de facturacion

Una factura puede originarse desde:

- Parte de trabajo validado.
- Presupuesto aceptado.
- Varios partes agrupados.
- Concepto manual autorizado.

## 5. Lineas de factura

Tipos de linea:

- Mano de obra.
- Desplazamiento.
- Material.
- Servicio.
- Concepto libre.

Campos recomendados:

- Descripcion.
- Cantidad.
- Precio unitario.
- Descuento.
- IVA.
- Total.

## 6. Relacion con oficina

- Un parte enviado por tecnico pasa a validacion.
- Oficina decide facturable/no facturable.
- Oficina corrige materiales, horas y desplazamiento.
- Parte validado puede pasar a facturacion.

## 7. Seguridad y auditoria

- Solo usuarios autorizados pueden emitir o anular facturas.
- Debe registrarse cambio de estado.
- Debe conservarse relacion con parte o presupuesto.
- Los PDFs de factura se protegen como documentos sensibles.

## 7.1 Facturas de proveedor y costes reales

La factura del proveedor se registra exactamente como la emita el proveedor. DMP no debe dividirla ni alterarla artificialmente por entregas parciales.

Las facturas pueden incluir portes, alquileres, gruas, transporte, servicios externos, embalajes, descuentos, recargos, tasas u otros costes justificados.

Las lineas pueden relacionarse con pedido, expediente, parte, equipo, instalacion o gasto general.

El criterio de reparto depende de cada empresa. DMP debe permitir asignacion completa, reparto manual, reparto porcentual, reparto por importe, gasto general y reglas configurables. Siempre debe conservar importe original, criterio y auditoria.

## 8. Criterios de aceptacion

- Un parte validado puede generar factura.
- Una factura tiene lineas e IVA.
- La factura tiene estado controlado.
- No se plantea contabilidad avanzada en primera fase.
- La trazabilidad economica no debe eliminar la trazabilidad tecnica ni logistica.
