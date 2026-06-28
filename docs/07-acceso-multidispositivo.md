# DoorManager Pro - Acceso multidispositivo

| Campo | Valor |
| --- | --- |
| Version | 0.3 |
| Estado | Referencia historica |
| Fecha | 2026-06-28 |
| Autor | Francisco Javier Ena Marquez |
| Ultima modificacion | 2026-06-28 |

## Indice

Este documento es referencia historica. La especificacion vigente esta en `docs/10-offline-first.md` y `docs/ADR/ADR-001-offline-first.md`.

## Referencias cruzadas

- `docs/10-offline-first.md`.
- `docs/ADR/ADR-001-offline-first.md`.

## Proximos desarrollos

- Integrar acceso multidispositivo con TOP y Gemelo Digital en v0.4.

Este documento se mantiene como referencia de continuidad sobre acceso multidispositivo.

La especificacion vigente queda repartida principalmente en:

- `docs/04-arquitectura.md`
- `docs/07-ui-ux.md`
- `docs/10-offline-first.md`

Resumen de la decision actual:

- DoorManager Pro tendra frontend web y frontend movil.
- Podra utilizarse desde navegador, ordenador, tablet, movil Android y movil iPhone.
- Todos los dispositivos compartiran la misma base de datos central.
- La aplicacion movil seguira arquitectura Offline First.
- El tecnico descargara trabajos con `Cargar trabajos`.
- El tecnico trabajara localmente sin conexion.
- El tecnico enviara cambios con `Enviar trabajo` o `Sincronizar`.
- No se plantea sincronizacion continua ni peticiones constantes desde movil.

Este archivo no debe usarse como especificacion principal si entra en conflicto con `docs/10-offline-first.md`.
