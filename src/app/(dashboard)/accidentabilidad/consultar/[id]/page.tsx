import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { getAccidente } from "@/lib/rotacion/data/accidentes";
import AccidenteStatusBadge, {
  type AccidenteEstado,
} from "@/components/accidentabilidad/AccidenteStatusBadge";
import ReviewActions from "./review-actions";
import DeleteButton from "./delete-button";
import EvaluacionPanel from "@/components/accidentabilidad/EvaluacionPanel";
import { getCurrentPermissions } from "@/lib/permissions";
import { Pencil } from "lucide-react";

function fmt(s: string | null) {
  if (!s) return "—";
  return new Date(s).toLocaleString("es-CO", { dateStyle: "medium", timeStyle: "short" });
}

export default async function AccidenteDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [result, perms] = await Promise.all([getAccidente(id), getCurrentPermissions()]);
  if (!result) notFound();
  const { accidente: a, vehiculos, eventos, evaluacion, contexto, signed } = result;
  const canEvaluate = perms.puedeEditar;

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      <div className="sticky top-0 z-30 flex items-center justify-between border-b border-[#E2E8F0] bg-white px-6 py-4">
        <div className="flex items-center gap-3">
          <Link href="/accidentabilidad/consultar" className="text-gray-500 hover:text-gray-900">
            <ChevronLeft className="h-5 w-5" />
          </Link>
          <div>
            <h1 className="text-xl font-semibold text-gray-900">Reporte #{a.consecutivo}</h1>
            <p className="text-sm text-gray-500">{a.conductor_nombre} · {a.conductor_cedula}</p>
          </div>
        </div>
        <AccidenteStatusBadge estado={a.estado as AccidenteEstado} />
      </div>

      <div className="mx-auto max-w-4xl space-y-5 px-6 py-6">
        {/* Acciones de revisión */}
        <Card title="Revisión">
          <ReviewActions id={a.id} estado={a.estado} />
          <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-[#F1F5F9] pt-4">
            {a.estado === "falta_informacion" && (
              <Link
                href={`/accidentabilidad/consultar/${a.id}/editar`}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm font-medium text-[#4F46E5] hover:bg-[#EEF2FF]"
              >
                <Pencil className="h-4 w-4" /> Editar / completar información
              </Link>
            )}
            <DeleteButton id={a.id} consecutivo={a.consecutivo} />
          </div>
        </Card>

        {/* Evaluación / dictamen (Política de Correctivos) */}
        {a.estado !== "falta_informacion" && (
          <Card title="Evaluación · Política de correctivos">
            <EvaluacionPanel
              accidenteId={a.id}
              evaluacion={evaluacion}
              contexto={contexto}
              canEvaluate={canEvaluate}
            />
          </Card>
        )}

        <div className="grid gap-5 md:grid-cols-2">
          <Card title="Conductor">
            <Field label="Nombre" value={a.conductor_nombre} />
            <Field label="Cédula" value={a.conductor_cedula} />
            <Field label="Licencia" value={a.conductor_licencia || "—"} />
          </Card>

          <Card title="Accidente">
            <Field label="Fecha" value={fmt(a.fecha_accidente)} />
            <Field label="Dirección" value={a.direccion_accidente} />
          </Card>
        </div>

        <Card title="Vehículos implicados">
          {vehiculos.length === 0 ? (
            <p className="text-sm text-gray-400">Sin vehículos registrados.</p>
          ) : (
            <ul className="space-y-2">
              {vehiculos.map((v) => (
                <li key={v.id} className="flex items-center gap-3 text-sm">
                  <span className="rounded bg-[#F1F5F9] px-2 py-0.5 font-mono text-gray-700">{v.placa || "—"}</span>
                  <span className="text-gray-600">{v.descripcion}</span>
                  {v.es_propio && <span className="rounded-full bg-[#EEF2FF] px-2 py-0.5 text-xs text-[#4F46E5]">propio</span>}
                </li>
              ))}
            </ul>
          )}
        </Card>

        {a.tiene_peaton && (
          <Card title="Peatón">
            <Field label="Nombre" value={a.peaton_nombre || "—"} />
            <Field label="Cédula" value={a.peaton_cedula || "—"} />
            <Field label="Teléfono" value={a.peaton_telefono || "—"} />
            <Field label="Dirección" value={a.peaton_direccion || "—"} />
            <Field label="Correo" value={a.peaton_correo || "—"} />
          </Card>
        )}

        <Card title="Resumen de los hechos">
          <p className="whitespace-pre-wrap text-sm text-gray-700">{a.resumen_hechos || "—"}</p>
          {a.nota_voz_transcripcion && (
            <div className="mt-3 rounded-lg bg-[#F8FAFC] p-3">
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-400">Transcripción de la nota de voz</p>
              <p className="whitespace-pre-wrap text-sm text-gray-600">{a.nota_voz_transcripcion}</p>
            </div>
          )}
          {signed.notaVoz && (
            <audio controls src={signed.notaVoz} className="mt-3 w-full">
              Tu navegador no soporta audio.
            </audio>
          )}
        </Card>

        {(a.hubo_arreglo || a.solicito_aseguradora) && (
          <Card title={a.hubo_arreglo ? "Arreglo inmediato" : "Aseguradora"}>
            {a.hubo_arreglo ? (
              <>
                <Field label="Monto" value={a.arreglo_monto != null ? `$${Number(a.arreglo_monto).toLocaleString("es-CO")}` : "—"} />
                <Field label="Quién recibe" value={a.arreglo_receptor_nombre || "—"} />
                <Field label="Cédula" value={a.arreglo_receptor_cedula || "—"} />
                {signed.arregloFirma && <Firma url={signed.arregloFirma} label="Firma de quien recibe" />}
              </>
            ) : (
              <>
                <Field label="Aseguradora" value={a.aseguradora_nombre || "—"} />
                <Field label="Abogado" value={`${a.abogado_nombre || ""} ${a.abogado_apellidos || ""}`.trim() || "—"} />
                <Field label="Cédula abogado" value={a.abogado_cedula || "—"} />
                <Field label="Celular abogado" value={a.abogado_celular || "—"} />
              </>
            )}
          </Card>
        )}

        <Card title="Firmas">
          <div className="grid gap-4 sm:grid-cols-2">
            {signed.firmaConductor && <Firma url={signed.firmaConductor} label="Conductor (empresa)" />}
            {signed.firmaTercero && <Firma url={signed.firmaTercero} label="Otra parte" />}
          </div>
        </Card>

        <Card title="Historial">
          <ul className="space-y-2 text-sm">
            {eventos.map((e) => (
              <li key={e.id} className="flex items-start gap-2">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#94A3B8]" />
                <div>
                  <span className="font-medium text-gray-800">{e.tipo}</span>
                  {e.estado_nuevo && <span className="text-gray-500"> → {e.estado_nuevo}</span>}
                  {e.comentario && <p className="text-gray-600">{e.comentario}</p>}
                  <p className="text-xs text-gray-400">
                    {fmt(e.created_at)}
                    {(e.profiles as { full_name?: string } | null)?.full_name
                      ? ` · ${(e.profiles as { full_name?: string }).full_name}`
                      : ""}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-[#E2E8F0] bg-white p-5">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-400">{title}</h2>
      {children}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between border-b border-[#F1F5F9] py-1.5 last:border-0">
      <span className="text-sm text-gray-500">{label}</span>
      <span className="text-sm font-medium text-gray-900">{value}</span>
    </div>
  );
}

function Firma({ url, label }: { url: string; label: string }) {
  return (
    <div>
      <p className="mb-1 text-xs text-gray-500">{label}</p>
      <Image
        src={url}
        alt={label}
        width={400}
        height={160}
        unoptimized
        className="h-40 w-full rounded-lg border border-[#E2E8F0] bg-white object-contain"
      />
    </div>
  );
}
