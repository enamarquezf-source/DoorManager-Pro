# DoorManager Pro - Checklist interactivo

| Campo | Valor |
| --- | --- |
| Version | 0.3 |
| Estado | Referencia historica |
| Fecha | 2026-06-28 |
| Autor | Francisco Javier Ena Marquez |
| Ultima modificacion | 2026-06-28 |

## Indice

Este documento es referencia historica. La especificacion vigente esta en `docs/KNOWLEDGE_ENGINE.md` y `docs/KNOWLEDGE_BASE/09_ITI_ENGINE.md`.

## Referencias cruzadas

- `docs/06-modulo-checklist.md`.
- `docs/KNOWLEDGE_ENGINE.md`.

## Proximos desarrollos

- Mantener solo como puente hasta renombrado completo a ITI.

Este documento se mantiene como referencia historica de la primera definicion del checklist interactivo.

La especificacion vigente del modulo se encuentra en:

- `docs/06-modulo-checklist.md`

Resumen de la decision actual:

- El checklist no sera una lista tradicional.
- Cada tipo de puerta podra tener su propio dibujo tecnico.
- El tecnico pulsara elementos del dibujo para abrir fichas de comprobacion.
- El modulo debe funcionar en ordenador, tablet, Android e iPhone.
- El modulo debe funcionar offline cuando el tecnico haya cargado previamente sus trabajos.
- Los resultados se sincronizaran manualmente con el servidor al pulsar `Enviar trabajo` o `Sincronizar`.

Este archivo no debe usarse como especificacion principal si entra en conflicto con `docs/06-modulo-checklist.md` o `docs/10-offline-first.md`.
