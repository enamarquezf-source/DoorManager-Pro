# DoorManager Pro - Validacion de oficina

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

- `docs/BUSINESS_RULES.md`.
- `docs/KNOWLEDGE_ENGINE.md`.

## Proximos desarrollos

- Añadir validacion de ITI, deficiencias y rechazo informado.

## 1. Objetivo

La validacion de oficina garantiza que los partes enviados por tecnicos son correctos antes de cerrarlos, enviarlos al cliente o pasarlos a facturacion.

## 2. Datos a validar

- Horas.
- Desplazamiento.
- Kilometros.
- Dietas.
- Peajes o aparcamiento.
- Materiales.
- Fotos.
- Firma.
- Observaciones.
- Checklist.
- Resultado.
- Facturable/no facturable.
- Garantia.
- Pendiente de presupuesto.
- Pendiente de segunda visita.

## 3. Acciones

- Validar.
- Rechazar.
- Solicitar correccion.
- Generar PDF.
- Enviar al cliente.
- Pasar a facturacion.
- Cerrar parte.

## 4. Estados relacionados

- Enviado por tecnico.
- Pendiente de validacion oficina.
- Validado.
- Rechazado.
- Cerrado.
- Facturado.

## 5. Auditoria

Debe registrar:

- Usuario validador.
- Fecha.
- Accion.
- Cambios realizados.
- Motivo de rechazo o correccion.
- Paso a facturacion.

## 6. Criterios de aceptacion

- Oficina puede revisar todos los datos del parte.
- Oficina puede solicitar correccion al tecnico.
- Solo partes validados pasan a facturacion ordinaria.
- Todo queda auditado.
