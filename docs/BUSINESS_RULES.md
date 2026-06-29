# DoorManager Pro - Business Rules

| Campo | Valor |
| --- | --- |
| Version | 0.6 |
| Estado | Vivo |
| Fecha | 2026-06-28 |
| Autor | Francisco Javier Ena Marquez |
| Ultima modificacion | 2026-06-29 |

## Indice

1. Reglas RB-001 a RB-063
2. Documentos relacionados
3. Proximos desarrollos

## 1. Reglas RB-001 a RB-063

### RB-001 Gestion inicial del aviso

Todo aviso debe registrarse desde el primer contacto, independientemente del canal de entrada.

### RB-002 Datos minimos del aviso

Un aviso debe incluir origen, cliente o contacto, ubicacion, descripcion, prioridad estimada y usuario receptor.

### RB-003 Tecnico solo recibe partes asignados

El tecnico no selecciona libremente trabajos. Recibe partes asignados por oficina, SAT, jefe de equipo o responsables autorizados.

### RB-004 Pantalla inicial del tecnico

La pantalla inicial del tecnico debe mostrar trabajos cargados, estado de conexion, pendientes de envio, errores y acceso a `Cargar trabajos` y `Enviar trabajo`.

### RB-005 Identificacion de equipos

Todo equipo debe poder identificarse por codigo interno, codigo cliente, grupo de carga, posicion fisica, numero de serie o equivalencias configuradas.

### RB-006 Tipos de actuacion

Las actuaciones iniciales son reparacion, mantenimiento, instalacion, revision, segunda visita y mejora.

### RB-007 Flujo flexible por empresa

Los flujos deben ser configurables por empresa, cliente, tipo de trabajo y permisos.

### RB-008 Rechazo informado firmado

Si el cliente rechaza una reparacion, deficiencia o recomendacion relevante, debe quedar reflejado y firmado cuando proceda.

### RB-009 Tecnico no cierra partes

El tecnico finaliza y envia el parte, pero no lo cierra administrativamente.

### RB-010 Envio al cliente tras validacion

El cliente recibe parte, fotos, documentos o factura solo tras validacion de oficina o usuario autorizado.

### RB-011 Destinatarios configurables

Los destinatarios de partes, fotos, presupuestos y facturas deben ser configurables por cliente, centro, contacto o tipo de documento.

### RB-012 Clientes con varios centros

Un cliente puede tener varios centros de trabajo, y cada centro puede tener edificios, naves, zonas, muelles y grupos de carga.

### RB-013 Expedientes desde primer contacto

Todo proceso relevante debe poder agruparse en expediente desde el primer contacto.

### RB-014 Identificadores multiples

El sistema debe soportar codigo interno, codigo cliente, OT cliente, codigo ERP externo, codigo de puerta, codigo de grupo de carga y codigo de expediente.

### RB-015 Motor de equivalencias

Debe existir un motor de equivalencias para buscar y relacionar identificadores internos y externos.

### RB-016 Posicion fisica y ciclo de vida

La posicion fisica conserva identidad aunque se sustituya el equipo instalado. El equipo sustituido queda historico.

### RB-017 Vista tecnica simplificada

El tecnico debe ver principalmente el equipo actual y los datos necesarios para trabajar, sin sobrecargarlo con historico irrelevante.

### RB-018 Material previsto/usado

Debe diferenciarse material previsto para preparar la salida y material usado real registrado por el tecnico.

### RB-019 Validacion de materiales

El tecnico no descuenta stock oficial. SAT u oficina validan material antes de actualizar stock.

### RB-020 Autorizacion cliente

Las decisiones del cliente que afecten seguridad, garantia, presupuesto o rechazo de reparacion deben quedar documentadas.

### RB-021 Parte dividido en causa y actuacion real

El parte debe separar causa inicial comunicada y actuacion real realizada. La causa inicial no se sobrescribe.

### RB-022 Averias adicionales segun tipo de parte

El sistema debe permitir registrar averias o deficiencias adicionales encontradas durante la actuacion, segun permisos y tipo de parte.

### RB-023 Gestion flexible de averias adicionales

Las averias adicionales pueden quedar como deficiencia, generar presupuesto independiente, generar segunda visita o quedar rechazadas por cliente con firma.

### RB-024 Politica comercial obligatoria antes de actuar

No se debe iniciar una actuacion operativa si no existe una politica de pago definida. Antes de generar o activar un parte deben existir datos fiscales minimos, CIF/NIF si procede, direccion fiscal, forma de pago, plazos de pago, datos necesarios para reclamacion, condiciones comerciales y responsable administrativo o contacto valido.

El sistema puede permitir leads o clientes provisionales, pero no debe permitir trabajo operativo sin datos de pago suficientes salvo autorizacion expresa de un usuario con permisos.

### RB-025 Modulos independientes y motores funcionales

Los modulos deben poder evolucionar de forma independiente, apoyados en motores funcionales comunes como expediente, equivalencias, conocimiento, garantias, rentabilidad, permisos y auditoria.

### RB-026 Reincidencia de averia y relacion entre partes

Si una averia vuelve a producirse y el parte anterior no esta facturado, puede reasignarse o reabrirse segun permisos. Si el parte anterior ya esta facturado, debe crearse un parte nuevo vinculado al anterior. La relacion debe poder deshacerse con permisos.

### RB-027 Coste de garantia y perdida economica

Toda garantia, reincidencia o trabajo no facturado debe registrar horas, desplazamiento, material, coste interno, motivo, parte original vinculado, importe facturado o no facturado y rentabilidad real.

### RB-028 Flujo de validacion de garantias y facturacion

Cuando un parte pueda estar en garantia, SAT evalua tecnicamente e indica la causa probable. El comercial asignado al cliente toma la decision final de facturacion: facturar, no facturar, facturar parcialmente, gesto comercial o garantia. Debe diferenciarse garantia tecnica de gesto comercial.

### RB-029 Equipo como objeto unico

El equipo instalado es un objeto tecnico unico con identificador interno inmutable, fabricante, modelo, numero de serie, fecha de instalacion, garantia, documentacion e historial. No debe confundirse con la referencia fisica donde esta instalado.

### RB-030 Codigo de sustitucion con S

Cuando un equipo se sustituye completamente, el codigo visible del nuevo equipo debe conservar la base de la referencia y añadir una `S` por cada sustitucion: `26011001`, `26011001S`, `26011001SS`, `26011001SSS`.

### RB-031 Cadena de sustituciones

Cada referencia fisica debe conservar una linea de vida con equipo original, equipos sustituidos y equipo actual. Los equipos antiguos quedan historicos y no se borran.

### RB-032 Garantia pertenece al equipo instalado

La garantia pertenece al equipo instalado, no a la referencia fisica ni al equipo anterior. Cada equipo nuevo genera su propio ciclo de garantia conforme a legislacion, fabricante, contrato o condiciones aplicables. No se hereda garantia de equipos anteriores.

### RB-033 Libro Tecnico del Equipo

Cada equipo instalado debe generar un Libro Tecnico del Equipo desde el check de instalacion. La instalacion no se considera completa si no queda creado el Libro Tecnico del Equipo con datos tecnicos, pruebas, fotografias, garantia, documentacion, validacion del cliente e historial posterior.

### RB-034 Solicitud de material sin decision tecnica unilateral

Cuando falte material, el tecnico puede solicitarlo y documentar la necesidad, pero no decide compras, proveedor final, logistica ni imputacion administrativa. SAT, almacen, compras u oficina gestionan la decision segun politica empresarial.

### RB-035 Solicitud de Material Pendiente

Toda falta de material relevante debe poder generar una Solicitud de Material Pendiente vinculada a expediente, parte, equipo y proveedor. Debe prepararse para conectarse en el futuro con pedido, albaran, factura de proveedor y factura al cliente.

### RB-036 Separacion entre trabajo tecnico y administrativo

El tecnico no debe hacer trabajo de oficina. La app movil debe centrarse en diagnostico, trabajo realizado, fotos, horas, desplazamiento, material usado, ITI, deficiencias, firma y envio. Oficina, SAT, comercial y administracion completan la parte no tecnica.

### RB-037 Aviso anticipado de disponibilidad

Si un tecnico preve terminar antes o detecta una incidencia operativa, puede avisar a SAT. El aviso no reorganiza automaticamente la jornada: SAT decide si reasigna, adelanta trabajos o mantiene la planificacion.

### RB-038 Panel SAT de inicio de jornada

SAT debe disponer de un panel de inicio de jornada con tecnicos disponibles, trabajos sin finalizar del dia anterior, tareas programadas, disponibilidad de material, disponibilidad de herramientas/equipos, climatologia, requisitos de acceso y tecnicos habilitados para cada trabajo.

### RB-039 Validacion informativa de tecnicos

Al asignar tecnico a cliente o trabajo, el sistema debe informar si cumple requisitos de PRL, reconocimiento medico, carnet, habilitacion, formacion, acceso, experiencia, especialidad, EPI y herramientas. No debe bloquear salvo politica configurable.

### RB-040 Centro de avisos y vencimientos

Debe existir un centro transversal de avisos y vencimientos para vehiculos, PRL, reconocimientos medicos, certificados, carnets, mantenimientos, revisiones, visitas comerciales, presupuestos pendientes, material pendiente, garantias y contratos. Cada aviso debe permitir responsable, departamento, prioridad, fecha de vencimiento, dias de preaviso y estado.

### RB-041 Plataforma transversal y Workspaces

DMP debe operar como plataforma transversal por departamentos sobre un nucleo comun de clientes, centros, expedientes, partes, equipos, materiales, documentos, historial, auditoria y conocimiento tecnico.

### RB-042 Un unico dato, multiples perspectivas

Cada departamento debe modificar solo la informacion que corresponde a su funcion. Los datos se relacionan entre departamentos sin mezclar responsabilidades.

### RB-043 Visibilidad configurable del portal cliente

El portal cliente solo mostrara expedientes, centros, pedidos, reparaciones, mantenimientos, documentos, estados, facturas, informes, acciones y datos pendientes que la empresa usuaria decida publicar mediante configuracion.

### RB-044 Aislamiento del portal cliente

El portal cliente debe aplicar aislamiento estricto entre empresas y clientes, autorizacion por peticion, usuarios individuales, identificadores no predecibles, permisos por organizacion, centro, expediente y documento, sesiones seguras y auditoria de accesos y descargas.

### RB-045 Modulos implantados con derecho de uso vitalicio

Un modulo implantado mantiene su derecho de uso para esa empresa y no debe retirarse automaticamente ni perder sus datos. Deben separarse derecho de uso, alojamiento, soporte, mantenimiento, integraciones y nuevas ampliaciones.

### RB-046 Implantacion decidida por el cliente

La empresa cliente decide cuando activar modulos, avanzar de fase, retirar el sistema anterior e iniciar produccion. DMP y el proveedor analizan, recomiendan, forman y guian.

### RB-047 Convivencia con sistema antiguo

DMP debe permitir convivencia progresiva con sistemas anteriores, registrando sistema de origen, referencia externa, identificador externo, numeros externos, enlace, observaciones y estado de migracion.

### RB-048 Referencia externa generica

La referencia externa debe ser generica y no depender de un ERP concreto. No se implementan conectores especificos hasta decision posterior.

### RB-049 Pedidos por expediente, parte, equipo o stock

DMP debe permitir pedidos vinculados a expediente, parte concreto, equipo o stock general. Una factura de proveedor puede agrupar varios pedidos, albaranes, expedientes y partes sin perder trazabilidad por linea.

### RB-050 Autorizacion humana obligatoria de compras

DMP puede detectar necesidades, consolidar, comparar, proponer, preparar PDF o correos y mostrar vista previa, pero nunca aprobar, emitir ni enviar un pedido sin accion expresa de usuario autorizado.

### RB-051 Entrada del material segun documentacion real

La unidad economica y de stock inicial depende de como el material entra documentado por el proveedor: unidad individual, equipo completo o componentes separados.

### RB-052 Prohibicion de desglose economico ficticio

DMP no debe inventar desglose economico interno de componentes cuando el proveedor facture un equipo completo con un unico precio. Los componentes pueden existir tecnicamente sin coste individual.

### RB-053 Stock distribuido

DMP debe controlar almacen central, almacenes secundarios, furgonetas, ubicaciones de cliente u obra, material reservado, material pendiente y material defectuoso cuando exista incidencia real. Todo traslado genera movimiento trazable.

### RB-054 Fiabilidad de stock

Cada almacen o furgoneta debe poder tener indice de fiabilidad segun recuento, movimientos, diferencias, ajustes, devoluciones pendientes y movimientos no validados. El indice informa, pero no bloquea.

### RB-055 Reservas reasignables

Una reserva de material no es bloqueo rigido. Usuarios autorizados pueden reasignar material reservado conservando origen, destino, partes afectados, usuario, fecha y motivo opcional.

### RB-056 Advertencia sin bloqueo ante stock negativo

Si una reasignacion deja stock negativo, otro parte incompleto o afecta planificacion, DMP debe avisar claramente, pero permitir continuar si el usuario tiene permisos.

### RB-057 Necesidad de reposicion

Si una reserva, consumo o ajuste deja el stock negativo o por debajo del minimo, DMP genera una Necesidad de Reposicion. No crea pedido automaticamente.

### RB-058 Consolidacion de necesidades

DMP debe agrupar necesidades por material y mostrar cantidad total, desglose por expediente y parte, cantidad para recuperar minimos, fechas, prioridades y ubicaciones. Compras decide como cubrirlas.

### RB-059 Separacion entre logistica e historial tecnico

Compras y logistica registran pedido, albaran, factura, entrega, devolucion, sustitucion, garantia de proveedor y stock. El historial tecnico registra componente instalado, equipo destino, parte, fecha, tecnico, causa, pruebas y resultado.

### RB-060 Reparacion frente a sustitucion

El historial tecnico debe distinguir reparacion del mismo componente y sustitucion por componente nuevo, conservando componente sustituido, componente nuevo, fecha, parte, tecnico, causa, pruebas y resultado.

### RB-061 Busqueda transversal

El buscador tecnico debe operar sobre equipo, varios equipos, centro, cliente, familia o todo el parque tecnico, con filtros tecnicos y administrativos, respetando permisos y aislamiento de datos.

### RB-062 Exportaciones y plantillas

Los resultados deben poder exportarse a Excel y PDF como informe detallado o resumen configurable. Las plantillas deben ser personalizables por empresa.

### RB-063 Seleccion de fotografias en informes

Al generar PDF debe poder elegirse todas las fotografias, solo fotografias marcadas como relevantes o ninguna, segun informe, usuario y permisos.

## 2. Documentos relacionados

- `docs/PRODUCT_BIBLE.md`.
- `docs/KNOWLEDGE_ENGINE.md`.
- `docs/ADR/ADR-002-expediente-unico.md`.
- `docs/ADR/ADR-005-referencia-fisica-equipo-libro-tecnico.md`.
- `docs/ARCHITECTURE/WORKSPACE_ARCHITECTURE.md`.
- `docs/OPERATIONS/SAT_DAILY_PLANNING.md`.
- `docs/OPERATIONS/TECHNICIAN_QUALIFICATION_ENGINE.md`.
- `docs/OPERATIONS/ALERTS_AND_EXPIRATIONS_CENTER.md`.
- `docs/OPERATIONS/MATERIAL_REQUESTS.md`.
- `docs/PRODUCT/MODULAR_PRODUCT_STRATEGY.md`.
- `docs/IMPLEMENTATION/IMPLEMENTATION_AND_ADOPTION.md`.
- `docs/IMPLEMENTATION/LEGACY_TRANSITION.md`.
- `docs/OPERATIONS/SUPPLIERS_PURCHASING_AND_STOCK.md`.
- `docs/OPERATIONS/STOCK_RELIABILITY.md`.
- `docs/OPERATIONS/TECHNICAL_HISTORY_AND_SEARCH.md`.
- `docs/REPORTING/EXPORTS_AND_TEMPLATES.md`.
- `docs/PORTALS/CLIENT_PORTAL.md`.

## 3. Proximos desarrollos

- Clasificar reglas por modulo.
- Asignar prioridad y origen de cada regla.
- Convertir reglas criticas en criterios de aceptacion.
