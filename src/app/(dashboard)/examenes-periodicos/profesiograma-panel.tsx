"use client";

/**
 * Pestaña Profesiograma: los cargos con su proceso y periodicidad por empresa.
 * Se actualiza subiendo el Excel nuevo de la ARL (se ve qué cambia antes de
 * guardar) o editando a mano. Al guardar, se listan las personas del control a
 * las que les cambiaría la periodicidad y se elige a quiénes aplicarla.
 */

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { FileSpreadsheet, Loader2, Pencil, Plus, Trash2, Upload, X } from "lucide-react";
import type { PersonaExamen } from "@/lib/sst/examenes";
import { etiquetaGrupo } from "@/lib/sst/examenes";
import type { DatosProfesiograma } from "@/lib/sst/examenes-data";
import {
  EMPRESAS_PROFESIOGRAMA, TIPOS_CARGO, compararProfesiogramas, etiquetaTipoCargo, personasAfectadas, validarTablaProfesiograma,
  type CambioCargo, type CargoProfesiograma, type EmpresaProfesiograma, type PersonaAfectada, type TablaProfesiograma, type TipoCargo,
} from "@/lib/sst/profesiograma";
import { leerProfesiograma, tablaDesdeLectura, type LecturaProfesiograma } from "@/lib/sst/profesiograma-excel";
import { aplicarPeriodicidades, guardarProfesiograma } from "./actions";

const inputCls = "h-8 w-full rounded-md border border-[#E2E8F0] bg-white px-2 text-sm text-gray-900 outline-none focus:border-[#4F46E5]";
const fechaCorta = (iso: string | null) => (iso ? iso.split("-").reverse().join("/") : "—");
const etiquetaEmpresa = (k: EmpresaProfesiograma) => EMPRESAS_PROFESIOGRAMA.find((e) => e.key === k)?.label ?? k;

type Borrador = Record<EmpresaProfesiograma, CargoProfesiograma[]>;
const copiar = (t: TablaProfesiograma): Borrador => ({
  la_carolina: t.la_carolina.map((c) => ({ ...c })),
  metrorecaudo: t.metrorecaudo.map((c) => ({ ...c })),
  anaya_giraldo: t.anaya_giraldo.map((c) => ({ ...c })),
});

/** Lo que queda tras guardar: a quiénes se les puede aplicar la periodicidad nueva. */
type Aplicacion = { cargaId: number; afectadas: PersonaAfectada[] };

export function ProfesiogramaPanel({ datos, personas, puedeEditar }: { datos: DatosProfesiograma; personas: PersonaExamen[]; puedeEditar: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [borrador, setBorrador] = useState<Borrador | null>(null);
  const [lectura, setLectura] = useState<{ archivo: string; l: LecturaProfesiograma; tabla: TablaProfesiograma } | null>(null);
  const [aplicacion, setAplicacion] = useState<Aplicacion | null>(null);
  const archivoRef = useRef<HTMLInputElement>(null);
  const editable = datos.editable && puedeEditar;

  const cambiosBorrador = useMemo(() => (borrador ? compararProfesiogramas(datos.tabla, borrador) : []), [borrador, datos.tabla]);
  const cambiosLectura = useMemo(() => (lectura ? compararProfesiogramas(datos.tabla, lectura.tabla) : []), [lectura, datos.tabla]);

  async function subir(file: File) {
    try {
      const XLSX = await import("xlsx");
      const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
      const hojas = wb.SheetNames.map((n) => ({
        nombre: n,
        filas: XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, defval: null, raw: false }) as unknown[][],
      }));
      const l = leerProfesiograma(hojas);
      if ("error" in l) {
        toast.error(l.error);
        return;
      }
      setBorrador(null);
      setLectura({ archivo: file.name, l, tabla: tablaDesdeLectura(datos.tabla, l) });
    } catch (e) {
      toast.error(`No se pudo leer el archivo: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      if (archivoRef.current) archivoRef.current.value = "";
    }
  }

  function guardar(tabla: TablaProfesiograma, meta: { origen: "archivo" | "edicion"; archivo?: string; fechaDocumento?: string | null }) {
    const v = validarTablaProfesiograma(tabla);
    if (!v.ok) {
      toast.error(v.error);
      return;
    }
    const anterior = datos.tabla;
    start(async () => {
      const r = await guardarProfesiograma(v.tabla, meta);
      if (!r.success) {
        toast.error(r.error);
        return;
      }
      toast.success(`Profesiograma guardado: ${r.dato.cambios.length} cambio(s).`);
      setBorrador(null);
      setLectura(null);
      const afectadas = personasAfectadas(personas, anterior, v.tabla);
      setAplicacion(afectadas.length ? { cargaId: r.dato.cargaId, afectadas } : null);
      router.refresh();
    });
  }

  if (!datos.editable) {
    return (
      <div className="space-y-3">
        <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          Se está usando el profesiograma del 05/10/2025 que viene en el código. Para subir uno nuevo o editarlo, falta aplicar la migración{" "}
          <code>20261109213335_sst_profesiograma_editable.sql</code>.
        </p>
        <TablaCargos tabla={datos.tabla} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {aplicacion && <AplicarPeriodicidades aplicacion={aplicacion} onCerrar={() => setAplicacion(null)} />}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm text-gray-600">
          {EMPRESAS_PROFESIOGRAMA.map((e) => `${e.label}: ${datos.tabla[e.key].length}`).join(" · ")} cargos
          {datos.cargas[0] && (
            <span className="block text-xs text-gray-500">
              Versión vigente: {datos.cargas[0].origen === "archivo" ? `archivo «${datos.cargas[0].archivo}»` : datos.cargas[0].origen === "edicion" ? "edición a mano" : "profesiograma inicial"}
              {datos.cargas[0].fechaDocumento ? ` (documento del ${fechaCorta(datos.cargas[0].fechaDocumento)})` : ""}, guardada el{" "}
              {new Date(datos.cargas[0].cargadoAt).toLocaleString("es-CO", { timeZone: "America/Bogota", dateStyle: "short", timeStyle: "short" })}
              {datos.cargas[0].usuarioEmail ? ` por ${datos.cargas[0].usuarioEmail}` : ""}.
            </span>
          )}
        </div>
        {editable && !borrador && !lectura && (
          <div className="flex gap-2">
            <input ref={archivoRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={(e) => e.target.files?.[0] && subir(e.target.files[0])} />
            <button
              type="button"
              onClick={() => archivoRef.current?.click()}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#E2E8F0] bg-white px-3 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              <Upload className="h-4 w-4" /> Subir Excel nuevo
            </button>
            <button
              type="button"
              onClick={() => setBorrador(copiar(datos.tabla))}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#4F46E5] px-3 text-sm font-medium text-white hover:bg-[#4338CA]"
            >
              <Pencil className="h-4 w-4" /> Editar cargos
            </button>
          </div>
        )}
      </div>

      {lectura && (
        <div className="space-y-3 rounded-xl border border-[#C7D2FE] bg-[#EEF2FF]/40 p-4">
          <p className="flex items-center gap-2 text-sm font-medium text-gray-900">
            <FileSpreadsheet className="h-4 w-4 text-[#4F46E5]" /> {lectura.archivo}
            {lectura.l.fecha && <span className="font-normal text-gray-600">· actualizado el {fechaCorta(lectura.l.fecha)}</span>}
          </p>
          <p className="text-xs text-gray-600">
            Hojas leídas: {lectura.l.hojas.map((h) => `${h.nombre} (${h.cargos} cargos)`).join(", ")}.
          </p>
          {lectura.l.avisos.length > 0 && (
            <ul className="list-disc space-y-0.5 pl-5 text-xs text-[#92400E]">
              {lectura.l.avisos.map((a) => (
                <li key={a}>{a}</li>
              ))}
            </ul>
          )}
          <ListaCambios cambios={cambiosLectura} />
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setLectura(null)} className="h-9 rounded-lg px-3 text-sm text-gray-600 hover:bg-gray-100">
              Cancelar
            </button>
            <button
              type="button"
              disabled={pending || cambiosLectura.length === 0}
              onClick={() => guardar(lectura.tabla, { origen: "archivo", archivo: lectura.archivo, fechaDocumento: lectura.l.fecha })}
              className="inline-flex h-9 items-center gap-2 rounded-lg bg-[#4F46E5] px-4 text-sm font-medium text-white hover:bg-[#4338CA] disabled:opacity-60"
            >
              {pending && <Loader2 className="h-4 w-4 animate-spin" />} Guardar esta versión
            </button>
          </div>
        </div>
      )}

      {borrador ? (
        <div className="space-y-4">
          {EMPRESAS_PROFESIOGRAMA.map(({ key, label }) => (
            <EditorEmpresa
              key={key}
              titulo={label}
              cargos={borrador[key]}
              onChange={(lista) => setBorrador((b) => (b ? { ...b, [key]: lista } : b))}
            />
          ))}
          <div className="sticky bottom-0 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#E2E8F0] bg-white p-3 shadow-sm">
            <span className="text-sm text-gray-600">
              {cambiosBorrador.length === 0 ? "Sin cambios todavía." : `${cambiosBorrador.length} cambio(s) sin guardar.`}
            </span>
            <div className="flex gap-2">
              <button type="button" onClick={() => setBorrador(null)} className="h-9 rounded-lg px-3 text-sm text-gray-600 hover:bg-gray-100">
                Cancelar
              </button>
              <button
                type="button"
                disabled={pending || cambiosBorrador.length === 0}
                onClick={() => guardar(borrador, { origen: "edicion" })}
                className="inline-flex h-9 items-center gap-2 rounded-lg bg-[#4F46E5] px-4 text-sm font-medium text-white hover:bg-[#4338CA] disabled:opacity-60"
              >
                {pending && <Loader2 className="h-4 w-4 animate-spin" />} Guardar cambios
              </button>
            </div>
          </div>
          {cambiosBorrador.length > 0 && <ListaCambios cambios={cambiosBorrador} />}
        </div>
      ) : (
        !lectura && <TablaCargos tabla={datos.tabla} />
      )}

      {datos.cargas.length > 0 && !borrador && (
        <div className="rounded-xl border border-[#E2E8F0] bg-white p-4">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Versiones guardadas</h3>
          <ul className="mt-2 space-y-1 text-xs text-gray-600">
            {datos.cargas.map((c) => (
              <li key={c.id}>
                {new Date(c.cargadoAt).toLocaleString("es-CO", { timeZone: "America/Bogota", dateStyle: "short", timeStyle: "short" })} ·{" "}
                {c.origen === "archivo" ? `archivo «${c.archivo}»` : c.origen === "edicion" ? "edición a mano" : "profesiograma inicial"}
                {c.fechaDocumento ? ` (documento del ${fechaCorta(c.fechaDocumento)})` : ""} · {c.cargos} cargos
                {c.origen !== "siembra" ? ` · ${c.cambios} cambio(s) · aplicado a ${c.personasAplicadas} persona(s)` : ""}
                {c.usuarioEmail ? ` · ${c.usuarioEmail}` : ""}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function TablaCargos({ tabla }: { tabla: TablaProfesiograma }) {
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      {EMPRESAS_PROFESIOGRAMA.map(({ key, label }) => (
        <div key={key} className="overflow-hidden rounded-xl border border-[#E2E8F0] bg-white">
          <h3 className="border-b border-[#F1F5F9] px-3 py-2 text-sm font-semibold text-gray-800">
            {label} <span className="font-normal text-gray-500">({tabla[key].length})</span>
          </h3>
          <table className="w-full text-xs">
            <tbody>
              {tabla[key].map((c) => (
                <tr key={c.cargo} className="border-b border-[#F1F5F9] last:border-0">
                  <td className="px-3 py-1.5 text-gray-800">{c.cargo}</td>
                  <td className="px-2 py-1.5 text-gray-500">{etiquetaTipoCargo(c.tipo)}</td>
                  <td className="whitespace-nowrap px-3 py-1.5 text-right font-medium tabular-nums text-gray-800">{c.meses} m</td>
                </tr>
              ))}
              {tabla[key].length === 0 && (
                <tr>
                  <td className="px-3 py-3 text-gray-500">Sin cargos.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}

function EditorEmpresa({ titulo, cargos, onChange }: { titulo: string; cargos: CargoProfesiograma[]; onChange: (l: CargoProfesiograma[]) => void }) {
  const cambiar = (i: number, c: Partial<CargoProfesiograma>) => onChange(cargos.map((x, j) => (j === i ? { ...x, ...c } : x)));
  return (
    <div className="overflow-hidden rounded-xl border border-[#E2E8F0] bg-white">
      <div className="flex items-center justify-between border-b border-[#F1F5F9] px-3 py-2">
        <h3 className="text-sm font-semibold text-gray-800">
          {titulo} <span className="font-normal text-gray-500">({cargos.length})</span>
        </h3>
        <button
          type="button"
          onClick={() => onChange([...cargos, { cargo: "", meses: 12, tipo: "oper" }])}
          className="inline-flex items-center gap-1 text-xs font-medium text-[#4F46E5] hover:underline"
        >
          <Plus className="h-3.5 w-3.5" /> Agregar cargo
        </button>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs uppercase tracking-wide text-gray-500">
            <th className="px-3 py-1.5">Cargo</th>
            <th className="w-56 px-2 py-1.5">Proceso</th>
            <th className="w-28 px-2 py-1.5">Meses</th>
            <th className="w-10" />
          </tr>
        </thead>
        <tbody>
          {cargos.map((c, i) => (
            <tr key={i} className="border-t border-[#F1F5F9]">
              <td className="px-3 py-1">
                <input className={inputCls} value={c.cargo} maxLength={150} placeholder="Nombre del cargo" onChange={(e) => cambiar(i, { cargo: e.target.value })} />
              </td>
              <td className="px-2 py-1">
                <select
                  className={inputCls}
                  value={c.tipo}
                  onChange={(e) => {
                    const tipo = e.target.value as TipoCargo;
                    // El proceso propone su periodicidad de referencia (36/24/12); se puede cambiar.
                    cambiar(i, { tipo, meses: TIPOS_CARGO.find((t) => t.key === tipo)?.meses ?? c.meses });
                  }}
                >
                  {TIPOS_CARGO.map((t) => (
                    <option key={t.key} value={t.key}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </td>
              <td className="px-2 py-1">
                <input type="number" min={6} max={60} className={inputCls} value={c.meses} onChange={(e) => cambiar(i, { meses: Number(e.target.value) })} />
              </td>
              <td className="px-2 py-1 text-right">
                <button type="button" title="Quitar cargo" onClick={() => onChange(cargos.filter((_, j) => j !== i))} className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600">
                  <Trash2 className="h-4 w-4" />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ListaCambios({ cambios }: { cambios: CambioCargo[] }) {
  if (cambios.length === 0) return <p className="text-sm text-gray-500">No hay diferencias con el profesiograma vigente.</p>;
  const desc = (c: CargoProfesiograma | null) => (c ? `${c.meses} meses · ${etiquetaTipoCargo(c.tipo)}` : "—");
  return (
    <div className="overflow-hidden rounded-lg border border-[#E2E8F0] bg-white">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-left uppercase tracking-wide text-gray-500">
            <th className="px-3 py-1.5">Empresa</th>
            <th className="px-3 py-1.5">Cargo</th>
            <th className="px-3 py-1.5">Cambio</th>
            <th className="px-3 py-1.5">Antes</th>
            <th className="px-3 py-1.5">Después</th>
          </tr>
        </thead>
        <tbody>
          {cambios.map((c) => (
            <tr key={`${c.empresa}|${c.cargo}`} className="border-t border-[#F1F5F9]">
              <td className="px-3 py-1.5 text-gray-600">{etiquetaEmpresa(c.empresa)}</td>
              <td className="px-3 py-1.5 font-medium text-gray-800">{c.cargo}</td>
              <td className={`px-3 py-1.5 font-semibold ${!c.antes ? "text-emerald-700" : !c.despues ? "text-red-600" : "text-amber-700"}`}>
                {!c.antes ? "Nuevo" : !c.despues ? "Se quita" : "Cambia"}
              </td>
              <td className="px-3 py-1.5 text-gray-600">{desc(c.antes)}</td>
              <td className="px-3 py-1.5 text-gray-800">{desc(c.despues)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Tras guardar: las personas a las que les cambia la periodicidad, para elegir a quiénes aplicarla. */
function AplicarPeriodicidades({ aplicacion, onCerrar }: { aplicacion: Aplicacion; onCerrar: () => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [marcadas, setMarcadas] = useState<Set<string>>(() => new Set(aplicacion.afectadas.filter((a) => a.sugerida).map((a) => a.cedula)));
  const alternar = (cedula: string) =>
    setMarcadas((s) => {
      const n = new Set(s);
      if (n.has(cedula)) n.delete(cedula);
      else n.add(cedula);
      return n;
    });

  function aplicar() {
    const cambios = aplicacion.afectadas.filter((a) => marcadas.has(a.cedula)).map((a) => ({ cedula: a.cedula, meses: a.nueva }));
    start(async () => {
      const r = await aplicarPeriodicidades(cambios, aplicacion.cargaId);
      if (!r.success) {
        toast.error(r.error);
        return;
      }
      toast.success(`Periodicidad actualizada a ${r.dato} persona(s).`);
      router.refresh();
      onCerrar();
    });
  }

  return (
    <div className="space-y-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-amber-900">
            A {aplicacion.afectadas.length} persona(s) del control les cambia la periodicidad con el profesiograma nuevo
          </p>
          <p className="text-xs text-amber-800">
            Vienen marcadas las que tenían la del profesiograma anterior; las demás tienen una periodicidad ajustada (p. ej. por concepto médico). Los
            exámenes ya registrados no cambian: afecta el vencimiento de quien aún no tiene exámenes y la periodicidad que se propone en su próximo examen.
          </p>
        </div>
        <button type="button" onClick={onCerrar} title="No aplicar" className="rounded p-1 text-amber-700 hover:bg-amber-100">
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="max-h-72 overflow-auto rounded-lg border border-amber-200 bg-white">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-white">
            <tr className="text-left uppercase tracking-wide text-gray-500">
              <th className="w-8 px-3 py-1.5">
                <input
                  type="checkbox"
                  checked={marcadas.size === aplicacion.afectadas.length}
                  onChange={(e) => setMarcadas(new Set(e.target.checked ? aplicacion.afectadas.map((a) => a.cedula) : []))}
                  aria-label="Marcar todas"
                />
              </th>
              <th className="px-3 py-1.5">Persona</th>
              <th className="px-3 py-1.5">Grupo</th>
              <th className="px-3 py-1.5">Hoy</th>
              <th className="px-3 py-1.5">Nueva</th>
            </tr>
          </thead>
          <tbody>
            {aplicacion.afectadas.map((a) => (
              <tr key={a.cedula} className="border-t border-[#F1F5F9]">
                <td className="px-3 py-1.5">
                  <input type="checkbox" checked={marcadas.has(a.cedula)} onChange={() => alternar(a.cedula)} aria-label={`Aplicar a ${a.nombre}`} />
                </td>
                <td className="px-3 py-1.5">
                  <p className="font-medium text-gray-900">{a.nombre}</p>
                  <p className="text-gray-500">
                    CC {a.cedula}
                    {a.cargo ? ` · ${a.cargo}` : ""}
                  </p>
                </td>
                <td className="px-3 py-1.5 text-gray-600">{etiquetaGrupo(a.grupo)}</td>
                <td className="px-3 py-1.5 text-gray-600">{a.actual} meses</td>
                <td className="px-3 py-1.5 font-medium text-gray-900">{a.nueva} meses</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCerrar} className="h-9 rounded-lg px-3 text-sm text-amber-900 hover:bg-amber-100">
          No aplicar
        </button>
        <button
          type="button"
          disabled={pending || marcadas.size === 0}
          onClick={aplicar}
          className="inline-flex h-9 items-center gap-2 rounded-lg bg-[#4F46E5] px-4 text-sm font-medium text-white hover:bg-[#4338CA] disabled:opacity-60"
        >
          {pending && <Loader2 className="h-4 w-4 animate-spin" />} Aplicar a {marcadas.size} persona(s)
        </button>
      </div>
    </div>
  );
}
