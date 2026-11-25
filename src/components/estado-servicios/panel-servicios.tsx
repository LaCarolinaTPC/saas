"use client";

/**
 * Estado de los servicios externos (24-nov-2026) en Selección › Tiempos y
 * reglas › Verificaciones con Croma: si cada uno funciona, cuántos errores
 * lleva y el último. Se calcula con lo que ya pasó (no los consulta).
 */
import { useCallback, useEffect, useState, useTransition } from "react";
import { RefreshCw } from "lucide-react";
import { alertaDePruebaAccion, estadoServiciosAccion } from "@/app/(dashboard)/candidatos/estado-servicios-actions";
import type { EstadoServicio } from "@/lib/estado-servicios";
import { ETIQUETA_NIVEL, TONO_NIVEL, haceCuanto } from "./comun";

export function PanelServicios() {
  const [datos, setDatos] = useState<EstadoServicio[] | { error: string } | null>(null);
  const [ocupado, enTransicion] = useTransition();
  const [prueba, setPrueba] = useState<{ ok: boolean; texto: string } | null>(null);
  const cargar = useCallback(
    (actualizar = false) =>
      enTransicion(async () => {
        setDatos(await estadoServiciosAccion(actualizar).catch((e: Error) => ({ error: e.message })));
      }),
    []
  );
  useEffect(() => cargar(), [cargar]);

  if (!datos) return <p className="mt-2 text-xs text-text-tertiary">Revisando el estado de los servicios…</p>;
  if ("error" in datos) return <p className="mt-2 text-xs text-red-700">{datos.error}</p>;
  return (
    <div className="mt-3 rounded-xl border border-border bg-white p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-sm font-medium text-text-primary">Estado de los servicios</p>
        <button type="button" onClick={() => cargar(true)} disabled={ocupado} className="inline-flex items-center gap-1 text-xs text-text-secondary hover:text-text-primary disabled:opacity-50">
          <RefreshCw className={`h-3.5 w-3.5 ${ocupado ? "animate-spin" : ""}`} /> Actualizar
        </button>
      </div>
      <ul className="divide-y divide-border">
        {datos.map((s) => (
          <li key={s.id} className="py-2 text-xs">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${TONO_NIVEL[s.nivel].punto}`} />
              <span className="font-medium text-text-primary">{s.nombre}</span>
              <span className={`font-medium ${TONO_NIVEL[s.nivel].texto}`}>{ETIQUETA_NIVEL[s.nivel]}</span>
              <span className="ml-auto text-text-tertiary">
                {s.total24h ? `${s.errores24h} error${s.errores24h === 1 ? "" : "es"} de ${s.total24h} en 24 h` : "sin uso en 24 h"}
                {s.ultimoOkAt ? ` · último bien ${haceCuanto(s.ultimoOkAt)}` : ""}
              </span>
            </div>
            {s.ultimoError && (s.nivel === "fallando" || s.errores24h > 0) && (
              <p className="mt-0.5 truncate pl-4 text-text-tertiary" title={s.ultimoError.texto}>
                Último error {haceCuanto(s.ultimoError.at)}: {s.ultimoError.texto}
              </p>
            )}
            {s.consejo && <p className="mt-0.5 pl-4 text-red-700">{s.consejo}</p>}
          </li>
        ))}
      </ul>
      <p className="mt-1 text-[11px] text-text-tertiary">
        «Fallando»: 3 errores seguidos en las últimas 3 horas, o la mitad de los intentos de la última hora. También sale un aviso en Candidatos y en Comunicaciones, y se
        avisa por correo a los destinatarios de abajo.
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={ocupado}
          onClick={() =>
            enTransicion(async () => {
              setPrueba(null);
              const r = await alertaDePruebaAccion().catch((e: Error) => ({ ok: false, error: e.message, para: undefined, copia: undefined }));
              setPrueba(
                r.ok
                  ? { ok: true, texto: `Correo de prueba enviado a ${r.para?.join(", ")}${r.copia?.length ? `, con copia a ${r.copia.join(", ")}` : ""}.` }
                  : { ok: false, texto: r.error ?? "No se pudo enviar." }
              );
            })
          }
          className="rounded-md border border-border px-2.5 py-1 text-xs font-medium text-text-secondary hover:bg-slate-50 disabled:opacity-50"
        >
          Enviar un correo de prueba de la alerta
        </button>
        {prueba && <span className={`text-xs ${prueba.ok ? "text-emerald-700" : "text-red-700"}`}>{prueba.texto}</span>}
      </div>
    </div>
  );
}
