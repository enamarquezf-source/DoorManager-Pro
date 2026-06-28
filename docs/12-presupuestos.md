# DoorManager Pro - Presupuestos

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
- `docs/KNOWLEDGE_ENGINE.md`.

## Proximos desarrollos

- Relacionar presupuestos derivados con deficiencias e informes inteligentes.

## 1. Objetivo

El modulo de presupuestos permite crear ofertas comerciales para montajes, reparaciones, mejoras, sustituciones y mantenimientos.

## 2. Creacion

Pueden ser creados por:

- Comercial.
- Tecnico.
- Oficina.

Origenes posibles:

- Solicitud web.
- Aviso.
- Cliente existente.
- Visita tecnica.
- Oportunidad comercial.

## 3. Tipos

- Montaje.
- Reparacion.
- Mejora.
- Sustitucion.
- Mantenimiento.

## 4. Estados

- Borrador.
- Enviado.
- Aceptado.
- Rechazado.
- Caducado.
- Convertido en parte.

## 5. Lineas de presupuesto

Cada linea debe poder incluir:

- Descripcion.
- Cantidad.
- Precio unitario.
- Descuento.
- IVA.
- Total.
- Material asociado opcional.
- Mano de obra opcional.

## 6. Conversion a partes

Un presupuesto aceptado puede generar uno o varios partes de trabajo.

Ejemplos:

- Montaje principal.
- Segunda visita.
- Reparacion complementaria.
- Revision posterior.

## 7. Seguridad y auditoria

- Registrar usuario creador.
- Registrar envio.
- Registrar aceptacion o rechazo.
- Conservar versiones o historial de estado.
- Controlar permisos de importes y descuentos.

## 8. Criterios de aceptacion

- Se puede crear presupuesto desde oficina, tecnico o comercial.
- Se pueden anadir lineas.
- Se puede enviar y marcar aceptado/rechazado.
- Un aceptado puede generar partes.
