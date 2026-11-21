"use client";

/**
 * Atención sostenida: pasan figuras una tras otra durante unos dos minutos y
 * hay que tocar solo cuando sale el círculo rojo.
 */

import { useEffect, useRef, useState } from "react";
import { ATENCION, type DatosPrueba, type EnsayoAtencion } from "@/lib/psicosensotecnica/bateria";
import { Avance, Instrucciones, Tarjeta, barajar, useInterrupciones } from "./comun";

interface Figura {
  objetivo: boolean;
  color: string;
  redonda: boolean;
}

const OBJETIVO: Figura = { objetivo: true, color: "bg-red-500", redonda: true };
const DISTRACTORES: Figura[] = [
  { objetivo: false, color: "bg-red-500", redonda: false },
  { objetivo: false, color: "bg-green-500", redonda: true },
  { objetivo: false, color: "bg-yellow-400", redonda: true },
  { objetivo: false, color: "bg-green-500", redonda: false },
];

/** Cantidad exacta de objetivos, en orden al azar y sin tres seguidos. */
function secuencia(n: number): Figura[] {
  const objetivos = Math.round(n * ATENCION.proporcionObjetivo);
  for (let intento = 0; intento < 50; intento++) {
    const s = barajar([
      ...Array.from({ length: objetivos }, () => OBJETIVO),
      ...Array.from({ length: n - objetivos }, (_, i) => DISTRACTORES[i % DISTRACTORES.length]),
    ]);
    if (!s.some((f, i) => f.objetivo && s[i + 1]?.objetivo && s[i + 2]?.objetivo)) return s;
  }
  return barajar([...Array.from({ length: objetivos }, () => OBJETIVO), ...Array.from({ length: n - objetivos }, (_, i) => DISTRACTORES[i % DISTRACTORES.length])]);
}

export function PruebaAtencion({ onTerminar }: { onTerminar: (datos: DatosPrueba["atencion"]) => void }) {
  const [practica, setPractica] = useState(true);
  const [corriendo, setCorriendo] = useState(false);
  const [figura, setFigura] = useState<Figura | null>(null);
  const [indice, setIndice] = useState(0);
  const [marca, setMarca] = useState<null | "bien" | "mal">(null);

  const figuras = useRef<Figura[]>([]);
  const resultados = useRef<EnsayoAtencion[]>([]);
  const actual = useRef(-1);
  const t0 = useRef<number | null>(null);
  const respondio = useRef(false);
  const relojes = useRef<ReturnType<typeof setTimeout>[]>([]);
  const interrupciones = useInterrupciones(corriendo && !practica);

  const limpiar = () => {
    relojes.current.forEach(clearTimeout);
    relojes.current = [];
  };
  useEffect(() => limpiar, []);

  function mostrar(i: number, esPractica: boolean) {
    const total = figuras.current.length;
    if (i >= total) {
      limpiar();
      setFigura(null);
      setCorriendo(false);
      if (esPractica) setPractica(false);
      else onTerminar({ ensayos: resultados.current, interrupciones: interrupciones.current });
      return;
    }
    actual.current = i;
    respondio.current = false;
    t0.current = null;
    setIndice(i);
    setMarca(null);
    setFigura(figuras.current[i]);
    requestAnimationFrame(() => (t0.current = performance.now()));
    relojes.current.push(setTimeout(() => setFigura(null), ATENCION.visibleMs));
    relojes.current.push(
      setTimeout(() => {
        // Cierra la ventana de esta figura: si no tocó, queda sin respuesta.
        if (!respondio.current) {
          resultados.current[i] = { objetivo: figuras.current[i].objetivo, respondio: false, tr: null };
          if (esPractica && figuras.current[i].objetivo) setMarca("mal");
        }
        mostrar(i + 1, esPractica);
      }, ATENCION.intervaloMs)
    );
  }

  function empezar() {
    limpiar();
    figuras.current = secuencia(practica ? ATENCION.practica : ATENCION.estimulos);
    resultados.current = [];
    setCorriendo(true);
    relojes.current.push(setTimeout(() => mostrar(0, practica), 800));
  }

  function tocar() {
    const i = actual.current;
    if (!corriendo || i < 0 || respondio.current || t0.current == null) return;
    respondio.current = true;
    const f = figuras.current[i];
    resultados.current[i] = { objetivo: f.objetivo, respondio: true, tr: Math.min(performance.now() - t0.current, ATENCION.intervaloMs) };
    if (practica) setMarca(f.objetivo ? "bien" : "mal");
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
    const minutos = Math.round((ATENCION.estimulos * ATENCION.intervaloMs) / 60_000);
    return (
      <Instrucciones
        titulo={`Atención sostenida${practica ? "" : " · ahora sí cuenta"}`}
        pasos={
          practica
            ? [
                "Van a pasar figuras de colores, una tras otra, bastante rápido.",
                "Toque la pantalla (o pulse la barra espaciadora) SOLO cuando salga un círculo rojo.",
                "Con cualquier otra figura (cuadrado rojo, círculo verde o amarillo…) no toque.",
                "Primero hay una práctica corta.",
              ]
            : [`Terminó la práctica. La prueba dura unos ${minutos} minutos sin pausas.`, "Mantenga la atención hasta el final: toque solo con el círculo rojo."]
        }
        boton={practica ? "Empezar la práctica" : "Empezar"}
        onSeguir={empezar}
      />
    );
  }

  return (
    <Tarjeta>
      <Avance hecho={indice + 1} total={practica ? ATENCION.practica : ATENCION.estimulos} etiqueta={practica ? "Práctica" : "Prueba"} />
      <button
        type="button"
        aria-label="Tocar cuando salga el círculo rojo"
        onPointerDown={tocar}
        className={`flex min-h-[320px] w-full touch-none select-none items-center justify-center rounded-xl border-2 ${
          marca === "bien" ? "border-green-400" : marca === "mal" ? "border-red-400" : "border-gray-100"
        } bg-gray-50`}
      >
        {figura && <span className={`block h-32 w-32 sm:h-40 sm:w-40 ${figura.color} ${figura.redonda ? "rounded-full" : "rounded-md"}`} />}
      </button>
      <p className="mt-3 text-center text-sm text-gray-500">Toque solo con el círculo rojo</p>
    </Tarjeta>
  );
}
