import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { getAccidente } from "@/lib/rotacion/data/accidentes";
import AccidenteStatusBadge, {
  type AccidenteEstado,
} from "@/components/accidentabilidad/AccidenteStatusBadge";
import ReviewActions from "./review-actions";
import DeleteButton from "./delete-button";
import EvaluacionPanel from "@/components/accidentabilidad/EvaluacionPanel";
import { getCurrentPermissions } from "@/lib/permissions";
import { Pencil } from "lucide-react";
import CierreInvestigacion from "@/components/accidentabilidad/CierreInvestigacion";
import { getCatalogosAccidente } from "@/lib/accidentabilidad/datos";
import {
  CATEGORIAS_FACTOR,
  CLASE_ACCIDENTE,
  CLASE_VEHICULO,
  CONDICION_VICTIMA,
  labelDe,
  type ClaseAccidente,
} from "@/lib/accidentabilidad/formato";

function fmt(s: string | null) {
  if (!s) return "—";
  return new Date(s).toLocaleString("es-CO", { dateStyle: "medium", timeStyle: "short" });
}

const LESIONADOS_LABEL: Record<string, string> = {
  ninguno: "Sin lesionados",
  leves: "Lesiones leves",
  incapacitantes: "Lesiones incapacitantes",
  fatal: "Fallecidos",
};
const siNo = (v: boolean | null | undefined) => (v === true ? "Sí" : v === false ? "No" : "—");
const o = (v: unknown) => (v == null || v === "" ? "—" : String(v));

const DANOS_LABEL: Record<string, string> = {
  menores: "Daños menores",
  significativos: "Daños significativos",
  altos: "Daños altos / costosos",
  perdida_total: "Pérdida total",
};

export default async function AccidenteDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [result, perms, catalogos] = await Promise.all([
    getAccidente(id),
    getCurrentPermissions(),
    getCatalogosAccidente({ incluirInactivos: true }),
  ]);
  if (!result) notFound();
  const { accidente: a, vehiculos, victimas, eventos, evaluacion, contexto, signed } = result;
  const terceros = vehiculos.filter((v) => !v.es_propio);
  const propioLegado = vehiculos.find((v) => v.es_propio);
  const factorPorCodigo = new Map(catalogos.factor.map((f) => [f.codigo, f]));
  const codigos: string[] = Array.isArray(a.factores_codigos) ? a.factores_codigos : [];
  const tipoVehiculo = (c: string | null) =>
    catalogos.tipo_vehiculo.find((t) => t.codigo === c)?.label ?? o(c);
  const canEvaluate = perms.puedeEditar;

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      <PageHeader
        volver={{ href: "/accidentabilidad/consultar", label: "Accidentes" }}
        titulo={`Reporte #${a.consecutivo}`}
        descripcion={`${a.conductor_nombre} · ${a.conductor_cedula}`}
      >
        <AccidenteStatusBadge estado={a.estado as AccidenteEstado} />
      </PageHeader>

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
            <Field label="Código" value={o(a.conductor_codigo)} />
            <Field label="Licencia" value={a.conductor_licencia || "—"} />
          </Card>

          <Card title="Accidente">
            <Field label="Fecha" value={fmt(a.fecha_accidente)} />
            <Field label="Dirección" value={a.direccion_accidente} />
            <Field label="Ciudad" value={a.ciudad || "—"} />
            <Field label="Clase de accidente" value={CLASE_ACCIDENTE[a.clase_accidente as ClaseAccidente] || "—"} />
            <Field label="Lesionados" value={LESIONADOS_LABEL[a.lesionados as string] || "—"} />
            <Field label="Daños" value={DANOS_LABEL[a.danos_materiales as string] || "—"} />
          </Card>
        </div>

        <Card title="1. Vehículo de la empresa">
          <div className="grid gap-x-8 md:grid-cols-2">
            <div>
              <Field label="N.º interno" value={o(a.vehiculo_codigo)} />
              <Field label="Placa" value={o(a.vehiculo_placa ?? propioLegado?.placa)} />
              <Field label="Ruta" value={o(a.vehiculo_ruta)} />
              <Field label="Vehículo empresa" value={siNo(a.vehiculo_empresa)} />
              <Field label="Vehículo afiliado" value={siNo(a.vehiculo_afiliado)} />
              <Field label="Inmovilización" value={siNo(a.inmovilizacion)} />
            </div>
            <div>
              <Field label="Transacción" value={siNo(a.transaccion)} />
              <Field label="Fotos" value={siNo(a.tiene_fotos)} />
              <Field label="IPAT" value={a.tiene_ipat ? `Sí${a.ipat_numero ? ` · N.º ${a.ipat_numero}` : ""}` : siNo(a.tiene_ipat)} />
              <Field label="Velocidad" value={a.velocidad_kmh != null ? `${Number(a.velocidad_kmh)} km/h` : "—"} />
              <Field label="Huella de frenado" value={o(a.huella_frenado)} />
              <Field label="Huella de arrastre" value={o(a.huella_arrastre)} />
            </div>
          </div>
        </Card>

        <Card title="6. Hipótesis del accidente (códigos de tránsito)">
          {codigos.length === 0 && !a.fact_uso_celular ? (
            <p className="text-sm text-gray-400">Sin códigos de tránsito marcados.</p>
          ) : (
            <ul className="space-y-1.5">
              {codigos.map((c) => {
                const f = factorPorCodigo.get(c);
                return (
                  <li key={c} className="flex items-start gap-3 text-sm">
                    <span className="w-9 shrink-0 font-mono text-gray-500">{c}</span>
                    <span className="text-gray-800">{f?.label ?? "Código fuera del catálogo"}</span>
                    {f?.categoria && (
                      <span className="ml-auto shrink-0 text-xs text-gray-400">{labelDe(CATEGORIAS_FACTOR, f.categoria)}</span>
                    )}
                  </li>
                );
              })}
              {a.fact_uso_celular && (
                <li className="flex items-start gap-3 text-sm">
                  <span className="w-9 shrink-0 font-mono text-gray-300">—</span>
                  <span className="text-gray-800">Uso de celular</span>
                </li>
              )}
            </ul>
          )}
        </Card>
        <Card title="2. Información de los hechos · Declaración del conductor">
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

        <Card title="3. Datos del tercero">
          {terceros.length === 0 ? (
            <p className="text-sm text-gray-400">Sin vehículos de terceros.</p>
          ) : (
            <div className="space-y-5">
              {terceros.map((t, i) => (
                <div key={t.id} className={i > 0 ? "border-t border-[#F1F5F9] pt-4" : ""}>
                  <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-gray-900">
                    <span className="rounded bg-[#F1F5F9] px-2 py-0.5 font-mono text-gray-700">{t.placa || "—"}</span>
                    {t.descripcion && <span className="font-normal text-gray-600">{t.descripcion}</span>}
                  </p>
                  <div className="grid gap-x-8 md:grid-cols-3">
                    <div>
                      <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Vehículo</p>
                      <Field label="Clase" value={labelDe(CLASE_VEHICULO, t.clase_vehiculo) ?? "—"} />
                      <Field label="Tipo" value={tipoVehiculo(t.tipo_vehiculo)} />
                      <Field label="Color" value={o(t.color)} />
                      <Field label="Modelo" value={o(t.modelo)} />
                    </div>
                    <div>
                      <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Conductor</p>
                      <Field label="Nombre" value={o(t.conductor_nombre)} />
                      <Field label="Cédula" value={o(t.conductor_cedula)} />
                      <Field label="Celular" value={o(t.conductor_celular)} />
                      <Field label="Dirección" value={o(t.conductor_direccion)} />
                    </div>
                    <div>
                      <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Propietario</p>
                      <Field label="Nombre" value={o(t.propietario_nombre)} />
                      <Field label="Teléfono" value={o(t.propietario_telefono)} />
                      <Field label="Dirección" value={o(t.propietario_direccion)} />
                      <Field label="Aseguradora" value={o(t.aseguradora)} />
                      <Field label="Afiliado a" value={o(t.afiliado_a)} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        {(victimas.length > 0 || a.tiene_peaton) && (
          <Card title="4. Lesionados o víctimas fatales">
            {victimas.length > 0 ? (
              <div className="space-y-4">
                {victimas.map((v, i) => (
                  <div key={v.id} className={i > 0 ? "border-t border-[#F1F5F9] pt-3" : ""}>
                    <p className="mb-1 flex items-center gap-2 text-sm font-semibold text-gray-900">
                      {v.nombre}
                      {v.fallecido && <span className="rounded-full bg-[#FEE2E2] px-2 py-0.5 text-xs font-medium text-[#EF4444]">Víctima fatal</span>}
                    </p>
                    <div className="grid gap-x-8 md:grid-cols-2">
                      <div>
                        <Field label="Cédula" value={o(v.cedula)} />
                        <Field label="Teléfono" value={o(v.telefono)} />
                        <Field label="Condición" value={labelDe(CONDICION_VICTIMA, v.condicion) ?? "—"} />
                      </div>
                      <div>
                        <Field label="Dirección" value={o(v.direccion)} />
                        <Field label="Municipio" value={o(v.municipio)} />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              // Reportes anteriores al formato: solo guardaban un peatón.
              <>
                <Field label="Peatón" value={a.peaton_nombre || "—"} />
                <Field label="Cédula" value={a.peaton_cedula || "—"} />
                <Field label="Teléfono" value={a.peaton_telefono || "—"} />
                <Field label="Dirección" value={a.peaton_direccion || "—"} />
                <Field label="Correo" value={a.peaton_correo || "—"} />
              </>
            )}
          </Card>
        )}

        <Card title="5. Información del agente">
          <Field label="Agente que atendió" value={o(a.agente_nombre)} />
          <Field label="Placa del agente" value={o(a.agente_placa)} />
          <Field label="Celular" value={o(a.agente_celular)} />
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

        <Card title="7. Cierre de la investigación">
          <CierreInvestigacion accidenteId={a.id} funcionario={a.funcionario_cierre} puedeEditar={canEvaluate} />
        </Card>

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
    <div className="flex justify-between gap-4 border-b border-[#F1F5F9] py-1.5 last:border-0">
      <span className="shrink-0 text-sm text-gray-500">{label}</span>
      <span className="text-right text-sm font-medium text-gray-900">{value}</span>
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
