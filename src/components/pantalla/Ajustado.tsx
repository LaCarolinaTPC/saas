"use client";

/**
 * Texto que se ajusta a su caja MIDIENDO lo que de verdad ocupa en el
 * navegador, en vez de estimarlo por número de letras.
 *
 * Empieza en `max` y baja (búsqueda binaria) hasta que el contenido cabe en el
 * ancho y el alto de la caja, sin pasar de `min`. Con `unaLinea` no parte el
 * texto (cifras, montos); si no, puede partirse en varias líneas, que es lo
 * que se quiere para títulos de vacantes, consejos o leyendas largas.
 *
 * Los hijos pueden usar `em` para tamaños relativos: todo escala junto.
 *
 * Mide antes de pintar (useLayoutEffect) y otra vez cuando cargan las fuentes,
 * porque una fuente más ancha que la de respaldo cambiaría la medida. Las
 * medidas son de layout, así que funciona igual dentro del lienzo escalado
 * con `transform: scale`.
 */

import { useLayoutEffect, useRef } from "react";

export function Ajustado({
  ancho,
  alto,
  max,
  min = 12,
  unaLinea = false,
  alinear = "izquierda",
  vertical = "centro",
  clave,
  style,
  soloLoNecesario = false,
  children,
}: {
  /** px; sin ancho ocupa el 100 % del contenedor. */
  ancho?: number;
  /**
   * La caja mide lo que el texto (hasta `ancho`) en vez de ocupar todo el
   * ancho: para poner algo justo después, como el ícono de un título.
   */
  soloLoNecesario?: boolean;
  alto: number;
  max: number;
  min?: number;
  unaLinea?: boolean;
  alinear?: "izquierda" | "centro" | "derecha";
  vertical?: "arriba" | "centro" | "abajo";
  /** Cambia cuando cambia el contenido: vuelve a medir. */
  clave?: string | number;
  style?: React.CSSProperties;
  children: React.ReactNode;
}) {
  const caja = useRef<HTMLDivElement>(null);
  const texto = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const c = caja.current;
    const t = texto.current;
    if (!c || !t) return;
    const medir = () => {
      const cabe = (tam: number) => {
        t.style.fontSize = `${tam}px`;
        return t.scrollWidth <= c.clientWidth + 0.5 && t.scrollHeight <= c.clientHeight + 0.5;
      };
      const tope = Math.max(min, max);
      if (cabe(tope)) return;
      let bajo = min;
      let alto = tope;
      for (let i = 0; i < 9 && alto - bajo > 0.5; i++) {
        const medio = (bajo + alto) / 2;
        if (cabe(medio)) bajo = medio;
        else alto = medio;
      }
      t.style.fontSize = `${Math.floor(bajo * 10) / 10}px`;
    };
    medir();
    let vivo = true;
    void document.fonts?.ready.then(() => vivo && medir());
    return () => {
      vivo = false;
    };
  }, [clave, ancho, alto, max, min, unaLinea]);

  return (
    <div
      ref={caja}
      data-ajustado=""
      style={{
        width: soloLoNecesario ? "fit-content" : (ancho ?? "100%"),
        maxWidth: soloLoNecesario ? (ancho ?? "100%") : undefined,
        height: alto,
        overflow: "hidden",
        display: "flex",
        alignItems: vertical === "arriba" ? "flex-start" : vertical === "abajo" ? "flex-end" : "center",
        justifyContent: alinear === "centro" ? "center" : alinear === "derecha" ? "flex-end" : "flex-start",
        minWidth: 0,
        flexShrink: 0,
      }}
    >
      <div
        ref={texto}
        style={{
          ...style,
          // El tamaño lo pone la medición; no se pasa por React para que un
          // re-render no lo devuelva al máximo.
          whiteSpace: unaLinea ? "nowrap" : "normal",
          overflowWrap: "break-word",
          width: unaLinea ? undefined : "100%",
          textAlign: alinear === "centro" ? "center" : alinear === "derecha" ? "right" : "left",
        }}
      >
        {children}
      </div>
    </div>
  );
}
