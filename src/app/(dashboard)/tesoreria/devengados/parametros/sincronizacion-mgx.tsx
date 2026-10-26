"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Database, Loader2, RefreshCw, Square } from "lucide-react";
import {
  EMPRESAS,
  MODULOS_POR_EMPRESA,
  NOMBRE_EMPRESA,
  NOMBRE_MODULO,
  TABLAS,
  etiquetaPar,
  type Empresa,
  type Modulo,
  type Par,
} from "@/lib/mgx/catalogo";
import { detenerMgx, planificarMgx, sincronizarMgxPaso, type AlcanceMgx } from "@/lib/mgx/actions";
import type { FilaMgxCorridas, FilaMgxTablas, ResultadoPar } from "@/lib/mgx/sync";

const co = (n: number | null | undefined) => (n ?? 0).toLocaleString("es-CO");

function cuando(t: string | null): string {
  return t
    ? new Date(t).toLocaleString("es-CO", { timeZone: "America/Bogota", dateStyle: "short", timeStyle: "short" })
    : "—";
}

const ESTRATEGIA: Record<string, string> = {
  reemplazo: "recarga completa",
  incremental_edicion: "incremental (ide + edición)",
  incremental_documento: "incremental (ide + documentos)",
};

/** Una corrida «corriendo» sin señales en 15 min se cortó (cerraron la pantalla, se cayó la red). */
function estadoVisible(f: FilaMgxTablas): { texto: string; clase: string } {
  const viejo = f.ultima_corrida_at && Date.now() - new Date(f.ultima_corrida_at).getTime() > 15 * 60_000;
  if (f.estado === "corriendo" && viejo) return { texto: "interrumpida", clase: "bg-amber-50 text-amber-700" };
  switch (f.estado) {
    case "ok":
      return { texto: "al día", clase: "bg-emerald-50 text-emerald-700" };
    case "pendiente":
      return { texto: "a medias", clase: "bg-amber-50 text-amber-700" };
    case "corriendo":
      return { texto: "sincronizando", clase: "bg-blue-50 text-blue-700" };
    case "error":
      return { texto: "error", clase: "bg-red-50 text-red-700" };
    default:
      return { texto: "nunca", clase: "bg-gray-100 text-gray-500" };
  }
}

/**
 * Sincronización con MGX (solo administrador). Trae de la base ETL de MGX las
 * tablas contables, de nómina e inventarios de las siete empresas.
 *
 * Trabaja por pasos de ~3 minutos: cada uno devuelve lo que falta y este
 * componente vuelve a llamar hasta terminar. Lo hecho queda guardado tabla por
 * tabla, así que «Detener» o cerrar la página no pierde nada.
 */
export function SincronizacionMgx({ estado, corridas }: { estado: FilaMgxTablas[]; corridas: FilaMgxCorridas[] }) {
  const router = useRouter();
  const [empresa, setEmpresa] = useState<Empresa | "">("");
  const [modulo, setModulo] = useState<Modulo | "">("");
  const [tabla, setTabla] = useState("");
  const [corriendo, setCorriendo] = useState<{ par: Par; paso: number; hechas: number; total: number } | null>(null);
  const [hechos, setHechos] = useState<ResultadoPar[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [terminado, setTerminado] = useState<string | null>(null);
  // La ref la lee el bucle (que no re-renderiza); el estado, la pantalla.
  const detener = useRef(false);
  const [deteniendo, setDeteniendo] = useState(false);

  const modulos: Modulo[] = empresa ? [...MODULOS_POR_EMPRESA[empresa]] : ["co", "no", "in", "rh"];
  const tablas = modulo ? TABLAS[modulo] : [];

  const porEmpresa = useMemo(() => {
    const m = new Map<string, FilaMgxTablas[]>();
    for (const f of estado) (m.get(f.empresa) ?? m.set(f.empresa, []).get(f.empresa)!).push(f);
    return EMPRESAS.filter((e) => m.has(e)).map((e) => ({ empresa: e, filas: m.get(e)! }));
  }, [estado]);

  async function sincronizar() {
    setError(null);
    setTerminado(null);
    setHechos([]);
    detener.current = false;
    setDeteniendo(false);
    const alcance: AlcanceMgx = { empresa: empresa || null, modulo: modulo || null, tabla: tabla || null };
    const plan = await planificarMgx(alcance);
    if (!plan.ok) {
      setError(plan.error ?? "No se pudo planificar.");
      return;
    }
    let pares = plan.pares;
    const total = pares.length;
    let corridaId: number | null = null;
    let paso = 0;
    while (pares.length) {
      paso++;
      setCorriendo({ par: pares[0], paso, hechas: total - pares.length, total });
      let r;
      try {
        r = await sincronizarMgxPaso(pares, corridaId, alcance);
      } catch (e) {
        r = { ok: false, hechos: [], pendientes: pares, error: e instanceof Error ? e.message : String(e) };
      }
      setHechos((h) => [...h, ...r.hechos]);
      corridaId = r.corridaId ?? corridaId;
      if (!r.ok) {
        setError(r.error ?? "La sincronización se cortó.");
        break;
      }
      pares = r.pendientes;
      if (detener.current && pares.length) {
        if (corridaId) await detenerMgx(corridaId);
        setTerminado(`Detenida. Quedan ${pares.length} tabla(s); lo hecho quedó guardado.`);
        break;
      }
      router.refresh();
    }
    if (!pares.length) setTerminado(`Listo: ${total} tabla(s) en ${paso} paso(s).`);
    setCorriendo(null);
    router.refresh();
  }

  const conError = hechos.filter((h) => h.error);
  const conAviso = hechos.filter((h) => h.aviso && !h.error);
  const escritas = hechos.reduce((s, h) => s + h.filas, 0);

  return (
    <div className="mt-6 rounded-xl border border-[#E2E8F0] bg-white p-6">
      <div className="flex items-center gap-2">
        <Database className="h-4 w-4 text-gray-400" />
        <h2 className="text-sm font-semibold text-gray-900">Sincronización con MGX</h2>
      </div>
      <p className="mt-1 text-sm text-gray-500">
        Trae de MGX la contabilidad, la nómina y los inventarios de las siete empresas a tablas de
        Gestivo (<code className="text-xs">mgx_*</code>). La primera vez copia todo; después solo lo
        nuevo y lo editado. MGX actualiza su base a las 2:00 am, así que lo de hoy llega mañana.
      </p>
      <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
        La <strong>primera carga</strong> de las tablas grandes (el cuerpo contable de La Carolina son
        16 millones de filas, cerca de una hora) se hace por consola:{" "}
        <code>npm run mgx:sincronizar</code>. Desde aquí funciona, pero son decenas de pasos.
      </p>

      <div className="mt-4 flex flex-wrap items-end gap-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">Empresa</label>
          <select
            value={empresa}
            disabled={!!corriendo}
            onChange={(e) => {
              setEmpresa(e.target.value as Empresa | "");
              setModulo("");
              setTabla("");
            }}
            className="rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm outline-none focus:border-[#4F46E5]"
          >
            <option value="">Todas</option>
            {EMPRESAS.map((e) => (
              <option key={e} value={e}>
                {NOMBRE_EMPRESA[e]} ({e})
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">Módulo</label>
          <select
            value={modulo}
            disabled={!!corriendo}
            onChange={(e) => {
              setModulo(e.target.value as Modulo | "");
              setTabla("");
            }}
            className="rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm outline-none focus:border-[#4F46E5]"
          >
            <option value="">Todos</option>
            {modulos.map((m) => (
              <option key={m} value={m}>
                {NOMBRE_MODULO[m]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">Tabla</label>
          <select
            value={tabla}
            disabled={!!corriendo || !modulo}
            onChange={(e) => setTabla(e.target.value)}
            className="rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm outline-none focus:border-[#4F46E5] disabled:bg-gray-50"
          >
            <option value="">Todas</option>
            {tablas.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
        {corriendo ? (
          <button
            onClick={() => {
              detener.current = true;
              setDeteniendo(true);
            }}
            disabled={deteniendo}
            className="inline-flex items-center gap-2 rounded-lg border border-[#E2E8F0] px-4 py-2 text-sm font-medium text-gray-700"
          >
            <Square className="h-4 w-4" /> Detener
          </button>
        ) : (
          <button
            onClick={sincronizar}
            className="inline-flex items-center gap-2 rounded-lg bg-[#4F46E5] px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
          >
            <RefreshCw className="h-4 w-4" /> Sincronizar
          </button>
        )}
      </div>

      {corriendo && (
        <div className="mt-3 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">
          <div className="flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            Paso {corriendo.paso} · {etiquetaPar(corriendo.par)} · {corriendo.hechas} de {corriendo.total} tablas
            {deteniendo && " · se detiene al terminar este paso"}
          </div>
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-blue-100">
            <div
              className="h-full bg-blue-500 transition-all"
              style={{ width: `${Math.round((corriendo.hechas / Math.max(1, corriendo.total)) * 100)}%` }}
            />
          </div>
        </div>
      )}

      {(terminado || error || hechos.length > 0) && !corriendo && (
        <div
          className={`mt-3 rounded-lg border p-3 text-sm ${
            error || conError.length ? "border-red-200 bg-red-50 text-red-700" : "border-emerald-200 bg-emerald-50 text-emerald-800"
          }`}
        >
          {error && <p>No se pudo completar: {error}</p>}
          {terminado && <p>{terminado}</p>}
          <p className="mt-1 text-xs">{co(escritas)} filas escritas.</p>
          {conError.length > 0 && (
            <ul className="mt-1 text-xs">
              {conError.map((h) => (
                <li key={etiquetaPar(h.par)}>
                  {etiquetaPar(h.par)}: {h.error}
                </li>
              ))}
            </ul>
          )}
          {conAviso.length > 0 && (
            <ul className="mt-1 text-xs text-amber-700">
              {conAviso.map((h) => (
                <li key={etiquetaPar(h.par)}>
                  {etiquetaPar(h.par)}: {h.aviso}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {porEmpresa.length === 0 ? (
        <p className="mt-4 text-sm text-gray-500">
          Todavía no existe el catálogo de MGX: falta aplicar la migración <code>tablas_espejo_de_mgx</code>.
        </p>
      ) : (
        <div className="mt-4 space-y-2">
          {porEmpresa.map(({ empresa: e, filas }) => {
            const errores = filas.filter((f) => f.estado === "error").length;
            const nunca = filas.filter((f) => f.estado === "nunca").length;
            const total = filas.reduce((s, f) => s + Number(f.filas ?? 0), 0);
            return (
              <details key={e} className="rounded-lg border border-[#F1F5F9]">
                <summary className="flex cursor-pointer flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-sm">
                  <span className="font-medium text-gray-800">{NOMBRE_EMPRESA[e]}</span>
                  <span className="text-xs text-gray-400">{e}</span>
                  <span className="text-xs text-gray-500">
                    {filas.length} tablas · {co(total)} filas
                  </span>
                  {errores > 0 && <span className="text-xs font-medium text-red-600">{errores} con error</span>}
                  {nunca > 0 && <span className="text-xs text-gray-500">{nunca} sin sincronizar</span>}
                </summary>
                <div className="overflow-x-auto px-3 pb-3">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-[#F1F5F9] text-left uppercase tracking-wide text-gray-500">
                        <th className="py-1.5 pr-3">Tabla</th>
                        <th className="py-1.5 pr-3">Cómo</th>
                        <th className="py-1.5 pr-3 text-right">En Gestivo</th>
                        <th className="py-1.5 pr-3 text-right">En MGX (aprox.)</th>
                        <th className="py-1.5 pr-3">Editadas hasta</th>
                        <th className="py-1.5 pr-3">Última corrida</th>
                        <th className="py-1.5">Estado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filas.map((f) => {
                        const ev = estadoVisible(f);
                        return (
                          <tr key={`${f.modulo}.${f.tabla}`} className="border-b border-[#F1F5F9] last:border-0">
                            <td className="py-1.5 pr-3 font-medium text-gray-700">
                              {f.modulo}.{f.tabla}
                              {!f.activa && <span className="ml-1 text-gray-400">(inactiva)</span>}
                            </td>
                            <td className="py-1.5 pr-3 text-gray-500">{ESTRATEGIA[f.estrategia] ?? f.estrategia}</td>
                            <td className="py-1.5 pr-3 text-right tabular-nums text-gray-700">{f.filas === null ? "—" : co(f.filas)}</td>
                            <td className="py-1.5 pr-3 text-right tabular-nums text-gray-400">{co(f.filas_origen_estimadas)}</td>
                            <td className="py-1.5 pr-3 text-gray-500">{f.ultima_edicion ? f.ultima_edicion.slice(0, 16) : "—"}</td>
                            <td className="py-1.5 pr-3 text-gray-500">{cuando(f.ultima_corrida_at)}</td>
                            <td className="py-1.5">
                              <span
                                title={f.error ?? f.aviso ?? (f.fase ? `fase: ${f.fase}` : undefined)}
                                className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${ev.clase}`}
                              >
                                {ev.texto}
                                {f.aviso && !f.error ? " ⚠" : ""}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </details>
            );
          })}
        </div>
      )}

      {corridas.length > 0 && (
        <div className="mt-4">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Últimas corridas</h3>
          <table className="mt-1 w-full text-xs">
            <tbody>
              {corridas.map((c) => (
                <tr key={c.id} className="border-b border-[#F1F5F9] last:border-0">
                  <td className="py-1.5 pr-3 text-gray-500">#{c.id}</td>
                  <td className="py-1.5 pr-3 text-gray-600">{cuando(c.iniciada_at)}</td>
                  <td className="py-1.5 pr-3 text-gray-600">
                    {c.origen === "script" ? "consola" : c.origen === "cron" ? "automática (noche)" : "pantalla"}
                    {c.usuario_email ? ` · ${c.usuario_email}` : ""}
                  </td>
                  <td className="py-1.5 pr-3 text-right tabular-nums text-gray-600">{co(c.filas)} filas</td>
                  <td
                    className={`py-1.5 ${
                      c.estado === "error" ? "text-red-600" : c.estado === "ok" ? "text-emerald-600" : "text-amber-700"
                    }`}
                    title={c.error ?? undefined}
                  >
                    {c.estado}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
