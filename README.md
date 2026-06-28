# DoorManager Pro

DoorManager Pro es una Technical Operations Platform (TOP) para empresas instaladoras y mantenedoras de puertas automaticas.

El objetivo es construir un producto de nivel empresarial, preparado para oficina, tecnicos en campo, comerciales, administrativos y gerencia. El proyecto esta pensado como referencia solida de portfolio para entrevistas como desarrollador Java, mostrando arquitectura, seguridad, datos, offline-first y modelado de negocio real.

## Vision General

DoorManager Pro debe poder usarse desde:

- Oficina.
- Ordenador.
- Movil.
- Tablet.
- Tecnicos en campo.
- Comerciales.
- Administrativos.
- Gerencia.

La plataforma incluira:

- Aplicacion interna para la empresa.
- Panel web para oficina.
- Aplicacion movil offline-first para tecnicos.
- Web publica para clientes potenciales.
- API REST segura.
- Base de datos PostgreSQL centralizada.
- Servidor de archivos para documentos, manuales, fotografias, videos y firmas.
- Sistema de roles, permisos, auditoria y proteccion de datos.

## Modulos Principales

- Clientes, contactos, direcciones e instalaciones.
- Puertas/equipos con ficha unica.
- Proveedores, materiales, stock, tarifas, pedidos y albaranes.
- Avisos, incidencias y averias.
- Partes de trabajo.
- Presupuestos.
- Validacion de oficina.
- Facturacion inicial.
- Checklist interactivo visual por tipo de puerta.
- Manuales, documentos, fotografias e historial.
- Equipos de trabajo y dashboard operativo.
- Offline-first para tecnicos.
- Web publica para solicitudes de presupuesto, avisos y captacion comercial.
- Copias de seguridad y recuperacion ante desastre.
- Knowledge Base tecnica con taxonomia, ITI, compatibilidades y Gemelo Digital conceptual.

## Arquitectura Prevista

```text
Web publica
Panel web oficina
App movil tecnico offline-first
        |
        | HTTPS / API REST / JWT
        v
Backend Java 21 + Spring Boot
        |
        |-- PostgreSQL centralizado
        |-- Servidor de archivos
        |-- Sistema de backups
```

## Offline-First

La app movil no debe sincronizar constantemente.

Flujo principal:

1. El tecnico pulsa `Cargar trabajos`.
2. El dispositivo descarga datos necesarios.
3. El tecnico trabaja localmente sin conexion.
4. Se guardan partes, fotos, firmas, materiales, horas y checklists en local.
5. El tecnico pulsa `Enviar trabajo`.
6. Si falla la conexion, no se pierde informacion y se puede reintentar.

El sistema usara UUID, control de versiones, auditoria de sincronizacion y resolucion de conflictos.

## Seguridad y Proteccion de Datos

La plataforma debe aplicar seguridad desde el diseno:

- Autenticacion segura.
- Contraseñas cifradas.
- JWT o sistema equivalente.
- Roles y permisos por modulo y accion.
- Registro de accesos y cambios.
- Validacion de entradas.
- Comunicaciones cifradas.
- Gestion segura de archivos.
- Copias de seguridad cifradas.
- Buenas practicas tecnicas orientadas a RGPD y LOPDGDD.

Este proyecto no sustituye asesoramiento legal, pero documenta medidas tecnicas razonables para proteger datos personales y operativos.

## Documentacion

La documentacion principal esta en `docs/`:

- `01-requisitos-funcionales.md`.
- `02-requisitos-seguridad.md`.
- `03-modelo-datos.md`.
- `04-arquitectura.md`.
- `05-roadmap.md`.
- `06-modulo-checklist.md`.
- `07-ui-ux.md`.
- `08-manuales-historial.md`.
- `09-dashboard.md`.
- `10-offline-first.md`.
- `11-partes-trabajo.md`.
- `12-presupuestos.md`.
- `13-validacion-oficina.md`.
- `14-base-datos-seguridad-backups.md`.
- `15-hardware-infraestructura.md`.
- `16-web-publica.md`.
- `17-clientes-proveedores.md`.
- `18-facturacion.md`.

## Estado

Proyecto en fase de documentacion, arquitectura y modelo conceptual. No se debe generar codigo hasta cerrar la base funcional y tecnica.

## Autor

Francisco Javier Ena Marquez

Proyecto desarrollado como portfolio profesional dentro del proceso de formacion y especializacion en desarrollo de aplicaciones multiplataforma.
