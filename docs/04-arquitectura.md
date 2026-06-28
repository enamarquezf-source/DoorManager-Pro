# DoorManager Pro - Arquitectura

| Campo | Valor |
| --- | --- |
| Version | 0.3 |
| Estado | Conceptual |
| Fecha | 2026-06-28 |
| Autor | Francisco Javier Ena Marquez |
| Ultima modificacion | 2026-06-28 |

## Indice

Este documento mantiene la numeracion arquitectonica interna. Para decisiones aceptadas consultar `docs/ADR/`.

## Referencias cruzadas

- `docs/PROJECT_DNA.md`.
- `docs/PRODUCT_BIBLE.md`.
- `docs/ADR/`.

## Proximos desarrollos

- Incorporar arquitectura conceptual de Gemelo Digital.
- Definir boundaries entre TOP, Knowledge Base y sincronizacion offline.

## 1. Objetivo

DoorManager Pro sera una plataforma empresarial modular preparada para crecer durante anos. La arquitectura debe soportar oficina, web publica, app movil offline-first, API REST, PostgreSQL centralizado, servidor de archivos, backups, auditoria y seguridad avanzada.

## 2. Componentes

- Panel web interno para oficina.
- Aplicacion movil offline-first para tecnicos.
- Web publica para captacion, solicitudes y avisos.
- Backend Java 21 con Spring Boot.
- API REST documentada con OpenAPI.
- PostgreSQL centralizado.
- Servidor de archivos.
- Servicio de sincronizacion offline.
- Sistema de backups.
- Sistema de auditoria.

## 3. Vista general

```text
Web publica clientes         Panel web oficina           App movil tecnicos
        |                          |                           |
        | HTTPS                    | HTTPS                     | Cargar / Enviar trabajo
        v                          v                           v
                        API REST Spring Boot
        -----------------------------------------------------------------
        | Seguridad | Negocio | Sincronizacion | Archivos | Auditoria |
        -----------------------------------------------------------------
             |                    |                    |
             v                    v                    v
        PostgreSQL central   Servidor archivos   Sistema backups
```

## 4. Backend

Stack:

- Java 21.
- Spring Boot.
- Spring Web.
- Spring Data JPA.
- Spring Security.
- JWT o equivalente.
- Flyway.
- PostgreSQL.
- Swagger/OpenAPI.
- JUnit y Mockito.

Responsabilidades:

- Seguridad y autorizacion.
- Gestion de negocio.
- Validacion de datos.
- API REST.
- Persistencia central.
- Gestion de archivos.
- Auditoria.
- Sincronizacion offline.
- Integracion con backups.

## 5. Frontend web interno

Usuarios:

- Gerencia.
- Administracion.
- Comerciales.
- Jefes de equipo.
- Usuarios de consulta.

Modulos principales:

- Dashboard.
- Clientes.
- Proveedores.
- Instalaciones y puertas.
- Avisos.
- Presupuestos.
- Partes.
- Validacion de oficina.
- Facturacion.
- Documentacion.
- Stock y materiales.
- Configuracion y permisos.

## 6. App movil offline-first

Usuarios:

- Tecnicos.
- Jefes de equipo en campo.

Principios:

- No sincronizacion continua.
- Boton `Cargar trabajos`.
- Trabajo local sin conexion.
- Boton `Enviar trabajo`.
- Reintento manual.
- UUID para evitar duplicados.
- Version para conflictos.
- Auditoria de sincronizacion.

Datos locales:

- Partes asignados.
- Clientes necesarios.
- Instalaciones y puertas.
- Checklists.
- Historial basico.
- Manuales necesarios.
- Fotografias necesarias.
- Materiales.
- Firmas y fotos tomadas.

## 7. Web publica

Objetivos:

- Captar clientes.
- Recibir solicitudes de presupuesto.
- Recibir avisos o reparaciones.
- Mostrar servicios.
- Mostrar anuncios o avisos.

La web publica debe integrarse con oficina creando leads o solicitudes que puedan convertirse en cliente, aviso, presupuesto o parte.

## 8. Servidor de archivos

Debe almacenar:

- Manuales.
- Documentos.
- Fotografias.
- Firmas.
- Videos.
- Planos.
- Esquemas.
- PDFs.
- Facturas y presupuestos generados.

La base de datos guardara metadatos y claves de almacenamiento.

## 9. Base de datos

PostgreSQL sera la base central.

Requisitos:

- Integridad referencial.
- Indices.
- Restricciones.
- Auditoria.
- Versionado offline.
- Borrado logico.
- Migraciones con Flyway.
- Backups consistentes.

## 10. Backups y recuperacion

La arquitectura debe incluir:

- Backup de base de datos.
- Backup de servidor de archivos.
- Copias cifradas.
- Copias fuera del servidor principal.
- Registro y alertas.
- Pruebas de restauracion.
- Plan de recuperacion ante desastre.

## 11. Modulos backend recomendados

- auth.
- authorization.
- users.
- customers.
- suppliers.
- installations.
- doors.
- documents.
- checklist.
- service_requests.
- quotes.
- work_orders.
- office_validation.
- invoices.
- materials_stock.
- work_teams.
- dashboard.
- public_web.
- sync.
- backups.
- audit.
- common.

## 12. API REST

Grupos de endpoints:

- `/api/v1/auth`.
- `/api/v1/users`.
- `/api/v1/customers`.
- `/api/v1/suppliers`.
- `/api/v1/installations`.
- `/api/v1/doors`.
- `/api/v1/documents`.
- `/api/v1/checklists`.
- `/api/v1/service-requests`.
- `/api/v1/quotes`.
- `/api/v1/work-orders`.
- `/api/v1/office-validations`.
- `/api/v1/invoices`.
- `/api/v1/materials`.
- `/api/v1/stock`.
- `/api/v1/dashboard`.
- `/api/v1/public`.
- `/api/v1/sync/download`.
- `/api/v1/sync/upload`.
- `/api/v1/backups`.

## 13. Seguridad arquitectonica

- HTTPS obligatorio en entornos reales.
- Autenticacion segura.
- Autorizacion por modulo, accion y recurso.
- Validacion de entradas.
- DTOs.
- No exponer entidades internas.
- Control de acceso a archivos.
- Registro de auditoria.
- Politicas de retencion.

## 14. Infraestructura

Opciones:

- Cloud.
- Servidor local.
- Modelo mixto.

Recomendacion inicial para portfolio:

- Docker Compose local.
- PostgreSQL en contenedor.
- Backend Spring Boot.
- Frontend web.
- Almacenamiento de archivos local controlado.
- Documentacion de despliegue cloud futuro.

## 15. Riesgos arquitectonicos

- Offline-first incrementa complejidad de sincronizacion.
- Archivos offline pueden consumir mucho almacenamiento.
- Facturacion exige especial cuidado fiscal y legal si se lleva a produccion.
- RGPD requiere procesos organizativos ademas de medidas tecnicas.
- Backups sin pruebas de restauracion generan falsa seguridad.
