# AGENTS.md

Reglas de este proyecto. Léelas antes de tocar código.

## Notificaciones

- Los avisos a los clientes salen siempre de una fila nueva en `public.notifications`; un disparador llama a la función `push-dispatch`, que es la única que reparte. No añotas otro repartidor.
- `push-dispatch` envía por dos vías: web (VAPID + `web-push`, tablas `push_subscriptions`) y apps nativas (Firebase Cloud Messaging, tabla `device_tokens`). Ambas se mantienen a la vez.
- Los envíos a Firebase se hacen solo a través del gateway de conectores de Lovable con `LOVABLE_API_KEY` y la clave de la conexión. Nunca se llama a `fcm.googleapis.com` directamente ni se guarda la cuenta de servicio en el código.
- El identificador de cada móvil se registra desde la app con la llamada `register_device_token`; es una función de la base de datos que reasigna el identificador si antes era de otra cuenta. No se escribe en `device_tokens` desde el navegador.
- El registro nativo usa `@capacitor-firebase/messaging` en la versión mayor de Capacitor que fija el proyecto, y solo se carga dentro de la app instalada (importación diferida), nunca en el navegador.

## Móvil

- Capacitor en la versión mayor que marca `package.json`; los complementos nativos van a la misma versión mayor.
- Tras cualquier cambio nativo hay que compilar la web, sincronizar con Capacitor y generar una versión nueva de la app: los cambios no llegan solos a las apps ya instaladas.

## Reglas de producto

- Los precios, límites, horarios y permisos están en la memoria del proyecto; léela antes de cambiar pagos, clases o accesos.
