"use client";

/**
 * Versión de la política en borrador (p. ej. la v3): sus esquemas, un
 * simulador que compara a personas reales con la vigente y con el borrador, y
 * el botón para publicarla (solo administradores).
 */
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CircleAlert, CircleCheck, CircleX, FlaskConical, Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { formatDateBogota } from "@/lib/utils";
import { PROCESO_ESTADOS } from "@/lib/contratacion/constants";
import { LETRAS_ESQUEMA, totalesEsquema, type ParametrosPolitica } from "@/lib/padrino/politica";
import { SEMAFORO_LABEL, sumarDias, type Requisito } from "@/lib/padrino/reglas";
import { BENEFICIARIO_LABEL } from "@/lib/padrino/hitos";
import {
  buscarPadrinos, buscarProcesos, publicarPolitica, simularVersiones,
  type LadoSimulacion, type PadrinoOpcion, type ProcesoOpcion, type ResultadoSimulacion,
} from "@/lib/padrino/actions";
import { Buscador, Elegido, inputCls, useBusqueda } from "./buscadores";

const COP = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });

/** Una tarjeta por esquema de la versión, con lo que cobra cada beneficiario. */
export function TarjetasEsquemas({ parametros }: { parametros: ParametrosPolitica }) {
  return (
    <>
      {LETRAS_ESQUEMA.filter((k) => parametros.esquemas[k]).map((k) => {
        const e = parametros.esquemas[k]!;
        const t = totalesEsquema(e);
        return (
          <div key={k} className="rounded-xl border border-[#E2E8F0] bg-white p-4">
            <div className="flex items-baseline justify-between gap-2">
              <p className="text-sm font-semibold text-gray-900">
                Esquema {k} · {e.nombre}
              </p>
              <p className="text-sm font-bold text-[#4F46E5]">{COP.format(t.total)}</p>
            </div>
            <p className="mt-0.5 text-xs text-gray-500">{e.condicion}</p>
            <p className="mt-2 text-xs text-gray-600">
              {e.hitos
                .map((h) => `${h.descripcion}: ${h.pagos.referido ? `padrino ${COP.format(h.pagos.padrino)} + referido ${COP.format(h.pagos.referido)}` : COP.format(h.pagos.padrino)}`)
                .join(" · ")}
            </p>
            {t.referido > 0 && (
              <p className="mt-1 text-[11px] text-gray-400">
                Padrino {COP.format(t.padrino)} · referido {COP.format(t.referido)}
              </p>
            )}
          </div>
        );
      })}
    </>
  );
}

export interface ReferidoSimulable {
  id: string;
  proceso_id: string | null;
  cedula_referido: string;
  nombre_referido: string | null;
  cedula_padrino: string;
  nombre_padrino: string | null;
  estado: string;
}

export function PoliticaBorrador({
  borrador,
  vigente,
  referidos,
  hoy,
  puedeSimular,
  puedePublicar,
}: {
  borrador: { id: string; version: string; parametros: ParametrosPolitica };
  vigente: { version: string } | null;
  referidos: ReferidoSimulable[];
  hoy: string;
  puedeSimular: boolean;
  puedePublicar: boolean;
}) {
  return (
    <details className="rounded-xl border border-dashed border-[#F59E0B] bg-[#FFFBEB] p-4">
      <summary className="cursor-pointer text-sm font-semibold text-[#92400E]">
        Política {borrador.version} en borrador · aún no rige
        <span className="ml-2 font-normal text-[#B45309]">
          ({LETRAS_ESQUEMA.filter((k) => borrador.parametros.esquemas[k]).map((k) => `Esquema ${k}`).join(", ")})
        </span>
      </summary>
      <p className="mt-2 text-xs text-[#92400E]">
        Así quedarán los esquemas cuando se publique con su fecha de vigencia y la aprobación de Gerencia. Mientras tanto, todo se registra y se paga con la política {vigente?.version ?? "vigente"}.
      </p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <TarjetasEsquemas parametros={borrador.parametros} />
      </div>
      {puedeSimular && <Simulador referidos={referidos} />}
      {puedePublicar && <Publicar borrador={borrador} vigente={vigente} hoy={hoy} />}
    </details>
  );
}

// ── Simulador ───────────────────────────────────────────────────────────────

const buscarProcesosSimulador = (q: string) => buscarProcesos(q, { simulador: true });
const buscarPadrinosSimulador = (q: string) => buscarPadrinos(q, { todosLosEmpleados: true });

function Simulador({ referidos }: { referidos: ReferidoSimulable[] }) {
  const conProceso = referidos.filter((r) => r.proceso_id);
  const [modo, setModo] = useState<"registrado" | "otro">(conProceso.length ? "registrado" : "otro");
  const [referidoId, setReferidoId] = useState(conProceso[0]?.id ?? "");
  const [proceso, setProceso] = useState<ProcesoOpcion | null>(null);
  const [padrino, setPadrino] = useState<PadrinoOpcion | null>(null);
  const [qProceso, setQProceso] = useState("");
  const [qPadrino, setQPadrino] = useState("");
  const [certificado, setCertificado] = useState<"registro" | "si" | "no">("registro");
  const [resultado, setResultado] = useState<ResultadoSimulacion | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendiente, start] = useTransition();
  const procesos = useBusqueda(buscarProcesosSimulador, qProceso);
  const padrinos = useBusqueda(buscarPadrinosSimulador, qPadrino);

  const elegido = conProceso.find((r) => r.id === referidoId) ?? null;
  const listo = modo === "registrado" ? Boolean(elegido) : Boolean(proceso && padrino);

  function comparar() {
    setError(null);
    start(async () => {
      const r = await simularVersiones({
        procesoId: modo === "registrado" ? elegido!.proceso_id! : proceso!.id,
        cedulaPadrino: modo === "registrado" ? elegido!.cedula_padrino : padrino!.cedula,
        referidoId: modo === "registrado" ? elegido!.id : null,
        experienciaCertificada: certificado === "registro" ? null : certificado === "si",
      });
      if (r.ok) setResultado(r.simulacion);
      else {
        setResultado(null);
        setError(r.error);
      }
    });
  }

  return (
    <section className="mt-4 rounded-xl border border-[#E2E8F0] bg-white p-4">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-gray-900">
        <FlaskConical className="h-4 w-4 text-[#4F46E5]" /> Simulador: la misma persona con cada versión
      </h3>
      <p className="mt-0.5 text-xs text-gray-500">
        Evalúa al referido y al padrino con los datos de hoy, con la política vigente y con el borrador, lado a lado. No guarda nada.
      </p>

      <div className="mt-3 flex flex-wrap gap-3 text-sm">
        <label className="flex items-center gap-1.5 text-gray-700">
          <input type="radio" checked={modo === "registrado"} onChange={() => setModo("registrado")} disabled={!conProceso.length} className="accent-[#4F46E5]" />
          Un referido registrado
        </label>
        <label className="flex items-center gap-1.5 text-gray-700">
          <input type="radio" checked={modo === "otro"} onChange={() => setModo("otro")} className="accent-[#4F46E5]" />
          Otra persona (proceso de contratación y padrino)
        </label>
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-[1fr_1fr_auto] lg:items-end">
        {modo === "registrado" ? (
          <div className="lg:col-span-2">
            <p className="mb-1 text-xs font-medium text-gray-600">Referido</p>
            <select value={referidoId} onChange={(e) => setReferidoId(e.target.value)} className={`${inputCls} w-full`}>
              {conProceso.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.nombre_referido ?? r.cedula_referido} · padrino {r.nombre_padrino ?? r.cedula_padrino}
                </option>
              ))}
            </select>
          </div>
        ) : (
          <>
            <div>
              <p className="mb-1 text-xs font-medium text-gray-600">Referido (proceso de contratación)</p>
              {proceso ? (
                <Elegido titulo={proceso.nombre} detalle={`${proceso.cedula} · ${PROCESO_ESTADOS.find((e) => e.value === proceso.estado)?.label ?? proceso.estado}`} onCambiar={() => setProceso(null)} />
              ) : (
                <Buscador
                  valor={qProceso}
                  onValor={setQProceso}
                  placeholder="Cédula o nombre del candidato"
                  items={procesos}
                  vacio="Ningún proceso de contratación con ese dato."
                  render={(p) => ({ key: p.id, titulo: p.nombre, detalle: `${p.cedula} · ${PROCESO_ESTADOS.find((e) => e.value === p.estado)?.label ?? p.estado} · ${formatDateBogota(p.fecha_creacion)}` })}
                  onElegir={setProceso}
                />
              )}
            </div>
            <div>
              <p className="mb-1 text-xs font-medium text-gray-600">Padrino (conductor o empleado activo)</p>
              {padrino ? (
                <Elegido titulo={padrino.nombre} detalle={`${padrino.cedula} · ${padrino.tipo === "conductor" ? "Conductor" : "Empleado"}${padrino.detalle ? ` · ${padrino.detalle}` : ""}`} onCambiar={() => setPadrino(null)} />
              ) : (
                <Buscador
                  valor={qPadrino}
                  onValor={setQPadrino}
                  placeholder="Cédula, nombre o código"
                  items={padrinos}
                  vacio="Ningún conductor ni empleado activo con ese dato."
                  render={(p) => ({ key: `${p.tipo}-${p.cedula}`, titulo: p.nombre, detalle: `${p.cedula} · ${p.tipo === "conductor" ? "Conductor" : "Empleado"}${p.detalle ? ` · ${p.detalle}` : ""}` })}
                  onElegir={setPadrino}
                />
              )}
            </div>
          </>
        )}
        <div>
          <p className="mb-1 text-xs font-medium text-gray-600">Certificado de experiencia</p>
          <select value={certificado} onChange={(e) => setCertificado(e.target.value as typeof certificado)} className={`${inputCls} w-full`}>
            <option value="registro">{modo === "registrado" ? "Como está en el registro" : "Sin validar"}</option>
            <option value="si">Validado (aspira al esquema A)</option>
            <option value="no">No válido</option>
          </select>
        </div>
      </div>

      <div className="mt-3 flex justify-end">
        <Button onClick={comparar} disabled={!listo || pendiente} className="bg-[#4F46E5] text-white hover:bg-[#4338CA]">
          {pendiente ? "Comparando…" : "Comparar versiones"}
        </Button>
      </div>
      {error && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

      {resultado && (
        <div className={`mt-4 ${pendiente ? "opacity-50" : ""}`}>
          <p className="mb-2 text-xs text-gray-500">
            <strong className="text-gray-800">{resultado.referido.nombre}</strong> ({resultado.referido.cedula}) con el padrino{" "}
            <strong className="text-gray-800">{resultado.padrino.nombre ?? resultado.padrino.cedula}</strong>. Ingreso supuesto: {formatDateBogota(resultado.fechaIngreso)} ({resultado.fuenteIngreso}).
          </p>
          <div className="grid gap-3 lg:grid-cols-2">
            {resultado.lados.map((l) => <Lado key={l.politicaId} lado={l} />)}
          </div>
        </div>
      )}
    </section>
  );
}

const ICONO = {
  cumple: <CircleCheck className="h-3.5 w-3.5 text-emerald-600" />,
  revisar: <CircleAlert className="h-3.5 w-3.5 text-amber-600" />,
  no_cumple: <CircleX className="h-3.5 w-3.5 text-red-600" />,
};

function Veredicto({ lado }: { lado: LadoSimulacion }) {
  const { bloqueoRegistro, decision, esquema } = lado;
  const [cls, texto] = bloqueoRegistro
    ? ["bg-red-50 text-red-700", bloqueoRegistro]
    : esquema.sinBonificacion
      ? ["bg-red-50 text-red-700", `Sin bonificación: ${esquema.sinBonificacion}`]
      : decision.bloqueantes
        ? ["bg-red-50 text-red-700", `Solo se aprueba como excepción: ${decision.bloqueantes} requisito(s) que bloquean no se cumplen.`]
        : decision.observar
          ? ["bg-amber-50 text-amber-800", `Se aprueba con observación: ${decision.observar} requisito(s) por revisar o que no bloquean.`]
          : ["bg-emerald-50 text-emerald-800", "Se aprueba directo: cumple todo lo que pesa al decidir."];
  return <p className={`rounded-lg px-3 py-2 text-xs ${cls}`}>{texto}</p>;
}

function Lado({ lado }: { lado: LadoSimulacion }) {
  const requisitos: Requisito[] = [...lado.validacion.padrino, ...lado.validacion.referido];
  return (
    <div className={`rounded-xl border p-4 ${lado.estado === "borrador" ? "border-[#F59E0B] bg-[#FFFDF5]" : "border-[#E2E8F0] bg-white"}`}>
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-sm font-semibold text-gray-900">
          Política {lado.version}{" "}
          <span className={`ml-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${lado.estado === "borrador" ? "bg-[#FEF3C7] text-[#92400E]" : "bg-[#EEF2FF] text-[#4F46E5]"}`}>
            {lado.estado === "borrador" ? "borrador" : "vigente"}
          </span>
        </p>
        <p className="text-sm font-bold text-[#4F46E5]">{COP.format(lado.totales.total)}</p>
      </div>
      <p className="mt-1 text-sm text-gray-700">
        Esquema <strong>{lado.esquema.esquema}</strong>
        {lado.nombreEsquema ? ` · ${lado.nombreEsquema}` : ""} · {lado.esquema.tipoIngreso === "reintegro" ? `reintegro${lado.esquema.mesesFuera !== null ? ` (${lado.esquema.mesesFuera} meses fuera)` : ""}` : "ingreso nuevo"}
      </p>
      <p className="text-xs text-gray-500">{lado.esquema.dato}</p>
      {lado.esquema.revisar && <p className="mt-1 text-xs text-amber-700">{lado.esquema.revisar}</p>}
      <p className="mt-2 text-xs text-gray-600">
        Padrino <strong>{COP.format(lado.totales.padrino)}</strong> · referido <strong>{COP.format(lado.totales.referido)}</strong>
      </p>
      {lado.hitos.length > 0 && (
        <ul className="mt-1 space-y-0.5 text-xs text-gray-500">
          {lado.hitos.map((h) => (
            <li key={`${h.numero}-${h.beneficiario}`}>
              {h.numero}. {h.descripcion} · {BENEFICIARIO_LABEL[h.beneficiario]} {COP.format(h.valor)}
              {h.fechaCausacion ? ` · ${formatDateBogota(h.fechaCausacion)}` : ""}
              {h.requiere_desempeno ? " · exige desempeño satisfactorio" : ""}
            </li>
          ))}
        </ul>
      )}
      <div className="mt-3">
        <Veredicto lado={lado} />
      </div>
      <ul className="mt-3 divide-y divide-[#F1F5F9]">
        {requisitos.map((q) => (
          <li key={q.codigo} className="flex gap-2 py-1.5">
            <span className="mt-0.5" title={SEMAFORO_LABEL[q.estado]}>{ICONO[q.estado]}</span>
            <div className="min-w-0">
              <p className="text-xs text-gray-800">
                <span className="font-medium">{q.codigo}</span> · {q.titulo}
                {q.momento === "contratacion" && <span className="ml-1 rounded bg-[#F1F5F9] px-1 text-[10px] text-gray-500">al contratar</span>}
                {q.bloquea === false && q.estado !== "cumple" && <span className="ml-1 rounded bg-[#F1F5F9] px-1 text-[10px] text-gray-500">no bloquea</span>}
              </p>
              <p className="text-[11px] text-gray-500">{q.dato}</p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ── Publicar ────────────────────────────────────────────────────────────────

function Publicar({ borrador, vigente, hoy }: { borrador: { id: string; version: string; parametros: ParametrosPolitica }; vigente: { version: string } | null; hoy: string }) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [fecha, setFecha] = useState("");
  const [aprobadaPor, setAprobadaPor] = useState("Gerencia General");
  const [soporte, setSoporte] = useState("");
  const [confirmo, setConfirmo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendiente, start] = useTransition();
  const ex = borrador.parametros.padrino.excluidos;
  const excluidos = borrador.parametros.padrino.modo_empleados === "excluidos";

  function publicar() {
    setError(null);
    start(async () => {
      const r = await publicarPolitica({ id: borrador.id, vigenteDesde: fecha, aprobadaPor, soporte });
      if (r.ok) {
        toast.success(`Política ${r.version} publicada: rige desde el ${formatDateBogota(fecha)}.`);
        setAbierto(false);
        router.refresh();
      } else setError(r.error);
    });
  }

  if (!abierto) {
    return (
      <div className="mt-4 flex justify-end">
        <Button onClick={() => setAbierto(true)} className="bg-[#B45309] text-white hover:bg-[#92400E]">
          <Send className="h-4 w-4" /> Publicar la {borrador.version}
        </Button>
      </div>
    );
  }

  return (
    <section className="mt-4 rounded-xl border border-[#F59E0B] bg-white p-4">
      <h3 className="text-sm font-semibold text-gray-900">Publicar la política {borrador.version}</h3>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-gray-600">
        <li>Desde la fecha que elija, los registros nuevos y los referidos que <strong>ingresen</strong> desde ese día usan la {borrador.version}. Los que ya están en seguimiento siguen con su versión.</li>
        <li>{vigente ? `La ${vigente.version} se cierra el día anterior${fecha ? ` (${formatDateBogota(sumarDias(fecha, -1))})` : ""}.` : "No hay otra versión vigente que cerrar."}</li>
        <li>Una vez publicada <strong>no se puede editar</strong>: cambiarla exige una versión nueva.</li>
        {excluidos && (
          <li>
            Áreas excluidas como padrinos: <strong>{ex.areas.length ? ex.areas.join(", ") : "ninguna"}</strong>; cargos excluidos:{" "}
            <strong>{ex.cargos.length ? ex.cargos.join(", ") : "ninguno"}</strong>.
            {!ex.cargos.length && <span className="text-amber-700"> Confirme con Gestión Humana que no falten los jefes que aprueban la contratación.</span>}
          </li>
        )}
      </ul>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="text-xs font-medium text-gray-600">
          Rige desde
          <input type="date" min={hoy} value={fecha} onChange={(e) => setFecha(e.target.value)} className={`${inputCls} mt-1 w-full`} />
        </label>
        <label className="text-xs font-medium text-gray-600">
          Aprobada por
          <input value={aprobadaPor} onChange={(e) => setAprobadaPor(e.target.value)} maxLength={200} className={`${inputCls} mt-1 w-full`} />
        </label>
        <label className="text-xs font-medium text-gray-600 sm:col-span-2">
          Soporte de la aprobación
          <textarea
            value={soporte}
            onChange={(e) => setSoporte(e.target.value)}
            maxLength={1000}
            rows={2}
            placeholder="Documento firmado, fecha y quién lo firma (p. ej. «Política Plan Padrino actualizada, firmada por la Gerencia el …»)"
            className="mt-1 w-full rounded-lg border border-[#E2E8F0] bg-white px-3 py-2 text-sm text-gray-700 outline-none focus:border-[#4F46E5] focus:ring-2 focus:ring-[#4F46E5]/20"
          />
        </label>
      </div>
      <label className="mt-3 flex items-start gap-2 text-xs text-gray-700">
        <input type="checkbox" checked={confirmo} onChange={(e) => setConfirmo(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[#B45309]" />
        Revisé los esquemas y el simulador, y tengo la aprobación escrita de Gerencia.
      </label>
      {error && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
      <div className="mt-3 flex justify-end gap-2">
        <Button variant="outline" onClick={() => setAbierto(false)} disabled={pendiente}>Cancelar</Button>
        <Button onClick={publicar} disabled={pendiente || !confirmo || !fecha || !soporte.trim() || !aprobadaPor.trim()} className="bg-[#B45309] text-white hover:bg-[#92400E]">
          {pendiente ? "Publicando…" : `Publicar la ${borrador.version}`}
        </Button>
      </div>
    </section>
  );
}
