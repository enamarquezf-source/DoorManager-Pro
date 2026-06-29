# DoorManager Pro - Product Bible

| Campo | Valor |
| --- | --- |
| Version | 0.6 |
| Estado | Vivo |
| Fecha | 2026-06-28 |
| Autor | Francisco Javier Ena Marquez |
| Ultima modificacion | 2026-06-29 |

## Indice

1. Vision de producto
2. Clientes y roles industriales
3. Cliente, expediente y parte
4. Centros, referencias fisicas y equipos instalados
5. Taxonomia tecnica
6. Identificadores, expediente y buscador universal
7. Avisos, partes y validacion
8. Material, almacen, garantias y reincidencias
9. Presupuestos, facturacion y condiciones comerciales
10. Libro Tecnico del Equipo
11. Configurabilidad empresarial y reglas
12. Workspaces departamentales
12.1 Portal seguro del cliente
12.2 Estrategia modular
13. Planificacion SAT y cualificacion tecnica
14. Centro de avisos y vencimientos
14.1 Implantacion y convivencia con sistemas anteriores
14.2 Proveedores, compras, stock y trazabilidad economica
14.3 Historial tecnico, busqueda e informes
15. Offline-first
16. ITI, informes inteligentes y deficiencias
17. Riesgo, seguridad y cliente
18. Planificacion y web publica
19. Rentabilidad real
20. Documentos relacionados
21. Proximos desarrollos

## 1. Vision de producto

DoorManager Pro es una Technical Operations Platform (TOP): una plataforma integral de operaciones tecnicas para empresas instaladoras y mantenedoras de puertas automaticas.

No es solo un ERP. Gestiona recursos, operaciones, conocimiento, seguridad, mantenimiento, inspecciones, documentacion, decisiones, trazabilidad e inteligencia tecnica.

DoorManager Pro no organiza la empresa ni sustituye al SAT. La plataforma proporciona informacion, trazabilidad y herramientas para que cada empresa tome sus decisiones.

DoorManager Pro sera una aplicacion web completa y modular. Debe poder desplegarse en nube gestionada, nube privada, infraestructura propia del cliente, servidor de terceros o entornos aislados, segun necesidades de seguridad y operativa de cada empresa.

## 2. Clientes y roles industriales

El producto contempla clientes residenciales, comunidades, administradores de fincas y clientes industriales.

En cliente industrial deben diferenciarse contactos como:

- Jefe de mantenimiento.
- Responsable de mantenimiento.
- Jefe de ventas.
- Compras.
- Administracion.
- Direccion de planta.

Cada cliente puede tener varios centros de trabajo. Cada centro puede tener edificios, naves, zonas, muelles y grupos de carga.

El sistema debe permitir leads o clientes provisionales con informacion incompleta, pero no debe permitir trabajo operativo sin politica comercial suficiente salvo autorizacion expresa de un usuario con permisos.

## 3. Cliente, expediente y parte

El flujo recomendado sera:

```text
Cliente -> Expediente -> Parte
```

Este flujo debe ser flexible para reflejar la realidad operativa:

- Cliente nuevo con datos incompletos.
- Expediente creado antes de disponer de todos los datos tecnicos.
- Parte creado aunque falten datos exactos del equipo.
- Estado `pendiente de completar datos` para clientes, expedientes, partes o equipos cuando proceda.

La flexibilidad no elimina los bloqueos comerciales obligatorios. Antes de generar o activar un parte operativo debe existir una politica de pago definida, salvo autorizacion expresa.

## 4. Centros, referencias fisicas y equipos instalados

El Grupo de Carga pasa a ser entidad principal en entornos industriales.

Un grupo de carga puede estar formado por:

- Puerta.
- Plataforma.
- Abrigo.
- Retenedor.
- Topes.
- Calzos.
- Semaforos.
- Otros componentes.

El grupo de carga mantiene su identidad independientemente del reemplazo de cualquiera de sus equipos.

Debe diferenciarse claramente entre referencia fisica y equipo instalado.

Referencia fisica:

- Identifica la posicion o ubicacion dentro de la instalacion.
- Permanece en el tiempo.
- Puede representar muelle, posicion, grupo de carga, codigo cliente u otra referencia estable.

Equipo instalado:

- Es el objeto tecnico real.
- Tiene fabricante, modelo, numero de serie, fecha de instalacion, garantia, documentacion e historial.
- Puede ser sustituido.

Reglas de ciclo de vida:

- La posicion fisica permanece.
- Los equipos evolucionan.
- El historial nunca se pierde.
- El tecnico ve principalmente el equipo actual.
- Oficina, SAT y gerencia consultan tambien el historico antiguo.
- Cada equipo tiene un identificador interno inmutable distinto del codigo visible.

Cuando un equipo se sustituye completamente, el equipo antiguo queda historico, no se borra, y el nuevo equipo ocupa la misma referencia fisica.

El codigo visible de sustitucion añade una `S` por cada sustitucion completa:

```text
26011001    -> equipo original
26011001S   -> primera sustitucion
26011001SS  -> segunda sustitucion
26011001SSS -> tercera sustitucion
```

Cada referencia fisica debe conservar una linea de vida:

```text
Referencia fisica
  -> Equipo original
  -> Equipo sustituido
  -> Equipo actual
```

Cada equipo conserva su propio historial, garantias, fotografias, ITI, deficiencias, presupuestos, reparaciones, mantenimientos y costes.

## 5. Taxonomia tecnica

DoorManager Pro utilizara una taxonomia jerarquica:

```text
Familia
  Tipo
    Marca
      Modelo
        Configuracion
          Componentes
            Accesorios
              Checklist
                Conocimiento tecnico
```

Nunca se asociara directamente un checklist a una puerta. El checklist se vincula a la jerarquia tecnica para mantener coherencia, versionado y reutilizacion.

## 6. Identificadores, expediente y buscador universal

La plataforma debe soportar:

- Codigo interno automatico.
- Codigo cliente.
- OT del cliente.
- Codigo ERP externo del cliente.
- Codigo de puerta.
- Codigo de grupo de carga.
- Codigo de expediente.

Debe existir buscador universal por cualquier codigo y motor de equivalencias entre identificadores.

El Expediente Unico es el contenedor de avisos, partes, presupuestos, facturas, garantias, fotos, firmas, documentos y auditoria.

## 7. Avisos, partes y validacion

Los avisos pueden llegar por telefono, email, WhatsApp, web, comercial, tecnico o responsable de mantenimiento del cliente.

Oficina o comercial reciben. Responsable Tecnico/SAT valora reparaciones. Comercial gestiona montajes y presupuestos. Solo usuarios autorizados generan expedientes.

El tecnico no crea ni cierra partes. Recibe partes asignados de reparacion, mantenimiento o instalacion.

El parte separa causa inicial y trabajo real realizado. La causa inicial no se sobrescribe. El tecnico añade diagnostico y actuacion real. El tecnico finaliza y envia, pero no cierra.

SAT, oficina, comercial o gerencia validan y cierran. El cliente recibe parte, fotos y factura tras validacion. Los destinatarios son configurables por cliente.

Si una averia vuelve a producirse:

- Si el parte anterior no esta facturado, puede reasignarse o reabrirse segun permisos.
- Si el parte anterior ya esta facturado, se crea un parte nuevo vinculado al anterior.
- La relacion entre partes debe poder deshacerse con permisos.
- Si es garantia o reincidencia, debe quedar reflejada la perdida economica.

## 8. Material, almacen, garantias y reincidencias

Debe diferenciarse material previsto y material usado real.

El material previsto ayuda a cargar antes de salir. El tecnico selecciona material usado desde base de datos y puede añadir material manualmente si no existe.

Si una reparacion esta planificada, el material previsto debe venir ya cargado en el parte como `material a usar`. El tecnico solo confirma lo usado realmente.

El tecnico no descuenta stock oficial. SAT u oficina validan material. Solo tras validacion se actualiza stock.

Cuando falta material, el tecnico puede solicitarlo, pero no decide compras ni logistica. La solicitud queda vinculada al expediente, parte, equipo y proveedor, y genera una Solicitud de Material Pendiente.

Datos minimos iniciales para recambios:

- Material.
- Proveedor.
- Fecha de entrega.
- Fecha de instalacion.
- Parte asociado.
- Equipo donde se instala.

La Solicitud de Material Pendiente debe poder conectarse en el futuro con pedido, albaran, factura de proveedor y factura al cliente. Debe evitarse exceso de datos manuales.

Almacenes previstos:

- Almacen central.
- Furgonetas.
- Material de obra.
- Material pendiente de validar.
- Reservas.

Garantias:

- Garantia de montaje.
- Garantia de reparacion.
- Garantia por componente.
- Garantia de equipo completo.

La garantia pertenece al equipo instalado, no a la referencia fisica ni al equipo anterior. Cada equipo nuevo genera su propio ciclo de garantia conforme a legislacion, fabricante, contrato o condiciones aplicables. No se hereda garantia de equipos anteriores.

La garantia es configurable por empresa, cliente, tipo de equipo, marca, modelo o componente. Puede afectar a facturacion y generar trabajos no facturables o parcialmente facturables.

Cuando un parte pueda estar en garantia, SAT evalua tecnicamente e indica si puede ser garantia, reincidencia, error de montaje, defecto de material, mal uso, golpe externo, desgaste, falta de mantenimiento u otra causa. El comercial asignado al cliente toma la decision final de facturacion: facturar, no facturar, facturar parcialmente, gesto comercial o garantia.

Debe diferenciarse garantia tecnica de gesto comercial.

En garantias y reincidencias deben registrarse horas, desplazamiento, material, coste interno, si se factura o no, motivo, parte original vinculado y rentabilidad real.

## 9. Presupuestos, facturacion y condiciones comerciales

Los presupuestos pueden ser creados por comercial, tecnico u oficina.

Tipos:

- Montaje.
- Reparacion.
- Mejora.
- Sustitucion.
- Mantenimiento.

Un presupuesto aceptado puede generar uno o varios partes. Partes validados pueden generar factura.

Cada cliente puede tener descuentos propios sobre mano de obra, material, desplazamiento o global. Tambien puede tener tarifa especial, descuento por contrato, descuento por volumen, descuentos temporales y condiciones de pago.

Antes de generar o activar un parte operativo deben existir:

- Datos fiscales minimos.
- CIF/NIF si procede.
- Direccion fiscal.
- Forma de pago.
- Plazos de pago.
- Datos necesarios para reclamacion.
- Condiciones comerciales.
- Responsable administrativo o contacto valido.

## 10. Libro Tecnico del Equipo

Cada equipo instalado debe generar un Libro Tecnico del Equipo. El Libro Tecnico nace con el check de instalacion.

Debe incluir:

- Fabricante.
- Modelo.
- Numero de serie.
- Tipo de equipo.
- Referencia fisica donde queda instalado.
- Fotografias.
- Check de instalacion.
- Pruebas de funcionamiento.
- Pruebas de seguridad.
- Tipo de uso previsto.
- Manuales.
- Declaraciones o certificados si procede.
- Garantia.
- Observaciones tecnicas.
- Recomendaciones futuras.
- Posibles mejoras.
- Firma o validacion del cliente.
- Historial posterior de reparaciones, mantenimientos, deficiencias, garantias e ITI.

La instalacion no se considera completa si no queda creado el Libro Tecnico del Equipo.

## 11. Configurabilidad empresarial y reglas

DoorManager Pro debe aplicar neutralidad organizativa. No impone organigrama, no decide por SAT y no sustituye la autoridad interna de cada empresa.

Las decisiones dependientes de cada empresa deben ser configurables mediante un motor de politicas empresariales:

- Quien puede autorizar excepciones.
- Quien puede cerrar partes.
- Quien puede validar garantias.
- Quien puede aprobar descuentos.
- Quien puede reabrir partes.
- Quien puede asignar tecnicos.
- Quien puede validar material.

El Business Rules Engine es el concepto de motor configurable de reglas de negocio. No se implementa todavia, pero la documentacion y el modelo funcional deben prepararse para reglas por empresa, departamento, rol, permiso, cliente, tipo de trabajo y excepcion.

Principio de minima carga administrativa: el tecnico no debe hacer trabajo de oficina. La app movil del tecnico debe centrarse en diagnostico, trabajo realizado, fotos, horas, desplazamiento, material usado, ITI, deficiencias, firma y envio. Oficina, SAT, comercial y administracion completan la parte no tecnica.

## 12. Workspaces departamentales

DoorManager Pro es una plataforma transversal por departamentos. Cada departamento trabaja desde su propio Workspace:

- Tecnico.
- SAT.
- Comercial.
- Administracion.
- Almacen/Compras.
- Gerencia.
- Cliente.
- Proveedor futuro.

Todos los Workspaces operan sobre un nucleo comun:

- Clientes.
- Centros.
- Expedientes.
- Partes.
- Equipos.
- Materiales.
- Documentacion.
- Knowledge base.
- Auditoria.
- Historial.

Principio: un unico dato, multiples perspectivas.

Cada departamento modifica unicamente la informacion que corresponde a su funcion. Los datos se relacionan entre departamentos sin mezclar responsabilidades.

## 12.1 Portal seguro del cliente

DoorManager Pro podra disponer de un portal de cliente como modulo configurable. El cliente consultara solo la informacion que la empresa usuaria de DMP decida publicar.

La visibilidad se definira mediante acuerdo y configuracion entre proveedor de DMP, empresa usuaria de DMP y politica que esa empresa aplique a sus propios clientes.

Debe poder configurarse visibilidad de expedientes, centros, pedidos, reparaciones, mantenimientos, documentos, estados, facturas, informes, acciones permitidas y datos pendientes que el cliente pueda completar.

El portal debe aplicar aislamiento estricto entre empresas y clientes, autorizacion por peticion, usuarios individuales, contraseñas protegidas, identificadores no predecibles, permisos por organizacion, centro, expediente y documento, sesiones seguras, auditoria de accesos y descargas, segundo factor configurable y ausencia total de acceso a informacion interna de la empresa usuaria.

## 12.2 Estrategia modular

En primeras versiones, todos los modulos podran estar disponibles gratuitamente. La arquitectura debe permitir que en el futuro los modulos sean activables, desactivables, opcionales y asociados a planes o acuerdos comerciales mediante capacidades o feature flags por empresa.

Un modulo ya implantado mantiene su derecho de uso de forma vitalicia para esa empresa. Nunca debe retirarse automaticamente un modulo ya implantado ni los datos generados con el.

Debe separarse derecho de uso del modulo implantado de servicios continuados, alojamiento, soporte, mantenimiento, integraciones y nuevas ampliaciones.

## 13. Planificacion SAT y cualificacion tecnica

La aplicacion debe apoyar a SAT, no organizar automaticamente. El tecnico no tiene labores organizativas, no rechaza partes y no organiza partes. Puede comunicar incidencias operativas, necesidades o disponibilidad prevista, pero SAT decide.

Si el tecnico preve terminar antes, puede avisar. SAT recibe el aviso y decide si reasigna, adelanta otra tarea o mantiene la planificacion.

El panel SAT de inicio de jornada debe mostrar:

- Tecnicos disponibles.
- Trabajos sin finalizar del dia anterior.
- Tareas programadas.
- Disponibilidad de material.
- Disponibilidad de herramientas/equipos.
- Climatologia para trabajos exteriores.
- Requisitos de acceso por cliente/centro.
- Tecnicos habilitados para cada trabajo.

El Technical Qualification Engine debe gestionar cursos PRL, reconocimientos medicos, carnets, habilitaciones, formacion por cliente, permisos de acceso, experiencia, especialidades, EPIs, herramientas necesarias y caducidades.

Cuando SAT asigne tecnico a cliente o trabajo, la aplicacion debe informar si cumple los requisitos. No debe bloquear la asignacion salvo politica configurable. El aviso debe ser claro pero sutil.

## 14. Centro de avisos y vencimientos

Debe existir un modulo transversal para avisos y vencimientos de:

- ITV de vehiculos.
- Seguros de vehiculos.
- Revisiones de furgonetas.
- Cursos PRL.
- Reconocimientos medicos.
- Certificados.
- Carnets.
- Mantenimientos programados.
- Revisiones de clientes.
- Visitas comerciales.
- Presupuestos pendientes.
- Material pendiente.
- Garantias proximas a vencer.
- Contratos proximos a renovar.

Cada aviso o vencimiento debe permitir responsable, departamento, prioridad, fecha de vencimiento, dias de preaviso y estado.

## 14.1 Implantacion y convivencia con sistemas anteriores

La implantacion debe adaptarse a tamaño de empresa, numero de usuarios y tecnicos, numero de clientes, complejidad, nivel de digitalizacion, calidad de datos, capacidad de adaptacion y requisitos de seguridad.

Debe existir entorno de pruebas separado para formacion, simulacion y depuracion antes de produccion.

DMP debe permitir convivencia progresiva con sistemas anteriores. Debe poder registrarse sistema de origen, referencia externa, identificador externo, numero de OT, pedido, factura o expediente, enlace externo, observaciones y estado de migracion. La referencia externa debe ser generica y no depender de un ERP concreto. No se implementan conectores especificos todavia.

## 14.2 Proveedores, compras, stock y trazabilidad economica

Los proveedores son entidad principal para compras, facturacion, stock, trazabilidad, costes y obligaciones documentales. El flujo general es: proveedor, pedido de compra, albaran o recepcion, entrada o destino del material, factura del proveedor, coste real, consumo o instalacion y facturacion al cliente cuando corresponda.

DMP debe diferenciar lo pedido, confirmado, recibido, facturado, utilizado, devuelto o sobrante. Puede preparar compras, comparar proveedores y generar documentos, pero nunca aprobar, emitir o enviar pedidos sin accion expresa de usuario autorizado.

El stock debe ser distribuido: almacen central, almacenes secundarios, furgonetas, ubicaciones de cliente u obra, material reservado, material pendiente y material defectuoso cuando exista incidencia real. Las furgonetas son almacenes moviles controlables y todo traslado genera movimiento trazable.

DMP debe distinguir stock teorico, contado, reservado, disponible, pendiente de validar y en discrepancia. Las diferencias no se corrigen automaticamente; los ajustes requieren trazabilidad.

## 14.3 Historial tecnico, busqueda e informes

El historial tecnico del equipo debe diferenciar reparacion del mismo componente y sustitucion por componente nuevo. En sustituciones debe constar componente sustituido, componente nuevo, fecha, parte, tecnico, causa, pruebas y resultado.

El buscador transversal debe poder trabajar sobre equipo, varios equipos, centro, cliente, familia o todo el parque tecnico, respetando permisos y aislamiento de datos.

Los resultados podran exportarse a Excel y PDF como informe detallado o resumen configurable. Las plantillas deben ser personalizables por empresa y permitir seleccion de fotografias: todas, solo relevantes o ninguna.

## 15. Offline-first

La app movil no debe sincronizar continuamente.

El tecnico pulsa `Cargar trabajos`, trabaja localmente sin conexion y guarda fotos, firmas, materiales, horas, checklist y observaciones localmente. Cuando quiera sincronizar pulsa `Enviar trabajo`.

Si falla la sincronizacion, nada se pierde. Debe existir reintento manual, UUID para evitar duplicados, control de conflictos y auditoria de sincronizacion.

## 16. ITI, informes inteligentes y deficiencias

ITI significa Inspeccion Tecnica Inteligente.

Toda actuacion genera una ITI. No importa si es reparacion, mantenimiento o instalacion. Toda intervencion finaliza con una evaluacion tecnica.

Toda actuacion puede generar:

1. Informe tecnico.
2. Informe de deficiencias.
3. Informe de riesgos.
4. Oportunidades comerciales.
5. Recomendaciones tecnicas.
6. Presupuestos derivados.

Cada deficiencia debe disponer de estado, prioridad, seguridad, operatividad, criticidad, fotografias, recomendacion, presupuesto, estado comercial e historial.

No desaparece hasta ser resuelta o rechazada.

## 17. Riesgo, seguridad y cliente

Cada punto de inspeccion puede tener estado tecnico, seguridad, operatividad y criticidad para el cliente.

Debe ser posible marcar equipo bloqueado o no apto. Si el cliente decide seguir usando el equipo, queda documentado y firmado.

DoorManager recomienda, no decide por el cliente.

## 18. Planificacion y web publica

Debe contemplar planificacion de tecnicos/equipos, calendario por tecnicos, equipos activos, trabajos del dia, contratos de mantenimiento y revisiones automaticas.

Futuro: sugerencias inteligentes de asignacion segun zona, disponibilidad, especialidad, carga de trabajo y proximidad.

La web publica permite captar clientes, recibir solicitudes de presupuesto, solicitudes de reparacion, anuncios y formularios con consentimiento RGPD. La solicitud web puede convertirse en lead, cliente, aviso, presupuesto o expediente.

## 19. Rentabilidad real

DoorManager Pro debe permitir calcular rentabilidad real:

- Por cliente.
- Por equipo.
- Por expediente.
- Por tecnico.
- Por marca/modelo.
- Por tipo de actuacion.
- Por garantia.
- Por reincidencia.

La rentabilidad debe considerar horas, desplazamientos, material, coste interno, importes facturados y trabajos no facturados por garantia, reincidencia o gesto comercial.

## 20. Documentos relacionados

- `docs/PROJECT_DNA.md`.
- `docs/KNOWLEDGE_ENGINE.md`.
- `docs/KNOWLEDGE_BASE/README.md`.
- `docs/KNOWLEDGE_BASE/10_DIGITAL_TWIN.md`.
- `docs/BUSINESS_RULES.md`.
- `docs/ADR/ADR-004-knowledge-engine.md`.
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

## 21. Proximos desarrollos

- Completar taxonomia tecnica.
- Definir entidades de Gemelo Digital.
- Formalizar motor de compatibilidades.
- Versionar checklists por jerarquia tecnica.
