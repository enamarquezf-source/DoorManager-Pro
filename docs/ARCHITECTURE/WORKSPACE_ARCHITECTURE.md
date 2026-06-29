# DoorManager Pro - Workspace Architecture

| Campo | Valor |
| --- | --- |
| Version | 0.2 |
| Estado | Conceptual |
| Fecha | 2026-06-29 |
| Autor | Francisco Javier Ena Marquez |
| Ultima modificacion | 2026-06-29 |

## Indice

1. Proposito
2. Principios
3. Workspaces
4. Nucleo comun
5. Politicas empresariales
6. Business Rules Engine
7. Documentos relacionados
8. Proximos desarrollos

## 1. Proposito

Definir la arquitectura funcional por Workspaces de DoorManager Pro.

No se implementa en esta fase. Este documento fija el criterio funcional para futuras decisiones de producto, datos y permisos.

## 2. Principios

DoorManager Pro es una plataforma transversal por departamentos.

Principios:

- Un unico dato, multiples perspectivas.
- La plataforma informa y traza; la empresa decide.
- DoorManager Pro no organiza la empresa ni sustituye al SAT.
- Cada departamento debe ver lo necesario para su trabajo sin duplicar datos.
- Cada departamento modifica solo la informacion que corresponde a su funcion.
- Las excepciones y permisos dependen de politicas empresariales configurables.

## 3. Workspaces

Workspaces previstos:

- Tecnico.
- SAT.
- Comercial.
- Administracion.
- Almacen/Compras.
- Gerencia.
- Cliente.
- Proveedor futuro.

Cada Workspace puede tener vistas, acciones, alertas y permisos distintos sobre los mismos datos base.

## 4. Nucleo comun

Todos los Workspaces trabajan sobre un nucleo comun:

- Clientes.
- Centros.
- Expedientes.
- Partes.
- Equipos.
- Materiales.
- Documentacion.
- Knowledge base.
- Auditoria.
- Historial.

El nucleo comun debe permitir que operaciones tecnicas, compras, facturacion, stock, portal cliente y reporting consulten datos relacionados sin duplicarlos ni mezclar responsabilidades.

## 4.1 Portal cliente como Workspace

El cliente puede disponer de un Workspace propio mediante portal seguro configurable. Su visibilidad no depende de los datos existentes, sino de la politica de publicacion definida por la empresa usuaria.

El portal nunca debe mostrar informacion interna de SAT, compras, administracion, margenes, costes internos, notas internas o auditoria interna salvo decision explicita y segura que corresponda al tipo de dato.

El nucleo comun evita duplicidad, contradicciones y perdida de trazabilidad.

## 5. Politicas empresariales

Las decisiones dependientes de cada empresa deben ser configurables:

- Quien puede autorizar excepciones.
- Quien puede cerrar partes.
- Quien puede validar garantias.
- Quien puede aprobar descuentos.
- Quien puede reabrir partes.
- Quien puede asignar tecnicos.
- Quien puede validar material.

Estas politicas deben poder variar por empresa, departamento, rol, permiso, cliente, tipo de trabajo o excepcion.

## 6. Business Rules Engine

El Business Rules Engine es el concepto de motor configurable de reglas de negocio.

Alcance documental inicial:

- Declarar reglas configurables.
- Relacionar reglas con roles, permisos y departamentos.
- Permitir excepciones trazables.
- Evitar decisiones rigidas incrustadas en la aplicacion.

No se implementa todavia.

## 7. Documentos relacionados

- `docs/PRODUCT_BIBLE.md`.
- `docs/PROJECT_DNA.md`.
- `docs/BUSINESS_RULES.md`.

## 8. Proximos desarrollos

- Definir matriz de Workspaces y permisos.
- Definir reglas configurables por empresa.
- Definir vistas iniciales por departamento.
