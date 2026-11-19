"use client";

/** Piezas compartidas por las pestañas de la configuración de la selección. */
import { useState } from "react";
import { CheckCircle2, History, TriangleAlert } from "lucide-react";
import { mostrarValor } from "@/lib/seleccion/ajustes";
import { historialCambios, type CambioSeleccion } from "./actions";

export type Aviso = { ok: boolean; texto: string } | null;

export const campo =
  "w-full rounded-xl border border-border bg-white px-3 py-2 text-sm outline-none placeholder:text-text-muted focus-visible:ring-2 focus-visible:ring-primary/30 disabled:bg-slate-50";

export const fechaHora = (iso: string) =>
  new Intl.DateTimeFormat("es-CO", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Bogota" }).format(new Date(iso));


export function AvisoLinea({ aviso }: { aviso: Aviso }) {
  if (!aviso) return null;
  return (
    <p className={`flex items-start gap-1.5 text-xs ${aviso.ok ? "text-emerald-700" : "text-red-700"}`}>
      {aviso.ok ? <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" /> : <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />}
      {aviso.texto}
    </p>
  );
}

export function Historial({ tipo, clave, unidad }: { tipo: "mensaje" | "ajuste"; clave: string; unidad?: string }) {
  const [cambios, setCambios] = useState<CambioSeleccion[] | null>(null);
  const [abierto, setAbierto] = useState(false);
  const mostrar = (v: unknown) => (unidad ? mostrarValor(unidad, v) : typeof v === "string" ? v : JSON.stringify(v));
  return (
    <div>
      <button
        type="button"
        onClick={async () => {
          setAbierto(!abierto);
          if (!cambios) setCambios(await historialCambios(tipo, clave).catch(() => []));
        }}
        className="inline-flex items-center gap-1 text-xs text-text-tertiary hover:text-text-primary"
      >
        <History className="h-3.5 w-3.5" /> {abierto ? "Ocultar historial" : "Historial"}
      </button>
      {abierto && (
        <div className="mt-2 rounded-xl bg-slate-50 p-3 text-xs">
          {cambios === null ? (
            <p className="text-text-tertiary">Cargando…</p>
          ) : cambios.length === 0 ? (
            <p className="text-text-tertiary">Sin cambios: tiene el valor sugerido.</p>
          ) : (
            <ol className="space-y-2">
              {cambios.map((c) => (
                <li key={c.id}>
                  <span className="text-text-tertiary">
                    {fechaHora(c.created_at)} · {c.usuario_email ?? "—"} · {c.campo === "modo" ? "modo de envío" : c.campo}
                  </span>
                  <div className="text-text-secondary">
                    <span className="line-through opacity-60">{mostrar(c.valor_anterior)}</span> → {mostrar(c.valor_nuevo)}
                  </div>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
    </div>
  );
}
