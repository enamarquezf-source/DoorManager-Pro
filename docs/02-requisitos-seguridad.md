# DoorManager Pro - Requisitos de seguridad y proteccion de datos

| Campo | Valor |
| --- | --- |
| Version | 0.3 |
| Estado | Vivo |
| Fecha | 2026-06-28 |
| Autor | Francisco Javier Ena Marquez |
| Ultima modificacion | 2026-06-28 |

## Indice

Este documento mantiene la numeracion de seguridad interna. Para el enfoque fundacional consultar `docs/SECURITY.md` y `docs/ADR/ADR-003-security-by-design.md`.

## Referencias cruzadas

- `docs/SECURITY.md`.
- `docs/CONSTITUTION.md`.
- `docs/ADR/ADR-003-security-by-design.md`.

## Proximos desarrollos

- Definir matriz completa de roles y permisos.
- Definir politica de incidentes de seguridad.

## 1. Objetivo

DoorManager Pro gestionara datos personales, clientes, proveedores, presupuestos, facturas, partes de trabajo, fotografias, firmas, manuales, documentos, ubicaciones e historiales tecnicos. La seguridad debe disenarse desde el inicio.

Este documento recoge buenas practicas tecnicas orientadas a RGPD y LOPDGDD, sin sustituir asesoramiento legal especializado.

## 2. Principios

- Seguridad por defecto.
- Minimo privilegio.
- Privacidad desde el diseno.
- Trazabilidad completa.
- Cifrado de comunicaciones.
- Control de acceso por modulo y accion.
- Proteccion de archivos sensibles.
- Copias de seguridad cifradas.
- Restauracion segura.
- Minimización de datos personales.

## 3. Autenticacion

Requisitos:

- Autenticacion segura para usuarios internos.
- Contraseñas cifradas con BCrypt o algoritmo robusto equivalente.
- JWT o sistema equivalente con expiracion.
- Control de sesiones.
- Revocacion o invalidacion de sesiones cuando proceda.
- Bloqueo o proteccion ante intentos repetidos de login.
- Registro de accesos exitosos y fallidos.
- Usuarios inactivos sin acceso.

## 4. Roles y permisos

Roles iniciales:

- ADMIN.
- GERENTE.
- ADMINISTRATIVO.
- COMERCIAL.
- JEFE_EQUIPO.
- TECNICO.
- CONSULTA.

El sistema debe permitir permisos por:

- Modulo.
- Accion.
- Recurso.
- Propiedad o asignacion.

Ejemplos de permisos:

- CLIENTES_LEER.
- CLIENTES_EDITAR.
- PROVEEDORES_GESTIONAR.
- PARTES_VALIDAR.
- PRESUPUESTOS_CREAR.
- FACTURAS_EMITIR.
- DOCUMENTOS_DESCARGAR.
- CHECKLIST_COMPLETAR.
- SYNC_ENVIAR_TRABAJO.
- BACKUPS_CONSULTAR_ESTADO.

## 5. Auditoria

Debe registrarse auditoria de:

- Accesos.
- Cambios de datos.
- Cambios de permisos.
- Subida, descarga o eliminacion de archivos.
- Carga y envio de trabajos offline.
- Validacion o rechazo de partes.
- Emision o anulacion de facturas.
- Generacion de PDFs.
- Restauraciones de backup.

Datos minimos:

- Usuario.
- Fecha y hora.
- Accion.
- Modulo.
- Recurso afectado.
- Resultado.
- IP o dispositivo cuando aplique.
- Detalles tecnicos no sensibles.

## 6. Proteccion contra ataques comunes

Requisitos:

- Usar JPA/consultas parametrizadas para reducir riesgo de inyeccion SQL.
- Validar entradas con DTOs y Bean Validation.
- Sanitizar campos mostrados en interfaz.
- Limitar tamanos de payload y archivos.
- Configurar CORS de forma restrictiva.
- Configurar cabeceras de seguridad.
- No exponer stack traces.
- No registrar contraseñas, tokens completos ni secretos.
- Proteger endpoints de subida de archivos.

## 7. Archivos sensibles

Archivos protegidos:

- Manuales.
- Fotografias.
- Firmas.
- Documentos.
- Facturas.
- Presupuestos.
- Informes.
- Esquemas y planos.

Requisitos:

- Acceso siempre autorizado por backend.
- URLs temporales o descarga controlada cuando proceda.
- Validacion de tipo MIME, extension y tamano.
- Separacion de metadatos y binarios.
- Backup cifrado de archivos.
- Registro de accesos relevantes.

## 8. RGPD y LOPDGDD

Buenas practicas tecnicas:

- Minimizar datos personales recogidos.
- Registrar consentimiento en formularios publicos.
- Definir finalidad del tratamiento.
- Aplicar control de acceso estricto.
- Permitir localizar datos de una persona.
- Preparar procesos para acceso, rectificacion y eliminacion cuando aplique.
- Aplicar borrado logico o anonimización cuando exista obligacion de conservar historico fiscal o tecnico.
- Definir politica de retencion.
- Evitar almacenar datos innecesarios en dispositivos moviles.
- Documentar encargados, ubicacion de datos y backups en implantaciones reales.

## 9. Seguridad offline-first

Requisitos:

- Descargar al movil solo trabajos necesarios.
- Proteger almacenamiento local si la tecnologia elegida lo permite.
- No guardar secretos de servidor en el cliente.
- Usar UUID para datos creados offline.
- Evitar duplicados en reintentos.
- Detectar conflictos por version.
- Registrar auditoria de sincronizacion.
- Permitir borrar datos locales tras cierre o sincronizacion segun politica.

## 10. Copias de seguridad

Requisitos:

- Backups automaticos diarios.
- Backups semanales y mensuales.
- Backups cifrados.
- Copias fuera del servidor principal.
- Registro de ejecucion.
- Alertas por fallo.
- Pruebas periodicas de restauracion.
- Control de acceso a backups.
- Backup de PostgreSQL y del servidor de archivos.

## 11. Restauracion segura

Requisitos:

- Documentar proceso de restauracion.
- Verificar integridad del backup.
- Registrar quien restaura y cuando.
- Evitar restauraciones no autorizadas.
- Probar recuperacion en entorno controlado.
- Definir RPO y RTO objetivo.

## 12. Pruebas minimas de seguridad

- Login valido e invalido.
- Acceso sin token.
- Acceso con token caducado.
- Permisos por modulo y accion.
- Acceso denegado a archivos no autorizados.
- Validacion de formularios publicos.
- Rechazo de archivos no permitidos.
- Sincronizacion offline duplicada.
- Conflicto de sincronizacion.
- Restauracion de backup en entorno de prueba.
