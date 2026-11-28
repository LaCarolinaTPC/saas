"use client";

/**
 * Candidatos › Novedades del día (27-nov-2026): las revisiones manuales que
 * surgieron hoy (antecedentes, exámenes por decidir, respuestas del
 * laboratorio, documentos que no cuadran, chats que requieren una persona) y
 * si ya se hicieron. Lo mismo que avisó por correo (Selección › Notificaciones),
 * aunque el correo esté apagado. Se lee por la ruta de lecturas (no hace fila
 * con las acciones de la página) y se actualiza cada 2 minutos.
 */
import { useCallback, useEffect, useState } from "react";
import { BellRing, CheckCircle2, ChevronDown, ChevronUp, CircleDot, ExternalLink, RefreshCw } from "lucide-react";
import { leerFicha } from "@/lib/lectura-ficha";
import type { NovedadDelDia } from "@/lib/seleccion/notificaciones-servidor";

const hora = (iso: string) => new Date(iso).toLocaleTimeString("es-CO", { hour: "numeric", minute: "2-digit", timeZone: "America/Bogota" });
const diaBogota = (offset = 0) => new Date(Date.now() - 5 * 3_600_000 - offset * 86_400_000).toISOString().slice(0, 10);

const CORREO: Record<string, string> = {
  enviado: "avisado por correo",
  fallido: "el correo falló",
  apagado: "correo apagado",
  sin_destinatarios: "sin destinatarios",
  pendiente: "enviando…",
};

/** Una ruta relativa (el enlace guardado lleva el dominio de quien lo generó). */
const ruta = (enlace: string | null) => {
  if (!enlace) return null;
  try {
    const u = new URL(enlace);
    return `${u.pathname}${u.search}`;
  } catch {
    return enlace;
  }
};

export function NovedadesDelDia() {
  const [dia, setDia] = useState<0 | 1>(0);
  const [novedades, setNovedades] = useState<NovedadDelDia[] | null | undefined>(undefined);
  const [abierto, setAbierto] = useState(true);
  const [verResueltas, setVerResueltas] = useState(false);

  const cargar = useCallback(() => {
    leerFicha("novedadesHoy", diaBogota(dia))
      .then((r) => setNovedades(r.novedades))
      .catch(() => setNovedades(null));
  }, [dia]);
  useEffect(() => {
    const primera = setTimeout(cargar, 0);
    const t = setInterval(() => document.visibilityState === "visible" && cargar(), 120_000);
    return () => {
      clearTimeout(primera);
      clearInterval(t);
    };
  }, [cargar]);

  if (novedades === null) return null; // Sin la migración 20261127235511: no hay bitácora.
  const lista = novedades ?? [];
  const pendientes = lista.filter((n) => n.resuelto === false);
  const mostradas = verResueltas ? lista : lista.filter((n) => n.resuelto !== true);
  const resueltas = lista.length - lista.filter((n) => n.resuelto !== true).length;

  return (
    <section className="mb-4 rounded-2xl border border-border bg-white">
      <header className="flex flex-wrap items-center gap-2 px-4 py-3">
        <button type="button" onClick={() => setAbierto((a) => !a)} className="flex items-center gap-2 text-sm font-semibold text-text-primary">
          <BellRing className="h-4 w-4 text-primary" /> Novedades {dia === 0 ? "del día" : "de ayer"}
          {novedades !== undefined && (
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${pendientes.length ? "bg-amber-100 text-amber-800" : "bg-emerald-50 text-emerald-700"}`}>
              {pendientes.length ? `${pendientes.length} por hacer` : "nada pendiente"}
            </span>
          )}
          {abierto ? <ChevronUp className="h-4 w-4 text-text-tertiary" /> : <ChevronDown className="h-4 w-4 text-text-tertiary" />}
        </button>
        <div className="ml-auto flex items-center gap-1 text-xs">
          {([0, 1] as const).map((d) => (
            <button key={d} type="button" onClick={() => setDia(d)} className={`rounded-lg px-2 py-1 ${dia === d ? "bg-slate-100 font-medium text-text-primary" : "text-text-tertiary hover:bg-slate-50"}`}>
              {d === 0 ? "Hoy" : "Ayer"}
            </button>
          ))}
          <button type="button" onClick={cargar} className="rounded-lg p-1 text-text-tertiary hover:bg-slate-50" aria-label="Actualizar las novedades">
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
        </div>
      </header>
      {abierto && (
        <div className="border-t border-border px-4 py-3">
          {novedades === undefined ? (
            <p className="text-xs text-text-tertiary">Cargando…</p>
          ) : !lista.length ? (
            <p className="text-xs text-text-tertiary">Ninguna revisión manual {dia === 0 ? "hoy" : "ayer"}.</p>
          ) : (
            <>
              <ul className="divide-y divide-border">
                {mostradas.map((n) => {
                  const href = ruta(n.enlace);
                  return (
                    <li key={n.id} className="flex flex-wrap items-start gap-x-3 gap-y-1 py-2 text-sm">
                      {n.resuelto ? (
                        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-label="Ya se hizo" />
                      ) : (
                        <CircleDot className={`mt-0.5 h-4 w-4 shrink-0 ${n.resuelto === false ? "text-amber-600" : "text-slate-400"}`} aria-label={n.resuelto === false ? "Por hacer" : "Aviso"} />
                      )}
                      <div className="min-w-0 flex-1">
                        <p className={n.resuelto ? "text-text-tertiary line-through decoration-slate-300" : "text-text-primary"}>
                          <span className="mr-1.5 rounded-full bg-slate-100 px-1.5 py-px text-[10px] font-medium text-slate-600">{n.tipoNombre}</span>
                          {n.prueba && <span className="mr-1.5 rounded-full bg-violet-50 px-1.5 py-px text-[10px] font-medium text-violet-700">Prueba</span>}
                          {n.titulo}
                        </p>
                        {n.detalle && <p className="truncate text-xs text-text-tertiary" title={n.detalle}>{n.detalle}</p>}
                      </div>
                      <span className="shrink-0 text-[11px] text-text-tertiary">
                        {hora(n.at)} · {CORREO[n.resultado] ?? n.resultado}
                      </span>
                      {href && (
                        <a href={href} className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-primary hover:underline">
                          Abrir <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                    </li>
                  );
                })}
              </ul>
              {resueltas > 0 && (
                <button type="button" onClick={() => setVerResueltas((v) => !v)} className="mt-2 text-xs text-text-tertiary hover:text-text-primary">
                  {verResueltas ? "Ocultar las ya hechas" : `Ver también las ya hechas (${resueltas})`}
                </button>
              )}
            </>
          )}
        </div>
      )}
    </section>
  );
}
