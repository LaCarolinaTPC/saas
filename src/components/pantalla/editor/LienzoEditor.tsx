"use client";

/**
 * Lienzo del editor: la diapositiva escalada para caber en el espacio, con una
 * capa encima para seleccionar, mover, redimensionar y rotar. Mismo patrón que
 * el croquis (CroquisEditor): pointer events con captura y un estado de
 * arrastre como unión discriminada. Las coordenadas se pasan a px del lienzo
 * dividiendo por la escala.
 */

import { useRef, useState } from "react";
import { LIENZO, type Diapositiva, type Elemento } from "@/lib/pantalla/modelo";
import type { DatosWidgets } from "@/lib/pantalla/datos-reglas";
import { claseFuentes } from "@/lib/pantalla/fuentes";
import { HANDLES, ajustarASnap, redimensionar, rotacionDesde, type Guia, type Handle, type Rect } from "@/lib/pantalla/editor-reglas";
import { LienzoDiapositiva } from "../LienzoDiapositiva";
import { useEscala } from "../Reproductor";

type Arrastre =
  | { modo: "mover"; id: string; inicio: { x: number; y: number }; caja: Rect; grupo: string }
  | { modo: "redimensionar"; id: string; handle: Handle; inicio: { x: number; y: number }; caja: Rect; rot: number; proporcional: boolean; grupo: string }
  | { modo: "rotar"; id: string; cx: number; cy: number; grupo: string };

const CURSOR: Record<Handle, string> = {
  n: "ns-resize",
  s: "ns-resize",
  e: "ew-resize",
  o: "ew-resize",
  ne: "nesw-resize",
  so: "nesw-resize",
  no: "nwse-resize",
  se: "nwse-resize",
};

function posHandle(h: Handle, w: number, hh: number): { left: number; top: number } {
  const x = h.includes("o") ? 0 : h.includes("e") ? w : w / 2;
  const y = h.startsWith("n") ? 0 : h.startsWith("s") ? hh : hh / 2;
  return { left: x, top: y };
}

let contadorGesto = 0;

export function LienzoEditor({
  diapositiva,
  datos,
  medios,
  seleccion,
  onSeleccionar,
  onCambiarElemento,
  onEditarTexto,
  probar,
}: {
  probar?: { id: string; n: number } | null;
  diapositiva: Diapositiva;
  datos: DatosWidgets;
  medios: Record<string, string>;
  seleccion: string | null;
  onSeleccionar: (id: string | null) => void;
  onCambiarElemento: (id: string, cambio: Partial<Elemento>, grupo: string) => void;
  onEditarTexto: (id: string) => void;
}) {
  const area = useRef<HTMLDivElement>(null);
  const lienzo = useRef<HTMLDivElement>(null);
  const escalaArea = useEscala(area);
  const escala = escalaArea * 0.94;
  const arrastre = useRef<Arrastre | null>(null);
  const [guias, setGuias] = useState<Guia[]>([]);

  const aLienzo = (e: { clientX: number; clientY: number }) => {
    const r = lienzo.current!.getBoundingClientRect();
    return { x: (e.clientX - r.left) / escala, y: (e.clientY - r.top) / escala };
  };

  const empezar = (e: React.PointerEvent, a: Arrastre) => {
    e.stopPropagation();
    e.preventDefault();
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    arrastre.current = a;
  };

  const alMover = (e: React.PointerEvent) => {
    const a = arrastre.current;
    if (!a) return;
    const p = aLienzo(e);
    if (a.modo === "mover") {
      const caja = { ...a.caja, x: a.caja.x + (p.x - a.inicio.x), y: a.caja.y + (p.y - a.inicio.y) };
      if (e.altKey) {
        setGuias([]);
        onCambiarElemento(a.id, { x: Math.round(caja.x), y: Math.round(caja.y) }, a.grupo);
        return;
      }
      const otras = diapositiva.elementos.filter((x) => x.id !== a.id).map(({ x, y, w, h }) => ({ x, y, w, h }));
      const s = ajustarASnap(caja, otras, 8 / escala);
      setGuias(s.guias);
      onCambiarElemento(a.id, { x: Math.round(s.x), y: Math.round(s.y) }, a.grupo);
    } else if (a.modo === "redimensionar") {
      // El delta se lleva al marco del elemento (deshace la rotación).
      const dx0 = p.x - a.inicio.x;
      const dy0 = p.y - a.inicio.y;
      const rad = (-a.rot * Math.PI) / 180;
      const dx = dx0 * Math.cos(rad) - dy0 * Math.sin(rad);
      const dy = dx0 * Math.sin(rad) + dy0 * Math.cos(rad);
      const prop = e.shiftKey ? !a.proporcional : a.proporcional;
      onCambiarElemento(a.id, redimensionar(a.caja, a.handle, dx, dy, prop), a.grupo);
    } else {
      onCambiarElemento(a.id, { rot: rotacionDesde(a.cx, a.cy, p.x, p.y, e.shiftKey) }, a.grupo);
    }
  };

  const terminar = () => {
    arrastre.current = null;
    setGuias([]);
  };

  const sel = diapositiva.elementos.find((x) => x.id === seleccion) ?? null;
  const h = 14 / escala; // tamaño de los handles en px de pantalla
  const borde = 2 / escala;

  return (
    <div
      ref={area}
      className="relative flex h-full w-full items-center justify-center overflow-hidden bg-[#e5e7eb]"
      onPointerDown={() => onSeleccionar(null)}
    >
      {escala > 0 && (
        <div
          ref={lienzo}
          className={`${claseFuentes} shadow-xl`}
          style={{ width: LIENZO.ancho * escala, height: LIENZO.alto * escala, position: "relative" }}
        >
          <div style={{ width: LIENZO.ancho, height: LIENZO.alto, transform: `scale(${escala})`, transformOrigin: "top left", position: "absolute" }}>
            <LienzoDiapositiva diapositiva={diapositiva} datos={datos} medios={medios} modo="editor" probar={probar} />

            {/* Capa de interacción */}
            <div
              style={{ position: "absolute", inset: 0 }}
              onPointerMove={alMover}
              onPointerUp={terminar}
              onPointerCancel={terminar}
            >
              {diapositiva.elementos.map((el) => (
                <div
                  key={el.id}
                  onPointerDown={(e) => {
                    onSeleccionar(el.id);
                    const p = aLienzo(e);
                    empezar(e, { modo: "mover", id: el.id, inicio: p, caja: { x: el.x, y: el.y, w: el.w, h: el.h }, grupo: `mover-${++contadorGesto}` });
                  }}
                  onDoubleClick={() => el.tipo === "texto" && onEditarTexto(el.id)}
                  style={{
                    position: "absolute",
                    left: el.x,
                    top: el.y,
                    width: el.w,
                    height: el.h,
                    transform: el.rot ? `rotate(${el.rot}deg)` : undefined,
                    cursor: "move",
                    outline: el.id === seleccion ? undefined : `${borde}px dashed transparent`,
                  }}
                  className="hover:outline-[#4F46E5]/50"
                />
              ))}

              {sel && (
                <div
                  style={{
                    position: "absolute",
                    left: sel.x,
                    top: sel.y,
                    width: sel.w,
                    height: sel.h,
                    transform: sel.rot ? `rotate(${sel.rot}deg)` : undefined,
                    outline: `${borde}px solid #4F46E5`,
                    pointerEvents: "none",
                  }}
                >
                  {/* Rotación */}
                  <div
                    style={{
                      position: "absolute",
                      left: sel.w / 2 - h / 2,
                      top: -h * 3,
                      width: h,
                      height: h,
                      borderRadius: "50%",
                      background: "#fff",
                      border: `${borde}px solid #4F46E5`,
                      cursor: "grab",
                      pointerEvents: "auto",
                    }}
                    onPointerDown={(e) => {
                      empezar(e, { modo: "rotar", id: sel.id, cx: sel.x + sel.w / 2, cy: sel.y + sel.h / 2, grupo: `rotar-${++contadorGesto}` });
                    }}
                    title="Rotar (Mayús: de 15 en 15)"
                  />
                  <div style={{ position: "absolute", left: sel.w / 2 - borde / 2, top: -h * 2, width: borde, height: h * 2, background: "#4F46E5" }} />
                  {HANDLES.map((hd) => {
                    const pos = posHandle(hd, sel.w, sel.h);
                    return (
                      <div
                        key={hd}
                        style={{
                          position: "absolute",
                          left: pos.left - h / 2,
                          top: pos.top - h / 2,
                          width: h,
                          height: h,
                          background: "#fff",
                          border: `${borde}px solid #4F46E5`,
                          borderRadius: 2 / escala,
                          cursor: CURSOR[hd],
                          pointerEvents: "auto",
                        }}
                        onPointerDown={(e) =>
                          empezar(e, {
                            modo: "redimensionar",
                            id: sel.id,
                            handle: hd,
                            inicio: aLienzo(e),
                            caja: { x: sel.x, y: sel.y, w: sel.w, h: sel.h },
                            rot: sel.rot,
                            proporcional: sel.tipo === "imagen" || sel.tipo === "video",
                            grupo: `tamano-${++contadorGesto}`,
                          })
                        }
                      />
                    );
                  })}
                </div>
              )}

              {guias.map((g, i) => (
                <div
                  key={i}
                  style={{
                    position: "absolute",
                    background: "#ec4899",
                    pointerEvents: "none",
                    ...(g.eje === "x"
                      ? { left: g.pos - borde / 2, top: 0, width: borde, height: LIENZO.alto }
                      : { top: g.pos - borde / 2, left: 0, height: borde, width: LIENZO.ancho }),
                  }}
                />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
