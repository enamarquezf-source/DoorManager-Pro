# DoorManager Pro - Security

| Campo | Valor |
| --- | --- |
| Version | 0.3 |
| Estado | Vivo |
| Fecha | 2026-06-28 |
| Autor | Francisco Javier Ena Marquez |
| Ultima modificacion | 2026-06-28 |

## Indice

1. Enfoque
2. Principios
3. Autenticacion
4. Autorizacion
5. Comunicaciones y datos
6. Gestion segura de archivos
7. Proteccion de APIs
8. Malware y ransomware
9. Auditoria y logs
10. Offline-first seguro
11. Backups y restauracion
12. Cumplimiento RGPD/LOPDGDD
13. Amenazas contempladas
14. Documentos relacionados
15. Proximos desarrollos

## 1. Enfoque

DoorManager Pro debe aplicar Security by Design y Zero Trust desde el inicio.

La plataforma gestionara informacion sensible de clientes, instalaciones, puertas, expedientes, fotos, videos, facturas, presupuestos, firmas, garantias y conocimiento tecnico interno.

## 2. Principios

- Security by Design.
- Zero Trust.
- Minimo privilegio.
- Privacidad por diseno y por defecto.
- Defensa en profundidad.
- Trazabilidad completa.
- Proteccion del conocimiento tecnico.
- Recuperacion garantizada.

## 3. Autenticacion

Requisitos:

- Autenticacion segura.
- Contraseñas cifradas con algoritmo robusto.
- Gestion de sesiones.
- Caducidad de tokens.
- Revocacion de sesiones cuando proceda.
- Proteccion frente a fuerza bruta.
- Registro de accesos.

## 4. Autorizacion

Requisitos:

- Roles y permisos.
- Acceso por modulo.
- Acceso por accion.
- Acceso por recurso.
- Control de propiedad o asignacion.
- Tecnico limitado a trabajos asignados.
- Acciones criticas restringidas.

## 5. Comunicaciones y datos

- Cifrado en transito mediante HTTPS en entornos reales.
- Cifrado de datos sensibles si procede.
- No exponer secretos en cliente.
- No registrar contraseñas ni tokens completos.
- Minimizar datos personales.
- Politicas de retencion.

## 6. Gestion segura de archivos

Archivos protegidos:

- Fotos.
- Videos.
- Facturas.
- Presupuestos.
- Firmas.
- Manuales.
- Planos.
- Esquemas.
- Documentos internos.

Requisitos:

- Validacion de tipos de archivo.
- Validacion de extension y MIME.
- Limitacion de tamano.
- Prevencion de subida de archivos peligrosos.
- Escaneo de archivos en servidor si procede.
- Descarga autorizada.
- Auditoria de accesos sensibles.

## 7. Proteccion de APIs

Requisitos:

- Proteccion contra ataques contra APIs.
- Rate limiting.
- Validacion estricta de entradas.
- Proteccion contra inyeccion SQL.
- Proteccion contra XSS.
- Proteccion contra CSRF cuando aplique.
- DTOs y no exposicion de entidades internas.
- Respuestas de error sin informacion sensible.

## 8. Malware y ransomware

Requisitos:

- Validar archivos subidos.
- Evitar ejecucion de archivos subidos.
- Separar almacenamiento de archivos de ejecucion de aplicacion.
- Backups cifrados y fuera del servidor principal.
- Restauracion probada.
- Permisos minimos en infraestructura.
- Registro de actividad sospechosa.

## 9. Auditoria y logs

Registrar acciones criticas:

- Login y logout.
- Fallos de acceso.
- Cambios de permisos.
- Descargas sensibles.
- Subida o eliminacion de archivos.
- Validacion o cierre de partes.
- Emision o anulacion de facturas.
- Rechazos firmados por cliente.
- Sincronizaciones offline.
- Restauraciones de backup.

Los logs no deben incluir secretos, contraseñas ni tokens completos.

## 10. Offline-first seguro

Requisitos:

- Descargar solo datos necesarios.
- Proteger almacenamiento local si la tecnologia lo permite.
- No almacenar secretos de servidor.
- Usar UUID para evitar duplicados.
- Control de conflictos.
- Auditoria de sincronizacion.
- Posibilidad de limpiar trabajos finalizados del dispositivo.

## 11. Backups y restauracion

- Backup cifrado.
- Backup de base de datos.
- Backup de archivos.
- Copia fuera del servidor principal.
- Registro de backups.
- Alertas de fallo.
- Restauracion probada.
- Acceso restringido a backups.

## 12. Cumplimiento RGPD/LOPDGDD

Buenas practicas tecnicas:

- Privacidad por diseno y por defecto.
- Minimizar datos personales.
- Registrar consentimientos cuando aplique.
- Soportar acceso, rectificacion y eliminacion cuando proceda.
- Definir retencion.
- Controlar encargados y ubicacion de datos en implantaciones reales.

Este documento no sustituye asesoramiento legal.

## 13. Amenazas contempladas

- Malware.
- Ransomware.
- Accesos no deseados.
- Fugas de datos.
- Manipulacion de documentos.
- Robo de credenciales.
- Ataques contra APIs.
- Inyeccion SQL.
- XSS.
- CSRF.
- Codigo malicioso.
- Perdida o robo de dispositivos moviles.

## 14. Documentos relacionados

- `docs/CONSTITUTION.md`.
- `docs/02-requisitos-seguridad.md`.
- `docs/ADR/ADR-003-security-by-design.md`.

## 15. Proximos desarrollos

- Definir matriz de permisos v0.4.
- Definir criterios minimos de hardening.
- Definir politica de gestion de incidentes.
