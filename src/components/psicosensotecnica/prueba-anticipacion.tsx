"use client";

/**
 * Anticipación de velocidad: un vehículo avanza a velocidad constante y entra
 * a un túnel. Hay que tocar en el instante en que saldría por la meta.
 */

import { useEffect, useRef, useState } from "react";
import { ANTICIPACION, type DatosPrueba, type EnsayoAnticipacion } from "@/lib/psicosensotecnica/bateria";
import { Avance, Instrucciones, Tarjeta, azar, useInterrupciones } from "./comun";

interface Recorrido {
  visibleMs: number;
  ocultoMs: number;
  /** Fracción de la pista que se ve antes del túnel. */
  tramoVisible: number;
}

/** Velocidad constante: el tiempo oculto sale del tiempo visible y de dónde empieza el túnel. */
function recorrido(): Recorrido {
  for (let i = 0; i < 100; i++) {
    const visibleMs = azar(ANTICIPACION.visibleMinMs, ANTICIPACION.visibleMaxMs);
    const tramoVisible = azar(0.4, 0.6);
    const ocultoMs = (visibleMs * (1 - tramoVisible)) / tramoVisible;
    if (ocultoMs >= ANTICIPACION.ocultoMinMs && ocultoMs <= ANTICIPACION.ocultoMaxMs) return { visibleMs, ocultoMs, tramoVisible };
  }
  return { visibleMs: 1500, ocultoMs: 1500, tramoVisible: 0.5 };
}

export function PruebaAnticipacion({ onTerminar }: { onTerminar: (datos: DatosPrueba["anticipacion"]) => void }) {
  const [practica, setPractica] = useState(true);
  const [corriendo, setCorriendo] = useState(false);
  const [hechos, setHechos] = useState(0);
  const [actual, setActual] = useState<Recorrido | null>(null);
  /** Posición del vehículo, de 0 a 1; null = dentro del túnel. */
  const [posicion, setPosicion] = useState<number | null>(0);
  const [aviso, setAviso] = useState<string | null>(null);

  const ensayos = useRef<EnsayoAnticipacion[]>([]);
  const cuenta = useRef(0);
  const inicio = useRef<number | null>(null);
  const recorridoRef = useRef<Recorrido | null>(null);
  const esperando = useRef(false);
  const cuadro = useRef<number | null>(null);
  const reloj = useRef<ReturnType<typeof setTimeout> | null>(null);
  const practicaRef = useRef(practica);
  const interrupciones = useInterrupciones(corriendo && !practica);

  const limpiar = () => {
    if (cuadro.current != null) cancelAnimationFrame(cuadro.current);
    if (reloj.current) clearTimeout(reloj.current);
    cuadro.current = null;
    reloj.current = null;
  };
  useEffect(() => limpiar, []);

  function lanzar() {
    limpiar();
    const r = recorrido();
    recorridoRef.current = r;
    setActual(r);
    setAviso(null);
    setPosicion(0);
    inicio.current = null;
    esperando.current = true;
    const paso = (t: number) => {
      if (inicio.current == null) inicio.current = t;
      const transcurrido = t - inicio.current;
      if (transcurrido < r.visibleMs) {
        setPosicion((transcurrido / r.visibleMs) * r.tramoVisible);
        cuadro.current = requestAnimationFrame(paso);
      } else {
        setPosicion(null);
        cuadro.current = null;
      }
    };
    cuadro.current = requestAnimationFrame(paso);
    reloj.current = setTimeout(() => cerrar(null), r.visibleMs + r.ocultoMs + ANTICIPACION.margenMs);
  }

  function cerrar(errorMs: number | null) {
    if (!esperando.current) return;
    esperando.current = false;
    limpiar();
    const r = recorridoRef.current!;
    const esPractica = practicaRef.current;
    if (!esPractica) ensayos.current.push({ visibleMs: Math.round(r.visibleMs), ocultoMs: Math.round(r.ocultoMs), errorMs: errorMs == null ? null : Math.round(errorMs) });
    cuenta.current += 1;
    setHechos(cuenta.current);
    setPosicion(null);
    setAviso(
      errorMs == null
        ? "No respondió a tiempo"
        : esPractica
          ? Math.abs(errorMs) < 150 ? "¡Muy cerca!" : errorMs < 0 ? `Se adelantó ${(Math.abs(errorMs) / 1000).toFixed(1)} s` : `Se demoró ${(errorMs / 1000).toFixed(1)} s`
          : "Anotado"
    );
    const total = esPractica ? ANTICIPACION.practica : ANTICIPACION.ensayos;
    reloj.current = setTimeout(() => {
      if (cuenta.current < total) return lanzar();
      setCorriendo(false);
      setAviso(null);
      cuenta.current = 0;
      setHechos(0);
      if (esPractica) {
        practicaRef.current = false;
        setPractica(false);
      } else onTerminar({ ensayos: ensayos.current, interrupciones: interrupciones.current });
    }, 1100);
  }

  function tocar() {
    const r = recorridoRef.current;
    if (!esperando.current || !r || inicio.current == null) return;
    const transcurrido = performance.now() - inicio.current;
    // Mientras el vehículo se ve todavía no hay nada que estimar.
    if (transcurrido < r.visibleMs) return;
    cerrar(Math.max(-ANTICIPACION.ocultoMaxMs, Math.min(ANTICIPACION.margenMs, transcurrido - (r.visibleMs + r.ocultoMs))));
  }

  const tocarRef = useRef(tocar);
  useEffect(() => {
    tocarRef.current = tocar;
  });
  useEffect(() => {
    if (!corriendo) return;
    const alPulsar = (ev: KeyboardEvent) => {
      if (ev.code !== "Space" || ev.repeat) return;
      ev.preventDefault();
      tocarRef.current();
    };
    window.addEventListener("keydown", alPulsar);
    return () => window.removeEventListener("keydown", alPulsar);
  }, [corriendo]);

  if (!corriendo) {
    return (
      <Instrucciones
        titulo={`Anticipación de velocidad${practica ? "" : " · ahora sí cuenta"}`}
        pasos={
          practica
            ? [
                "Un vehículo avanza por la pista a velocidad constante y entra a un túnel, donde deja de verse.",
                "Dentro del túnel sigue a la misma velocidad. Calcule cuándo llegaría a la línea de meta, al final del túnel.",
                "Toque la pantalla (o pulse la barra espaciadora) en el instante en que cree que llega a la meta.",
                "Primero hay dos ensayos de práctica, en los que se le dice qué tan cerca estuvo.",
              ]
            : [`Terminó la práctica. Ahora son ${ANTICIPACION.ensayos} ensayos que sí cuentan.`, "Aquí ya no se le dice qué tan cerca estuvo."]
        }
        boton={practica ? "Empezar la práctica" : "Empezar"}
        onSeguir={() => {
          setCorriendo(true);
          lanzar();
        }}
      />
    );
  }

  const tramo = actual?.tramoVisible ?? 0.5;
  return (
    <Tarjeta>
      <Avance hecho={hechos} total={practica ? ANTICIPACION.practica : ANTICIPACION.ensayos} etiqueta={practica ? "Práctica" : "Prueba"} />
      <button type="button" aria-label="Tocar cuando el vehículo llegue a la meta" onPointerDown={tocar} className="block w-full touch-none select-none py-10">
        <div className="relative h-16 w-full overflow-hidden rounded-md bg-gray-200">
          {/* Túnel: desde donde deja de verse hasta la meta. */}
          <div className="absolute inset-y-0 right-0 bg-gray-700" style={{ left: `${tramo * 100}%` }} />
          <div className="absolute inset-y-0 right-0 w-1.5 bg-red-500" />
          {posicion != null && (
            <div className="absolute top-1/2 h-8 w-12 -translate-x-full -translate-y-1/2 rounded bg-indigo-600" style={{ left: `${Math.max(posicion, 0.001) * 100}%` }} />
          )}
        </div>
        <div className="mt-1 flex justify-end text-xs font-medium text-red-600">Meta</div>
      </button>
      <p className="h-6 text-center text-sm font-medium text-gray-600">{aviso ?? "Toque cuando crea que llega a la meta"}</p>
    </Tarjeta>
  );
}
