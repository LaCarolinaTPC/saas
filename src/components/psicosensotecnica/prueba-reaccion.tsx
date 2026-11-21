"use client";

/**
 * Tiempo de reacción: primero una señal simple (tocar apenas se enciende) y
 * después de elección (tocar el lado que se enciende). Cada fase tiene unos
 * ensayos de práctica que no se envían.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { REACCION, type DatosPrueba, type EnsayoReaccion } from "@/lib/psicosensotecnica/bateria";
import { Avance, Instrucciones, Tarjeta, azar, useInterrupciones } from "./comun";

type Fase = "simple" | "eleccion";
type Etapa = { fase: Fase; practica: boolean; corriendo: boolean };
type Lado = "izq" | "der";

const TOTAL: Record<Fase, number> = { simple: REACCION.ensayosSimple, eleccion: REACCION.ensayosEleccion };

export function PruebaReaccion({ onTerminar }: { onTerminar: (datos: DatosPrueba["reaccion"]) => void }) {
  const [etapa, setEtapa] = useState<Etapa>({ fase: "simple", practica: true, corriendo: false });
  /** Qué está encendido: nada (esperando), el centro o un lado. */
  const [senal, setSenal] = useState<null | "centro" | Lado>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [hechos, setHechos] = useState(0);

  const ensayos = useRef<EnsayoReaccion[]>([]);
  const cuenta = useRef(0);
  const enPausa = useRef(false);
  const t0= useRef<number | null>(null);
  const reloj = useRef<ReturnType<typeof setTimeout> | null>(null);
  const etapaRef = useRef(etapa);
  const senalRef = useRef(senal);
  const interrupciones = useInterrupciones(etapa.corriendo && !etapa.practica);

  useEffect(() => {
    etapaRef.current = etapa;
  }, [etapa]);

  const limpiar = () => {
    if (reloj.current) clearTimeout(reloj.current);
    reloj.current = null;
  };
  useEffect(() => limpiar, []);

  const encender = useCallback((valor: null | "centro" | Lado) => {
    senalRef.current = valor;
    setSenal(valor);
    // El tiempo cuenta desde que la señal se pinta, no desde que se pide.
    t0.current = null;
    if (valor) requestAnimationFrame(() => (t0.current = performance.now()));
  }, []);

  const siguiente = useCallback(() => {
    limpiar();
    enPausa.current = false;
    encender(null);
    reloj.current = setTimeout(() => {
      encender(etapaRef.current.fase === "simple" ? "centro" : Math.random() < 0.5 ? "izq" : "der");
      reloj.current = setTimeout(() => registrar({ tr: null, anticipada: false, respuesta: null }), REACCION.limiteMs);
    }, azar(REACCION.esperaMinMs, REACCION.esperaMaxMs));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [encender]);

  function registrar(r: { tr: number | null; anticipada: boolean; respuesta: Lado | null }) {
    limpiar();
    enPausa.current = true;
    const e = etapaRef.current;
    const lado = senalRef.current === "izq" || senalRef.current === "der" ? senalRef.current : undefined;
    if (!e.practica) {
      ensayos.current.push(
        e.fase === "simple"
          ? { fase: "simple", tr: r.tr, anticipada: r.anticipada }
          // Si se adelantó no había lado encendido todavía: se anota uno cualquiera, el ensayo no cuenta.
          : { fase: "eleccion", lado: lado ?? "izq", respuesta: r.respuesta, tr: r.tr, anticipada: r.anticipada }
      );
    }
    cuenta.current += 1;
    setHechos(cuenta.current);
    setAviso(r.anticipada ? "Espere a que se encienda" : r.tr == null ? "No respondió a tiempo" : e.practica ? `${Math.round(r.tr)} ms` : null);
    encender(null);

    const total = e.practica ? REACCION.practica : TOTAL[e.fase];
    if (cuenta.current < total) {
      reloj.current = setTimeout(() => {
        setAviso(null);
        siguiente();
      }, 700);
      return;
    }
    // Se acabó el tramo: de práctica a la fase real, de simple a elección, o fin.
    reloj.current = setTimeout(() => {
      setAviso(null);
      cuenta.current = 0;
      setHechos(0);
      if (e.practica) setEtapa({ fase: e.fase, practica: false, corriendo: false });
      else if (e.fase === "simple") setEtapa({ fase: "eleccion", practica: true, corriendo: false });
      else onTerminar({ ensayos: ensayos.current, interrupciones: interrupciones.current });
    }, 900);
  }

  function tocar(ladoTocado: Lado | null) {
    // Entre un ensayo y el siguiente los toques no cuentan (un doble toque no gasta un ensayo).
    if (!etapaRef.current.corriendo || enPausa.current) return;
    if (!senalRef.current) return registrar({ tr: null, anticipada: true, respuesta: ladoTocado });
    if (t0.current == null) return;
    registrar({ tr: Math.min(performance.now() - t0.current, REACCION.limiteMs), anticipada: false, respuesta: ladoTocado });
  }

  // Teclado: espacio en la simple, flechas en la de elección.
  const tocarRef = useRef(tocar);
  useEffect(() => {
    tocarRef.current = tocar;
  });
  useEffect(() => {
    if (!etapa.corriendo) return;
    const alPulsar = (ev: KeyboardEvent) => {
      if (ev.repeat) return;
      if (etapaRef.current.fase === "simple" && ev.code === "Space") {
        ev.preventDefault();
        tocarRef.current(null);
      } else if (etapaRef.current.fase === "eleccion" && (ev.code === "ArrowLeft" || ev.code === "ArrowRight")) {
        ev.preventDefault();
        tocarRef.current(ev.code === "ArrowLeft" ? "izq" : "der");
      }
    };
    window.addEventListener("keydown", alPulsar);
    return () => window.removeEventListener("keydown", alPulsar);
  }, [etapa.corriendo]);

  const empezar = () => {
    setEtapa((e) => ({ ...e, corriendo: true }));
    etapaRef.current = { ...etapaRef.current, corriendo: true };
    siguiente();
  };

  if (!etapa.corriendo) {
    const simple = etapa.fase === "simple";
    return (
      <Instrucciones
        titulo={`Tiempo de reacción · ${simple ? "parte 1 de 2" : "parte 2 de 2"}${etapa.practica ? "" : " · ahora sí cuenta"}`}
        pasos={
          etapa.practica
            ? simple
              ? [
                  "Va a ver un círculo gris. En algún momento se pone verde.",
                  "Apenas se ponga verde, tóquelo lo más rápido que pueda (o pulse la barra espaciadora).",
                  "No toque antes de que cambie: eso cuenta como error.",
                  "Primero hay tres ensayos de práctica.",
                ]
              : [
                  "Ahora hay dos círculos, uno a cada lado. Se enciende uno de los dos.",
                  "Toque el que se encienda, lo más rápido que pueda (o use las flechas izquierda y derecha).",
                  "Si toca el lado equivocado cuenta como error.",
                  "Primero hay tres ensayos de práctica.",
                ]
            : [`Terminó la práctica. Ahora son ${TOTAL[etapa.fase]} ensayos que sí cuentan.`, "Responda rápido, pero sin adelantarse."]
        }
        boton={etapa.practica ? "Empezar la práctica" : "Empezar"}
        onSeguir={empezar}
      />
    );
  }

  const total = etapa.practica ? REACCION.practica : TOTAL[etapa.fase];
  const circulo = (encendido: boolean) =>
    `h-36 w-36 rounded-full border-4 transition-none sm:h-44 sm:w-44 ${encendido ? "border-green-600 bg-green-500" : "border-gray-300 bg-gray-200"}`;

  return (
    <Tarjeta>
      <Avance hecho={hechos} total={total} etiqueta={etapa.practica ? "Práctica" : "Prueba"} />
      <div className="flex min-h-[300px] touch-none select-none flex-col items-center justify-center gap-4">
        {etapa.fase === "simple" ? (
          <button type="button" aria-label="Tocar" onPointerDown={() => tocar(null)} className={circulo(senal === "centro")} />
        ) : (
          <div className="flex w-full items-center justify-around">
            <button type="button" aria-label="Izquierda" onPointerDown={() => tocar("izq")} className={circulo(senal === "izq")} />
            <button type="button" aria-label="Derecha" onPointerDown={() => tocar("der")} className={circulo(senal === "der")} />
          </div>
        )}
        <p className="h-6 text-sm font-medium text-gray-600">{aviso}</p>
      </div>
    </Tarjeta>
  );
}
