"use client";

import { useEffect } from "react";

/**
 * Antepone un prefijo al título de la pestaña ("[DEV] GESTIVO …") y lo
 * mantiene cuando Next cambia el título al navegar.
 */
export function PrefijoTitulo({ prefijo }: { prefijo: string }) {
  useEffect(() => {
    const aplicar = () => {
      if (!document.title.startsWith(prefijo)) {
        document.title = prefijo + document.title;
      }
    };
    aplicar();
    // Al poner el título se dispara otra mutación; aplicar() ya no cambia nada
    // porque el prefijo está, así que no hay ciclo.
    const observador = new MutationObserver(aplicar);
    observador.observe(document.head, { subtree: true, childList: true, characterData: true });
    return () => observador.disconnect();
  }, [prefijo]);

  return null;
}
