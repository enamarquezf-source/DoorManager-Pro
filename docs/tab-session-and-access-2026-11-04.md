# Sesión por pestaña y recuperación de acceso · 04/11/2026

El usuario informa de «No tienes permiso para acceder a esta zona» al volver a SAT, recuperable cerrando sesión y entrando de nuevo. No se dispone de la URL exacta ni de una sesión de su cuenta para reproducir esa pantalla en Pro; no se atribuye el caso a un permiso concreto sin esa evidencia.

Cambios de recuperación:

- Una ruta denegada vuelve a consultar el perfil y permisos una vez antes de mostrar la denegación. No cambia roles ni concede acceso por defecto. Incluye reintento sin cerrar sesión y regreso al inicio con contraste legible.
- /app y /app/ abren el inicio permitido del espacio validado. Los detalles y módulos mantienen el control de rutas; no se redirigen para saltarse permisos.
- Un fallo temporal de verificación tiene un reintento; una baja o ausencia explícita de perfil mantiene el rechazo. Un fallo de conexión persistente no se presenta como ausencia de perfil.
- Al cambiar de identidad se espera la verificación antes de decidir acceso; la actualización de acceso por foco también finaliza la inicialización.

El usuario pide además contraseña al abrir de nuevo Pro. Sus credenciales pasan a sessionStorage, por pestaña; la demo conserva localStorage para su visitante anónimo. Al cargar esta versión se elimina solo el antiguo token persistente de Pro, sin borrar partes, perfiles offline ni IndexedDB. Una recarga en la misma pestaña conserva la sesión. Una pestaña nueva sin sesión requiere identificarse y, por tanto, conexión. La función «restaurar pestaña cerrada» depende del navegador y puede recuperar sessionStorage; este cambio no es un bloqueo criptográfico al cerrar el navegador ni un sistema de PIN offline.

Si sessionStorage no está disponible, Pro utiliza memoria, nunca localStorage como alternativa. Los avisos de autenticación de otra pestaña no sustituyen la identidad de esta pestaña ni fuerzan su salida. El perfil y las políticas del servidor siguen siendo los que autorizan cada operación.

Las pruebas cubren recuperación transitoria, rechazo de baja, reintento sin salida, rutas de entrada, credenciales por pestaña, preservación del trabajo local, demo anónima y avisos entre pestañas. La validación con credenciales reales de Pro queda a cargo de una sesión autorizada del usuario.
