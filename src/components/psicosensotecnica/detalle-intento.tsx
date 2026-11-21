/**
 * Resultado de una prueba psicosensotécnica, para la psicóloga: alertas en
 * lenguaje llano y las métricas de cada prueba frente a su umbral. Sin hooks:
 * sirve en el panel de la bandeja (cliente) y en la página completa (servidor).
 */

import { Fragment } from "react";
import { NOMBRE_PRUEBA } from "@/lib/psicosensotecnica/bateria";
import { NOMBRE_BANDA, type Banda, type InformePrueba } from "@/lib/psicosensotecnica/calificacion";
import { estadoLegible, type IntentoDetalle } from "@/lib/psicosensotecnica/tipos";

export const fechaHora = (iso: string | null) =>
  iso ? new Intl.DateTimeFormat("es-CO", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Bogota" }).format(new Date(iso)) : "—";

export function colorEstado(i: { estado: string; concepto: string | null; sugerencia?: string | null }): string {
  if (i.estado === "terminado") {
    if (i.concepto === "apto") return "bg-green-50 text-green-700";
    if (i.concepto === "no_apto") return "bg-red-50 text-red-700";
    return "bg-amber-50 text-amber-800";
  }
  if (i.estado === "anulado" || i.estado === "abandonado") return "bg-gray-100 text-gray-500";
  return "bg-sky-50 text-sky-700";
}

const COLOR_BANDA: Record<Banda, string> = {
  recomendado: "border-green-200 bg-green-50 text-green-800",
  con_sugerencias: "border-amber-200 bg-amber-50 text-amber-900",
  no_recomendado: "border-red-200 bg-red-50 text-red-800",
};

/** Cabecera del perfil del cargo y de la integridad: ajuste, banda y rasgo predominante. */
function ResumenInforme({ prueba, informe }: { prueba: string; informe: InformePrueba }) {
  return (
    <div className={`mt-2 rounded-lg border p-3 text-sm ${COLOR_BANDA[informe.banda]}`}>
      <p className="font-semibold">
        {prueba === "perfil" ? "Ajuste al perfil del cargo" : "Resultado de integridad"}: {informe.ajuste}% · {NOMBRE_BANDA[informe.banda]}
      </p>
      {informe.rasgoPredominante && (
        <p className="mt-1">
          Rasgo predominante: <strong>{informe.rasgoPredominante.nombre}</strong>. {informe.rasgoPredominante.descripcion}
        </p>
      )}
      <p className="mt-1 text-xs opacity-80">Orientativo: el perfil esperado es configurable y no hay baremos validados. El concepto es de la psicóloga.</p>
    </div>
  );
}

export function DetalleIntento({ intento }: { intento: IntentoDetalle }) {
  const duracion =
    intento.iniciadoEn && intento.terminadoEn ? Math.round((new Date(intento.terminadoEn).getTime() - new Date(intento.iniciadoEn).getTime()) / 60_000) : null;
  const datos: [string, string][] = [
    ["Cédula", intento.cedula],
    ["Celular", intento.celular ?? "—"],
    ["Origen", intento.origen === "candidato" ? "Candidato" : "Libre"],
    ["Asignada", intento.asignadoEn ? `${fechaHora(intento.asignadoEn)} · ${intento.asignadoPorEmail ?? ""}` : "No (entró por su cuenta)"],
    ["Presentada", intento.terminadoEn ? `${fechaHora(intento.terminadoEn)}${duracion != null ? ` · ${duracion} min` : ""}` : intento.iniciadoEn ? `Empezó ${fechaHora(intento.iniciadoEn)}` : "—"],
    ["Dispositivo", [intento.equipo ?? "Equipo sin vincular", intento.tipoEntrada === "tactil" ? "pantalla táctil" : intento.tipoEntrada === "raton" ? "ratón" : null].filter(Boolean).join(" · ")],
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${colorEstado(intento)}`}>{estadoLegible(intento)}</span>
        {intento.puntajeGlobal != null && <span className="text-sm text-gray-600">Puntaje orientativo: {intento.puntajeGlobal} / 100</span>}
      </div>

      <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
        {datos.map(([k, v]) => (
          <div key={k} className="min-w-0">
            <dt className="text-xs text-gray-500">{k}</dt>
            <dd className="break-words font-medium text-gray-800">{v}</dd>
          </div>
        ))}
      </dl>

      {intento.estado === "terminado" && (
        <div className={`rounded-lg border p-3 text-sm ${intento.alertas.length ? "border-amber-200 bg-amber-50 text-amber-900" : "border-green-200 bg-green-50 text-green-800"}`}>
          <p className="font-semibold">{intento.alertas.length ? "Para revisar" : "Sin alertas del sistema"}</p>
          {intento.alertas.length > 0 && (
            <ul className="mt-1 list-disc space-y-0.5 pl-5">
              {intento.alertas.map((a) => (
                <li key={a}>{a}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {intento.pruebas.map((p) => (
        <section key={p.prueba}>
          <div className="flex items-baseline justify-between gap-2">
            <h3 className="text-sm font-semibold text-gray-900">{NOMBRE_PRUEBA[p.prueba]}</h3>
            {p.puntaje != null && <span className="text-xs text-gray-500">{p.puntaje} / 100</span>}
          </div>
          {p.informe && <ResumenInforme prueba={p.prueba} informe={p.informe} />}
          <table className="mt-1.5 w-full text-sm">
            <tbody className="divide-y divide-gray-100">
              {p.metricas.map((m, i) => (
                <Fragment key={m.clave}>
                  {m.grupo && m.grupo !== p.metricas[i - 1]?.grupo && (
                    <tr>
                      <td colSpan={3} className="pb-1 pt-3 text-xs font-semibold uppercase tracking-wide text-gray-400">
                        {m.grupo}
                      </td>
                    </tr>
                  )}
                  <tr className={m.alerta ? "bg-amber-50" : ""}>
                    <td className="py-1.5 pr-2 text-gray-600">{m.nombre}</td>
                    <td className={`whitespace-nowrap py-1.5 text-right font-medium ${m.alerta ? "text-amber-800" : "text-gray-900"}`}>
                      {m.valor == null ? "—" : `${m.valor.toLocaleString("es-CO")} ${m.unidad}`}
                    </td>
                    <td className="w-28 whitespace-nowrap py-1.5 pl-2 text-right text-xs text-gray-400">
                      {m.rango ? `esperado ${m.rango[0]}–${m.rango[1]}` : m.umbral != null ? `alerta: ${m.umbral}` : ""}
                    </td>
                  </tr>
                </Fragment>
              ))}
            </tbody>
          </table>
          {p.informe && (p.informe.riesgos.length > 0 || p.informe.entrevista.length > 0) && (
            <div className="mt-3 space-y-3 text-sm">
              {p.informe.riesgos.length > 0 && (
                <div>
                  <p className="font-medium text-gray-900">Respuestas para revisar</p>
                  <ul className="mt-1 list-disc space-y-0.5 pl-5 text-gray-700">
                    {p.informe.riesgos.map((r) => (
                      <li key={r}>{r}</li>
                    ))}
                  </ul>
                </div>
              )}
              {p.informe.entrevista.length > 0 && (
                <div>
                  <p className="font-medium text-gray-900">Preguntas para profundizar en la entrevista</p>
                  <ul className="mt-1 list-disc space-y-0.5 pl-5 text-gray-700">
                    {p.informe.entrevista.map((q) => (
                      <li key={q}>{q}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </section>
      ))}
      {intento.estado !== "asignado" && intento.pruebas.length === 0 && <p className="text-sm text-gray-500">Todavía no ha terminado ninguna prueba.</p>}

      {intento.concepto && (
        <div className="rounded-lg border border-gray-200 p-3 text-sm">
          <p className="font-semibold text-gray-900">Concepto: {intento.concepto === "apto" ? "Apto" : "No apto"}</p>
          <p className="text-xs text-gray-500">
            {intento.conceptoPorEmail} · {fechaHora(intento.conceptoEn)}
          </p>
          {intento.conceptoObservacion && <p className="mt-1.5 whitespace-pre-wrap text-gray-700">{intento.conceptoObservacion}</p>}
        </div>
      )}
      {intento.estado === "anulado" && (
        <p className="rounded-lg bg-gray-100 p-3 text-sm text-gray-600">
          Anulada por {intento.anuladoPorEmail} el {fechaHora(intento.anuladoEn)}: {intento.motivoAnulacion}
        </p>
      )}
      <p className="text-xs text-gray-400">
        Tamizaje (batería {intento.versionBateria ?? "—"}): los umbrales son provisionales y no reemplazan el criterio profesional.
      </p>
    </div>
  );
}
