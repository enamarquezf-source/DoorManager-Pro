# Knowledge Base - Glossary

| Campo | Valor |
| --- | --- |
| Version | 0.4 |
| Estado | Borrador inicial |
| Fecha | 2026-06-28 |
| Autor | Francisco Javier Ena Marquez |
| Ultima modificacion | 2026-06-29 |

## Indice

1. Glosario inicial
2. Referencias cruzadas
3. Proximos desarrollos

## 1. Glosario inicial

### Grupo de carga

Conjunto funcional industrial que puede incluir puerta, plataforma, abrigo, retenedor, topes, calzos, semaforos y otros componentes.

### Posicion fisica

Ubicacion funcional permanente dentro de una instalacion. Mantiene identidad aunque cambie el equipo instalado.

### Referencia fisica

Identificador estable de una posicion dentro de la instalacion. Puede representar muelle, posicion, grupo de carga, codigo cliente u otra referencia funcional. Permanece en el tiempo aunque el equipo instalado sea sustituido.

### Equipo

Activo tecnico instalado en una posicion fisica o grupo de carga.

### Equipo instalado

Objeto tecnico real con fabricante, modelo, numero de serie, fecha de instalacion, garantia, documentacion e historial. Puede ser sustituido y conserva su propio ciclo de vida.

### Codigo visible de equipo

Codigo operativo mostrado a usuarios y clientes. En sustituciones completas puede incorporar sufijos `S`, `SS`, `SSS` para reflejar la cadena visible de sustitucion.

### Identificador interno inmutable

Identificador tecnico que no cambia aunque cambie el codigo visible, la referencia comercial o el estado historico del equipo.

### Sustitucion completa

Reemplazo total de un equipo instalado por otro. El equipo antiguo queda historico, el nuevo ocupa la misma referencia fisica y se inicia un nuevo ciclo de garantia.

### Linea de vida

Cadena historica de una referencia fisica que relaciona equipo original, equipos sustituidos y equipo actual.

### Libro Tecnico del Equipo

Contenedor documental y tecnico de un equipo instalado. Nace con el check de instalacion e incluye datos del equipo, pruebas, fotografias, garantia, documentacion, validacion del cliente e historial posterior.

### ITI

Inspeccion Tecnica Inteligente. Evaluacion tecnica generada por reparaciones, mantenimientos e instalaciones.

### Expediente

Contenedor unico de avisos, partes, presupuestos, facturas, garantias, fotos, firmas, documentos y auditoria.

### Parte vinculado

Parte relacionado con otro parte anterior, normalmente por reincidencia, garantia o continuidad de una averia.

### Reincidencia

Reaparicion de una averia o problema tecnico ya tratado anteriormente. Puede implicar reapertura, reasignacion o creacion de nuevo parte vinculado segun estado de facturacion y permisos.

### Garantia tecnica

Evaluacion tecnica que indica que una actuacion puede estar cubierta por garantia, defecto, error de montaje u otra causa tecnica.

### Gesto comercial

Decision comercial de no facturar o facturar parcialmente una actuacion aunque no exista necesariamente cobertura tecnica de garantia.

### Politica comercial

Conjunto minimo de datos fiscales, forma de pago, plazos, condiciones comerciales y contactos administrativos necesarios antes de iniciar trabajo operativo.

### Deficiencia

Problema, riesgo, mejora o desviacion tecnica detectada que permanece abierta hasta resolverse o rechazarse.

### Criticidad

Nivel de importancia del elemento o problema para el cliente, su operacion y seguridad.

### Operatividad

Capacidad del equipo para cumplir su funcion en condiciones normales o con limitaciones.

### Knowledge Engine

Sistema que transforma intervenciones tecnicas en conocimiento reutilizable.

### Gemelo Digital

Representacion conceptual de centro, grupo de carga, equipos, componentes, estado, historial, documentacion, garantias, manuales e inspecciones.

### TOP

Technical Operations Platform. Plataforma integral de operaciones tecnicas.

### Business Rule

Regla funcional o de negocio que condiciona el comportamiento del producto.

### ADR

Architecture Decision Record. Registro de decision arquitectonica.

### RFC

Request for Comments. Documento propuesto para discutir cambios importantes antes de aceptarlos.

## 2. Referencias cruzadas

- `docs/PROJECT_DNA.md`.
- `docs/PRODUCT_BIBLE.md`.
- `docs/BUSINESS_RULES.md`.
- `docs/ADR/`.

## 3. Proximos desarrollos

- Ampliar glosario con terminos tecnicos de puertas.
- Incluir sinonimos y terminos usados por clientes.
