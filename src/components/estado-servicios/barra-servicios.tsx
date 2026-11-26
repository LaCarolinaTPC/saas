"use client";

/**
 * Barra de estado de los servicios externos (26-nov-2026): siempre a la vista
 * en Candidatos, Comunicaciones y el chat de prueba. En verde cuando todo
 * responde; cuando algo falla, en rojo con qué hacer mientras tanto (por
 * ejemplo, revisar el RNMC a mano). Croma va por fuente. Se calcula con las
 * respuestas ya recibidas y se actualiza sola cada 2 minutos.
 */
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronUp, ExternalLink, PauseCircle, RefreshCw, TriangleAlert } from "lucide-react";
import type { EstadoServicio, NivelServicio } from "@/lib/estado-servicios";
import { ETIQUETA_NIVEL, TONO_NIVEL, haceCuanto } from "./comun";

const CADA_MS = 120_000;

const CORTO: Record<string, string> = {
  croma: "Croma",
  ia: "IA",
  whatsapp: "WhatsApp",
  correo: "Correo",
};

function Punto({ nivel }: { nivel: NivelServicio }) {
  return <span className={`h-2 w-2 shrink-0 rounded-full ${TONO_NIVEL[nivel].punto}`} />;
}

function cuenta(s: { errores24h: number; total24h: number }): string {
  return s.total24h ? `${s.errores24h} error${s.errores24h === 1 ? "" : "es"} de ${s.total24h} en 24 h` : "sin uso en 24 h";
}

export function BarraServicios({ inicial, className = "" }: { inicial?: EstadoServicio[]; className?: string }) {
  const [estados, setEstados] = useState<EstadoServicio[] | null>(inicial ?? null);
  const [leidoAt, setLeidoAt] = useState<string | null>(inicial ? new Date().toISOString() : null);
  const [abierta, setAbierta] = useState(false);
  const [cargando, setCargando] = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const r = await fetch("/api/estado-servicios", { cache: "no-store" });
      const j = (await r.json()) as { ok: boolean; estados?: EstadoServicio[] };
      if (j.ok && j.estados) {
        setEstados(j.estados);
        setLeidoAt(new Date().toISOString());
      }
    } catch {
      // Sin red: se queda lo último que se leyó.
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    // Sin datos del servidor (chat de prueba), se leen al abrir; después, cada 2 minutos y al volver a la ventana.
    const primera = inicial ? null : setTimeout(() => void cargar(), 0);
    const refrescar = () => {
      if (document.visibilityState === "visible") void cargar();
    };
    const intervalo = setInterval(refrescar, CADA_MS);
    window.addEventListener("focus", refrescar);
    return () => {
      if (primera) clearTimeout(primera);
      clearInterval(intervalo);
      window.removeEventListener("focus", refrescar);
    };
  }, [cargar, inicial]);

  if (!estados) return null;
  if (!estados.length) return null;
  const mal = estados.filter((e) => e.nivel === "fallando");
  const pausa = estados.find((e) => e.id === "croma" && e.nivel === "pausado");
  const todoBien = !mal.length && !pausa;

  return (
    <div className={`space-y-2 ${className}`}>
      {mal.map((e) => (
        <div key={e.id} className="flex flex-wrap items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="font-medium">
              {e.nombre} no está respondiendo: {e.seguidos > 0 ? `${e.seguidos} error${e.seguidos === 1 ? "" : "es"} seguido${e.seguidos === 1 ? "" : "s"}` : `${e.errores24h} errores en 24 h`}
              {e.ultimoError ? `, el último ${haceCuanto(e.ultimoError.at)}` : ""}
              {e.ultimoOkAt ? ` (respondió bien por última vez ${haceCuanto(e.ultimoOkAt)})` : ""}.
            </p>
            {e.ultimoError && <p className="truncate text-xs opacity-80" title={e.ultimoError.texto}>{e.ultimoError.texto}</p>}
            {e.consejo && (
              <p className="mt-0.5 text-xs">
                <span className="font-semibold">Qué hacer: </span>
                {e.consejo}
              </p>
            )}
            {(e.partes ?? []).some((p) => p.nivel === "fallando" && p.portal) && (
              <p className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs">
                {(e.partes ?? [])
                  .filter((p) => p.nivel === "fallando" && p.portal)
                  .map((p) => (
                    <a key={p.id} href={p.portal!} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium underline">
                      Revisar {p.nombre.split(" (")[0]} a mano <ExternalLink className="h-3 w-3" />
                    </a>
                  ))}
              </p>
            )}
          </div>
          <Link href="/candidatos/seleccion?pestana=tiempos" className="shrink-0 text-xs font-medium underline">
            Ver estado
          </Link>
        </div>
      ))}
      {pausa && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          <PauseCircle className="h-4 w-4 shrink-0" />
          <p className="min-w-0 flex-1">
            Croma está en pausa: no se consulta el RUNT, el SIMIT ni los antecedentes. Lo que falta se revisa a mano en la ficha («Lo revisé a mano») y nadie se cita solo.
          </p>
          <Link href="/candidatos/seleccion?pestana=tiempos" className="shrink-0 text-xs font-medium underline">
            Quitar la pausa
          </Link>
        </div>
      )}

      {/* La barra: siempre, con cada servicio y, al abrirla, las fuentes de Croma. */}
      <div className={`rounded-xl border px-3 py-1.5 text-xs ${todoBien ? "border-emerald-200 bg-emerald-50/60" : "border-border bg-white"}`}>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className={`font-medium ${todoBien ? "text-emerald-800" : "text-text-primary"}`}>
            {todoBien ? "Todos los servicios responden" : "Estado de los servicios"}
          </span>
          {estados.map((s) => (
            <span key={s.id} className="flex items-center gap-1 text-text-secondary" title={`${s.nombre}: ${ETIQUETA_NIVEL[s.nivel]} · ${cuenta(s)}`}>
              <Punto nivel={s.nivel} />
              {CORTO[s.id] ?? s.id}
              {s.id === "croma" && s.partes?.some((p) => p.nivel === "fallando") && (
                <span className="text-red-700">({s.partes.filter((p) => p.nivel === "fallando").map((p) => p.nombre.split(" (")[0]).join(", ")})</span>
              )}
            </span>
          ))}
          <span className="ml-auto flex items-center gap-2 text-text-muted">
            {leidoAt && <span>Actualizado {haceCuanto(leidoAt)}</span>}
            <button type="button" onClick={() => void cargar()} disabled={cargando} className="cursor-pointer hover:text-text-primary disabled:opacity-50" aria-label="Actualizar el estado">
              <RefreshCw className={`h-3.5 w-3.5 ${cargando ? "animate-spin" : ""}`} />
            </button>
            <button type="button" onClick={() => setAbierta((a) => !a)} className="flex cursor-pointer items-center gap-0.5 hover:text-text-primary">
              Detalle {abierta ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            </button>
          </span>
        </div>
        {abierta && (
          <ul className="mt-2 space-y-1 border-t border-border/60 pt-2">
            {estados.map((s) => (
              <li key={s.id}>
                <div className="flex flex-wrap items-center gap-2">
                  <Punto nivel={s.nivel} />
                  <span className="font-medium text-text-primary">{s.id === "croma" ? "Croma" : s.nombre}</span>
                  <span className={TONO_NIVEL[s.nivel].texto}>{ETIQUETA_NIVEL[s.nivel]}</span>
                  <span className="ml-auto text-text-tertiary">
                    {cuenta(s)}
                    {s.ultimoOkAt ? ` · última buena ${haceCuanto(s.ultimoOkAt)}` : ""}
                  </span>
                </div>
                {s.partes && s.partes.length > 0 && (
                  <ul className="mt-1 space-y-0.5 pl-4">
                    {s.partes.map((p) => (
                      <li key={p.id} className="flex flex-wrap items-center gap-2">
                        <Punto nivel={p.nivel} />
                        <span className="text-text-secondary">{p.nombre}</span>
                        <span className={TONO_NIVEL[p.nivel].texto}>{ETIQUETA_NIVEL[p.nivel]}</span>
                        {p.portal && (
                          <a href={p.portal} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 text-primary hover:underline" title="Consulta ciudadana para revisarla a mano">
                            portal <ExternalLink className="h-3 w-3" />
                          </a>
                        )}
                        <span className="ml-auto text-text-tertiary">
                          {cuenta(p)}
                          {p.ultimoOkAt ? ` · última buena ${haceCuanto(p.ultimoOkAt)}` : " · sin respuestas buenas recientes"}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
            <li className="pt-1 text-[11px] text-text-muted">
              Se calcula con las respuestas recibidas (no consulta a los servicios). «Fallando»: 3 errores seguidos en las últimas 3 horas, o la mitad de los intentos de la
              última hora.{" "}
              <Link href="/candidatos/seleccion?pestana=tiempos" className="underline">
                Configurar alertas
              </Link>
            </li>
          </ul>
        )}
      </div>
    </div>
  );
}
