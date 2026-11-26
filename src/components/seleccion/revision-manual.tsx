"use client";

/**
 * «Croma no respondió»: las fuentes que fallaron o siguen en curso, marcadas en
 * rojo para que una persona las revise en el portal oficial y dé el visto
 * bueno (pedido de GH del 18-nov-2026). Al guardar, la fuente cuenta como
 * respondida y Croma no se vuelve a consultar para este proceso. Se puede
 * adjuntar el certificado en PDF (por ejemplo, el del RNMC).
 */
import { useRef, useState } from "react";
import { ExternalLink, FileUp, Loader2, Sparkles, TriangleAlert } from "lucide-react";
import { leerCertificadoAMano, revisarFuenteAMano, type FuenteRevision } from "@/lib/contratacion/actions";
import type { LecturaCertificado } from "@/lib/verificacion/lectura-certificado";
import { PORTALES_FUENTE } from "@/lib/verificacion/portales";

export interface FuentePendiente {
  fuente: FuenteRevision;
  /** Por qué está pendiente: «falló: …», «en curso en Croma», «sin consultar». */
  motivo: string;
  /** La fuente sí respondió, con un hallazgo: la revisión a mano lo corrige o lo confirma (entrega 3). */
  conHallazgo?: boolean;
  /** Todavía no se ha consultado (Croma en pausa o esperando): se puede verificar a mano igual. */
  sinConsultar?: boolean;
}

const NOMBRE: Record<FuenteRevision, string> = {
  policia: "Policía (antecedentes)",
  procuraduria: "Procuraduría",
  contraloria: "Contraloría",
  rnmc: "RNMC (medidas correctivas)",
  simit: "SIMIT",
  runt: "RUNT (licencia)",
};

// Consultas ciudadanas gratuitas de cada fuente (compartidas con la barra de estado).
const PORTAL: Record<FuenteRevision, string> = PORTALES_FUENTE as Record<FuenteRevision, string>;

function leerPdf(archivo: File): Promise<string> {
  return new Promise((ok, mal) => {
    const lector = new FileReader();
    lector.onload = () => ok(String(lector.result).split(",")[1] ?? "");
    lector.onerror = () => mal(new Error("No se pudo leer el archivo."));
    lector.readAsDataURL(archivo);
  });
}

export function RevisionManual({ procesoId, pendientes, onGuardado }: { procesoId: string; pendientes: FuentePendiente[]; onGuardado: () => void }) {
  const [abierta, setAbierta] = useState<FuenteRevision | null>(null);
  const [hallazgo, setHallazgo] = useState<boolean | null>(null);
  const [valor, setValor] = useState("0");
  const [licencia, setLicencia] = useState({ categoria: "", vence: "", restricciones: "" });
  const [nota, setNota] = useState("");
  const [pdf, setPdf] = useState<{ base64: string; nombre: string } | null>(null);
  const [ocupado, setOcupado] = useState(false);
  // Guardadas en esta pantalla mientras la ficha se vuelve a leer (puede tardar unos segundos).
  const [guardadas, setGuardadas] = useState<FuenteRevision[]>([]);
  const [error, setError] = useState<string | null>(null);
  // El certificado leído por la IA (26-nov-2026): llena el formulario; la persona revisa y guarda.
  const [leyendo, setLeyendo] = useState(false);
  const [lectura, setLectura] = useState<LecturaCertificado | null>(null);
  const [errorIa, setErrorIa] = useState<string | null>(null);
  const archivoRef = useRef<HTMLInputElement>(null);

  if (pendientes.length === 0) return null;

  function abrir(f: FuenteRevision) {
    setAbierta(f);
    setHallazgo(null);
    setValor("0");
    setLicencia({ categoria: "", vence: "", restricciones: "" });
    setNota("");
    setPdf(null);
    setError(null);
    setLectura(null);
    setErrorIa(null);
  }

  async function elegirPdf(archivo: File | undefined) {
    setError(null);
    if (!archivo) return;
    if (archivo.type !== "application/pdf" && !archivo.name.toLowerCase().endsWith(".pdf")) return setError("El archivo debe ser un PDF.");
    if (archivo.size > 700_000) return setError("El PDF pesa más de 700 KB. Descárgalo de nuevo del portal o redúcelo.");
    const fuente = abierta;
    let base64: string;
    try {
      base64 = await leerPdf(archivo);
      setPdf({ base64, nombre: archivo.name });
    } catch (e) {
      return setError(e instanceof Error ? e.message : "No se pudo leer el archivo.");
    }
    if (!fuente) return;
    // La IA lo lee y llena el formulario; nada se guarda hasta que la persona lo confirme.
    setLectura(null);
    setErrorIa(null);
    setLeyendo(true);
    const r = await leerCertificadoAMano(procesoId, fuente, { base64, nombre: archivo.name }).catch((e: Error) => ({ ok: false as const, error: e.message }));
    setLeyendo(false);
    if (!r.ok) return setErrorIa(r.error);
    const l = r.lectura;
    setLectura(l);
    if (fuente === "simit" && l.valor != null) setValor(String(l.valor));
    else if (fuente === "runt") setLicencia((x) => ({ categoria: l.categoria ?? x.categoria, vence: l.vence ?? x.vence, restricciones: l.restricciones ?? x.restricciones }));
    else if (l.hallazgo != null) setHallazgo(l.hallazgo);
    setNota((n) => (n.trim() ? n : `Leído por la IA del certificado${l.fecha ? ` del ${l.fecha}` : ""}: ${l.detalle}`.slice(0, 500)));
  }

  async function guardar() {
    if (!abierta || ocupado) return;
    const esSimit = abierta === "simit";
    const esRunt = abierta === "runt";
    const conHallazgo = esSimit ? Number(valor || 0) > 0 : esRunt ? false : hallazgo;
    if (conHallazgo == null) return setError("Elige el resultado de la revisión.");
    if (esRunt && !licencia.categoria.trim()) return setError("Escribe la categoría de la licencia.");
    setOcupado(true);
    setError(null);
    const r = await revisarFuenteAMano(procesoId, abierta, {
      hallazgo: conHallazgo,
      valor: esSimit ? Number(valor || 0) : null,
      nota,
      pdf,
      licencia: esRunt ? { categoria: licencia.categoria, vence: licencia.vence || null, restricciones: licencia.restricciones || null } : null,
    }).catch((e: Error) => ({ ok: false as const, error: e.message }));
    setOcupado(false);
    if (!r.ok) return setError(r.error ?? "No se pudo guardar.");
    setGuardadas((g) => [...g, abierta]);
    setAbierta(null);
    onGuardado();
  }

  const opcion = (activo: boolean, tono: "verde" | "rojo") =>
    `rounded-lg border px-3 py-2 text-sm font-medium ${activo ? (tono === "verde" ? "border-emerald-500 bg-emerald-50 text-emerald-700" : "border-red-500 bg-red-50 text-red-700") : "border-[#E2E8F0] bg-white text-gray-700"}`;

  return (
    <section className="rounded-lg border border-red-200 bg-red-50 p-3">
      <h4 className="mb-1 flex items-center gap-1.5 text-sm font-semibold text-red-800">
        <TriangleAlert className="h-4 w-4" /> {pendientes.every((p) => p.conHallazgo) ? "Revisar a mano" : "Croma no respondió: revisar a mano"}
      </h4>
      <p className="mb-2 text-xs text-red-800">
        Si ya lo revisaste en el portal oficial, registra aquí lo que encontraste: la fuente queda respondida con tu revisión y no se vuelve a consultar en Croma. Lo que Croma no
        respondió, Gestivo lo sigue reintentando solo.
      </p>
      <ul className="space-y-2">
        {pendientes.map((p) => (
          <li key={p.fuente} className="rounded-lg border border-red-200 bg-white p-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0 text-sm">
                <span className="mr-2 rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-red-700">
                  {p.conHallazgo ? "Con hallazgo" : p.sinConsultar ? "Sin verificar" : "Error en Croma"}
                </span>
                <span className="font-medium text-gray-900">{NOMBRE[p.fuente]}</span>
                <span className="block text-xs text-gray-500">{p.motivo}</span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <a href={PORTAL[p.fuente]} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-[#4F46E5]">
                  Abrir el portal <ExternalLink className="h-3 w-3" />
                </a>
                {guardadas.includes(p.fuente) ? (
                  <span className="inline-flex items-center gap-1 rounded-lg bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                    <Loader2 className="h-3 w-3 animate-spin" /> Guardado · actualizando la ficha…
                  </span>
                ) : abierta !== p.fuente && (
                  <button type="button" onClick={() => abrir(p.fuente)} className="rounded-lg bg-[#4F46E5] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#4338CA]">
                    Lo revisé a mano
                  </button>
                )}
              </div>
            </div>

            {abierta === p.fuente && (
              <div className="mt-3 space-y-2 border-t border-[#F1F5F9] pt-3">
                {p.fuente === "runt" ? (
                  <div className="grid gap-2 sm:grid-cols-3">
                    <label className="block text-sm font-medium text-gray-700">
                      Categoría
                      <input value={licencia.categoria} onChange={(e) => setLicencia({ ...licencia, categoria: e.target.value })} placeholder="C2" className="mt-1 h-10 w-full rounded-lg border border-[#E2E8F0] px-3 text-sm outline-none focus:border-[#4F46E5]" />
                    </label>
                    <label className="block text-sm font-medium text-gray-700">
                      Vence
                      <input type="date" value={licencia.vence} onChange={(e) => setLicencia({ ...licencia, vence: e.target.value })} className="mt-1 h-10 w-full rounded-lg border border-[#E2E8F0] px-3 text-sm outline-none focus:border-[#4F46E5]" />
                    </label>
                    <label className="block text-sm font-medium text-gray-700">
                      Restricciones
                      <input value={licencia.restricciones} onChange={(e) => setLicencia({ ...licencia, restricciones: e.target.value })} placeholder="Ninguna, lentes…" className="mt-1 h-10 w-full rounded-lg border border-[#E2E8F0] px-3 text-sm outline-none focus:border-[#4F46E5]" />
                    </label>
                    <p className="text-xs text-gray-500 sm:col-span-3">Revísela en el portal del RUNT o en la foto de la licencia que mandó el aspirante (pestaña Documentos). Con esto la licencia queda verificada.</p>
                  </div>
                ) : p.fuente === "simit" ? (
                  <label className="block text-sm font-medium text-gray-700">
                    Valor en comparendos (0 si no tiene)
                    <input value={valor} onChange={(e) => setValor(e.target.value.replace(/\D/g, "").slice(0, 10))} inputMode="numeric" className="mt-1 h-10 w-full rounded-lg border border-[#E2E8F0] px-3 text-sm outline-none focus:border-[#4F46E5]" />
                  </label>
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    <button type="button" onClick={() => setHallazgo(false)} className={opcion(hallazgo === false, "verde")}>
                      Sin novedad
                    </button>
                    <button type="button" onClick={() => setHallazgo(true)} className={opcion(hallazgo === true, "rojo")}>
                      Con hallazgo
                    </button>
                  </div>
                )}
                <textarea
                  value={nota}
                  onChange={(e) => setNota(e.target.value)}
                  rows={2}
                  maxLength={500}
                  placeholder={hallazgo ? "Qué encontraste (obligatorio)" : "Nota (opcional): dónde lo revisaste, número del certificado…"}
                  className="w-full rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm outline-none focus:border-[#4F46E5]"
                />
                <div className="flex flex-wrap items-center gap-2">
                  <input ref={archivoRef} type="file" accept="application/pdf,.pdf" className="hidden" onChange={(e) => void elegirPdf(e.target.files?.[0])} />
                  <button type="button" onClick={() => archivoRef.current?.click()} className="inline-flex items-center gap-1.5 rounded-lg border border-[#E2E8F0] bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50">
                    <FileUp className="h-3.5 w-3.5" /> {pdf ? "Cambiar el PDF" : p.fuente === "rnmc" ? "Adjuntar el certificado del RNMC (PDF)" : "Adjuntar el certificado (PDF)"}
                  </button>
                  {pdf && <span className="truncate text-xs text-gray-600">{pdf.nombre}</span>}
                  {!pdf && <span className="text-[11px] text-gray-500">La IA lo lee y llena la revisión.</span>}
                </div>
                {leyendo && (
                  <p className="flex items-center gap-1.5 rounded-lg bg-indigo-50 px-3 py-2 text-xs text-indigo-800">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> Leyendo el certificado con la IA…
                  </p>
                )}
                {errorIa && <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">{errorIa}</p>}
                {lectura && (
                  <div className="space-y-1 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs text-indigo-900">
                    <p className="flex items-center gap-1.5 font-semibold">
                      <Sparkles className="h-3.5 w-3.5" /> La IA leyó el certificado y llenó la revisión: revísela y guarde.
                    </p>
                    {lectura.detalle && <p>«{lectura.detalle}»</p>}
                    <p className="text-indigo-700">
                      {[lectura.nombre, lectura.cedula ? `cédula ${lectura.cedula}${lectura.cedulaCoincide ? " (coincide)" : ""}` : null, lectura.fecha ? `del ${lectura.fecha}` : null]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                    {lectura.avisos.map((a) => (
                      <p key={a} className="rounded bg-amber-100 px-2 py-1 font-medium text-amber-900">
                        ⚠ {a}
                      </p>
                    ))}
                  </div>
                )}
                {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}
                <div className="flex justify-end gap-2">
                  <button type="button" onClick={() => setAbierta(null)} disabled={ocupado} className="rounded-lg border border-[#E2E8F0] px-3 py-1.5 text-xs font-medium text-gray-700">
                    Cancelar
                  </button>
                  <button type="button" onClick={guardar} disabled={ocupado} className="inline-flex items-center gap-1.5 rounded-lg bg-[#4F46E5] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50">
                    {ocupado && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Guardar la revisión
                  </button>
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
