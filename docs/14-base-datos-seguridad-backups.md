# DoorManager Pro - Base de datos, seguridad y backups

| Campo | Valor |
| --- | --- |
| Version | 0.3 |
| Estado | Vivo |
| Fecha | 2026-06-28 |
| Autor | Francisco Javier Ena Marquez |
| Ultima modificacion | 2026-06-28 |

## Indice

Este documento mantiene su estructura actual.

## Referencias cruzadas

- `docs/SECURITY.md`.
- `docs/03-modelo-datos.md`.

## Proximos desarrollos

- Incorporar entidades Knowledge Base, taxonomia y Gemelo Digital al modelo de datos.

## 1. Objetivo

Definir criterios de robustez para PostgreSQL, seguridad de datos, RGPD tecnico, copias de seguridad y recuperacion ante desastre.

## 2. Base de datos robusta

Requisitos:

- PostgreSQL.
- Claves primarias.
- Claves foraneas.
- Indices.
- Restricciones.
- Campos de auditoria.
- UUID en entidades criticas.
- Fechas de creacion y actualizacion.
- Usuario creador y modificador.
- Borrado logico donde proceda.
- Version para sincronizacion offline.

## 3. Seguridad de datos

- Acceso por roles y permisos.
- Validacion de entradas.
- Proteccion contra inyeccion SQL.
- Comunicaciones cifradas.
- Gestion segura de archivos.
- Auditoria completa.
- Registro de accesos.
- Registro de cambios.

## 4. RGPD y LOPDGDD

Buenas practicas tecnicas:

- Minimizar datos personales.
- Registrar consentimiento en web publica.
- Controlar finalidad y acceso.
- Facilitar localizacion de datos personales.
- Preparar acceso, rectificacion y eliminacion cuando aplique.
- Definir retencion.
- Proteger backups.

No sustituye asesoramiento legal.

## 5. Estrategia de backup

- Copias automaticas diarias.
- Copias semanales.
- Copias mensuales.
- Copias cifradas.
- Copias fuera del servidor principal.
- Backup de base de datos.
- Backup de documentos.
- Backup de fotografias.
- Backup de firmas.
- Registro de backups.
- Alertas si falla una copia.
- Politica de retencion.

## 6. Restauracion

- Restauracion probada periodicamente.
- Procedimiento documentado.
- Validacion de integridad.
- Registro de restauraciones.
- Acceso restringido.
- Plan de recuperacion ante desastre.

## 7. RPO y RTO

Definiciones recomendadas:

- RPO: perdida maxima de datos aceptable.
- RTO: tiempo maximo de recuperacion aceptable.

Para una primera version profesional se recomienda definir objetivos conservadores y revisarlos segun criticidad real.
