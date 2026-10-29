# Avisos al móvil

- [x] Conectar Firebase Messaging (clave de cuenta de servicio subida; proyecto `gym-gym-8jjyja`).
- [x] Integrar permisos y registro de dispositivos para iPhone y Android, conservando los avisos web.
- [x] Enviar las notificaciones existentes a los dispositivos registrados y respetar los permisos del cliente.
- [x] Preparar Codemagic: la compilación de Android coloca `google-services.json` y la de iOS coloca `GoogleService-Info.plist` desde archivos secretos; API 36, mínimo Android 7 y código de versión automático.
- [ ] Subir a Codemagic los archivos secretos `FIREBASE_GOOGLE_SERVICES_JSON` (Android) y `FIREBASE_GOOGLE_SERVICE_INFO_PLIST` (iPhone), y el keystore de Google Play.
- [ ] Subir la clave de Apple (APNs) a Firebase y activar las capacidades de notificaciones en el proyecto de iOS.
- [ ] Lanzar las dos compilaciones de Codemagic y publicar las versiones nuevas (Google Play y App Store).
- [ ] Verificar la recepción real en un iPhone y un Android con la versión nueva instalada.
