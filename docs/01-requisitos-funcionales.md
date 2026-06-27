# DoorManager Pro - Requisitos funcionales

## 1. Objetivo del producto

DoorManager Pro sera una aplicacion profesional para empresas instaladoras y mantenedoras de puertas automaticas. Su objetivo es centralizar la gestion de clientes, instalaciones, equipos, intervenciones tecnicas, revisiones periodicas, usuarios y roles, ofreciendo una base solida para operaciones diarias y crecimiento futuro.

El MVP debe permitir registrar la informacion esencial del negocio, consultar el estado operativo de las instalaciones y facilitar el seguimiento de trabajos tecnicos.

## 2. Alcance del MVP

El MVP inicial incluira los siguientes modulos:

- Clientes
- Instalaciones
- Puertas y equipos
- Intervenciones
- Revisiones
- Usuarios y roles
- Dashboard basico

No forman parte del MVP inicial:

- Facturacion completa
- Gestion avanzada de stock
- Aplicacion movil nativa
- Firma digital de partes
- Integracion con ERPs externos
- Geolocalizacion en tiempo real
- Planificador avanzado de rutas

Estos elementos podran incorporarse en fases posteriores.

## 3. Actores principales

### Administrador

Usuario con permisos completos sobre la aplicacion. Puede gestionar usuarios, roles, clientes, instalaciones, equipos, intervenciones, revisiones y configuracion general.

### Responsable tecnico

Usuario encargado de supervisar trabajos, asignar intervenciones y revisar el estado de instalaciones y equipos.

### Tecnico

Usuario operativo que consulta y registra intervenciones, revisiones y observaciones tecnicas.

### Usuario de consulta

Usuario con acceso limitado a informacion operativa y reportes, sin capacidad de modificar datos criticos.

## 4. Requisitos por modulo

## 4.1 Clientes

El sistema debe permitir:

- Crear clientes con datos fiscales y de contacto.
- Consultar el listado de clientes.
- Buscar clientes por nombre, CIF/NIF, telefono o email.
- Ver el detalle de un cliente.
- Editar informacion de cliente.
- Desactivar clientes sin eliminar su historico.
- Consultar las instalaciones asociadas a un cliente.

Datos minimos del cliente:

- Nombre comercial o razon social
- CIF/NIF
- Persona de contacto
- Telefono
- Email
- Direccion fiscal
- Estado activo/inactivo
- Observaciones

## 4.2 Instalaciones

El sistema debe permitir:

- Crear instalaciones asociadas a un cliente.
- Registrar ubicacion completa de la instalacion.
- Consultar instalaciones por cliente, localidad, estado o tipo.
- Ver el detalle de una instalacion.
- Editar datos de una instalacion.
- Desactivar instalaciones manteniendo su historico.
- Consultar puertas/equipos asociados.
- Consultar intervenciones y revisiones realizadas en la instalacion.

Datos minimos de la instalacion:

- Cliente asociado
- Nombre o referencia interna
- Direccion
- Localidad
- Provincia
- Codigo postal
- Persona de contacto en ubicacion
- Telefono de contacto
- Estado operativo
- Observaciones

## 4.3 Puertas y equipos

El sistema debe permitir:

- Crear puertas/equipos asociados a una instalacion.
- Clasificar equipos por tipo.
- Registrar datos tecnicos principales.
- Consultar equipos por instalacion, tipo, estado o numero de serie.
- Editar datos tecnicos.
- Desactivar equipos sin eliminar historico.
- Consultar intervenciones y revisiones asociadas a cada equipo.

Tipos iniciales previstos:

- Puerta corredera
- Puerta batiente
- Puerta seccional
- Puerta enrollable
- Barrera automatica
- Persiana automatica
- Otro equipo automatizado

Datos minimos del equipo:

- Instalacion asociada
- Tipo de equipo
- Marca
- Modelo
- Numero de serie
- Fecha de instalacion
- Estado operativo
- Ubicacion dentro de la instalacion
- Observaciones tecnicas

## 4.4 Intervenciones

El sistema debe permitir:

- Crear intervenciones asociadas a cliente, instalacion y opcionalmente equipo.
- Clasificar intervenciones por tipo y prioridad.
- Asignar tecnico responsable.
- Registrar estado de la intervencion.
- Registrar descripcion del problema o trabajo solicitado.
- Registrar solucion aplicada.
- Consultar historico de intervenciones.
- Filtrar por cliente, instalacion, tecnico, estado, prioridad y fechas.
- Cerrar intervenciones con fecha de finalizacion.

Tipos iniciales de intervencion:

- Averia
- Mantenimiento correctivo
- Mantenimiento preventivo
- Instalacion
- Puesta en marcha
- Inspeccion
- Otro

Estados iniciales:

- Pendiente
- Asignada
- En curso
- Finalizada
- Cancelada

Prioridades iniciales:

- Baja
- Media
- Alta
- Urgente

Datos minimos de la intervencion:

- Cliente asociado
- Instalacion asociada
- Equipo asociado opcional
- Tipo
- Prioridad
- Estado
- Tecnico asignado
- Fecha de solicitud
- Fecha planificada
- Fecha de inicio
- Fecha de finalizacion
- Descripcion
- Solucion aplicada
- Observaciones internas

## 4.5 Revisiones

El sistema debe permitir:

- Crear revisiones periodicas asociadas a instalacion y equipo.
- Registrar fecha prevista y fecha realizada.
- Registrar resultado de revision.
- Registrar observaciones tecnicas.
- Consultar revisiones pendientes, realizadas y vencidas.
- Filtrar revisiones por cliente, instalacion, equipo, tecnico, estado y fechas.
- Marcar una revision como completada.

Estados iniciales:

- Programada
- Pendiente
- Realizada
- Vencida
- Cancelada

Resultados iniciales:

- Correcta
- Correcta con observaciones
- Requiere intervencion
- No realizada

Datos minimos de la revision:

- Cliente asociado
- Instalacion asociada
- Equipo asociado
- Tecnico asignado
- Fecha prevista
- Fecha realizada
- Estado
- Resultado
- Observaciones
- Proxima fecha recomendada

## 4.6 Usuarios y roles

El sistema debe permitir:

- Crear usuarios internos.
- Autenticar usuarios mediante credenciales.
- Asignar roles.
- Activar y desactivar usuarios.
- Consultar listado de usuarios.
- Editar datos basicos y rol de usuario.
- Restringir operaciones segun permisos.

Roles iniciales:

- ADMIN
- RESPONSABLE_TECNICO
- TECNICO
- CONSULTA

Datos minimos del usuario:

- Nombre
- Apellidos
- Email
- Password cifrado
- Rol
- Estado activo/inactivo
- Fecha de creacion
- Ultimo acceso

## 4.7 Dashboard basico

El sistema debe mostrar indicadores operativos basicos:

- Numero total de clientes activos.
- Numero total de instalaciones activas.
- Numero total de equipos activos.
- Intervenciones pendientes.
- Intervenciones urgentes.
- Revisiones pendientes.
- Revisiones vencidas.
- Ultimas intervenciones registradas.

El dashboard debe respetar los permisos del usuario autenticado.

## 5. Requisitos transversales

- Todas las entidades principales deben tener identificador unico.
- Las eliminaciones fisicas deben evitarse en entidades de negocio relevantes.
- El sistema debe conservar trazabilidad basica de creacion y modificacion.
- Las busquedas deben admitir paginacion y ordenacion.
- Las respuestas de API deben ser consistentes.
- Los errores deben devolverse con formato uniforme.
- La documentacion OpenAPI debe estar disponible para facilitar pruebas y portfolio.

## 6. Criterios generales de aceptacion

- Un usuario autenticado puede operar solo dentro de los permisos de su rol.
- Un administrador puede gestionar usuarios, clientes, instalaciones, equipos, intervenciones y revisiones.
- Un tecnico puede consultar sus trabajos asignados y registrar avances o cierres segun permisos definidos.
- El sistema impide crear equipos sin instalacion asociada.
- El sistema impide crear instalaciones sin cliente asociado.
- El sistema mantiene el historico de intervenciones y revisiones aunque el cliente, instalacion o equipo se desactive.
- Las operaciones principales quedan preparadas para auditoria futura.
