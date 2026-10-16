"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CircleAlert, CircleCheck, CircleX, FileText, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { formatDateBogota, formatDateTimeBogota } from "@/lib/utils";
import { PROCESO_ESTADOS } from "@/lib/contratacion/constants";
import {
  ESTADOS_ABIERTOS, ESTADOS_CAMBIO_ESQUEMA, ESTADOS_DECISION, SEMAFORO_LABEL, hitosProyectados, resumenValidacion, totalEsquema,
  type Requisito,
} from "@/lib/padrino/reglas";
import {
  anularReferido, cerrarNoContratado, decidirElegibilidad, revalidarReferido, subirCertificado, validarCertificado,
} from "@/lib/padrino/actions";
import type { getReferido } from "@/lib/padrino/datos";
import { EstadoBadge } from "../plan-padrino-client";
import { HitoBadge } from "../hitos/hitos-client";

type Datos = NonNullable<Awaited<ReturnType<typeof getReferido>>>;

const COP = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });
const areaCls =
  "w-full rounded-lg border border-[#E2E8F0] bg-white px-3 py-2 text-sm text-gray-700 outline-none focus:border-[#4F46E5] focus:ring-2 focus:ring-[#4F46E5]/20";

const ACCIONES: Record<string, string> = {
  registro: "Registró el referido",
  revalidacion: "Revalidó los requisitos",
  certificado_subido: "Adjuntó el certificado de experiencia",
  cambio_esquema: "Validó el certificado y fijó el esquema",
  elegible: "Aprobó la elegibilidad",
  elegible_por_excepcion: "Aprobó la elegibilidad como excepción",
  no_elegible: "Declaró no elegible",
  contratado: "Pasó a Contratado",
  no_contratado: "Cerró como no contratado",
  anulacion: "Anuló el registro",
  hitos_creados: "Se crearon los hitos de pago",
  hito_por_aprobar: "Un hito se cumplió y quedó por aprobar",
  hito_no_causado: "Un hito no se causó",
  hitos_cancelados: "Se cancelaron los hitos siguientes",
  hito_aprobado: "Aprobó un hito",
  hito_rechazado: "Rechazó un hito",
  hito_pagado: "Marcó un hito como pagado",
  hito_exportado: "Exportó el hito para nómina",
  hito_en_incentivos: "El pago quedó registrado en incentivos",
  completado: "Plan completado: todos los hitos pagados",
  terminado: "Plan terminado sin completar",
};

export function ReferidoClient({ datos, alertas = [], puedeRegistrar, puedeAprobar }: { datos: Datos; alertas?: string[]; puedeRegistrar: boolean; puedeAprobar: boolean }) {
  const { referido: r, proceso, eventos, politica } = datos;
  const router = useRouter();
  const [pendiente, start] = useTransition();
  const anulado = Boolean(r.anulado_at);
  const decidiendo = !anulado && ESTADOS_DECISION.includes(r.estado);
  const esquemaEditable = !anulado && ESTADOS_CAMBIO_ESQUEMA.includes(r.estado);
  const abierto = !anulado && (ESTADOS_ABIERTOS.includes(r.estado) || r.estado === "no_elegible");
  const procEstado = PROCESO_ESTADOS.find((e) => e.value === proceso?.estado);
  const hitos = politica ? hitosProyectados(politica.esquemas, r.esquema, r.fecha_ingreso) : [];

  function correr(fn: () => Promise<{ ok: boolean; error?: string }>, exito: string, despues?: () => void) {
    start(async () => {
      const res = await fn();
      if (res.ok) {
        toast.success(exito);
        despues?.();
        router.refresh();
      } else toast.error(res.error ?? "No se pudo guardar.");
    });
  }

  return (
    <div className="mx-auto max-w-[1200px] space-y-5 px-4 py-5 sm:px-6">
      {anulado && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          Registro anulado el {formatDateTimeBogota(r.anulado_at)} por {r.anulado_por_email ?? "—"}: {r.motivo_anulacion}
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <Tarjeta titulo="Referido">
          <Dato k="Nombre" v={r.nombre_referido ?? "—"} />
          <Dato k="Cédula" v={r.cedula_referido} />
          <Dato
            k="Proceso"
            v={
              proceso ? (
                <span className="inline-flex flex-wrap items-center gap-1">
                  {procEstado && (
                    <span className="rounded-full px-2 py-0.5 text-xs font-medium" style={{ backgroundColor: procEstado.bg, color: procEstado.color }}>
                      {procEstado.label}
                    </span>
                  )}
                  {proceso.vacante && <span className="text-xs text-gray-500">{proceso.vacante}</span>}
                </span>
              ) : (
                "Sin proceso"
              )
            }
          />
          {r.candidate_id && (
            <Link href={`/candidatos/${r.candidate_id}`} className="text-xs font-medium text-[#4F46E5] hover:underline">Ver ficha del candidato</Link>
          )}
        </Tarjeta>
        <Tarjeta titulo="Padrino">
          <Dato k="Nombre" v={r.nombre_padrino ?? "—"} />
          <Dato k="Cédula" v={r.cedula_padrino} />
          <Dato k="Vinculación" v={`${r.padrino_tipo === "conductor" ? "Conductor" : "Empleado"}${r.padrino_cargo ? ` · ${r.padrino_cargo}` : ""}`} />
        </Tarjeta>
        <Tarjeta titulo="Estado">
          <div className="mb-2"><EstadoBadge estado={r.estado} /></div>
          <Dato k="Esquema" v={`${r.esquema} · ${politica?.esquemas[r.esquema]?.nombre ?? ""} (${COP.format(totalEsquema(politica?.esquemas[r.esquema]))})`} />
          <Dato k="Fecha de ingreso" v={r.fecha_ingreso ? formatDateBogota(r.fecha_ingreso) : "—"} />
          <Dato k="Política" v={politica?.version ?? "—"} />
          <Dato k="Registró" v={`${r.created_by_email ?? "—"} · ${formatDateBogota(r.created_at)}`} />
        </Tarjeta>
      </div>

      {alertas.length > 0 && (
        <div className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
          <p className="font-medium">Alerta antes del próximo hito</p>
          {alertas.map((a) => <p key={a}>{a}</p>)}
        </div>
      )}
      {r.estado === "elegible" && proceso && proceso.estado !== "contratado" && (
        <p className="rounded-lg bg-[#EEF2FF] px-3 py-2 text-sm text-[#3730A3]">
          Elegible. Pasará a Contratado sola cuando el proceso de contratación quede en «Contratado»; la fecha de ingreso será la fecha de contrato del proceso.
        </p>
      )}
      {decidiendo && proceso?.estado === "cierre" && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
          El proceso de contratación se cerró sin contratar{proceso.causa_no_contrato ? ` (${proceso.causa_no_contrato})` : ""}: ciérrelo como no contratado.
        </p>
      )}

      <Validacion r={r} puedeRevalidar={puedeRegistrar && decidiendo} pendiente={pendiente} onRevalidar={() => correr(() => revalidarReferido(r.id), "Requisitos revalidados con los datos de hoy")} />

      <div className="grid gap-4 lg:grid-cols-2">
        <Certificado
          r={r}
          editable={esquemaEditable}
          puedeSubir={puedeRegistrar}
          puedeValidar={puedeAprobar}
          pendiente={pendiente}
          onSubir={(fd) => correr(() => subirCertificado(fd), "Certificado adjunto: queda pendiente de validar")}
          onValidar={(valido, obs) => correr(() => validarCertificado(r.id, valido, obs), valido ? "Certificado válido: Esquema A" : "Certificado no válido: Esquema B")}
        />
        <Tarjeta titulo={`Hitos del esquema ${r.esquema}`} accion={datos.hitos.length > 0 && <Link href="/candidatos/plan-padrino/hitos?vista=todos" className="text-xs font-medium text-[#4F46E5] hover:underline">Bandeja de hitos</Link>}>
          {datos.hitos.length > 0 ? (
            <ul className="divide-y divide-[#F1F5F9] text-sm">
              {datos.hitos.map((h) => (
                <li key={h.id} className="flex items-start justify-between gap-3 py-2">
                  <span className="min-w-0 text-gray-700">
                    {h.numero}. {h.descripcion}
                    <span className="block text-xs text-gray-400">Se causa el {formatDateBogota(h.fecha_causacion)}</span>
                    {h.motivo && <span className="block text-xs text-gray-500">{h.motivo}</span>}
                    {h.fecha_pago && <span className="block text-xs text-emerald-700">Pagado {formatDateBogota(h.fecha_pago)} · {h.referencia_pago}</span>}
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="block font-medium tabular-nums text-gray-900">{COP.format(h.valor)}</span>
                    <HitoBadge estado={h.estado} />
                  </span>
                </li>
              ))}
            </ul>
          ) : (
          <ul className="divide-y divide-[#F1F5F9] text-sm">
            {hitos.map((h) => (
              <li key={h.numero} className="flex items-center justify-between gap-3 py-2">
                <span className="text-gray-700">
                  {h.numero}. {h.descripcion}
                  {h.requiere_desempeno && <span className="block text-xs text-gray-400">Exige marcar desempeño satisfactorio al aprobar</span>}
                </span>
                <span className="text-right">
                  <span className="block font-medium tabular-nums text-gray-900">{COP.format(h.valor)}</span>
                  <span className="block text-xs text-gray-400">{h.fechaCausacion ? `Se causa el ${formatDateBogota(h.fechaCausacion)}` : "Al contratar"}</span>
                </span>
              </li>
            ))}
          </ul>
          )}
          <p className="mt-2 text-xs text-gray-400">
            Cada hito se causa solo si a su fecha el referido sigue activo y el padrino mantiene contrato vigente. Gestivo los evalúa cada día después del sync de GEMA; los cumplidos pasan a la bandeja de aprobación y después a nómina.
          </p>
        </Tarjeta>
      </div>

      {puedeAprobar && decidiendo && (
        <Decision
          r={r}
          pendiente={pendiente}
          onDecidir={(decision, obs, excepcion) => correr(() => decidirElegibilidad({ id: r.id, decision, observacion: obs, excepcion }), decision === "elegible" ? "Referido elegible" : "Referido no elegible")}
          onNoContratado={(obs) => correr(() => cerrarNoContratado(r.id, obs), "Cerrado como no contratado")}
        />
      )}
      {puedeAprobar && !anulado && r.estado === "elegible" && (
        <CierreElegible pendiente={pendiente} procesoCerrado={proceso?.estado === "cierre"} onCerrar={(obs) => correr(() => cerrarNoContratado(r.id, obs), "Cerrado como no contratado")} />
      )}
      {r.elegibilidad_at && (
        <Tarjeta titulo="Decisión de elegibilidad">
          <p className="text-sm text-gray-700">
            {r.estado === "no_elegible" ? "No elegible" : r.elegibilidad_excepcion ? "Elegible por excepción" : "Elegible"} · {r.elegibilidad_por_email ?? "—"} · {formatDateTimeBogota(r.elegibilidad_at)}
          </p>
          {r.elegibilidad_observacion && <p className="mt-1 whitespace-pre-wrap text-sm text-gray-500">{r.elegibilidad_observacion}</p>}
        </Tarjeta>
      )}
      {r.cierre_observacion && (
        <Tarjeta titulo="Cierre sin contratación"><p className="whitespace-pre-wrap text-sm text-gray-600">{r.cierre_observacion}</p></Tarjeta>
      )}

      <Tarjeta titulo="Bitácora">
        <ol className="space-y-2 text-sm">
          {eventos.map((e) => (
            <li key={e.id} className="flex flex-wrap gap-x-3 border-b border-[#F8FAFC] pb-2 last:border-0">
              <span className="w-36 shrink-0 text-xs text-gray-400">{formatDateTimeBogota(e.created_at)}</span>
              <span className="text-gray-800">{ACCIONES[e.accion] ?? e.accion}</span>
              <span className="text-xs text-gray-500">{e.usuario_email ?? "—"}</span>
              {typeof e.detalle?.observacion === "string" && <span className="w-full text-xs text-gray-500 sm:pl-36">{e.detalle.observacion}</span>}
              {typeof e.detalle?.motivo === "string" && <span className="w-full text-xs text-gray-500 sm:pl-36">{e.detalle.motivo}</span>}
            </li>
          ))}
        </ol>
      </Tarjeta>

      {puedeAprobar && abierto && <Anular pendiente={pendiente} aprobados={datos.hitos.filter((h) => h.estado === "aprobado").length} onAnular={(m, cancelarAprobados) => correr(() => anularReferido(r.id, m, cancelarAprobados), "Registro anulado")} />}
    </div>
  );
}

function Tarjeta({ titulo, children, accion }: { titulo: string; children: React.ReactNode; accion?: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-[#E2E8F0] bg-white p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-gray-900">{titulo}</h2>
        {accion}
      </div>
      {children}
    </section>
  );
}

function Dato({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex gap-2 py-0.5 text-sm">
      <span className="w-32 shrink-0 text-gray-500">{k}</span>
      <span className="min-w-0 text-gray-800">{v}</span>
    </div>
  );
}

const ICONO = {
  cumple: <CircleCheck className="h-4 w-4 text-emerald-600" />,
  revisar: <CircleAlert className="h-4 w-4 text-amber-600" />,
  no_cumple: <CircleX className="h-4 w-4 text-red-600" />,
};

function TablaRequisitos({ titulo, items }: { titulo: string; items: Requisito[] }) {
  return (
    <div>
      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">{titulo}</p>
      <ul className="divide-y divide-[#F1F5F9]">
        {items.map((q) => (
          <li key={q.codigo} className="flex gap-3 py-2">
            <span className="mt-0.5" title={SEMAFORO_LABEL[q.estado]}>{ICONO[q.estado]}</span>
            <div className="min-w-0">
              <p className="text-sm text-gray-800"><span className="font-medium">{q.codigo}</span> · {q.titulo}</p>
              <p className="text-xs text-gray-500">{q.dato}</p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Validacion({ r, puedeRevalidar, pendiente, onRevalidar }: { r: Datos["referido"]; puedeRevalidar: boolean; pendiente: boolean; onRevalidar: () => void }) {
  const res = resumenValidacion(r.validacion);
  return (
    <Tarjeta
      titulo="Requisitos"
      accion={
        puedeRevalidar && (
          <Button variant="outline" size="sm" onClick={onRevalidar} disabled={pendiente}>
            <RefreshCw className="h-3.5 w-3.5" /> Revalidar con datos de hoy
          </Button>
        )
      }
    >
      <p className="mb-3 text-xs text-gray-500">
        Evaluados el {r.validacion?.evaluadoEl ? formatDateBogota(r.validacion.evaluadoEl) : "—"}: {res.cumple} cumplen, {res.revisar} requieren revisión, {res.noCumple} no cumplen.
        {res.noCumple > 0 && " Un requisito que no se cumple solo se aprueba como excepción documentada."}
      </p>
      <div className="grid gap-4 lg:grid-cols-2">
        <TablaRequisitos titulo="Padrino" items={r.validacion?.padrino ?? []} />
        <TablaRequisitos titulo="Referido" items={r.validacion?.referido ?? []} />
      </div>
    </Tarjeta>
  );
}

function Certificado({
  r, editable, puedeSubir, puedeValidar, pendiente, onSubir, onValidar,
}: {
  r: Datos["referido"];
  editable: boolean;
  puedeSubir: boolean;
  puedeValidar: boolean;
  pendiente: boolean;
  onSubir: (fd: FormData) => void;
  onValidar: (valido: boolean, obs: string) => void;
}) {
  const [obs, setObs] = useState("");
  const porValidar = r.certificado_ruta && !r.certificado_validado_at;
  return (
    <Tarjeta titulo="Certificado de experiencia y esquema">
      <p className="mb-3 text-xs text-gray-500">
        Esquema A si la coordinadora valida un certificado de experiencia en transporte público urbano de Barranquilla; si no, Esquema B. El esquema solo cambia antes del primer hito.
      </p>
      {r.certificado_ruta ? (
        <div className="mb-3 flex items-center justify-between gap-3 rounded-lg border border-[#E2E8F0] px-3 py-2">
          <a href={`/api/candidatos/plan-padrino/certificado/${r.id}`} target="_blank" rel="noreferrer" className="inline-flex min-w-0 items-center gap-2 text-sm text-[#4F46E5] hover:underline">
            <FileText className="h-4 w-4 shrink-0" /> <span className="truncate">{r.certificado_nombre ?? "Certificado"}</span>
          </a>
          <span className="shrink-0 text-xs text-gray-500">
            {r.certificado_validado_at
              ? `${r.experiencia_certificada ? "Válido" : "No válido"} · ${r.certificado_validado_por_email ?? ""}`
              : "Por validar"}
          </span>
        </div>
      ) : (
        <p className="mb-3 text-sm text-gray-500">Sin certificado adjunto.</p>
      )}

      {editable && puedeSubir && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            fd.set("id", r.id);
            onSubir(fd);
            e.currentTarget.reset();
          }}
          className="mb-3 flex flex-wrap items-center gap-2"
        >
          <input type="file" name="archivo" accept="application/pdf,image/jpeg,image/png" required className="text-xs" />
          <Button type="submit" variant="outline" size="sm" disabled={pendiente}>{r.certificado_ruta ? "Reemplazar" : "Adjuntar"}</Button>
        </form>
      )}

      {editable && puedeValidar && porValidar && (
        <div className="space-y-2 border-t border-[#F1F5F9] pt-3">
          <textarea value={obs} onChange={(e) => setObs(e.target.value)} rows={2} className={areaCls} placeholder="Observación (obligatoria si no es válido)" />
          <div className="flex gap-2">
            <Button size="sm" disabled={pendiente} onClick={() => onValidar(true, obs)} className="bg-emerald-600 text-white hover:bg-emerald-700">Válido · Esquema A</Button>
            <Button size="sm" variant="outline" disabled={pendiente || !obs.trim()} onClick={() => onValidar(false, obs)}>No válido · Esquema B</Button>
          </div>
        </div>
      )}
    </Tarjeta>
  );
}

function Decision({
  r, pendiente, onDecidir, onNoContratado,
}: {
  r: Datos["referido"];
  pendiente: boolean;
  onDecidir: (d: "elegible" | "no_elegible", obs: string, excepcion: boolean) => void;
  onNoContratado: (obs: string) => void;
}) {
  const res = resumenValidacion(r.validacion);
  const [obs, setObs] = useState("");
  const [excepcion, setExcepcion] = useState(false);
  const bloqueado = res.noCumple > 0 && !excepcion;
  const pideObs = res.noCumple > 0 || res.revisar > 0;
  return (
    <Tarjeta titulo="Decisión de elegibilidad">
      <textarea
        value={obs}
        onChange={(e) => setObs(e.target.value)}
        rows={3}
        maxLength={2000}
        className={areaCls}
        placeholder={pideObs ? "Observación obligatoria: qué se revisó de los requisitos en revisión o por qué se aprueba como excepción" : "Observación (opcional al aprobar, obligatoria al rechazar)"}
      />
      {res.noCumple > 0 && (
        <label className="mt-2 flex items-start gap-2 text-sm text-gray-700">
          <input type="checkbox" checked={excepcion} onChange={(e) => setExcepcion(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[#4F46E5]" />
          Aprobar como excepción documentada ({res.noCumple} requisito(s) no se cumplen)
        </label>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        <Button disabled={pendiente || bloqueado || (pideObs && !obs.trim())} onClick={() => onDecidir("elegible", obs, excepcion)} className="bg-[#4F46E5] text-white hover:bg-[#4338CA]">
          Aprobar elegibilidad
        </Button>
        <Button variant="outline" disabled={pendiente || !obs.trim()} onClick={() => onDecidir("no_elegible", obs, false)}>
          No elegible
        </Button>
        <Button variant="ghost" disabled={pendiente || !obs.trim()} onClick={() => onNoContratado(obs)} className="ml-auto text-gray-600">
          Cerrar como no contratado
        </Button>
      </div>
    </Tarjeta>
  );
}

function CierreElegible({ pendiente, procesoCerrado, onCerrar }: { pendiente: boolean; procesoCerrado: boolean; onCerrar: (obs: string) => void }) {
  const [obs, setObs] = useState("");
  return (
    <Tarjeta titulo="Cerrar sin contratación">
      <p className="mb-2 text-xs text-gray-500">
        {procesoCerrado
          ? "El proceso de contratación se cerró sin contratar: cierre el referido sin bonificación."
          : "Si el referido no llegó a contratarse, ciérrelo sin bonificación."}
      </p>
      <textarea value={obs} onChange={(e) => setObs(e.target.value)} rows={2} className={areaCls} placeholder="Observación del cierre" />
      <div className="mt-2 flex justify-end">
        <Button size="sm" variant="outline" disabled={pendiente || !obs.trim()} onClick={() => onCerrar(obs)}>Cerrar como no contratado</Button>
      </div>
    </Tarjeta>
  );
}

function Anular({ pendiente, aprobados, onAnular }: { pendiente: boolean; aprobados: number; onAnular: (motivo: string, cancelarAprobados: boolean) => void }) {
  const [abierto, setAbierto] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [confirmaAprobados, setConfirmaAprobados] = useState(false);
  if (!abierto) {
    return (
      <div className="text-right">
        <button onClick={() => setAbierto(true)} className="text-xs font-medium text-red-600 hover:underline">Anular registro…</button>
      </div>
    );
  }
  return (
    <Tarjeta titulo="Anular registro">
      <p className="mb-2 text-xs text-gray-500">El registro no se borra: queda anulado con su motivo y la cédula del referido se libera para un registro nuevo.</p>
      {aprobados > 0 && (
        <label className="mb-2 flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-800">
          <input type="checkbox" checked={confirmaAprobados} onChange={(e) => setConfirmaAprobados(e.target.checked)} className="mt-0.5" />
          <span>
            Este referido tiene <strong>{aprobados} hito(s) aprobado(s)</strong>, posiblemente ya exportados a nómina. Al anular se cancelan y salen de la bandeja de pago: confírmelo con nómina antes de seguir.
          </span>
        </label>
      )}
      <textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={2} className={areaCls} placeholder="Motivo de la anulación" />
      <div className="mt-2 flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={() => setAbierto(false)}>Cancelar</Button>
        <Button size="sm" disabled={pendiente || !motivo.trim() || (aprobados > 0 && !confirmaAprobados)} onClick={() => onAnular(motivo, aprobados > 0)} className="bg-red-600 text-white hover:bg-red-700">Anular</Button>
      </div>
    </Tarjeta>
  );
}
