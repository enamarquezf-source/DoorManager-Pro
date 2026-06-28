# DoorManager Pro - Product Bible

| Campo | Valor |
| --- | --- |
| Version | 0.3 |
| Estado | Vivo |
| Fecha | 2026-06-28 |
| Autor | Francisco Javier Ena Marquez |
| Ultima modificacion | 2026-06-28 |

## Indice

1. Vision de producto
2. Clientes y roles industriales
3. Centros, posiciones y grupos de carga
4. Taxonomia tecnica
5. Identificadores, expediente y buscador universal
6. Avisos, partes y validacion
7. Material, almacen y garantias
8. Presupuestos, facturacion y condiciones comerciales
9. Offline-first
10. ITI, informes inteligentes y deficiencias
11. Riesgo, seguridad y cliente
12. Planificacion y web publica
13. Documentos relacionados
14. Proximos desarrollos

## 1. Vision de producto

DoorManager Pro es una Technical Operations Platform (TOP): una plataforma integral de operaciones tecnicas para empresas instaladoras y mantenedoras de puertas automaticas.

No es solo un ERP. Gestiona recursos, operaciones, conocimiento, seguridad, mantenimiento, inspecciones, documentacion, decisiones, trazabilidad e inteligencia tecnica.

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

## 3. Centros, posiciones y grupos de carga

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

Debe diferenciarse entre posicion fisica y equipo instalado:

- La posicion fisica permanece.
- Los equipos cambian.
- El historial nunca se pierde.
- El tecnico ve principalmente el equipo actual.
- Oficina, SAT y gerencia consultan tambien el historico antiguo.

## 4. Taxonomia tecnica

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

## 5. Identificadores, expediente y buscador universal

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

## 6. Avisos, partes y validacion

Los avisos pueden llegar por telefono, email, WhatsApp, web, comercial, tecnico o responsable de mantenimiento del cliente.

Oficina o comercial reciben. Responsable Tecnico/SAT valora reparaciones. Comercial gestiona montajes y presupuestos. Solo usuarios autorizados generan expedientes.

El tecnico no crea ni cierra partes. Recibe partes asignados de reparacion, mantenimiento o instalacion.

El parte separa causa inicial y trabajo real realizado. La causa inicial no se sobrescribe. El tecnico añade diagnostico y actuacion real. El tecnico finaliza y envia, pero no cierra.

SAT, oficina, comercial o gerencia validan y cierran. El cliente recibe parte, fotos y factura tras validacion. Los destinatarios son configurables por cliente.

## 7. Material, almacen y garantias

Debe diferenciarse material previsto y material usado real.

El material previsto ayuda a cargar antes de salir. El tecnico selecciona material usado desde base de datos y puede añadir material manualmente si no existe.

El tecnico no descuenta stock oficial. SAT u oficina validan material. Solo tras validacion se actualiza stock.

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

La garantia es configurable por empresa, cliente, tipo de equipo, marca, modelo o componente. Puede afectar a facturacion y generar trabajos no facturables o parcialmente facturables.

## 8. Presupuestos, facturacion y condiciones comerciales

Los presupuestos pueden ser creados por comercial, tecnico u oficina.

Tipos:

- Montaje.
- Reparacion.
- Mejora.
- Sustitucion.
- Mantenimiento.

Un presupuesto aceptado puede generar uno o varios partes. Partes validados pueden generar factura.

Cada cliente puede tener descuentos propios sobre mano de obra, material, desplazamiento o global. Tambien puede tener tarifa especial, descuento por contrato, descuento por volumen, descuentos temporales y condiciones de pago.

## 9. Offline-first

La app movil no debe sincronizar continuamente.

El tecnico pulsa `Cargar trabajos`, trabaja localmente sin conexion y guarda fotos, firmas, materiales, horas, checklist y observaciones localmente. Cuando quiera sincronizar pulsa `Enviar trabajo`.

Si falla la sincronizacion, nada se pierde. Debe existir reintento manual, UUID para evitar duplicados, control de conflictos y auditoria de sincronizacion.

## 10. ITI, informes inteligentes y deficiencias

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

## 11. Riesgo, seguridad y cliente

Cada punto de inspeccion puede tener estado tecnico, seguridad, operatividad y criticidad para el cliente.

Debe ser posible marcar equipo bloqueado o no apto. Si el cliente decide seguir usando el equipo, queda documentado y firmado.

DoorManager recomienda, no decide por el cliente.

## 12. Planificacion y web publica

Debe contemplar planificacion de tecnicos/equipos, calendario por tecnicos, equipos activos, trabajos del dia, contratos de mantenimiento y revisiones automaticas.

Futuro: sugerencias inteligentes de asignacion segun zona, disponibilidad, especialidad, carga de trabajo y proximidad.

La web publica permite captar clientes, recibir solicitudes de presupuesto, solicitudes de reparacion, anuncios y formularios con consentimiento RGPD. La solicitud web puede convertirse en lead, cliente, aviso, presupuesto o expediente.

## 13. Documentos relacionados

- `docs/PROJECT_DNA.md`.
- `docs/KNOWLEDGE_ENGINE.md`.
- `docs/KNOWLEDGE_BASE/README.md`.
- `docs/KNOWLEDGE_BASE/10_DIGITAL_TWIN.md`.
- `docs/BUSINESS_RULES.md`.
- `docs/ADR/ADR-004-knowledge-engine.md`.

## 14. Proximos desarrollos

- Completar taxonomia tecnica.
- Definir entidades de Gemelo Digital.
- Formalizar motor de compatibilidades.
- Versionar checklists por jerarquia tecnica.
