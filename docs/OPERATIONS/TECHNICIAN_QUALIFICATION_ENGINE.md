# DoorManager Pro - Technician Qualification Engine

| Campo | Valor |
| --- | --- |
| Version | 0.1 |
| Estado | Conceptual |
| Fecha | 2026-06-29 |
| Autor | Francisco Javier Ena Marquez |
| Ultima modificacion | 2026-06-29 |

## Indice

1. Proposito
2. Concepto
3. Ambitos gestionados
4. Validacion informativa
5. Caducidades
6. Documentos relacionados
7. Proximos desarrollos

## 1. Proposito

Definir el concepto de Technical Qualification Engine para asignacion informada de tecnicos.

## 2. Concepto

El Technical Qualification Engine es el motor funcional que relaciona tecnicos, requisitos de cliente/trabajo y caducidades.

No decide por SAT. Informa si un tecnico cumple requisitos y permite aplicar politicas configurables.

## 3. Ambitos gestionados

Debe gestionar:

- Cursos PRL.
- Reconocimientos medicos.
- Carnets.
- Habilitaciones.
- Formacion por cliente.
- Permisos de acceso.
- Experiencia.
- Especialidades.
- EPIs.
- Herramientas necesarias.
- Caducidades.

## 4. Validacion informativa

Cuando SAT asigne tecnico a cliente o trabajo, la aplicacion debe informar si cumple requisitos.

La validacion debe ser clara pero sutil:

- No debe impedir trabajar por defecto.
- Debe indicar requisitos cumplidos, pendientes o proximos a vencer.
- Debe permitir excepciones si la politica empresarial lo permite.
- Debe bloquear solo cuando una politica configurable lo exija.

## 5. Caducidades

Las caducidades deben conectarse con el Centro de avisos y vencimientos para generar preavisos y seguimiento por responsable, departamento, prioridad, fecha de vencimiento, dias de preaviso y estado.

## 6. Documentos relacionados

- `docs/PRODUCT_BIBLE.md`.
- `docs/BUSINESS_RULES.md`.
- `docs/OPERATIONS/SAT_DAILY_PLANNING.md`.
- `docs/OPERATIONS/ALERTS_AND_EXPIRATIONS_CENTER.md`.

## 7. Proximos desarrollos

- Definir catalogo de requisitos.
- Definir niveles de severidad informativa.
- Definir reglas de excepcion por empresa y cliente.
