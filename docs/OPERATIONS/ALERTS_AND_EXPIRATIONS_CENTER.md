# DoorManager Pro - Alerts and Expirations Center

| Campo | Valor |
| --- | --- |
| Version | 0.1 |
| Estado | Conceptual |
| Fecha | 2026-06-29 |
| Autor | Francisco Javier Ena Marquez |
| Ultima modificacion | 2026-06-29 |

## Indice

1. Proposito
2. Alcance
3. Datos minimos
4. Principios
5. Documentos relacionados
6. Proximos desarrollos

## 1. Proposito

Definir un modulo transversal para avisos, vencimientos y seguimiento preventivo.

## 2. Alcance

El Centro de avisos y vencimientos debe cubrir:

- ITV de vehiculos.
- Seguros de vehiculos.
- Revisiones de furgonetas.
- Cursos PRL.
- Reconocimientos medicos.
- Certificados.
- Carnets.
- Mantenimientos programados.
- Revisiones de clientes.
- Visitas comerciales.
- Presupuestos pendientes.
- Material pendiente.
- Garantias proximas a vencer.
- Contratos proximos a renovar.

## 3. Datos minimos

Cada aviso o vencimiento debe permitir:

- Responsable.
- Departamento.
- Prioridad.
- Fecha de vencimiento.
- Dias de preaviso.
- Estado.

## 4. Principios

- Debe ser transversal a todos los Workspaces.
- Debe evitar duplicar datos de origen.
- Debe enlazar con expediente, cliente, tecnico, vehiculo, material, contrato, garantia o documento cuando proceda.
- Debe informar y priorizar, no decidir automaticamente.

## 5. Documentos relacionados

- `docs/PRODUCT_BIBLE.md`.
- `docs/BUSINESS_RULES.md`.
- `docs/ARCHITECTURE/WORKSPACE_ARCHITECTURE.md`.
- `docs/OPERATIONS/MATERIAL_REQUESTS.md`.
- `docs/OPERATIONS/TECHNICIAN_QUALIFICATION_ENGINE.md`.

## 6. Proximos desarrollos

- Definir estados del aviso.
- Definir prioridades.
- Definir fuentes automaticas de vencimientos.
