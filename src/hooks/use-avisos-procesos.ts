"use client";

import { useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { esperaPorGuardado } from "@/lib/guardado-reciente";

/**
 * Llama a `alCambiar` cuando la base avisa que un proceso, una cita o un
 * registro del profesor cambió (canal privado «procesos»; el aviso solo trae
 * el id, nunca datos). Varios avisos seguidos se agrupan. Si el canal no
 * conecta (o el usuario no puede escucharlo), relee cada minuto.
 */
export function useAvisosProcesos(alCambiar: () => void) {
  const fn = useRef(alCambiar);
  useEffect(() => {
    fn.current = alCambiar;
  }, [alCambiar]);

  useEffect(() => {
    const supabase = createClient();
    let rafaga: number | undefined;
    let respaldo: number | undefined;
    let canal: ReturnType<typeof supabase.channel> | null = null;
    let cancelado = false;
    let conectadoAntes = false;
    const releer = () => fn.current();
    const alAviso = () => {
      if (rafaga) return;
      // Justo después de un guardado propio (que ya trajo la página nueva), se espera a que
      // termine la ventana: así no se pide la página entera encima mientras la persona espera.
      rafaga = window.setTimeout(() => {
        rafaga = undefined;
        releer();
      }, Math.max(1500, esperaPorGuardado() + 500));
    };
    const iniciarRespaldo = () => {
      if (respaldo) return;
      respaldo = window.setInterval(() => document.visibilityState === "visible" && releer(), 60_000);
    };
    const detenerRespaldo = () => {
      if (respaldo) window.clearInterval(respaldo);
      respaldo = undefined;
    };
    iniciarRespaldo();
    (async () => {
      await supabase.realtime.setAuth();
      if (cancelado) return;
      canal = supabase
        .channel("procesos", { config: { private: true } })
        .on("broadcast", { event: "cambio" }, alAviso)
        .subscribe((estado) => {
          if (estado === "SUBSCRIBED") {
            detenerRespaldo();
            if (conectadoAntes) releer();
            conectadoAntes = true;
          } else if (estado === "CHANNEL_ERROR" || estado === "TIMED_OUT" || estado === "CLOSED") {
            iniciarRespaldo();
          }
        });
    })();
    return () => {
      cancelado = true;
      if (rafaga) window.clearTimeout(rafaga);
      detenerRespaldo();
      if (canal) supabase.removeChannel(canal);
    };
  }, []);
}
