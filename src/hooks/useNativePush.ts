import { useEffect } from "react";
import { enableNativePush, isNativeApp, startNativePushListener } from "@/lib/nativePush";

// Registra el móvil del usuario para que le salten los avisos con la app cerrada.
export function useNativePush(userId: string | null) {
  useEffect(() => {
    if (!isNativeApp() || !userId) return;

    let stop = () => {};
    let cancelled = false;

    (async () => {
      const handle = await startNativePushListener();
      if (cancelled) {
        handle();
        return;
      }
      stop = handle;

      const result = await enableNativePush();
      if (result.status === "error") {
        console.warn("No se pudo registrar el dispositivo para avisos:", result.message);
      }
    })();

    return () => {
      cancelled = true;
      stop();
    };
  }, [userId]);
}
