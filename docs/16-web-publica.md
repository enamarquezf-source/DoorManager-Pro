# DoorManager Pro - Web publica

| Campo | Valor |
| --- | --- |
| Version | 0.3 |
| Estado | Vivo |
| Fecha | 2026-06-28 |
| Autor | Francisco Javier Ena Marquez |
| Ultima modificacion | 2026-06-28 |

## Indice

Este documento mantiene su estructura actual.

## Referencias cruzadas

- `docs/PRODUCT_BIBLE.md`.
- `docs/SECURITY.md`.

## Proximos desarrollos

- Definir conversion de solicitudes web a expediente unico.

## 1. Objetivo

La web publica servira para captar clientes, recibir solicitudes y conectar oportunidades comerciales con la oficina.

## 2. Funciones

- Mostrar servicios.
- Mostrar anuncios o avisos.
- Formulario de solicitud de presupuesto.
- Formulario de aviso o reparacion.
- Contacto.
- Entrada automatica como lead o solicitud.

## 3. Formulario de presupuesto

Campos recomendados:

- Nombre.
- Telefono.
- Email.
- Tipo de cliente.
- Tipo de puerta.
- Ubicacion.
- Descripcion.
- Fotos opcionales.
- Consentimiento de proteccion de datos.

## 4. Formulario de aviso o reparacion

Campos recomendados:

- Datos de contacto.
- Ubicacion.
- Tipo de puerta.
- Descripcion del problema.
- Urgencia.
- Fotos opcionales.
- Consentimiento de proteccion de datos.

## 5. Conversion en oficina

La oficina debe poder convertir solicitud web en:

- Cliente.
- Aviso.
- Presupuesto.
- Parte de trabajo.

## 6. Seguridad y RGPD

- Validar formularios.
- Evitar spam.
- Registrar consentimiento.
- Informar finalidad del tratamiento.
- Limitar datos solicitados.
- Proteger fotos adjuntas.
- Auditar conversion a cliente o aviso.

## 7. Criterios de aceptacion

- Una solicitud web aparece en oficina.
- La oficina puede convertirla en entidad interna.
- El formulario recoge consentimiento.
- Las fotos quedan protegidas.
