"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, FileSpreadsheet, Loader2, Undo2, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { ALERTA_COMBUSTIBLE_LABEL, type AlertaCombustible } from "@/lib/mantenimiento/combustible-alertas";
import type { CargaCombustible, ResultadoCarga, ResumenArchivo } from "@/lib/mantenimiento/combustible-data";
import { cop, decimal, entero, fechaCorta, fechaHora } from "@/lib/financiera/formato";
import type { ConciliacionGema } from "@/lib/mantenimiento/combustible-conciliacion";
import { reversarCargaCombustible } from "./actions";
import { IndicadorGema } from "./indicador-gema";

const MAX_ARCHIVOS = 31;

const rango = (desde: string | null, hasta: string | null) =>
  !desde ? "—" : desde === hasta ? fechaCorta(desde) : `${fechaCorta(desde)} a ${fechaCorta(hasta)}`;

export function CargaCombustibleClient({ cargas, conciliaciones, ultimoDia, puedeEditar, error }: {
  cargas: CargaCombustible[];
  /** Cruce en vivo de cada carga con el cierre de GEMA; null si no se pudo calcular. */
  conciliaciones: Record<string, ConciliacionGema> | null;
  ultimoDia: string | null;
  puedeEditar: boolean;
  error: string | null;
}) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [archivos, setArchivos] = useState<File[]>([]);
  const [previa, setPrevia] = useState<ResumenArchivo[] | null>(null);
  const [paso, setPaso] = useState<"previsualizar" | "cargar" | null>(null);
  const [arrastrando, setArrastrando] = useState(false);
  const [pendiente, empezar] = useTransition();

  function agregar(lista: FileList | File[]) {
    const nuevos = [...lista].filter((f) => /\.xlsx?$/i.test(f.name));
    if (nuevos.length < [...lista].length) toast.error("Solo se aceptan archivos Excel (.xlsx).");
    setArchivos((prev) => {
      const nombres = new Set(prev.map((f) => f.name));
      const todos = [...prev, ...nuevos.filter((f) => !nombres.has(f.name))];
      if (todos.length > MAX_ARCHIVOS) toast.error(`Máximo ${MAX_ARCHIVOS} archivos por carga.`);
      return todos.slice(0, MAX_ARCHIVOS);
    });
    setPrevia(null);
  }

  function limpiar() {
    setArchivos([]);
    setPrevia(null);
    if (input.current) input.current.value = "";
  }

  async function enviar(accion: "previsualizar" | "cargar") {
    if (archivos.length === 0) return;
    setPaso(accion);
    const form = new FormData();
    for (const a of archivos) form.append("archivos", a);
    form.set("accion", accion);
    try {
      const res = await fetch("/api/mantenimiento/combustible", { method: "POST", body: form });
      const json = (await res.json()) as
        | { ok: true; archivos?: ResumenArchivo[]; cargas?: ResultadoCarga[] }
        | { ok: false; error: string };
      if (!json.ok) {
        toast.error(json.error);
        return;
      }
      if (accion === "previsualizar" && json.archivos) setPrevia(json.archivos);
      if (accion === "cargar" && json.cargas) {
        const c = json.cargas;
        const nuevas = c.reduce((s, x) => s + x.nuevas, 0);
        const corregidas = c.reduce((s, x) => s + x.corregidas, 0);
        const fallidos = c.filter((x) => x.errorArchivo).length;
        toast.success(
          `${c.length - fallidos} archivo(s) cargado(s): ${entero(nuevas)} tanqueos nuevos` +
            (corregidas ? `, ${entero(corregidas)} corregidos` : "") +
            (fallidos ? ` · ${fallidos} rechazado(s)` : "") + ".",
        );
        limpiar();
        router.refresh();
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setPaso(null);
    }
  }

  function reversar(c: CargaCombustible) {
    const texto =
      `¿Reversar la carga de «${c.archivo_nombre}»?\n\n` +
      "Se borran los tanqueos que esta carga creó o corrigió por última vez. " +
      "Si un tanqueo corregido venía de un archivo anterior, vuelve a subir ese archivo para recuperarlo.";
    if (!confirm(texto)) return;
    empezar(async () => {
      const r = await reversarCargaCombustible(c.id);
      if (!r.success) { toast.error(r.error ?? "No se pudo reversar."); return; }
      toast.success(`Carga reversada: ${entero(r.tanqueos ?? 0)} tanqueos borrados.`);
      router.refresh();
    });
  }

  const ocupado = pendiente || paso !== null;
  const cargables = previa?.filter((p) => !p.errorArchivo) ?? [];
  const totalEscribir = cargables.reduce((s, p) => s + p.nuevas + p.corregidas, 0);
  const puedeConfirmar = puedeEditar && !!previa && cargables.length > 0 && archivos.length > 0;

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-4 sm:p-6">
      {error && (
        <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          No se pudo leer la información de combustible. ¿Ya se aplicó la migración? Detalle: {error}
        </p>
      )}

      <section className="overflow-hidden rounded-xl border border-[#E2E8F0] bg-white">
        <div className="border-b border-[#E2E8F0] px-4 py-3">
          <h2 className="text-sm font-semibold text-gray-900">Archivo del proveedor</h2>
          <p className="text-xs text-gray-500">
            El Excel diario de Petromil (Fecha, Factura, # Interno, Placa, Producto, Volumen, Total). Puedes subir varios
            días a la vez. Volver a subir un archivo no duplica tanqueos: los que cambiaron se actualizan.
            {ultimoDia && <> Último día cargado: <strong>{fechaCorta(ultimoDia)}</strong>.</>}
          </p>
        </div>

        <div className="space-y-4 p-4">
          <label
            onDragOver={(e) => { e.preventDefault(); setArrastrando(true); }}
            onDragLeave={() => setArrastrando(false)}
            onDrop={(e) => { e.preventDefault(); setArrastrando(false); agregar(e.dataTransfer.files); }}
            className={`flex cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed px-4 py-6 text-center text-sm ${arrastrando ? "border-[#4F46E5] bg-indigo-50" : "border-[#CBD5E1] bg-[#F8FAFC] hover:bg-white"}`}
          >
            <FileSpreadsheet className="h-6 w-6 text-gray-400" />
            <span className="font-medium text-gray-700">Arrastra aquí los Excel o toca para elegirlos</span>
            <span className="text-xs text-gray-500">Hasta {MAX_ARCHIVOS} archivos .xlsx</span>
            <input
              ref={input}
              type="file"
              multiple
              accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="hidden"
              onChange={(e) => { if (e.target.files) agregar(e.target.files); e.target.value = ""; }}
            />
          </label>

          {archivos.length > 0 && (
            <ul className="flex flex-wrap gap-2">
              {archivos.map((a) => (
                <li key={a.name} className="inline-flex max-w-full items-center gap-1 rounded-full border border-[#E2E8F0] bg-white py-1 pl-3 pr-1 text-xs text-gray-700">
                  <span className="truncate">{a.name}</span>
                  <button
                    type="button"
                    aria-label={`Quitar ${a.name}`}
                    onClick={() => { setArchivos((p) => p.filter((x) => x !== a)); setPrevia(null); }}
                    className="rounded-full p-0.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={archivos.length === 0 || ocupado}
              onClick={() => enviar("previsualizar")}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#4F46E5] px-4 text-sm font-medium text-[#4F46E5] hover:bg-indigo-50 disabled:opacity-50"
            >
              {paso === "previsualizar" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              Previsualizar
            </button>
            <button
              type="button"
              disabled={!puedeConfirmar || ocupado}
              onClick={() => enviar("cargar")}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#4F46E5] px-4 text-sm font-medium text-white hover:bg-[#4338CA] disabled:opacity-50"
            >
              {paso === "cargar" ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              Confirmar carga
            </button>
            {archivos.length > 0 && (
              <button type="button" disabled={ocupado} onClick={limpiar} className="h-9 px-2 text-sm text-gray-500 hover:text-gray-800">
                Limpiar
              </button>
            )}
            <span className="text-xs text-gray-500">
              {!puedeEditar ? "Tu tipo de usuario es de solo consulta: puedes previsualizar pero no cargar." : "Nada se escribe hasta confirmar."}
            </span>
          </div>

          {previa && (
            <div className="space-y-3">
              <p className="text-sm text-gray-700">
                {previa.length} archivo(s): se escribirán <strong>{entero(totalEscribir)}</strong> tanqueos
                {previa.some((p) => p.errorArchivo) && <> · <span className="text-red-700">{previa.filter((p) => p.errorArchivo).length} rechazado(s) entero(s)</span></>}.
              </p>
              {previa.map((p) => <TarjetaArchivo key={p.archivo} p={p} />)}
            </div>
          )}
        </div>
      </section>

      <section className="overflow-hidden rounded-xl border border-[#E2E8F0] bg-white">
        <div className="border-b border-[#E2E8F0] px-4 py-3">
          <h2 className="text-sm font-semibold text-gray-900">Últimas cargas</h2>
        </div>
        {cargas.length === 0 ? (
          <p className="p-6 text-center text-sm text-gray-500">Todavía no se ha cargado ningún archivo.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-sm">
              <thead className="bg-[#F8FAFC] text-left text-xs uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-3 py-2">Archivo</th>
                  <th className="px-3 py-2">Días</th>
                  <th className="px-3 py-2 text-right">Nuevos</th>
                  <th className="px-3 py-2 text-right">Corregidos</th>
                  <th className="px-3 py-2 text-right">Rechazados</th>
                  <th className="px-3 py-2 text-right">Galones</th>
                  <th className="px-3 py-2 text-right">Valor</th>
                  <th className="px-3 py-2">Cierre GEMA</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {cargas.map((c) => (
                  <tr key={c.id} className={`border-t border-[#F1F5F9] align-top ${c.reversada_at ? "text-gray-400" : ""}`}>
                    <td className="px-3 py-2">
                      <div className={`font-medium ${c.reversada_at ? "line-through" : "text-gray-900"}`}>{c.archivo_nombre}</div>
                      <div className="text-xs text-gray-500">
                        {fechaHora(c.created_at)} · {c.origen === "historico" ? "histórico" : (c.usuario_email ?? "—")}
                        {c.reversada_at && <> · reversada {fechaHora(c.reversada_at)}</>}
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2">{rango(c.fecha_desde, c.fecha_hasta)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{entero(c.nuevas)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{entero(c.corregidas)}</td>
                    <td className={`px-3 py-2 text-right tabular-nums ${c.rechazadas && !c.reversada_at ? "text-amber-700" : ""}`}>{entero(c.rechazadas)}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{decimal(c.galones, 1)}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{cop(c.valor)}</td>
                    <td className="px-3 py-2">
                      {!c.reversada_at && <IndicadorGema c={conciliaciones?.[c.id]} compacto />}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {puedeEditar && !c.reversada_at && (
                        <button
                          type="button"
                          disabled={ocupado}
                          onClick={() => reversar(c)}
                          title="Reversar carga"
                          aria-label={`Reversar la carga de ${c.archivo_nombre}`}
                          className="text-gray-400 hover:text-red-600 disabled:opacity-50"
                        >
                          <Undo2 className="h-4 w-4" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

export function TarjetaArchivo({ p }: { p: ResumenArchivo }) {
  if (p.errorArchivo) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
        <div className="font-semibold">{p.archivo}</div>
        <div>{p.errorArchivo}</div>
      </div>
    );
  }
  const r = p.resumen;
  const alertas = Object.entries(r.alertas) as [AlertaCombustible, number][];
  const dato = "rounded-lg bg-[#F8FAFC] px-3 py-2";
  return (
    <div className="space-y-3 rounded-xl border border-[#E2E8F0] p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="min-w-0 break-words text-sm font-semibold text-gray-900">{p.archivo}</div>
        <div className="text-xs text-gray-500">
          Tanqueos del {rango(r.desde, r.hasta)}
          {p.fechaNombre && r.desde && p.fechaNombre !== r.desde && <> · el nombre dice {fechaCorta(p.fechaNombre)}</>}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4 lg:grid-cols-7">
        <div className={dato}><div className="text-xs text-gray-500">Tanqueos</div><div className="font-semibold tabular-nums">{entero(r.tanqueos)}</div></div>
        <div className={dato}><div className="text-xs text-gray-500">Galones</div><div className="font-semibold tabular-nums">{decimal(r.galones, 1)}</div></div>
        <div className={dato}><div className="text-xs text-gray-500">Valor</div><div className="font-semibold tabular-nums">{cop(r.valor)}</div></div>
        <div className={dato}><div className="text-xs text-gray-500">Nuevos</div><div className="font-semibold tabular-nums text-emerald-700">{entero(p.nuevas)}</div></div>
        <div className={dato}><div className="text-xs text-gray-500">Corregidos</div><div className="font-semibold tabular-nums">{entero(p.corregidas)}</div></div>
        <div className={dato}><div className="text-xs text-gray-500">Ya cargados</div><div className="font-semibold tabular-nums text-gray-500">{entero(p.sinCambio + p.enOtroArchivo)}</div></div>
        <div className={dato}><div className="text-xs text-gray-500">Rechazados</div><div className={`font-semibold tabular-nums ${p.rechazadasTotal ? "text-amber-700" : ""}`}>{entero(p.rechazadasTotal)}</div></div>
      </div>

      {alertas.length > 0 && (
        <div className="flex flex-wrap gap-1.5 text-xs">
          {alertas.map(([a, n]) => (
            <span key={a} className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-amber-800">
              {ALERTA_COMBUSTIBLE_LABEL[a]}: <strong>{n}</strong>
            </span>
          ))}
        </div>
      )}

      <IndicadorGema c={p.conciliacion} />

      {p.avisos.length > 0 && (
        <ul className="space-y-1 text-xs text-gray-600">
          {p.avisos.map((a) => (
            <li key={a} className="flex gap-1.5"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />{a}</li>
          ))}
        </ul>
      )}

      {p.cambios.length > 0 && (
        <details className="text-xs">
          <summary className="cursor-pointer text-gray-700">Tanqueos que cambian ({entero(p.corregidas)})</summary>
          <ul className="mt-1 space-y-0.5 text-gray-600">
            {p.cambios.map((c) => (
              <li key={`${c.factura}|${c.vehiculo}|${c.hora}`}>
                Bus {c.vehiculo} · factura {c.factura} · {fechaCorta(c.fecha)} {c.hora?.slice(0, 5) ?? ""}:{" "}
                {decimal(c.antes.galones, 3)} gal / {cop(c.antes.valor)} → {decimal(c.despues.galones, 3)} gal / {cop(c.despues.valor)}
              </li>
            ))}
          </ul>
        </details>
      )}

      {p.rechazadas.length > 0 && (
        <details className="text-xs">
          <summary className="cursor-pointer text-amber-800">Filas rechazadas ({entero(p.rechazadasTotal)})</summary>
          <ul className="mt-1 space-y-0.5 text-gray-600">
            {p.rechazadas.map((x) => (
              <li key={`${x.hoja}|${x.linea}`}>Hoja «{x.hoja}», fila {x.linea}{x.factura ? ` (factura ${x.factura})` : ""}: {x.motivo}</li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
