# DoorManager Pro - Modulo checklist interactivo

| Campo | Valor |
| --- | --- |
| Version | 0.3 |
| Estado | Vivo |
| Fecha | 2026-06-28 |
| Autor | Francisco Javier Ena Marquez |
| Ultima modificacion | 2026-06-28 |

## Indice

Este documento mantiene la estructura actual, pero el concepto v0.3 preferente es ITI, no checklist aislado.

## Referencias cruzadas

- `docs/KNOWLEDGE_ENGINE.md`.
- `docs/KNOWLEDGE_BASE/09_ITI_ENGINE.md`.
- `docs/ADR/ADR-004-knowledge-engine.md`.

## Proximos desarrollos

- Renombrar el modulo hacia ITI en v0.4.
- Vincular checklists a la taxonomia jerarquica, no a puertas concretas.

## 1. Objetivo

El checklist interactivo sera un modulo diferencial. No sera una lista tradicional, sino un dibujo tecnico de la puerta con partes clicables y fichas individuales de comprobacion.

## 2. Relacion con puertas y partes

- Cada puerta puede tener checklists unicos segun tipo.
- Cada parte de trabajo puede incluir uno o varios checklists.
- Las respuestas quedan en el historial de puerta.
- El checklist debe funcionar offline cuando el parte este cargado en el movil.

## 3. Elementos clicables

Ejemplos:

- Motor.
- Guias.
- Muelles.
- Fotocelulas.
- Finales de carrera.
- Felpudo.
- Cerradura.
- Hoja movil.
- Hoja fija.
- Cuadro.
- Bandas de seguridad.
- Selectores.
- Radar.
- Semaforos.

## 4. Ficha de comprobacion

Cada elemento abrira una ficha con:

- Estado.
- Fotografias.
- Observaciones.
- Mediciones.
- Firma si procede.
- Fecha.
- Tecnico responsable.
- Relacion con parte de trabajo.

Estados iniciales:

- Correcto.
- Incorrecto.
- No aplica.

## 5. Seguridad

- Solo usuarios autorizados pueden completar o modificar checklists.
- La oficina puede revisar el checklist durante validacion del parte.
- Las fotografias se protegen como archivos sensibles.
- Las modificaciones quedan auditadas.

## 6. Offline-first

Al pulsar `Cargar trabajos`, el movil debe recibir:

- Plantillas de checklist necesarias.
- Dibujos tecnicos.
- Componentes clicables.
- Datos de puerta.
- Historial basico.

Al pulsar `Enviar trabajo`, se enviaran:

- Respuestas.
- Fotos.
- Firmas.
- Mediciones.
- Observaciones.

## 7. Criterios de aceptacion

- El dibujo muestra partes clicables.
- Cada parte abre ficha propia.
- El checklist se asocia a puerta y parte.
- Funciona offline tras cargar trabajos.
- Las respuestas quedan disponibles para validacion de oficina e historial.
