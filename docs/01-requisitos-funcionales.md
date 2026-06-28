# DoorManager Pro - Requisitos funcionales

## 1. Objetivo del producto

DoorManager Pro sera una plataforma web profesional responsive/PWA para empresas instaladoras y mantenedoras de puertas automaticas. Su objetivo es centralizar la gestion de clientes, instalaciones, puertas/equipos, intervenciones, comprobaciones de montaje, comprobaciones de mantenimiento, usuarios, roles y permisos.

La aplicacion debe poder utilizarse desde ordenador, movil y tablet mediante navegador moderno. Todos los dispositivos accederan a una base de datos PostgreSQL centralizada a traves de una API REST segura.

## 2. Alcance del MVP

El MVP inicial incluira los siguientes modulos:

- Autenticacion.
- Usuarios, roles y permisos.
- Clientes.
- Instalaciones.
- Puertas y equipos.
- Intervenciones tecnicas.
- Comprobaciones de montaje.
- Comprobaciones de mantenimiento.
- Checklist visual interactivo por puerta/equipo.
- Historial de checks por puerta/equipo.
- Dashboard operativo responsive.
- PWA instalable basica.

No forman parte del MVP inicial:

- Aplicacion movil nativa.
- Facturacion completa.
- Gestion avanzada de stock.
- Integracion con ERPs externos.
- Geolocalizacion en tiempo real.
- Planificador avanzado de rutas.
- Sincronizacion offline compleja.

Estos elementos podran incorporarse en fases posteriores.

## 3. Actores principales

### Administrador

Usuario con permisos completos sobre la plataforma. Puede gestionar usuarios, roles, permisos, clientes, instalaciones, equipos, intervenciones, comprobaciones y configuracion general.

### Responsable tecnico

Usuario encargado de supervisar trabajos, asignar intervenciones, revisar historiales y validar comprobaciones cuando proceda.

### Tecnico

Usuario operativo que consulta trabajos asignados y registra intervenciones, comprobaciones, observaciones, fotografias y estados de checklist segun permisos.

### Usuario de consulta

Usuario con acceso limitado de solo lectura a informacion operativa y reportes autorizados.

## 4. Requisitos por modulo

## 4.1 Acceso web responsive/PWA

El sistema debe permitir:

- Acceso desde ordenador, movil y tablet.
- Interfaz responsive adaptada a diferentes tamanos de pantalla.
- Instalacion visual como PWA en dispositivos compatibles.
- Uso seguro mediante HTTPS en entornos reales.
- Consumo de la API REST centralizada desde todos los dispositivos.
- Conservacion de sesion mediante token JWT mientras sea valido.

## 4.2 Clientes

El sistema debe permitir:

- Crear clientes con datos fiscales y de contacto.
- Consultar el listado de clientes.
- Buscar clientes por nombre, CIF/NIF, telefono o email.
- Ver el detalle de un cliente.
- Editar informacion de cliente.
- Desactivar clientes sin eliminar su historico.
- Consultar las instalaciones asociadas a un cliente.

Datos minimos del cliente:

- Nombre comercial o razon social.
- CIF/NIF.
- Persona de contacto.
- Telefono.
- Email.
- Direccion fiscal.
- Estado activo/inactivo.
- Observaciones.

## 4.3 Instalaciones

El sistema debe permitir:

- Crear instalaciones asociadas a un cliente.
- Registrar ubicacion completa de la instalacion.
- Consultar instalaciones por cliente, localidad, estado o tipo.
- Ver el detalle de una instalacion.
- Editar datos de una instalacion.
- Desactivar instalaciones manteniendo su historico.
- Consultar puertas/equipos asociados.
- Consultar intervenciones y comprobaciones realizadas en la instalacion.

Datos minimos de la instalacion:

- Cliente asociado.
- Nombre o referencia interna.
- Direccion.
- Localidad.
- Provincia.
- Codigo postal.
- Persona de contacto en ubicacion.
- Telefono de contacto.
- Estado operativo.
- Observaciones.

## 4.4 Puertas y equipos

El sistema debe permitir:

- Crear puertas/equipos asociados a una instalacion.
- Clasificar equipos por tipo.
- Registrar datos tecnicos principales.
- Consultar equipos por instalacion, tipo, estado o numero de serie.
- Editar datos tecnicos.
- Desactivar equipos sin eliminar historico.
- Consultar intervenciones, comprobaciones e historial de checks de cada equipo.
- Garantizar que las comprobaciones sean unicas para cada puerta/equipo.

Tipos iniciales previstos:

- Puerta corredera.
- Puerta batiente.
- Puerta seccional.
- Puerta enrollable.
- Barrera automatica.
- Persiana automatica.
- Otro equipo automatizado.

Datos minimos del equipo:

- Instalacion asociada.
- Tipo de equipo.
- Marca.
- Modelo.
- Numero de serie.
- Fecha de instalacion.
- Estado operativo.
- Ubicacion dentro de la instalacion.
- Observaciones tecnicas.

## 4.5 Intervenciones

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

- Averia.
- Mantenimiento correctivo.
- Mantenimiento preventivo.
- Instalacion.
- Puesta en marcha.
- Inspeccion.
- Otro.

Estados iniciales:

- Pendiente.
- Asignada.
- En curso.
- Finalizada.
- Cancelada.

## 4.6 Comprobaciones de montaje

El sistema debe permitir:

- Crear comprobaciones de montaje asociadas a una puerta/equipo concreto.
- Registrar tecnico responsable.
- Registrar fecha y hora de cada comprobacion.
- Completar checks por zonas interactivas de la puerta.
- Adjuntar observaciones y fotografias por zona comprobada.
- Registrar firma o validacion cuando proceda.
- Consultar el historial de montaje de cada puerta/equipo.
- Impedir que usuarios sin permiso creen, modifiquen o validen comprobaciones.

## 4.7 Comprobaciones de mantenimiento

El sistema debe permitir:

- Crear comprobaciones de mantenimiento asociadas a una puerta/equipo concreto.
- Diferenciar mantenimientos preventivos, correctivos o revisiones tecnicas.
- Completar checks visuales por zona de la puerta.
- Registrar estado, observaciones, fotografias, fecha y tecnico por zona.
- Consultar comprobaciones pendientes, en curso, finalizadas y vencidas.
- Mantener historial completo de checks por puerta/equipo.
- Restringir el acceso y modificacion segun permisos.

## 4.8 Checklist visual interactivo

El sistema debe permitir:

- Mostrar un dibujo o esquema visual de la puerta.
- Representar zonas pulsables sobre el esquema.
- Abrir la comprobacion correspondiente al pulsar una zona.
- Mostrar el estado visual de cada zona.
- Diferenciar zonas correctas, pendientes, a revisar y con averia.
- Guardar el resultado de cada zona de forma independiente.
- Asociar cada check a una puerta/equipo y a un tipo de comprobacion.

Partes interactivas iniciales:

- Motor.
- Cuadro de maniobra.
- Fotocelulas.
- Guias.
- Hoja u hojas moviles.
- Radar o detector.
- Selector de funciones.
- Bateria.
- Finales de carrera.
- Sistema antiaplastamiento.
- Cerradura o desbloqueo manual.

Estados iniciales por zona:

- Correcto.
- Pendiente.
- Revisar.
- Averia.

Datos minimos por zona comprobada:

- Zona de la puerta.
- Estado.
- Observaciones.
- Fotografias.
- Fecha y hora.
- Tecnico responsable.
- Firma o validacion si procede.

## 4.9 Usuarios, roles y permisos

El sistema debe permitir:

- Crear usuarios internos.
- Autenticar usuarios mediante credenciales.
- Asignar roles.
- Asociar permisos a roles.
- Activar y desactivar usuarios.
- Consultar listado de usuarios.
- Editar datos basicos y rol de usuario.
- Restringir operaciones segun permisos.
- Controlar que puede ver y modificar cada usuario.

Roles iniciales:

- ADMIN.
- RESPONSABLE_TECNICO.
- TECNICO.
- CONSULTA.

## 4.10 Dashboard basico

El sistema debe mostrar indicadores operativos basicos:

- Numero total de clientes activos.
- Numero total de instalaciones activas.
- Numero total de equipos activos.
- Intervenciones pendientes.
- Intervenciones urgentes.
- Comprobaciones de montaje pendientes.
- Comprobaciones de mantenimiento pendientes.
- Checks con averia o a revisar.
- Ultimas intervenciones registradas.

El dashboard debe respetar los permisos del usuario autenticado.

## 5. Requisitos transversales

- Todas las entidades principales deben tener identificador unico.
- Las eliminaciones fisicas deben evitarse en entidades de negocio relevantes.
- El sistema debe conservar trazabilidad de creacion y modificacion.
- Las busquedas deben admitir paginacion y ordenacion.
- Las respuestas de API deben ser consistentes.
- Los errores deben devolverse con formato uniforme.
- La documentacion OpenAPI debe estar disponible para facilitar pruebas y portfolio.
- Las interfaces deben ser usables en escritorio, movil y tablet.
- Las acciones criticas deben validarse en backend, aunque el frontend oculte opciones no autorizadas.

## 6. Criterios generales de aceptacion

- Un usuario autenticado puede operar solo dentro de los permisos de su rol.
- Un administrador puede gestionar usuarios, clientes, instalaciones, equipos, intervenciones y comprobaciones.
- Un tecnico puede consultar sus trabajos asignados y registrar checks segun permisos definidos.
- El sistema impide crear equipos sin instalacion asociada.
- El sistema impide crear instalaciones sin cliente asociado.
- El sistema mantiene el historico de intervenciones y comprobaciones aunque el cliente, instalacion o equipo se desactive.
- Cada puerta/equipo dispone de historial propio de checks.
- El checklist visual permite abrir comprobaciones al pulsar zonas de la puerta.
- Solo usuarios autorizados pueden consultar o modificar comprobaciones.
