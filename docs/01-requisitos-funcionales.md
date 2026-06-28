# DoorManager Pro - Requisitos funcionales

| Campo | Valor |
| --- | --- |
| Version | 0.3 |
| Estado | Vivo |
| Fecha | 2026-06-28 |
| Autor | Francisco Javier Ena Marquez |
| Ultima modificacion | 2026-06-28 |

## Indice

Este documento mantiene la numeracion funcional interna. Para vision TOP, taxonomia tecnica y Knowledge Base consultar `docs/PROJECT_DNA.md`, `docs/PRODUCT_BIBLE.md` y `docs/KNOWLEDGE_BASE/README.md`.

## Referencias cruzadas

- `docs/PROJECT_DNA.md`.
- `docs/PRODUCT_BIBLE.md`.
- `docs/BUSINESS_RULES.md`.

## Proximos desarrollos

- Alinear requisitos funcionales con taxonomia tecnica v0.4.
- Convertir requisitos criticos en criterios de aceptacion trazables.

## 1. Objetivo

DoorManager Pro sera una plataforma profesional para empresas instaladoras y mantenedoras de puertas automaticas. Debe centralizar clientes, proveedores, instalaciones, puertas, partes, presupuestos, facturacion, documentos, historiales, tecnicos, equipos de trabajo y actividad comercial.

La solucion debe estar preparada para oficina, ordenador, movil, tablet, tecnicos en campo, comerciales, administrativos y gerencia.

## 2. Componentes funcionales

- Aplicacion interna para la empresa.
- Aplicacion movil offline-first para tecnicos.
- Panel web para oficina.
- Web publica para clientes potenciales.
- Base de datos centralizada.
- Servidor de archivos.
- Sistema de seguridad, roles y permisos.
- Sistema de copias de seguridad.

## 3. Usuarios principales

- Administrador.
- Gerente.
- Administrativo.
- Comercial.
- Jefe de equipo.
- Tecnico.
- Usuario de consulta.
- Cliente potencial desde web publica.

## 4. Clientes

El modulo de clientes debe permitir gestionar:

- Clientes particulares.
- Empresas.
- Comunidades.
- Administradores de fincas.
- Contactos.
- Direcciones.
- Instalaciones asociadas.
- Puertas asociadas.
- Historial.
- Facturacion.
- Presupuestos.
- Avisos.
- Partes.
- Documentos.

## 5. Proveedores

El modulo de proveedores debe permitir gestionar:

- Nombre proveedor.
- CIF/NIF.
- Contactos.
- Telefono.
- Email.
- Direccion.
- Materiales suministrados.
- Marcas.
- Referencias.
- Tarifas.
- Pedidos.
- Albaranes.
- Facturas de proveedor.
- Relacion con stock.
- Relacion con materiales usados en partes.

## 6. Ficha unica de puerta

Cada puerta/equipo tendra una ficha unica con pestanas:

- Informacion general.
- Cliente.
- Ubicacion.
- Caracteristicas tecnicas.
- Historial.
- Mantenimientos.
- Montajes.
- Incidencias.
- Documentacion.
- Checklist.
- Fotografias.
- Material instalado.
- Observaciones.

## 7. Partes de trabajo

El parte de trabajo sera una entidad central.

Tipos iniciales:

- Reparacion directa desde aviso.
- Montaje desde presupuesto aceptado.
- Reparacion o mejora desde presupuesto aceptado.
- Mantenimiento preventivo.
- Revision.
- Segunda visita.

El tecnico debe poder rellenar:

- Horas empleadas.
- Hora llegada.
- Hora inicio.
- Hora fin.
- Tiempo total.
- Tiempo facturable.
- Desplazamiento.
- Kilometros.
- Dietas si procede.
- Peajes o aparcamiento si procede.
- Materiales usados.
- Material pendiente.
- Observaciones.
- Fotos.
- Checklist.
- Firma del cliente.
- Resultado del trabajo.

Estados:

- Borrador.
- Pendiente de asignar.
- Asignado.
- Cargado en movil.
- En curso.
- Pendiente de enviar.
- Enviado por tecnico.
- Pendiente de validacion oficina.
- Validado.
- Rechazado.
- Cerrado.
- Facturado.
- Cancelado.

## 8. Validacion de oficina

La oficina debe poder validar:

- Horas.
- Desplazamiento.
- Materiales.
- Fotos.
- Firma.
- Observaciones.
- Facturable/no facturable.
- Garantia.
- Pendiente de presupuesto.
- Pendiente de segunda visita.

Acciones:

- Validar.
- Rechazar.
- Solicitar correccion.
- Generar PDF.
- Enviar al cliente.
- Pasar a facturacion.
- Cerrar parte.

Debe quedar auditoria completa.

## 9. Presupuestos

Los presupuestos pueden ser creados por:

- Comercial.
- Tecnico.
- Oficina.

Tipos:

- Montaje.
- Reparacion.
- Mejora.
- Sustitucion.
- Mantenimiento.

Estados:

- Borrador.
- Enviado.
- Aceptado.
- Rechazado.
- Caducado.
- Convertido en parte.

Un presupuesto aceptado puede generar uno o varios partes de trabajo.

## 10. Facturacion

El modulo inicial de facturacion debe contemplar:

- Facturas a clientes.
- Lineas de factura.
- Relacion con partes validados.
- Relacion con presupuestos.
- Materiales facturables.
- Horas facturables.
- Desplazamiento facturable.
- IVA.
- Estados de factura.

Estados iniciales:

- Pendiente.
- Emitida.
- Pagada.
- Vencida.
- Anulada.

No se implementara contabilidad avanzada inicialmente, pero el modelo debe quedar preparado.

## 11. Web publica

La web publica debe permitir:

- Mostrar servicios.
- Mostrar anuncios o avisos.
- Formulario de solicitud de presupuesto.
- Formulario de aviso o reparacion.
- Datos del cliente.
- Tipo de puerta.
- Fotos opcionales.
- Ubicacion.
- Descripcion del problema.
- Consentimiento de proteccion de datos.

La oficina debe poder convertir una solicitud web en:

- Cliente.
- Aviso.
- Presupuesto.
- Parte de trabajo.

## 12. Offline-first

La app movil no debe sincronizar constantemente.

Debe permitir:

- Boton `Cargar trabajos`.
- Boton `Enviar trabajo`.
- Trabajo local sin conexion.
- Guardado local de partes, fotos, firmas, materiales, horas y checks.
- Estado claro de datos pendientes.
- Reintento manual.
- Control de duplicados con UUID.
- Control de conflictos.
- Auditoria de sincronizacion.

## 13. Checklist interactivo

Cada puerta tendra checklists unicos.

El checklist debe incluir:

- Dibujo de puerta.
- Partes clicables.
- Comprobaciones individuales.
- Fotos.
- Estados.
- Observaciones.
- Firma.
- Historial.

## 14. Documentacion e historial

Cada puerta debe tener:

- Manuales.
- Documentos.
- Fotografias.
- Esquemas.
- Planos.
- Videos.
- Historial de montajes.
- Historial de mantenimientos.
- Historial de incidencias y averias.
- Material instalado o sustituido.

## 15. Copias de seguridad

El sistema debe contemplar:

- Copias automaticas diarias.
- Copias semanales.
- Copias mensuales.
- Copias cifradas.
- Copias fuera del servidor principal.
- Restauracion probada.
- Registro de backups.
- Alertas si falla una copia.
- Politica de retencion.
- Copia de base de datos.
- Copia de documentos, fotografias y firmas.
- Plan de recuperacion ante desastre.

## 16. Criterios de aceptacion

- Los usuarios acceden solo a modulos y acciones permitidas.
- Un tecnico puede cargar trabajos, trabajar offline y enviar el resultado sin perder datos.
- La oficina puede validar partes antes de facturar.
- Un presupuesto aceptado puede generar partes de trabajo.
- Un parte validado puede pasar a facturacion.
- La web publica genera solicitudes tratables desde oficina.
- Cada puerta conserva historial tecnico y documental completo.
- Las copias de seguridad cubren base de datos y archivos.
