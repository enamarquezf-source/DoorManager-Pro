# DoorManager Pro - Business Rules

| Campo | Valor |
| --- | --- |
| Version | 0.3 |
| Estado | Vivo |
| Fecha | 2026-06-28 |
| Autor | Francisco Javier Ena Marquez |
| Ultima modificacion | 2026-06-28 |

## Indice

1. Reglas RB-001 a RB-023
2. Documentos relacionados
3. Proximos desarrollos

## 1. Reglas RB-001 a RB-023

### RB-001 Gestion inicial del aviso

Todo aviso debe registrarse desde el primer contacto, independientemente del canal de entrada.

### RB-002 Datos minimos del aviso

Un aviso debe incluir origen, cliente o contacto, ubicacion, descripcion, prioridad estimada y usuario receptor.

### RB-003 Tecnico solo recibe partes asignados

El tecnico no selecciona libremente trabajos. Recibe partes asignados por oficina, SAT, jefe de equipo o responsables autorizados.

### RB-004 Pantalla inicial del tecnico

La pantalla inicial del tecnico debe mostrar trabajos cargados, estado de conexion, pendientes de envio, errores y acceso a `Cargar trabajos` y `Enviar trabajo`.

### RB-005 Identificacion de equipos

Todo equipo debe poder identificarse por codigo interno, codigo cliente, grupo de carga, posicion fisica, numero de serie o equivalencias configuradas.

### RB-006 Tipos de actuacion

Las actuaciones iniciales son reparacion, mantenimiento, instalacion, revision, segunda visita y mejora.

### RB-007 Flujo flexible por empresa

Los flujos deben ser configurables por empresa, cliente, tipo de trabajo y permisos.

### RB-008 Rechazo informado firmado

Si el cliente rechaza una reparacion, deficiencia o recomendacion relevante, debe quedar reflejado y firmado cuando proceda.

### RB-009 Tecnico no cierra partes

El tecnico finaliza y envia el parte, pero no lo cierra administrativamente.

### RB-010 Envio al cliente tras validacion

El cliente recibe parte, fotos, documentos o factura solo tras validacion de oficina o usuario autorizado.

### RB-011 Destinatarios configurables

Los destinatarios de partes, fotos, presupuestos y facturas deben ser configurables por cliente, centro, contacto o tipo de documento.

### RB-012 Clientes con varios centros

Un cliente puede tener varios centros de trabajo, y cada centro puede tener edificios, naves, zonas, muelles y grupos de carga.

### RB-013 Expedientes desde primer contacto

Todo proceso relevante debe poder agruparse en expediente desde el primer contacto.

### RB-014 Identificadores multiples

El sistema debe soportar codigo interno, codigo cliente, OT cliente, codigo ERP externo, codigo de puerta, codigo de grupo de carga y codigo de expediente.

### RB-015 Motor de equivalencias

Debe existir un motor de equivalencias para buscar y relacionar identificadores internos y externos.

### RB-016 Posicion fisica y ciclo de vida

La posicion fisica conserva identidad aunque se sustituya el equipo instalado. El equipo sustituido queda historico.

### RB-017 Vista tecnica simplificada

El tecnico debe ver principalmente el equipo actual y los datos necesarios para trabajar, sin sobrecargarlo con historico irrelevante.

### RB-018 Material previsto/usado

Debe diferenciarse material previsto para preparar la salida y material usado real registrado por el tecnico.

### RB-019 Validacion de materiales

El tecnico no descuenta stock oficial. SAT u oficina validan material antes de actualizar stock.

### RB-020 Autorizacion cliente

Las decisiones del cliente que afecten seguridad, garantia, presupuesto o rechazo de reparacion deben quedar documentadas.

### RB-021 Parte dividido en causa y actuacion real

El parte debe separar causa inicial comunicada y actuacion real realizada. La causa inicial no se sobrescribe.

### RB-022 Averias adicionales segun tipo de parte

El sistema debe permitir registrar averias o deficiencias adicionales encontradas durante la actuacion, segun permisos y tipo de parte.

### RB-023 Gestion flexible de averias adicionales

Las averias adicionales pueden quedar como deficiencia, generar presupuesto independiente, generar segunda visita o quedar rechazadas por cliente con firma.

## 2. Documentos relacionados

- `docs/PRODUCT_BIBLE.md`.
- `docs/KNOWLEDGE_ENGINE.md`.
- `docs/ADR/ADR-002-expediente-unico.md`.

## 3. Proximos desarrollos

- Clasificar reglas por modulo.
- Asignar prioridad y origen de cada regla.
- Convertir reglas criticas en criterios de aceptacion.
