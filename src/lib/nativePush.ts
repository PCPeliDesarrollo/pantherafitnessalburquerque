import { Capacitor } from "@capacitor/core";
import { supabase } from "@/integrations/supabase/client";

export type NativePushResult =
  | { status: "web" }
  | { status: "registered"; token: string }
  | { status: "denied" }
  | { status: "error"; message: string };

// Solo dentro de la app instalada en el móvil (iPhone o Android).
export function isNativeApp(): boolean {
  return Capacitor.isNativePlatform();
}

// Pide permiso al sistema y guarda el identificador del dispositivo para poder avisarle.
export async function enableNativePush(): Promise<NativePushResult> {
  if (!Capacitor.isNativePlatform()) return { status: "web" };

  try {
    const { FirebaseMessaging } = await import("@capacitor-firebase/messaging");

    const permission = await FirebaseMessaging.requestPermissions();
    if (permission.receive !== "granted") return { status: "denied" };

    const { token } = await FirebaseMessaging.getToken();
    if (!token) return { status: "error", message: "el dispositivo no devolvió identificador" };

    const platform = Capacitor.getPlatform() === "ios" ? "ios" : "android";
    const { error } = await supabase.rpc("register_device_token", {
      _token: token,
      _platform: platform,
    });
    if (error) return { status: "error", message: error.message };

    return { status: "registered", token };
  } catch (e) {
    return { status: "error", message: e instanceof Error ? e.message : String(e) };
  }
}

// Escucha avisos mientras la app está abierta y vuelve a registrar el dispositivo
// si el identificador cambia. Devuelve la función para dejar de escuchar.
export async function startNativePushListener(
  onNotification?: (data: { title?: string; body?: string }) => void,
): Promise<() => void> {
  if (!Capacitor.isNativePlatform()) return () => {};

  try {
    const { FirebaseMessaging } = await import("@capacitor-firebase/messaging");

    const handles = await Promise.all([
      FirebaseMessaging.addListener("notificationReceived", (event) => {
        const notification = event.notification as { title?: string; body?: string } | undefined;
        onNotification?.({ title: notification?.title, body: notification?.body });
      }),
      FirebaseMessaging.addListener("tokenReceived", () => {
        void enableNativePush();
      }),
    ]);

    return () => handles.forEach((handle) => void handle.remove());
  } catch {
    return () => {};
  }
}
