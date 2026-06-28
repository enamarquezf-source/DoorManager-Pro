# DoorManager Pro - Partes de trabajo

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
- `docs/BUSINESS_RULES.md`.

## Proximos desarrollos

- Integrar parte de trabajo con ITI y deficiencias v0.4.

## 1. Objetivo

El parte de trabajo sera una entidad central del sistema. Recoge la actividad real del tecnico, sirve como base para validacion de oficina, historial de puerta y facturacion.

## 2. Tipos

- Reparacion directa desde aviso.
- Montaje desde presupuesto aceptado.
- Reparacion o mejora desde presupuesto aceptado.
- Mantenimiento preventivo.
- Revision.
- Segunda visita.

## 3. Datos del parte

- Cliente.
- Instalacion.
- Puerta/equipo.
- Tipo.
- Estado.
- Tecnico asignado.
- Equipo de trabajo.
- Origen: aviso, presupuesto, mantenimiento o manual.
- Fecha prevista.
- Prioridad.
- Descripcion.

## 4. Datos que rellena el tecnico

- Hora llegada.
- Hora inicio.
- Hora fin.
- Horas empleadas.
- Tiempo total.
- Tiempo facturable.
- Desplazamiento.
- Kilometros.
- Dietas si procede.
- Peajes o aparcamiento si procede.
- Materiales usados.
- Material pendiente.
- Observaciones.
- Fotos.
- Checklist.
- Firma del cliente.
- Resultado del trabajo.

## 5. Estados

- Borrador.
- Pendiente de asignar.
- Asignado.
- Cargado en movil.
- En curso.
- Pendiente de enviar.
- Enviado por tecnico.
- Pendiente de validacion oficina.
- Validado.
- Rechazado.
- Cerrado.
- Facturado.
- Cancelado.

## 6. Offline-first

El parte debe poder completarse sin conexion.

Requisitos:

- UUID generado antes de trabajar offline.
- Guardado local de cambios.
- Adjuntos locales hasta envio.
- Estado pendiente de enviar.
- Reintento sin duplicar.
- Auditoria de sincronizacion.

## 7. Relacion con otros modulos

- Puede venir de aviso.
- Puede venir de presupuesto aceptado.
- Puede generar validacion de oficina.
- Puede generar factura.
- Actualiza historial de puerta.
- Consume materiales y stock.

## 8. Criterios de aceptacion

- Un tecnico puede completar un parte en campo.
- El parte conserva horas, materiales, fotos, firma y checklist.
- Oficina debe validarlo antes de facturacion ordinaria.
- El parte queda en historial de puerta.
