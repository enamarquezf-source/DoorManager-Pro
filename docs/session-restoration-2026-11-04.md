# Restauración de sesión · 04/11/2026

Se detectó una dependencia circular en la restauración compartida de DMP: el suscriptor asíncrono de onAuthStateChange esperaba la consulta de perfil, que llama a getUser. El cliente de Supabase espera a sus suscriptores dentro del proceso de autenticación, por lo que esa consulta podía esperar el bloqueo que el propio suscriptor impedía liberar. El caso afecta especialmente a la renovación del token al reabrir una pestaña.

authService entrega ahora los avisos en una tarea posterior y cancela avisos pendientes al desmontar el proveedor. Se conservan las comprobaciones de sesión, identidad, perfil y permisos. La carga inicial reutiliza la sesión obtenida, sin consultarla dos veces. La portada de demo delega la validación de sesiones guardadas en el proveedor habitual, sin una restauración previa duplicada. La presencia de almacenamiento local nunca concede acceso.

La pantalla de restauración ofrece reintento y actualización después de 15 segundos si sigue pendiente. No cierra sesiones automáticamente ni elimina IndexedDB, partes o colas de envío. El reintento recarga la página; la actualización reutiliza el mecanismo existente que protege el trabajo pendiente.

Pruebas: liberación del aviso antes de consultar el perfil, cancelación de avisos tras desmontaje, pantalla de recuperación, reanudación de visitante sin crear otro y reutilización de sesión inicial. Compilación correcta. La reproducción de cerrar/reabrir en el ordenador concreto del usuario requiere la versión publicada; no se afirma haber validado ese dispositivo.
