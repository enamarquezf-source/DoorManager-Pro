# DoorManager Pro - SAT Daily Planning

| Campo | Valor |
| --- | --- |
| Version | 0.1 |
| Estado | Conceptual |
| Fecha | 2026-06-29 |
| Autor | Francisco Javier Ena Marquez |
| Ultima modificacion | 2026-06-29 |

## Indice

1. Proposito
2. Principio operativo
3. Panel de inicio de jornada
4. Tecnico y asignacion
5. Aviso anticipado de disponibilidad
6. Relacion con cualificaciones
7. Documentos relacionados
8. Proximos desarrollos

## 1. Proposito

Documentar como DoorManager Pro debe apoyar la planificacion diaria de SAT.

## 2. Principio operativo

La aplicacion debe apoyar a SAT, no organizar automaticamente.

DoorManager Pro no sustituye al responsable SAT. Proporciona informacion, alertas, trazabilidad y contexto para que SAT decida.

## 3. Panel de inicio de jornada

El panel SAT de inicio de jornada debe mostrar:

- Tecnicos disponibles.
- Trabajos sin finalizar del dia anterior.
- Tareas programadas.
- Disponibilidad de material.
- Disponibilidad de herramientas/equipos.
- Climatologia para trabajos exteriores.
- Requisitos de acceso por cliente/centro.
- Tecnicos habilitados para cada trabajo.

## 4. Tecnico y asignacion

El tecnico no tiene labores organizativas.

Reglas:

- No rechaza partes.
- No organiza partes.
- No decide la ruta global.
- Puede comunicar incidencias operativas.
- Puede comunicar necesidades de material, herramientas o apoyo.
- SAT decide asignaciones y cambios.

## 5. Aviso anticipado de disponibilidad

Si el tecnico preve terminar antes, puede avisar.

El aviso debe llegar a SAT como informacion operativa. No debe reorganizar automaticamente la jornada. SAT decide si reasigna, adelanta otra tarea o mantiene la planificacion.

## 6. Relacion con cualificaciones

Al asignar tecnico a cliente o trabajo, el sistema debe informar si cumple requisitos de acceso, cualificacion, PRL, reconocimientos medicos, carnets, habilitaciones, EPIs y herramientas.

La validacion debe ser informativa salvo politica configurable que convierta algun requisito en bloqueo.

## 7. Documentos relacionados

- `docs/PRODUCT_BIBLE.md`.
- `docs/BUSINESS_RULES.md`.
- `docs/OPERATIONS/TECHNICIAN_QUALIFICATION_ENGINE.md`.
- `docs/OPERATIONS/ALERTS_AND_EXPIRATIONS_CENTER.md`.

## 8. Proximos desarrollos

- Definir estados de planificacion diaria.
- Definir severidad de avisos SAT.
- Definir integracion con calendario y disponibilidad.
