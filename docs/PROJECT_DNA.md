# DoorManager Pro - Project DNA

| Campo | Valor |
| --- | --- |
| Version | 0.5 |
| Estado | Vivo |
| Fecha | 2026-06-28 |
| Autor | Francisco Javier Ena Marquez |
| Ultima modificacion | 2026-06-29 |

## Indice

1. Identidad
2. Proposito
3. Naturaleza TOP
4. Principios no negociables
5. Neutralidad organizativa
6. Plataforma transversal por workspaces
7. Aplicacion web modular e implantacion adaptable
8. Taxonomia tecnica
9. Conocimiento y trazabilidad
10. Documentos relacionados
11. Proximos desarrollos

## 1. Identidad

DoorManager Pro deja de definirse unicamente como un ERP. A partir de la version 0.3 se define como una Technical Operations Platform (TOP): una plataforma integral de operaciones tecnicas especializada en empresas instaladoras y mantenedoras de puertas automaticas.

Sigue cubriendo funciones de ERP vertical, pero su alcance es mayor: gestiona operaciones, conocimiento, seguridad, mantenimiento, inspecciones, documentacion, decisiones, trazabilidad e inteligencia tecnica.

## 2. Proposito

DoorManager Pro existe para:

- Preservar el conocimiento tecnico.
- Mejorar la seguridad.
- Reducir errores.
- Ayudar a tomar decisiones.
- Centralizar informacion sensible de clientes, instalaciones, puertas, grupos de carga, partes, presupuestos, facturacion y garantias.
- Cambiar para mejor la forma de trabajar de una empresa.

Principio fundamental:

> Cada intervencion debe dejar la instalacion mejor conocida que antes de la visita.

## 3. Naturaleza TOP

DoorManager Pro combina:

- ERP especializado.
- Plataforma de operaciones tecnicas.
- Motor de conocimiento tecnico.
- Sistema de Inspeccion Tecnica Inteligente.
- Gemelo Digital conceptual de instalaciones.
- Repositorio documental y de evidencias.
- Plataforma offline-first para campo.
- Sistema de trazabilidad, auditoria y seguridad.
- Base operativa para SAT, oficina, comercial, tecnicos y gerencia.
- Motor documental para reglas de negocio configurables.
- Workspaces departamentales sobre un nucleo comun.

## 4. Principios no negociables

- El tecnico trabaja; la aplicacion ayuda.
- La informacion critica debe estar disponible incluso sin conexion.
- El conocimiento pertenece a la empresa.
- Nada relevante se elimina sin historial.
- La seguridad prevalece.
- El cliente decide, pero la decision queda documentada.
- Cada dato tiene un proposito.
- La plataforma evoluciona y es configurable.
- DoorManager Pro informa y traza; la empresa decide.
- Un unico dato, multiples perspectivas.
- El tecnico trabaja; la administracion administrativa corresponde a oficina, SAT, comercial o administracion.
- La implantacion se adapta al cliente y el cliente decide cuando avanzar de fase.
- Los modulos implantados conservan su derecho de uso y sus datos.
- La trazabilidad economica y la trazabilidad tecnica se relacionan, pero no se mezclan.

## 5. Neutralidad organizativa

DoorManager Pro no organiza la empresa ni sustituye al SAT. La plataforma proporciona informacion, trazabilidad y herramientas para que cada empresa tome sus decisiones.

Las decisiones operativas y administrativas que dependan de cada empresa deben poder configurarse mediante politicas empresariales: autorizaciones, cierres, garantias, descuentos, reaperturas, asignaciones y validaciones de material.

El Business Rules Engine se documenta como concepto futuro de motor configurable de reglas de negocio. No se implementa todavia.

## 6. Plataforma transversal por workspaces

DoorManager Pro es una plataforma transversal. Cada departamento trabaja con su propio Workspace:

- Tecnico.
- SAT.
- Comercial.
- Administracion.
- Almacen/Compras.
- Gerencia.
- Cliente.
- Proveedor futuro.

Todos los Workspaces se apoyan en un nucleo comun de clientes, expedientes, partes, equipos, documentacion, knowledge base, auditoria e historial.

El nucleo comun debe incluir tambien centros, materiales, documentos, historial tecnico y auditoria economica cuando proceda. Cada departamento modifica unicamente la informacion que corresponde a su funcion.

Principio fundamental:

> Un unico dato, multiples perspectivas.

## 7. Aplicacion web modular e implantacion adaptable

DoorManager Pro sera una aplicacion web completa y modular, similar conceptualmente a una suite empresarial vertical especializada en puertas automaticas.

Debe admitir nube gestionada, nube privada, infraestructura propia del cliente, servidor de terceros y entornos aislados. La seguridad, estructura y despliegue dependeran de las necesidades de cada empresa.

La implantacion puede ser completa por nosotros, guiada, realizada por el cliente con asistencia o hibrida. Nosotros analizamos, recomendamos, formamos y guiamos, pero la empresa cliente decide activacion de modulos, avance de fases, retirada del sistema anterior e inicio de produccion.

## 8. Taxonomia tecnica

DoorManager Pro utilizara una taxonomia jerarquica para clasificar equipos, componentes, checklists y conocimiento tecnico.

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

Nunca se debe asociar directamente un checklist a una puerta concreta. El checklist debe asociarse a esta jerarquia para permitir reutilizacion, versionado, aprendizaje tecnico y compatibilidades.

## 9. Conocimiento y trazabilidad

DoorManager Pro no almacena solamente datos. Conserva conocimiento.

Cada intervencion puede enriquecer:

- Averias frecuentes.
- Recomendaciones.
- Checklists.
- Procedimientos.
- Observaciones internas.
- Compatibilidades.
- Historicos de deficiencias.
- Riesgos y criticidad.

## 10. Documentos relacionados

- `docs/CONSTITUTION.md`.
- `docs/PRODUCT_BIBLE.md`.
- `docs/KNOWLEDGE_ENGINE.md`.
- `docs/SECURITY.md`.
- `docs/KNOWLEDGE_BASE/README.md`.
- `docs/KNOWLEDGE_BASE/10_DIGITAL_TWIN.md`.
- `docs/ARCHITECTURE/WORKSPACE_ARCHITECTURE.md`.
- `docs/OPERATIONS/SAT_DAILY_PLANNING.md`.
- `docs/OPERATIONS/TECHNICIAN_QUALIFICATION_ENGINE.md`.
- `docs/OPERATIONS/ALERTS_AND_EXPIRATIONS_CENTER.md`.
- `docs/OPERATIONS/MATERIAL_REQUESTS.md`.
- `docs/PRODUCT/MODULAR_PRODUCT_STRATEGY.md`.
- `docs/IMPLEMENTATION/IMPLEMENTATION_AND_ADOPTION.md`.
- `docs/IMPLEMENTATION/LEGACY_TRANSITION.md`.
- `docs/PORTALS/CLIENT_PORTAL.md`.

## 11. Proximos desarrollos

- Consolidar el modelo de Gemelo Digital.
- Definir taxonomia tecnica completa.
- Formalizar motor de compatibilidades.
- Versionar checklists por familia, tipo, marca, modelo y configuracion.
