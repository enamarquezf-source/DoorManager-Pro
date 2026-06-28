# DoorManager Pro - Hardware e infraestructura

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

- `docs/04-arquitectura.md`.
- `docs/SECURITY.md`.

## Proximos desarrollos

- Definir requisitos minimos para almacenamiento offline y archivos tecnicos.

## 1. Objetivo

Documentar hardware recomendado para oficina, tecnicos y servidor.

## 2. Oficina

Recomendado:

- Ordenadores actuales con navegador moderno.
- Monitores de tamano suficiente.
- Impresora.
- Escaner.
- Red cableada o Wi-Fi estable.
- Router profesional.
- NAS opcional.
- Sistema de copias de seguridad.
- Servidor local opcional.

## 3. Tecnicos

Recomendado:

- Movil Android o iPhone.
- Tablet opcional.
- Buena camara.
- Firma en pantalla.
- Almacenamiento local suficiente.
- Conexion movil.
- Uso offline.
- Cargador de vehiculo.
- Proteccion fisica del dispositivo.

## 4. Servidor cloud

Ventajas:

- Escalabilidad.
- Acceso desde cualquier lugar.
- Backups gestionables fuera de oficina.
- Menor mantenimiento fisico.
- Alta disponibilidad potencial.

Inconvenientes:

- Coste recurrente.
- Dependencia del proveedor.
- Requiere buena gestion de seguridad cloud.

## 5. Servidor local

Ventajas:

- Control fisico.
- Puede integrarse con red local.
- Coste recurrente potencialmente menor.

Inconvenientes:

- Requiere mantenimiento.
- Mayor responsabilidad de backups.
- Riesgo ante robo, incendio o averia.
- Acceso remoto mas complejo.

## 6. Recomendacion

Para portfolio y primeras demos:

- Docker local.
- PostgreSQL local.
- Servidor de archivos local.
- Backups documentados.

Para produccion real:

- Evaluar cloud o hibrido.
- Backups externos.
- Monitorizacion.
- HTTPS.
- Politicas de seguridad y acceso.
