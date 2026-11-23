"use client";

/**
 * «Croma no respondió»: las fuentes que fallaron o siguen en curso, marcadas en
 * rojo para que una persona las revise en el portal oficial y dé el visto
 * bueno (pedido de GH del 18-nov-2026). Al guardar, la fuente cuenta como
 * respondida y Croma no se vuelve a consultar para este proceso. Se puede
 * adjuntar el certificado en PDF (por ejemplo, el del RNMC).
 */
import { useRef, useState } from "react";
import { ExternalLink, FileUp, Loader2, TriangleAlert } from "lucide-react";
import { revisarFuenteAMano, type FuenteRevision } from "@/lib/contratacion/actions";

export interface FuentePendiente {
  fuente: FuenteRevision;
  /** Por qué está pendiente: «falló: …», «en curso en Croma», «sin consultar». */
  motivo: string;
  /** La fuente sí respondió, con un hallazgo: la revisión a mano lo corrige o lo confirma (entrega 3). */
  conHallazgo?: boolean;
}

const NOMBRE: Record<FuenteRevision, string> = {
  policia: "Policía (antecedentes)",
  procuraduria: "Procuraduría",
  contraloria: "Contraloría",
  rnmc: "RNMC (medidas correctivas)",
  simit: "SIMIT",
};

// Consultas ciudadanas gratuitas de cada fuente.
const PORTAL: Record<FuenteRevision, string> = {
  policia: "https://antecedentes.policia.gov.co:7005/WebJudicial/",
  procuraduria: "https://www.procuraduria.gov.co/Pages/Consulta-de-Antecedentes.aspx",
  contraloria: "https://www.contraloria.gov.co/web/guest/persona-natural",
  rnmc: "https://srvcnpc.policia.gov.co/PSC/frm_cnp_consulta.aspx",
  simit: "https://www.fcm.org.co/simit/#/home-public",
};

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
  const [nota, setNota] = useState("");
  const [pdf, setPdf] = useState<{ base64: string; nombre: string } | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const archivoRef = useRef<HTMLInputElement>(null);

  if (pendientes.length === 0) return null;

  function abrir(f: FuenteRevision) {
    setAbierta(f);
    setHallazgo(null);
    setValor("0");
    setNota("");
    setPdf(null);
    setError(null);
  }

  async function elegirPdf(archivo: File | undefined) {
    setError(null);
    if (!archivo) return;
    if (archivo.type !== "application/pdf" && !archivo.name.toLowerCase().endsWith(".pdf")) return setError("El archivo debe ser un PDF.");
    if (archivo.size > 700_000) return setError("El PDF pesa más de 700 KB. Descárgalo de nuevo del portal o redúcelo.");
    try {
      setPdf({ base64: await leerPdf(archivo), nombre: archivo.name });
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo leer el archivo.");
    }
  }

  async function guardar() {
    if (!abierta || ocupado) return;
    const esSimit = abierta === "simit";
    const conHallazgo = esSimit ? Number(valor || 0) > 0 : hallazgo;
    if (conHallazgo == null) return setError("Elige el resultado de la revisión.");
    setOcupado(true);
    setError(null);
    const r = await revisarFuenteAMano(procesoId, abierta, { hallazgo: conHallazgo, valor: esSimit ? Number(valor || 0) : null, nota, pdf }).catch((e: Error) => ({ ok: false as const, error: e.message }));
    setOcupado(false);
    if (!r.ok) return setError(r.error ?? "No se pudo guardar.");
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
                <span className="mr-2 rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-red-700">{p.conHallazgo ? "Con hallazgo" : "Error en Croma"}</span>
                <span className="font-medium text-gray-900">{NOMBRE[p.fuente]}</span>
                <span className="block text-xs text-gray-500">{p.motivo}</span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <a href={PORTAL[p.fuente]} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-[#4F46E5]">
                  Abrir el portal <ExternalLink className="h-3 w-3" />
                </a>
                {abierta !== p.fuente && (
                  <button type="button" onClick={() => abrir(p.fuente)} className="rounded-lg bg-[#4F46E5] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#4338CA]">
                    Lo revisé a mano
                  </button>
                )}
              </div>
            </div>

            {abierta === p.fuente && (
              <div className="mt-3 space-y-2 border-t border-[#F1F5F9] pt-3">
                {p.fuente === "simit" ? (
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
                </div>
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
