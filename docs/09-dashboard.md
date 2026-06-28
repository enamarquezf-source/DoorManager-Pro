# DoorManager Pro - Dashboard

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
- `docs/10-offline-first.md`.

## Proximos desarrollos

- Añadir indicadores de ITI, deficiencias y riesgos.

## 1. Objetivo

El dashboard debe mostrar el estado operativo de la empresa, no solo estadisticas.

## 2. Informacion principal

- Equipos de trabajo activos.
- Trabajo actual de cada equipo.
- Avisos urgentes.
- Partes pendientes de asignar.
- Partes cargados en movil.
- Partes pendientes de enviar.
- Partes pendientes de validacion.
- Presupuestos enviados y aceptados.
- Facturas pendientes o vencidas.
- Incidencias abiertas.
- Fallos de sincronizacion.

## 3. Ejemplos de equipos

- Equipo Norte: instalando puerta rapida.
- Equipo Zaragoza: mantenimiento preventivo.
- Equipo Barcelona: revision anual.
- Equipo Madrid: aviso urgente.

## 4. Vistas por rol

- Gerencia: vision global, facturacion, equipos y urgencias.
- Oficina: partes, validaciones, presupuestos y clientes.
- Jefe de equipo: tecnicos, trabajos y conflictos.
- Tecnico: mis trabajos, pendientes de envio y errores.

## 5. Offline y tiempo real

El dashboard debe diferenciar:

- Datos online recientes.
- Ultima sincronizacion conocida.
- Trabajos pendientes en dispositivo.
- Errores de sincronizacion.

No debe simular tiempo real si el tecnico esta offline.

## 6. Criterios de aceptacion

- Gerencia ve equipos activos.
- Oficina ve validaciones pendientes.
- Se muestran trabajos offline pendientes.
- Los indicadores respetan permisos.
