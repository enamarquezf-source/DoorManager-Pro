# DoorManager Pro - Requisitos de seguridad

## 1. Objetivo

La seguridad es una prioridad del proyecto DoorManager Pro. La plataforma gestionara datos de clientes, ubicaciones, puertas automaticas, usuarios internos, fotografias, historiales de intervenciones y comprobaciones tecnicas, por lo que debe aplicar controles solidos desde el MVP.

Este documento define los requisitos iniciales de autenticacion, autorizacion, proteccion de datos, auditoria, validacion, seguridad de API, frontend web/PWA y despliegue seguro.

## 2. Principios de seguridad

- Seguridad por defecto.
- Minimo privilegio.
- Separacion clara de responsabilidades.
- Validacion estricta de entradas.
- Proteccion de credenciales y tokens.
- Trazabilidad de operaciones relevantes.
- Autorizacion real siempre en backend.
- Evitar exposicion innecesaria de informacion interna.
- Preparacion para futuras exigencias de cumplimiento normativo.

## 3. Autenticacion

El sistema usara Spring Security con JWT para autenticar usuarios contra la API REST.

Requisitos:

- Las credenciales deben enviarse exclusivamente por canales seguros en entornos reales.
- Las passwords nunca deben almacenarse en texto plano.
- Las passwords deben cifrarse mediante BCrypt o algoritmo equivalente robusto.
- El login debe devolver un token JWT firmado.
- El JWT debe incluir solo informacion necesaria para identificar al usuario, rol y permisos.
- El JWT debe tener expiracion.
- El sistema debe rechazar tokens expirados, manipulados o mal firmados.
- Los endpoints protegidos deben requerir token valido.
- Los endpoints publicos deben reducirse al minimo imprescindible, como login y documentacion controlada.
- Los usuarios inactivos no deben poder autenticarse.

Consideraciones futuras:

- Refresh tokens.
- Revocacion de sesiones.
- Bloqueo temporal por intentos fallidos.
- Segundo factor de autenticacion para perfiles administrativos.

## 4. Autorizacion

La autorizacion se basara en roles y permisos. El frontend podra ocultar acciones no permitidas, pero la decision de seguridad debe aplicarse siempre en el backend.

Roles iniciales:

- ADMIN.
- RESPONSABLE_TECNICO.
- TECNICO.
- CONSULTA.

Matriz inicial de permisos:

| Recurso | ADMIN | RESPONSABLE_TECNICO | TECNICO | CONSULTA |
| --- | --- | --- | --- | --- |
| Usuarios | CRUD | Lectura limitada | Sin acceso | Sin acceso |
| Roles y permisos | CRUD | Lectura | Sin acceso | Sin acceso |
| Clientes | CRUD | Lectura/edicion | Lectura | Lectura |
| Instalaciones | CRUD | CRUD | Lectura | Lectura |
| Equipos | CRUD | CRUD | Lectura/edicion tecnica | Lectura |
| Intervenciones | CRUD | CRUD | Lectura/actualizacion asignadas | Lectura |
| Comprobaciones de montaje | CRUD/validacion | CRUD/validacion | Lectura/edicion asignadas | Lectura autorizada |
| Comprobaciones de mantenimiento | CRUD/validacion | CRUD/validacion | Lectura/edicion asignadas | Lectura autorizada |
| Fotografias de checks | CRUD | CRUD | Crear/leer asignadas | Lectura autorizada |
| Dashboard | Completo | Operativo | Personalizado | Solo lectura |

Requisitos:

- Los permisos deben comprobarse por endpoint y, cuando aplique, por recurso concreto.
- Las rutas administrativas deben requerir rol ADMIN.
- Los tecnicos no deben poder modificar trabajos o comprobaciones no asignadas salvo permiso explicito.
- La validacion o firma de comprobaciones puede requerir permiso especifico.
- El cambio de rol debe estar restringido a usuarios autorizados.
- El acceso a fotografias debe respetar los mismos permisos que la comprobacion asociada.

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
- Controlar tamano, tipo y almacenamiento de fotografias asociadas a checks.
- Preparar politicas de retencion y backup para datos operativos.

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
- Validar que cada check pertenece a la puerta/equipo indicado.
- Validar que las fotografias pertenecen a una comprobacion accesible por el usuario.

## 7. Seguridad de API

Requisitos:

- Todas las respuestas de error deben tener estructura uniforme.
- Los endpoints deben estar versionados, por ejemplo `/api/v1`.
- Aplicar paginacion en listados para evitar respuestas masivas.
- Restringir CORS a origenes autorizados.
- Configurar cabeceras de seguridad cuando aplique.
- Proteger Swagger/OpenAPI en entornos no locales.
- Evitar exponer trazas internas en respuestas HTTP.
- Aplicar limites razonables a subida de fotografias.
- Separar endpoints publicos, autenticados y administrativos.

Codigos HTTP esperados:

- 200 para consultas correctas.
- 201 para creaciones correctas.
- 204 para acciones sin cuerpo.
- 400 para errores de validacion.
- 401 para autenticacion ausente o invalida.
- 403 para permisos insuficientes.
- 404 para recursos inexistentes o no accesibles.
- 409 para conflictos de negocio.
- 500 para errores internos no controlados.

## 8. Seguridad frontend/PWA

Requisitos:

- El frontend React debe consumir solo la API REST autorizada.
- El frontend no debe contener secretos.
- Las rutas de la aplicacion deben protegerse segun sesion y permisos.
- Las acciones no autorizadas deben ocultarse o deshabilitarse, sin sustituir la validacion backend.
- La PWA debe servirse por HTTPS en entornos reales.
- El service worker no debe cachear informacion sensible sin una decision explicita.
- El cierre de sesion debe limpiar estado local sensible.
- El almacenamiento del token debe minimizar riesgo de exposicion.

## 9. Auditoria y trazabilidad

Desde el MVP se debe preparar una base de auditoria.

Requisitos iniciales:

- Registrar fecha de creacion de entidades principales.
- Registrar fecha de ultima modificacion.
- Registrar usuario creador cuando sea viable.
- Registrar usuario modificador cuando sea viable.
- Mantener historico funcional de intervenciones y comprobaciones.
- Registrar tecnico responsable de cada zona comprobada.
- Registrar fecha y hora de cada check.

Eventos candidatos para auditoria futura:

- Login exitoso y fallido.
- Cambio de password.
- Cambio de rol o permisos.
- Desactivacion de usuarios.
- Desactivacion de clientes, instalaciones o equipos.
- Cierre de intervenciones.
- Creacion, modificacion o validacion de comprobaciones.
- Adjuntos fotograficos anadidos o eliminados.

## 10. Gestion de errores

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
  "path": "/api/v1/customers"
}
```

## 11. Seguridad en base de datos

Requisitos:

- Usar PostgreSQL con usuario de aplicacion de privilegios limitados.
- Gestionar cambios de esquema con Flyway.
- Evitar modificaciones manuales no versionadas del esquema.
- Definir restricciones de integridad referencial.
- Definir indices para claves foraneas y busquedas frecuentes.
- Evitar borrados fisicos de datos de negocio salvo necesidad justificada.
- Garantizar unicidad e integridad de checks por puerta/equipo, tipo y zona cuando aplique.
- Preparar backups en entornos reales.

## 12. Seguridad en despliegue

Requisitos:

- Usar Docker para entornos reproducibles.
- No incluir secretos en imagenes Docker.
- Configurar variables sensibles desde entorno.
- Separar perfiles de desarrollo, test y produccion.
- Desactivar configuraciones inseguras en produccion.
- Usar HTTPS delante de frontend y backend en entornos reales.
- Configurar logs adecuados para diagnostico sin filtrar informacion sensible.

## 13. Pruebas de seguridad iniciales

El MVP debe incluir pruebas o verificaciones para:

- Login correcto.
- Login con credenciales invalidas.
- Acceso sin token a endpoints protegidos.
- Acceso con token invalido.
- Restriccion por rol.
- Restriccion por permiso sobre comprobaciones.
- Validacion de DTOs.
- No exposicion de password en respuestas.
- Rechazo de operaciones sobre recursos inexistentes.
- Rechazo de modificacion de checks no asignados o no autorizados.
