"use client";

/**
 * Inicio de la presentación con sonido (TV y vista previa). El navegador solo
 * deja sonar un video después de un gesto en la página (clic, toque o tecla), y
 * el TV abre la presentación solo. Por eso, si la presentación tiene videos «Con
 * sonido»:
 *
 *   - al abrir se muestra una pantalla de inicio con «Iniciar presentación con
 *     sonido»; el pase de diapositivas empieza solo cuando alguien pulsa (pedido
 *     de RRHH: sin temporizador), desde la primera, y se repite todo el día;
 *   - si después un video queda sin sonido, queda «Activar sonido» en la esquina.
 *
 * Sirve cualquier gesto: el botón (tiene el foco, para el OK del control remoto),
 * cualquier tecla o un toque en la pantalla.
 */
import { useEffect, useRef } from "react";
import { Play, Tv, Volume2 } from "lucide-react";

const TECLAS_IGNORADAS = ["Escape", "Tab", "Shift", "Control", "Alt", "Meta"];

/** Pantalla de inicio (antes de empezar) o botón pequeño en la esquina (ya empezó, sin sonido). */
export function BotonIniciarSonido({
  inicio,
  visible,
  onIniciar,
  titulo,
}: {
  /** Pantalla de inicio: la presentación aún no empieza. */
  inicio: boolean;
  /** Botón pequeño de la esquina (un video quedó sin sonido). */
  visible: boolean;
  onIniciar: () => void;
  titulo?: string;
}) {
  const boton = useRef<HTMLButtonElement>(null);
  const iniciar = useRef(onIniciar);
  useEffect(() => {
    iniciar.current = onIniciar;
  }, [onIniciar]);
  const activo = inicio || visible;

  // Cualquier tecla del control o toque en la pantalla cuenta como gesto.
  useEffect(() => {
    if (!activo) return;
    boton.current?.focus();
    const alGesto = (e: Event) => {
      if (e instanceof KeyboardEvent && TECLAS_IGNORADAS.includes(e.key)) return;
      iniciar.current();
    };
    window.addEventListener("keydown", alGesto);
    window.addEventListener("pointerdown", alGesto);
    return () => {
      window.removeEventListener("keydown", alGesto);
      window.removeEventListener("pointerdown", alGesto);
    };
  }, [activo]);

  if (inicio) {
    return (
      <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-[3vh] bg-gradient-to-br from-[#0f172a] via-[#111c3a] to-[#1e293b] px-8 text-center text-white">
        <div className="flex items-center gap-4 text-[clamp(20px,2.4vw,40px)] font-semibold text-slate-300">
          <Tv className="h-[1.3em] w-[1.3em] text-[#2a78d6]" />
          {titulo || "Pantalla informativa"}
        </div>
        <button
          ref={boton}
          type="button"
          autoFocus
          onClick={() => iniciar.current()}
          className="flex items-center gap-[1.2vw] rounded-full bg-[#2a78d6] px-[3.5vw] py-[2.6vh] text-[clamp(22px,2.8vw,52px)] font-semibold text-white shadow-2xl ring-white/70 hover:bg-[#2366b8] focus:outline-none focus:ring-8"
        >
          <Play className="h-[1.2em] w-[1.2em] fill-white" /> Iniciar presentación con sonido
        </button>
        <p className="text-[clamp(16px,1.8vw,30px)] text-slate-300">Pulse OK en el control remoto o toque la pantalla</p>
        <p className="text-[clamp(13px,1.3vw,22px)] text-slate-500">Se pulsa una vez: la presentación se repite todo el día</p>
      </div>
    );
  }
  if (!visible) return null;
  return (
    <button
      ref={boton}
      type="button"
      onClick={() => iniciar.current()}
      className="absolute bottom-6 left-6 z-30 flex items-center gap-2 rounded-full bg-black/70 px-4 py-2 text-[clamp(13px,1.1vw,18px)] text-white backdrop-blur focus:outline-none focus:ring-4 focus:ring-white/60"
    >
      <Volume2 className="h-[1.2em] w-[1.2em]" /> Activar sonido
    </button>
  );
}
