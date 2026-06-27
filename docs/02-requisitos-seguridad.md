# DoorManager Pro - Requisitos de seguridad

## 1. Objetivo

La seguridad es una prioridad del proyecto DoorManager Pro. La aplicacion gestionara datos de clientes, ubicaciones, instalaciones tecnicas, usuarios internos e historiales de intervenciones, por lo que debe aplicar controles solidos desde el MVP.

Este documento define los requisitos iniciales de autenticacion, autorizacion, proteccion de datos, auditoria, validacion y despliegue seguro.

## 2. Principios de seguridad

- Seguridad por defecto.
- Minimo privilegio.
- Separacion clara de responsabilidades.
- Validacion estricta de entradas.
- Proteccion de credenciales.
- Trazabilidad de operaciones relevantes.
- Evitar exposicion innecesaria de informacion interna.
- Preparacion para futuras exigencias de cumplimiento normativo.

## 3. Autenticacion

El sistema usara Spring Security con JWT para autenticar usuarios.

Requisitos:

- Las credenciales deben enviarse exclusivamente por canales seguros en entornos reales.
- Las passwords nunca deben almacenarse en texto plano.
- Las passwords deben cifrarse mediante un algoritmo robusto como BCrypt.
- El login debe devolver un token JWT firmado.
- El JWT debe incluir solo informacion necesaria para identificar al usuario y sus permisos.
- El JWT debe tener expiracion.
- El sistema debe rechazar tokens expirados, manipulados o mal firmados.
- Los endpoints protegidos deben requerir token valido.
- Los endpoints publicos deben reducirse al minimo imprescindible, como login y documentacion controlada.

Consideraciones futuras:

- Refresh tokens.
- Revocacion de sesiones.
- Bloqueo temporal por intentos fallidos.
- Segundo factor de autenticacion para perfiles administrativos.

## 4. Autorizacion

La autorizacion se basara en roles y permisos.

Roles iniciales:

- ADMIN
- RESPONSABLE_TECNICO
- TECNICO
- CONSULTA

Matriz inicial de permisos:

| Recurso | ADMIN | RESPONSABLE_TECNICO | TECNICO | CONSULTA |
| --- | --- | --- | --- | --- |
| Usuarios | CRUD | Lectura limitada | Sin acceso | Sin acceso |
| Clientes | CRUD | Lectura/edicion | Lectura | Lectura |
| Instalaciones | CRUD | CRUD | Lectura | Lectura |
| Equipos | CRUD | CRUD | Lectura/edicion tecnica | Lectura |
| Intervenciones | CRUD | CRUD | Lectura/actualizacion asignadas | Lectura |
| Revisiones | CRUD | CRUD | Lectura/actualizacion asignadas | Lectura |
| Dashboard | Completo | Operativo | Personalizado | Solo lectura |

Requisitos:

- Los permisos deben comprobarse en backend, no solo en frontend.
- Las rutas administrativas deben requerir rol ADMIN.
- Los tecnicos no deben poder modificar trabajos no asignados salvo permiso explicito.
- Los usuarios inactivos no deben poder autenticarse.
- El cambio de rol debe estar restringido a usuarios autorizados.

## 5. Proteccion de datos

Requisitos:

- No devolver passwords, hashes ni datos sensibles innecesarios en respuestas de API.
- Usar DTOs para controlar la informacion expuesta.
- Validar y normalizar emails, telefonos y campos identificativos.
- Evitar mensajes de error que revelen informacion sensible.
- Registrar solo la informacion necesaria en logs.
- No registrar tokens JWT completos.
- No registrar passwords ni datos secretos.
- Configurar secretos mediante variables de entorno o mecanismos seguros equivalentes.
- Evitar credenciales hardcodeadas en codigo o repositorio.

## 6. Validacion de entrada

Todas las entradas externas deben validarse antes de procesarse.

Requisitos:

- Validar campos obligatorios.
- Validar formatos de email, fechas, telefonos y estados.
- Limitar longitudes maximas de texto.
- Rechazar valores no contemplados en enumeraciones.
- Sanitizar campos libres cuando se muestren en interfaces web.
- Usar Bean Validation en DTOs de entrada.
- Evitar confiar en IDs recibidos sin comprobar existencia y permisos.

## 7. Seguridad de API

Requisitos:

- Todas las respuestas de error deben tener estructura uniforme.
- Los endpoints deben estar versionados, por ejemplo `/api/v1`.
- Aplicar paginacion en listados para evitar respuestas masivas.
- Restringir CORS a origenes autorizados.
- Configurar cabeceras de seguridad cuando aplique.
- Proteger Swagger/OpenAPI en entornos no locales.
- Evitar exponer trazas internas en respuestas HTTP.

Codigos HTTP esperados:

- 200 para consultas correctas.
- 201 para creaciones correctas.
- 204 para eliminaciones logicas o acciones sin cuerpo.
- 400 para errores de validacion.
- 401 para autenticacion ausente o invalida.
- 403 para permisos insuficientes.
- 404 para recursos inexistentes o no accesibles.
- 409 para conflictos de negocio.
- 500 para errores internos no controlados.

## 8. Auditoria y trazabilidad

Desde el MVP se debe preparar una base de auditoria.

Requisitos iniciales:

- Registrar fecha de creacion de entidades principales.
- Registrar fecha de ultima modificacion.
- Registrar usuario creador cuando sea viable.
- Registrar usuario modificador cuando sea viable.
- Mantener historico funcional de intervenciones y revisiones.

Eventos candidatos para auditoria futura:

- Login exitoso y fallido.
- Cambio de password.
- Cambio de rol.
- Desactivacion de usuarios.
- Desactivacion de clientes, instalaciones o equipos.
- Cierre de intervenciones.
- Resultado de revisiones.

## 9. Gestion de errores

Requisitos:

- Centralizar el tratamiento de excepciones.
- No exponer stack traces al cliente.
- Diferenciar errores de validacion, negocio, autenticacion y sistema.
- Incluir identificador de error o timestamp para facilitar soporte.
- Mantener mensajes claros pero no reveladores.

Formato recomendado de error:

```json
{
  "timestamp": "2026-06-28T10:00:00Z",
  "status": 400,
  "error": "VALIDATION_ERROR",
  "message": "La solicitud contiene campos no validos",
  "path": "/api/v1/clientes"
}
```

## 10. Seguridad en base de datos

Requisitos:

- Usar PostgreSQL con usuario de aplicacion de privilegios limitados.
- Gestionar cambios de esquema con Flyway.
- Evitar modificaciones manuales no versionadas del esquema.
- Definir restricciones de integridad referencial.
- Definir indices para claves foraneas y busquedas frecuentes.
- Evitar borrados fisicos de datos de negocio salvo necesidad justificada.
- Preparar backups en entornos reales.

## 11. Seguridad en despliegue

Requisitos:

- Usar Docker para entornos reproducibles.
- No incluir secretos en imagenes Docker.
- Configurar variables sensibles desde entorno.
- Separar perfiles de desarrollo, test y produccion.
- Desactivar configuraciones inseguras en produccion.
- Usar HTTPS delante de la aplicacion en entornos reales.
- Configurar logs adecuados para diagnostico sin filtrar informacion sensible.

## 12. Pruebas de seguridad iniciales

El MVP debe incluir pruebas o verificaciones para:

- Login correcto.
- Login con credenciales invalidas.
- Acceso sin token a endpoints protegidos.
- Acceso con token invalido.
- Restriccion por rol.
- Validacion de DTOs.
- No exposicion de password en respuestas.
- Rechazo de operaciones sobre recursos inexistentes.
