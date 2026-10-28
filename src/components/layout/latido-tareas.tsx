"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { LATIDO_MS } from "@/lib/tareas/reglas";

/**
 * El latido de las tareas programadas (estilo wp-cron, ver `src/lib/tareas`):
 * al abrir cualquier página del panel y cada 5 minutos mientras esté abierta,
 * avisa al servidor para que corra las tareas cuya hora ya pasó.
 *
 * Con la pestaña oculta no late —diez pestañas olvidadas no deben estar
 * llamando toda la tarde— y al volver a mirarla late si ya tocaba. Si una tarea
 * cambió datos, relee la página. No pinta nada.
 */
export function LatidoTareas() {
  const router = useRouter();
  useEffect(() => {
    let ultimo = 0;
    let enCurso = false;
    async function latir() {
      if (enCurso || document.visibilityState !== "visible") return;
      if (Date.now() - ultimo < LATIDO_MS - 5_000) return;
      enCurso = true;
      ultimo = Date.now();
      try {
        const r = await fetch("/api/tareas/latido", { method: "POST", cache: "no-store" });
        if (r.ok && ((await r.json()) as { refrescar?: boolean }).refrescar) router.refresh();
      } catch {
        // Sin red no pasa nada: el siguiente latido lo intenta.
      } finally {
        enCurso = false;
      }
    }
    latir();
    const id = setInterval(latir, 30_000);
    document.addEventListener("visibilitychange", latir);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", latir);
    };
  }, [router]);
  return null;
}
