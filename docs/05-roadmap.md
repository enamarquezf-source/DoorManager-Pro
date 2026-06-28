# DoorManager Pro - Roadmap

| Campo | Valor |
| --- | --- |
| Version | 0.3 |
| Estado | Vivo |
| Fecha | 2026-06-28 |
| Autor | Francisco Javier Ena Marquez |
| Ultima modificacion | 2026-06-28 |

## Indice

Este documento mantiene la numeracion del roadmap. La version 0.4 debe incorporar hitos de Knowledge Base, Gemelo Digital y compatibilidades.

## Referencias cruzadas

- `docs/PROJECT_DNA.md`.
- `docs/PRODUCT_BIBLE.md`.
- `docs/KNOWLEDGE_BASE/README.md`.

## Proximos desarrollos

- Reordenar fases con TOP y Knowledge Base como ejes.
- Crear roadmap v0.4 por hitos verificables.

## 1. Objetivo

Definir una evolucion realista para construir DoorManager Pro como plataforma profesional de portfolio y producto empresarial escalable.

## 2. Principios

- Documentar antes de codificar.
- Construir una base de datos robusta.
- Seguridad desde el inicio.
- Offline-first como requisito critico.
- Separar archivos de datos relacionales.
- Preparar backups y recuperacion.
- Evitar sobredimensionar la primera version sin bloquear crecimiento.

## 3. Fase 0 - Documentacion maestra

Entregables:

- Requisitos funcionales.
- Seguridad y RGPD.
- Modelo de datos.
- Arquitectura.
- Roadmap.
- Documentos especificos de checklist, UI, historial, dashboard, offline, partes, presupuestos, validacion, backups, hardware, web publica, clientes/proveedores y facturacion.

Criterio de salida:

- La documentacion describe todos los modulos actuales sin contradicciones relevantes.

## 4. Fase 1 - Base tecnica backend y datos

Entregables:

- Proyecto Spring Boot Java 21.
- PostgreSQL.
- Flyway.
- Docker Compose.
- OpenAPI.
- Manejo global de errores.
- Estructura modular.

Criterio de salida:

- Backend arranca y expone salud y documentacion.

## 5. Fase 2 - Seguridad

Entregables:

- Usuarios.
- Roles.
- Permisos.
- JWT o equivalente.
- Auditoria basica.
- Registro de accesos.
- Tests de permisos.

Criterio de salida:

- Los modulos quedan protegidos por roles y permisos.

## 6. Fase 3 - Clientes, instalaciones y puertas

Entregables:

- Clientes.
- Contactos.
- Direcciones.
- Instalaciones.
- Tipos de puerta.
- Puertas/equipos.
- Ficha unica de puerta.

Criterio de salida:

- Una puerta puede consultarse con cliente, ubicacion, datos tecnicos e historial inicial.

## 7. Fase 4 - Documentos, manuales y archivos

Entregables:

- Servidor de archivos local.
- Metadatos en base de datos.
- Manuales.
- Documentos.
- Fotografias.
- Firmas.
- Control de permisos.

Criterio de salida:

- Los archivos se suben, protegen y consultan desde entidades del sistema.

## 8. Fase 5 - Proveedores, materiales y stock

Entregables:

- Proveedores.
- Materiales.
- Tarifas.
- Stock.
- Movimientos.
- Relacion con partes.

Criterio de salida:

- Un parte puede consumir materiales controlados.

## 9. Fase 6 - Partes de trabajo

Entregables:

- Tipos de parte.
- Estados.
- Horas.
- Desplazamientos.
- Materiales usados.
- Fotos.
- Firma.
- Checklist asociado.

Criterio de salida:

- Un tecnico puede completar un parte en flujo controlado.

## 10. Fase 7 - Validacion de oficina

Entregables:

- Revision de horas, desplazamiento, materiales, fotos, firma y observaciones.
- Validar.
- Rechazar.
- Solicitar correccion.
- Generar PDF.
- Pasar a facturacion.
- Auditoria completa.

Criterio de salida:

- Un parte enviado no pasa a facturacion sin validacion.

## 11. Fase 8 - Presupuestos

Entregables:

- Presupuestos.
- Lineas.
- Estados.
- Envio.
- Aceptacion.
- Conversion a partes.

Criterio de salida:

- Un presupuesto aceptado genera uno o varios partes.

## 12. Fase 9 - Facturacion inicial

Entregables:

- Facturas.
- Lineas.
- Estados.
- Relacion con partes validados.
- Relacion con presupuestos.
- IVA.

Criterio de salida:

- Un parte validado puede convertirse en factura inicial.

## 13. Fase 10 - Offline-first movil

Entregables:

- Cargar trabajos.
- Base local conceptual.
- Enviar trabajo.
- Reintentos.
- Duplicados por UUID.
- Conflictos por version.
- Auditoria de sincronizacion.

Criterio de salida:

- El tecnico puede trabajar sin conexion y enviar despues.

## 14. Fase 11 - Web publica

Entregables:

- Paginas de servicios.
- Anuncios o avisos.
- Formulario de presupuesto.
- Formulario de aviso o reparacion.
- Consentimiento de proteccion de datos.
- Entrada como lead en oficina.

Criterio de salida:

- Una solicitud web puede convertirse en cliente, aviso, presupuesto o parte.

## 15. Fase 12 - Backups, infraestructura y demo

Entregables:

- Estrategia de backup.
- Registro de backups.
- Prueba de restauracion.
- Documentacion hardware.
- Datos semilla.
- Demo profesional.

Criterio de salida:

- El proyecto puede presentarse con arquitectura, datos, seguridad y recuperacion documentadas.
