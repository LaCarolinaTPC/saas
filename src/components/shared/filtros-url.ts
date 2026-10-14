"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";

/**
 * Un filtro cuyo valor vive en el estado local —para que el filtrado en cliente
 * responda en la misma tecla— y se refleja en la URL, para poder recargar la
 * pantalla o compartir el enlace sin perder los filtros.
 *
 * La URL se escribe con la History API nativa y NO con router.replace: las
 * pantallas que usan esto son `force-dynamic`, así que un replace volvería a
 * pedir el payload RSC —con todas las consultas de la página— en cada tecla.
 * `history.replaceState` está soportado por Next y queda sincronizado con
 * useSearchParams, sin ida al servidor.
 *
 * replaceState y no pushState: así no se llena el historial de estados
 * intermedios y «atrás» sale de la pantalla, que es lo que se espera de un
 * filtro.
 *
 * El valor de la URL se lee SOLO al montar; a partir de ahí manda el estado
 * local. Valida tú el valor donde lo consumas: la URL la escribe cualquiera.
 */
export function useFiltroUrl(
  clave: string,
  opciones?: { retardoMs?: number }
): [string, (valor: string) => void] {
  const sp = useSearchParams();
  // Inicializador diferido: useSearchParams solo se lee en el primer render, de
  // modo que un cambio de la URL no reinicia lo que el usuario está escribiendo.
  const [valor, setValor] = useState(() => sp.get(clave) ?? "");
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retardoMs = opciones?.retardoMs ?? 0;

  const aplicar = useCallback(
    (v: string) => {
      // Se lee window.location.search en el momento de escribir, no un `sp`
      // capturado en el render: así un texto con retardo pendiente y un clic en
      // otro filtro no se pisan entre sí.
      const q = new URLSearchParams(window.location.search);
      if (v) q.set(clave, v);
      else q.delete(clave);
      const cadena = q.toString();
      window.history.replaceState(
        null,
        "",
        `${window.location.pathname}${cadena ? `?${cadena}` : ""}`
      );
    },
    [clave]
  );

  const cambiar = useCallback(
    (v: string) => {
      setValor(v);
      if (temporizador.current) clearTimeout(temporizador.current);
      if (retardoMs === 0) aplicar(v);
      else temporizador.current = setTimeout(() => aplicar(v), retardoMs);
    },
    [aplicar, retardoMs]
  );

  useEffect(
    () => () => {
      if (temporizador.current) clearTimeout(temporizador.current);
    },
    []
  );

  return [valor, cambiar];
}

/** Retardo para los campos de texto; los selectores escriben al instante. */
export const RETARDO_TEXTO_MS = 350;
