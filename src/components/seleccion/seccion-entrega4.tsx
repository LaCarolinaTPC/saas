"use client";

/**
 * Selección, entrega 4, en la ficha del candidato: día de contratación
 * (psicotécnica, entrevista, inducción). Solo registro: no cambia la etapa.
 */
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Brain, CalendarCheck, ExternalLink, MessagesSquare, ScanText, UserCheck } from "lucide-react";
import {
  cambiarClaseDocumento,
  citarPsicotecnicaFicha,
  datosDiaContratacion,
  documentosLeidos,
  revisarDocumentoLeido,
  marcarAsistenciaPsicoFicha,
  registrarEntrevistaFicha,
  registrarInduccionFicha,
  registrarPsicoExternaFicha,
} from "@/app/(dashboard)/candidatos/entrega4-actions";
import { anularAdjuntoFicha } from "@/app/(dashboard)/candidatos/entrega3-actions";
import type { DiaContratacion } from "@/lib/seleccion/dia-contratacion-servidor";
import type { DocumentoLeidoVista } from "@/lib/seleccion/lectura/revision-servidor";
import { CLASES, NOMBRE_CLASE, etiquetaCampo } from "@/lib/seleccion/lectura/esquema";
import { RESULTADOS_PSICO_EXTERNA } from "@/lib/seleccion/dia-contratacion";
import { ESTADO_CITA_LABEL, citaVigente, hhmm } from "@/lib/seleccion/agenda";
import { BotonSubir, ListaArchivos, botonPri, botonSec, campo, fechaHora, useAccion, useEntrega3 } from "./seccion-entrega3";

/** Campo de ancho fijo: sin el w-full del estilo base, que gana sobre w-40/w-56. */
const campoCorto = campo.replace("w-full ", "");
const SIN_MIGRACION = "Falta aplicar la migración de la entrega 4 de selección (20261121030237).";

/** Hoy en Bogotá, AAAA-MM-DD. */
const hoyBogota = () => new Date(Date.now() - 5 * 3_600_000).toISOString().slice(0, 10);
/** Ahora en Bogotá para un <input type="datetime-local">. */
const ahoraLocal = () => new Date(Date.now() - 5 * 3_600_000).toISOString().slice(0, 16);
const fechaCorta = (d: string) => new Date(`${d}T12:00:00-05:00`).toLocaleDateString("es-CO", { weekday: "short", day: "numeric", month: "short" });

function useDiaContratacion(procesoId: string, version: number) {
  const [datos, setDatos] = useState<(DiaContratacion & { puedeEditar: boolean }) | { error: string } | null>(null);
  const [propia, setPropia] = useState(0);
  useEffect(() => {
    let vivo = true;
    datosDiaContratacion(procesoId)
      .then((d) => vivo && setDatos(d))
      .catch(() => undefined);
    return () => {
      vivo = false;
    };
  }, [procesoId, version, propia]);
  const recargar = useCallback(() => setPropia((n) => n + 1), []);
  return { datos, recargar };
}

export function SeccionDiaContratacion({ procesoId, abierto, version }: { procesoId: string; abierto: boolean; version: number }) {
  const { datos, recargar } = useDiaContratacion(procesoId, version);
  const e3 = useEntrega3(procesoId, version);
  const recargarE3 = e3.recargar;
  const recargarTodo = useCallback(() => {
    recargar();
    recargarE3();
  }, [recargar, recargarE3]);
  const { mensaje, ocupado, correr } = useAccion(recargarTodo);
  const [cita, setCita] = useState({ fecha: "", hora: "08:00", lugar: "" });
  const [externa, setExterna] = useState({ resultado: "apto", fecha: "", puntaje: "", entidad: "" });
  const [verExterna, setVerExterna] = useState(false);
  const [entrevista, setEntrevista] = useState({ cuando: "", nota: "" });
  const [induccion, setInduccion] = useState("");

  if (!datos) return <p className="text-sm text-gray-500">Cargando…</p>;
  if ("error" in datos) return <p className="text-sm text-red-700">{datos.error}</p>;
  if (!datos.disponible) return <p className="text-sm text-gray-500">{SIN_MIGRACION}</p>;
  const editar = datos.puedeEditar;
  const { psicotecnica: ps } = datos;
  const v = ps.vigente;
  const archivosPsico = (e3.datos?.carpeta?.otros ?? []).filter((a) => a.tipo === "psicotecnica");

  return (
    <div className="space-y-5">
      <p className="text-xs text-gray-500">Solo registro: nada de esto cambia la etapa del proceso. La psicotécnica apta es condición para contratar si así está en Tiempos y reglas.</p>

      {/* ── Psicotécnica ── */}
      <section className="rounded-lg border border-[#F1F5F9] p-3">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h4 className="flex items-center gap-1.5 text-sm font-semibold text-gray-900">
            <Brain className="h-4 w-4" /> Psicotécnica
          </h4>
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-medium ${
              v.resultado === "apto" ? "bg-emerald-50 text-emerald-700" : v.resultado === "no_apto" ? "bg-red-50 text-red-700" : "bg-gray-100 text-gray-600"
            }`}
          >
            {v.detalle}
          </span>
        </div>

        <div className="space-y-2 text-sm">
          {ps.gestivo ? (
            <p className="text-gray-700">
              Prueba de Gestivo: <strong>{ps.gestivo.concepto === "apto" ? "apto" : "no apto"}</strong>
              {ps.gestivo.puntaje != null ? ` · puntaje ${ps.gestivo.puntaje}` : ""}
              {ps.gestivo.por ? ` · concepto de ${ps.gestivo.por}` : ""}
              {ps.gestivo.en ? ` el ${fechaHora(ps.gestivo.en)}` : ""}{" "}
              <Link href={`/psicosensotecnica/${ps.gestivo.intentoId}`} className="inline-flex items-center gap-0.5 text-[#4F46E5] hover:underline">
                ver informe <ExternalLink className="h-3 w-3" />
              </Link>
            </p>
          ) : ps.gestivoPorRevisar ? (
            <p className="text-amber-700">
              Hizo la prueba de Gestivo y espera el concepto de la psicóloga.{" "}
              <Link href={`/psicosensotecnica/${ps.gestivoPorRevisar}`} className="inline-flex items-center gap-0.5 text-[#4F46E5] hover:underline">
                revisar <ExternalLink className="h-3 w-3" />
              </Link>
            </p>
          ) : (
            <p className="text-gray-500">No ha hecho la prueba de Gestivo. Se asigna en la tarjeta «Prueba psicosensotécnica» de esta ficha.</p>
          )}

          {/* Cita */}
          {datos.cita && (
            <div className="flex flex-wrap items-center gap-2 rounded-md bg-gray-50 px-2 py-1.5 text-xs text-gray-700">
              <CalendarCheck className="h-3.5 w-3.5" />
              Cita: {fechaCorta(datos.cita.fecha)} a las {hhmm(datos.cita.hora)}
              {datos.cita.lugar ? ` · ${datos.cita.lugar}` : " · en la sede"} · {ESTADO_CITA_LABEL[datos.cita.estado]}
              {datos.cita.recordatorio_at ? " · recordatorio enviado" : ""}
              {editar && citaVigente(datos.cita) && (
                <>
                  <button type="button" className="text-emerald-700 underline" disabled={ocupado} onClick={() => correr(() => marcarAsistenciaPsicoFicha(datos.cita!.id, true), "Registrado: llegó.")}>
                    llegó
                  </button>
                  <button type="button" className="text-red-700 underline" disabled={ocupado} onClick={() => correr(() => marcarAsistenciaPsicoFicha(datos.cita!.id, false), "Registrado: no asistió.")}>
                    no asistió
                  </button>
                </>
              )}
            </div>
          )}
          {editar && abierto && (
            <form
              className="flex flex-wrap items-end gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                correr(() => citarPsicotecnicaFicha(procesoId, cita.fecha, cita.hora, cita.lugar), "Cita creada. El recordatorio sale el mismo día.");
              }}
            >
              <label className="text-xs text-gray-500">
                {datos.cita && citaVigente(datos.cita) ? "Mover la cita" : "Citar"}
                <input type="date" required min={hoyBogota()} value={cita.fecha} onChange={(e) => setCita({ ...cita, fecha: e.target.value })} className={`${campoCorto} mt-0.5 w-40`} />
              </label>
              <label className="text-xs text-gray-500">
                Hora
                <input type="time" required value={cita.hora} onChange={(e) => setCita({ ...cita, hora: e.target.value })} className={`${campoCorto} mt-0.5 w-28`} />
              </label>
              <label className="min-w-[12rem] flex-1 text-xs text-gray-500">
                Lugar (vacío = la sede)
                <input value={cita.lugar} maxLength={200} onChange={(e) => setCita({ ...cita, lugar: e.target.value })} placeholder="IPS, dirección…" className={`${campo} mt-0.5`} />
              </label>
              <button type="submit" className={botonSec} disabled={ocupado}>
                Guardar cita
              </button>
            </form>
          )}

          {/* Resultado de una IPS */}
          {ps.externa ? (
            <div className="text-gray-700">
              Resultado de IPS: <strong>{RESULTADOS_PSICO_EXTERNA[ps.externa.resultado]}</strong>
              {ps.externa.entidad ? ` · ${ps.externa.entidad}` : ""}
              {ps.externa.fecha ? ` · ${fechaCorta(ps.externa.fecha)}` : ""}
              {ps.externa.puntaje != null ? ` · puntaje ${ps.externa.puntaje}` : ""}
              {ps.externa.por ? <span className="text-xs text-gray-400"> · registró {ps.externa.por}</span> : null}
              {editar && (
                <button
                  type="button"
                  className="ml-2 text-xs text-gray-400 underline hover:text-gray-600"
                  disabled={ocupado}
                  onClick={() => confirm("¿Borrar el resultado de la IPS?") && correr(() => registrarPsicoExternaFicha(procesoId, null), "Resultado borrado.")}
                >
                  borrar
                </button>
              )}
            </div>
          ) : (
            editar &&
            (verExterna ? (
              <form
                className="grid gap-2 rounded-md border border-dashed border-[#E2E8F0] p-2 sm:grid-cols-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  correr(() => registrarPsicoExternaFicha(procesoId, externa), "Resultado registrado.", () => setVerExterna(false));
                }}
              >
                <label className="text-xs text-gray-500">
                  Resultado
                  <select value={externa.resultado} onChange={(e) => setExterna({ ...externa, resultado: e.target.value })} className={`${campo} mt-0.5`}>
                    {Object.entries(RESULTADOS_PSICO_EXTERNA).map(([k, t]) => (
                      <option key={k} value={k}>
                        {t}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-xs text-gray-500">
                  Fecha
                  <input type="date" required max={hoyBogota()} value={externa.fecha} onChange={(e) => setExterna({ ...externa, fecha: e.target.value })} className={`${campo} mt-0.5`} />
                </label>
                <label className="text-xs text-gray-500">
                  Puntaje (opcional)
                  <input inputMode="decimal" value={externa.puntaje} onChange={(e) => setExterna({ ...externa, puntaje: e.target.value })} className={`${campo} mt-0.5`} />
                </label>
                <label className="text-xs text-gray-500">
                  IPS
                  <input value={externa.entidad} maxLength={120} onChange={(e) => setExterna({ ...externa, entidad: e.target.value })} className={`${campo} mt-0.5`} />
                </label>
                <div className="flex gap-2 sm:col-span-4">
                  <button type="submit" className={botonPri} disabled={ocupado}>
                    Guardar resultado
                  </button>
                  <button type="button" className={botonSec} onClick={() => setVerExterna(false)}>
                    Cancelar
                  </button>
                </div>
              </form>
            ) : (
              <button type="button" className="text-xs text-[#4F46E5] hover:underline" onClick={() => setVerExterna(true)}>
                Registrar el resultado de una IPS
              </button>
            ))
          )}
          <ListaArchivos archivos={archivosPsico} puedeEditar={editar} onAnular={(id, m) => correr(() => anularAdjuntoFicha(id, m), "Archivo anulado.")} />
          {editar && <BotonSubir procesoId={procesoId} tipo="psicotecnica" texto="Subir el PDF del resultado" onSubido={(r) => correr(async () => r, "Archivo subido.")} />}
        </div>
      </section>

      {/* ── Entrevista ── */}
      <section className="rounded-lg border border-[#F1F5F9] p-3">
        <h4 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-gray-900">
          <MessagesSquare className="h-4 w-4" /> Entrevista
        </h4>
        {datos.entrevista.at ? (
          <div className="text-sm text-gray-700">
            Hecha el {fechaHora(datos.entrevista.at)}
            {datos.entrevista.por ? <span className="text-xs text-gray-400"> · {datos.entrevista.por}</span> : null}
            {datos.entrevista.nota && <p className="mt-1 whitespace-pre-wrap text-xs text-gray-600">{datos.entrevista.nota}</p>}
            {editar && (
              <button
                type="button"
                className="mt-1 block text-xs text-gray-400 underline hover:text-gray-600"
                disabled={ocupado}
                onClick={() => confirm("¿Borrar el registro de la entrevista?") && correr(() => registrarEntrevistaFicha(procesoId, "", "", true), "Registro borrado.")}
              >
                borrar
              </button>
            )}
          </div>
        ) : editar ? (
          <form
            className="space-y-2"
            onSubmit={(e) => {
              e.preventDefault();
              correr(() => registrarEntrevistaFicha(procesoId, entrevista.cuando, entrevista.nota), "Entrevista registrada.");
            }}
          >
            <label className="block text-xs text-gray-500">
              Cuándo (vacío = ahora)
              <input type="datetime-local" max={ahoraLocal()} value={entrevista.cuando} onChange={(e) => setEntrevista({ ...entrevista, cuando: e.target.value })} className={`${campoCorto} mt-0.5 w-56`} />
            </label>
            <textarea
              value={entrevista.nota}
              onChange={(e) => setEntrevista({ ...entrevista, nota: e.target.value })}
              rows={2}
              maxLength={2000}
              placeholder="Observaciones (opcional)"
              className={campo}
            />
            <button type="submit" className={botonSec} disabled={ocupado}>
              Registrar entrevista
            </button>
          </form>
        ) : (
          <p className="text-sm text-gray-500">Sin registrar.</p>
        )}
      </section>

      {/* ── Inducción ── */}
      <section className="rounded-lg border border-[#F1F5F9] p-3">
        <h4 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-gray-900">
          <UserCheck className="h-4 w-4" /> Inducción
        </h4>
        {datos.induccion.at ? (
          <div className="text-sm text-gray-700">
            Hecha el {fechaHora(datos.induccion.at)}
            {datos.induccion.por ? <span className="text-xs text-gray-400"> · {datos.induccion.por}</span> : null}
            {editar && (
              <button
                type="button"
                className="ml-2 text-xs text-gray-400 underline hover:text-gray-600"
                disabled={ocupado}
                onClick={() => confirm("¿Borrar el registro de la inducción?") && correr(() => registrarInduccionFicha(procesoId, "", true), "Registro borrado.")}
              >
                borrar
              </button>
            )}
          </div>
        ) : editar ? (
          <form
            className="flex flex-wrap items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              correr(() => registrarInduccionFicha(procesoId, induccion), "Inducción registrada.");
            }}
          >
            <label className="text-xs text-gray-500">
              Cuándo (vacío = ahora)
              <input type="datetime-local" max={ahoraLocal()} value={induccion} onChange={(e) => setInduccion(e.target.value)} className={`${campoCorto} mt-0.5 w-56`} />
            </label>
            <button type="submit" className={botonSec} disabled={ocupado}>
              Registrar inducción
            </button>
          </form>
        ) : (
          <p className="text-sm text-gray-500">Sin registrar.</p>
        )}
      </section>

      {mensaje && <p className="text-xs text-gray-600">{mensaje}</p>}
    </div>
  );
}

// ── Documentos leídos (R5) ───────────────────────────────────────────────────

type Decision = "aceptado" | "corregido" | "rechazado";
interface EstadoCampo {
  decision: Decision | null;
  valor: string;
}

function textoValor(campo: string, v: unknown): string {
  if (Array.isArray(v)) {
    if (campo === "experiencias") {
      return (v as { empresa?: string | null; cargo?: string | null; desde?: string | null; hasta?: string | null; vehiculo?: string | null; conduccion?: boolean }[])
        .map((e) => [e.empresa, e.cargo, `${e.desde ?? "¿?"} a ${e.hasta ?? "¿?"}`, e.vehiculo, e.conduccion ? "conducción" : null].filter(Boolean).join(" · "))
        .join("\n");
    }
    if (campo === "referencias") {
      return (v as { nombre?: string | null; telefono?: string | null; tipo?: string; empresa?: string | null }[])
        .map((r) => [r.nombre, r.telefono, r.tipo, r.empresa].filter(Boolean).join(" · "))
        .join("\n");
    }
    return v.join(", ");
  }
  return v == null ? "" : String(v);
}

const COLOR_CONFIANZA: Record<string, string> = {
  alta: "bg-emerald-50 text-emerald-700",
  media: "bg-amber-50 text-amber-700",
  baja: "bg-red-50 text-red-700",
};

const ESTADO_LECTURA: Record<DocumentoLeidoVista["estado"], string> = {
  leido: "Leído",
  pendiente: "Leyendo…",
  ilegible: "No se pudo leer",
  error: "Error al leer",
  omitido: "Sin leer",
};

const TEXTO_DECISION: Record<Decision, string> = { aceptado: "Aceptar", corregido: "Corregir", rechazado: "Rechazar" };

function TarjetaDocumento({ procesoId, doc, editar, onGuardado }: { procesoId: string; doc: DocumentoLeidoVista; editar: boolean; onGuardado: () => void }) {
  const { mensaje, ocupado, correr } = useAccion(onGuardado);
  const [estado, setEstado] = useState<Record<string, EstadoCampo>>(() =>
    Object.fromEntries(doc.campos.map((c) => [c.campo, { decision: c.decision, valor: textoValor(c.campo, c.decision === "corregido" ? c.valor_final : c.valor) }]))
  );
  const poner = (campo: string, cambio: Partial<EstadoCampo>) => setEstado((e) => ({ ...e, [campo]: { ...e[campo], ...cambio } }));
  const guardar = (todo?: Decision) => {
    const decisiones: { campo: string; decision: Decision; valor_final?: string }[] = [];
    for (const c of doc.campos) {
      if (c.calculado) continue;
      const e = estado[c.campo];
      const decision = todo ?? e?.decision;
      if (decision) decisiones.push({ campo: c.campo, decision, valor_final: decision === "corregido" ? e.valor : undefined });
    }
    correr(() => revisarDocumentoLeido(procesoId, doc.id, decisiones), "Revisión guardada. Lo aceptado se aplicó al proceso (solo los datos vacíos).");
  };
  const cedulaNoCoincide = doc.campos.find((c) => c.campo === "cedula_coincide" && c.valor === "no");

  return (
    <li className="rounded-lg border border-[#E2E8F0] p-3">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        {editar ? (
          <select
            aria-label="Tipo de documento"
            value={doc.clase}
            disabled={ocupado}
            onChange={(e) => correr(() => cambiarClaseDocumento(procesoId, doc.id, e.target.value), "Tipo cambiado.")}
            className="rounded-md border border-[#E2E8F0] bg-white px-2 py-1 text-sm font-semibold text-gray-900"
          >
            {CLASES.map((k) => (
              <option key={k} value={k}>
                {NOMBRE_CLASE[k]}
              </option>
            ))}
          </select>
        ) : (
          <span className="text-sm font-semibold text-gray-900">{NOMBRE_CLASE[doc.clase]}</span>
        )}
        <span
          className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
            doc.estado === "leido" ? "bg-[#EEF2FF] text-[#4F46E5]" : doc.estado === "pendiente" ? "bg-gray-100 text-gray-600" : "bg-amber-50 text-amber-700"
          }`}
        >
          {ESTADO_LECTURA[doc.estado]}
        </span>
        {doc.revisadoAt && (
          <span className="text-xs text-gray-500">
            Revisado por {doc.revisadoPor} · {fechaHora(doc.revisadoAt)}
          </span>
        )}
        <span className="ml-auto text-[11px] text-gray-400">{fechaHora(doc.createdAt)}</span>
      </div>
      {doc.resumen && <p className="mb-2 text-xs text-gray-600">{doc.resumen}</p>}
      {doc.error && <p className="mb-2 text-xs text-red-700">{doc.error}</p>}
      {cedulaNoCoincide?.nota && <p className="mb-2 rounded-md border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-800">{cedulaNoCoincide.nota}</p>}

      <div className="grid gap-3 md:grid-cols-[minmax(0,14rem)_1fr]">
        <div className="flex flex-wrap gap-2 md:flex-col">
          {doc.archivos.map((a) =>
            a.url && a.mime?.startsWith("image/") ? (
              <a key={a.lecturaId} href={a.url} target="_blank" rel="noreferrer" className="block">
                {/* eslint-disable-next-line @next/next/no-img-element -- URL firmada del bucket privado */}
                <img src={a.url} alt={`${NOMBRE_CLASE[doc.clase]} enviada por WhatsApp`} className="max-h-48 w-auto rounded border border-[#F1F5F9]" />
              </a>
            ) : a.url ? (
              <a key={a.lecturaId} href={a.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-[#4F46E5] hover:underline">
                {a.nombre ?? "Abrir el PDF"} <ExternalLink className="h-3 w-3" />
              </a>
            ) : (
              <span key={a.lecturaId} className="text-xs text-gray-400">
                Archivo no disponible
              </span>
            )
          )}
        </div>

        {doc.campos.length === 0 ? (
          <p className="text-sm text-gray-500">{doc.estado === "leido" ? "No hay datos que revisar." : "Sin datos leídos."}</p>
        ) : (
          <ul className="space-y-2">
            {doc.campos.map((c) => {
              const e = estado[c.campo] ?? { decision: null, valor: "" };
              const esLista = Array.isArray(c.valor);
              const opciones: Decision[] = esLista ? ["aceptado", "rechazado"] : ["aceptado", "corregido", "rechazado"];
              return (
                <li key={c.campo} className="rounded-md bg-gray-50 px-2 py-1.5 text-sm">
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <span className="text-xs font-medium text-gray-500">{etiquetaCampo(doc.clase, c.campo)}</span>
                    {c.calculado ? (
                      <span className="rounded bg-gray-200 px-1.5 text-[10px] text-gray-600">calculado</span>
                    ) : (
                      <span className={`rounded px-1.5 text-[10px] ${COLOR_CONFIANZA[c.confianza]}`}>confianza {c.confianza}</span>
                    )}
                  </div>
                  {e.decision === "corregido" && !esLista ? (
                    <input value={e.valor} onChange={(ev) => poner(c.campo, { valor: ev.target.value })} className={`${campo} mt-1`} aria-label={`Corregir ${etiquetaCampo(doc.clase, c.campo)}`} />
                  ) : (
                    <p className={`whitespace-pre-wrap text-gray-900 ${e.decision === "rechazado" ? "line-through opacity-50" : ""}`}>{textoValor(c.campo, c.valor)}</p>
                  )}
                  {c.evidencia && (
                    <p className="text-[11px] text-gray-400">
                      Visto: «{c.evidencia}»{c.pagina ? ` · pág. ${c.pagina}` : ""}
                    </p>
                  )}
                  {c.nota && <p className="text-[11px] text-amber-700">{c.nota}</p>}
                  {editar && !c.calculado && (
                    <div className="mt-1 flex gap-1 text-xs" role="group" aria-label="Decisión">
                      {opciones.map((d) => (
                        <button
                          key={d}
                          type="button"
                          onClick={() => poner(c.campo, { decision: e.decision === d ? null : d })}
                          aria-pressed={e.decision === d}
                          className={`rounded border px-2 py-0.5 ${
                            e.decision === d
                              ? d === "rechazado"
                                ? "border-red-300 bg-red-50 text-red-700"
                                : "border-[#4F46E5] bg-[#EEF2FF] text-[#4F46E5]"
                              : "border-[#E2E8F0] text-gray-600 hover:bg-white"
                          }`}
                        >
                          {TEXTO_DECISION[d]}
                        </button>
                      ))}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {editar && doc.campos.some((c) => !c.calculado) && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button type="button" className={botonPri} disabled={ocupado} onClick={() => guardar()}>
            Guardar revisión
          </button>
          <button type="button" className={botonSec} disabled={ocupado} onClick={() => guardar("aceptado")}>
            Aceptar todo
          </button>
          <button type="button" className={botonSec} disabled={ocupado} onClick={() => guardar("rechazado")}>
            Rechazar todo
          </button>
        </div>
      )}
      {mensaje && <p className="mt-2 text-xs text-gray-600">{mensaje}</p>}
    </li>
  );
}

export function SeccionDocumentosLeidos({ procesoId, version }: { procesoId: string; version: number }) {
  const [datos, setDatos] = useState<{ docs: DocumentoLeidoVista[] | null; puedeEditar: boolean } | { error: string } | null>(null);
  const [propia, setPropia] = useState(0);
  useEffect(() => {
    let vivo = true;
    documentosLeidos(procesoId)
      .then((d) => vivo && setDatos(d))
      .catch(() => undefined);
    return () => {
      vivo = false;
    };
  }, [procesoId, version, propia]);
  const recargar = useCallback(() => setPropia((n) => n + 1), []);

  if (!datos) return null;
  if ("error" in datos) return <p className="text-sm text-red-700">{datos.error}</p>;
  // Sin la migración de la entrega 4 no se muestra nada.
  if (datos.docs == null) return null;
  const porRevisar = datos.docs.filter((d) => d.estado === "leido" && !d.revisadoAt && d.campos.some((c) => !c.calculado)).length;

  return (
    <section>
      <h4 className="mb-1 flex items-center gap-1.5 text-sm font-semibold text-gray-900">
        <ScanText className="h-4 w-4" /> Documentos leídos
        {porRevisar > 0 && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800">{porRevisar} por revisar</span>}
      </h4>
      <p className="mb-2 text-xs text-gray-500">
        Lo que la IA leyó de las fotos y PDF que envió por WhatsApp. Es una propuesta: lo que acepte llena los datos vacíos del proceso, crea las referencias y marca el documento como recibido en la carpeta.
      </p>
      {datos.docs.length === 0 ? (
        <p className="text-sm text-gray-500">Todavía no se ha leído ningún documento.</p>
      ) : (
        <ul className="space-y-3">
          {datos.docs.map((d) => (
            <TarjetaDocumento key={`${d.id}-${d.revisadoAt ?? ""}-${d.clase}`} procesoId={procesoId} doc={d} editar={datos.puedeEditar} onGuardado={recargar} />
          ))}
        </ul>
      )}
    </section>
  );
}
