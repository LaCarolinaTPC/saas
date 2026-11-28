"use client";

/**
 * Pestaña «Antecedentes» de la selección (25-nov-2026): por cada fuente que se
 * consulta en Croma, qué devuelve, cada caso posible y qué hace Gestivo con él
 * (pasa solo, revisión manual o propone cierre). Abajo, un probador: se arma un
 * caso y se ve qué harían las reglas guardadas, sin consultar nada.
 * La tabla y los ejemplos están en src/lib/seleccion/secciones-antecedentes.ts.
 */
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FlaskConical, Loader2, ShieldCheck } from "lucide-react";
import type { AjusteSeleccion } from "@/lib/seleccion/ajustes";
import { NOMBRE_FUENTE, reglasDeAjustes, type AccionAntecedente, type FuenteAntecedentes } from "@/lib/seleccion/antecedentes";
import {
  CASOS_PROBADOR, EJEMPLO_BASE, NOMBRE_EJEMPLO, TABLA_ANTECEDENTES, TEXTO_FIJO, TEXTO_VEREDICTO, probarReglas, type CasoProbador, type EjemploProbador,
} from "@/lib/seleccion/secciones-antecedentes";
import { FilaAjuste, Tarjeta } from "./TiemposReglas";
import { aplicarReglasAntecedentes } from "./actions";
import { AvisoLinea, campo, type Aviso } from "./comunes";

const SUFIJO_UNIDAD: Record<string, string> = { horas: "horas", dias: "días", minutos: "min", porcentaje: "%" };
const campoCorto = campo.replace("w-full ", "");

const CLASE_FIJO: Record<string, string> = {
  pasa: "bg-emerald-50 text-emerald-700",
  revision: "bg-amber-50 text-amber-800",
  espera: "bg-slate-100 text-text-secondary",
  pregunta: "bg-sky-50 text-sky-700",
};

const ACCION: Record<AccionAntecedente, { texto: string; clase: string }> = {
  tolera: { texto: "Pasa solo", clase: "bg-emerald-50 text-emerald-700" },
  revision: { texto: "Revisión manual", clase: "bg-amber-50 text-amber-800" },
  descarta: { texto: "Propone cierre", clase: "bg-red-50 text-red-700" },
};

const ESTADO_FUENTE: Record<string, string> = {
  limpio: "Sin hallazgos",
  hallazgo: "Con hallazgo",
  pendiente: "En curso",
  error: "No respondió",
  sin_consultar: "Sin consultar",
};

const CLASE_VEREDICTO: Record<string, string> = {
  limpio: "border-emerald-200 bg-emerald-50 text-emerald-900",
  tolerable: "border-emerald-200 bg-emerald-50 text-emerald-900",
  revision: "border-amber-200 bg-amber-50 text-amber-900",
  descarta: "border-red-200 bg-red-50 text-red-900",
  pendiente: "border-slate-200 bg-slate-50 text-text-primary",
};

const FUENTES: FuenteAntecedentes[] = ["policia", "procuraduria", "contraloria", "rnmc"];

function Probador({ ajustes }: { ajustes: AjusteSeleccion[] }) {
  const [e, setE] = useState<EjemploProbador>(EJEMPLO_BASE);
  const reglas = useMemo(() => reglasDeAjustes(ajustes), [ajustes]);
  const ev = useMemo(() => probarReglas(reglas, e), [reglas, e]);
  const v = TEXTO_VEREDICTO[ev.veredicto];

  return (
    <Tarjeta
      id="probador"
      titulo="Probar con un ejemplo"
      detalle={`Arme un caso y vea qué haría Gestivo con las reglas guardadas. No consulta nada en Croma ni toca a ningún aspirante. El aspirante del ejemplo se llama ${NOMBRE_EJEMPLO}.`}
      icono={<FlaskConical className="h-4 w-4 text-primary" />}
    >
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {FUENTES.map((f) => (
          <label key={f} className="block text-xs text-text-secondary">
            {NOMBRE_FUENTE[f]}
            <select value={e[f]} onChange={(x) => setE({ ...e, [f]: x.target.value as CasoProbador })} className={`${campo} mt-1`}>
              {CASOS_PROBADOR.filter((c) => !(f === "contraloria" && c.id === "otro_nombre")).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.texto}
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>

      <details className="mt-3 rounded-xl border border-border p-3">
        <summary className="cursor-pointer text-xs font-medium text-text-secondary">Probar las palabras: escriba lo que diría el certificado</summary>
        <p className="mt-1 text-[11px] text-text-tertiary">
          Vacío, se usa la frase habitual. Las palabras se buscan en este veredicto y en la entidad afectada del fallo, haya o no hallazgo.
        </p>
        <div className="mt-2 grid gap-3 sm:grid-cols-2">
          <label className="text-xs text-text-secondary">
            Policía: veredicto
            <input value={e.policiaTexto ?? ""} onChange={(x) => setE({ ...e, policiaTexto: x.target.value })} placeholder="ACTUALMENTE NO ES REQUERIDO POR AUTORIDAD JUDICIAL ALGUNA" className={`${campo} mt-1`} />
          </label>
          <label className="text-xs text-text-secondary">
            Procuraduría: veredicto
            <input value={e.procuraduriaTexto ?? ""} onChange={(x) => setE({ ...e, procuraduriaTexto: x.target.value })} placeholder="Registra sanción: destitución e inhabilidad general" className={`${campo} mt-1`} />
          </label>
          <label className="text-xs text-text-secondary sm:col-span-2">
            Contraloría: entidad afectada del fallo (con «Con hallazgo»)
            <input value={e.contraloriaEntidad ?? ""} onChange={(x) => setE({ ...e, contraloriaEntidad: x.target.value })} placeholder="Empresa de transporte masivo" className={`${campo} mt-1`} />
          </label>
        </div>
      </details>

      {(e.contraloria === "hallazgo" || e.rnmc === "hallazgo") && (
        <div className="mt-3 flex flex-wrap items-end gap-3 rounded-xl bg-slate-50 p-3">
          {e.contraloria === "hallazgo" && (
            <>
              <label className="text-xs text-text-secondary">
                Contraloría: valor del fallo
                <input type="number" min={0} value={e.contraloriaValor} onChange={(x) => setE({ ...e, contraloriaValor: Number(x.target.value) || 0 })} className={`${campoCorto} mt-1 block w-40`} />
              </label>
              <label className="text-xs text-text-secondary">
                Fecha del fallo
                <input type="date" value={e.contraloriaFecha} onChange={(x) => setE({ ...e, contraloriaFecha: x.target.value })} className={`${campoCorto} mt-1 block w-40`} />
              </label>
            </>
          )}
          {e.rnmc === "hallazgo" && (
            <>
              <label className="text-xs text-text-secondary">
                RNMC: medidas pendientes
                <input type="number" min={1} max={20} value={e.rnmcMedidas} onChange={(x) => setE({ ...e, rnmcMedidas: Number(x.target.value) || 1 })} className={`${campoCorto} mt-1 block w-24`} />
              </label>
              <label className="min-w-[14rem] flex-1 text-xs text-text-secondary">
                Qué dice cada medida
                <input value={e.rnmcTexto} onChange={(x) => setE({ ...e, rnmcTexto: x.target.value })} className={`${campo} mt-1`} />
              </label>
            </>
          )}
        </div>
      )}

      <div className={`mt-4 rounded-xl border p-3 ${CLASE_VEREDICTO[ev.veredicto]}`} aria-live="polite">
        <p className="text-sm font-semibold">Resultado: {v.titulo}</p>
        <p className="text-xs">{v.detalle}</p>
      </div>
      <ul className="mt-2 divide-y divide-border text-sm">
        {ev.fuentes.map((f) => (
          <li key={f.fuente} className="flex flex-col gap-1 py-2 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
            <span className="min-w-0">
              <span className="text-text-primary">{NOMBRE_FUENTE[f.fuente]}</span>
              <span className="text-text-tertiary"> · {ESTADO_FUENTE[f.estado] ?? f.estado}</span>
              {f.motivo && <span className="block text-xs text-text-tertiary">{f.motivo}</span>}
            </span>
            {f.accion ? (
              <span className={`shrink-0 self-start rounded-full px-2 py-0.5 text-[11px] font-medium ${ACCION[f.accion].clase}`}>{ACCION[f.accion].texto}</span>
            ) : f.estado === "limpio" ? (
              <span className={`shrink-0 self-start rounded-full px-2 py-0.5 text-[11px] font-medium ${ACCION.tolera.clase}`}>Pasa solo</span>
            ) : (
              <span className="shrink-0 self-start rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-text-secondary">
                {ev.faltan?.includes(f.fuente) ? "Pasa sin ella" : "Espera"}
              </span>
            )}
          </li>
        ))}
      </ul>
    </Tarjeta>
  );
}

export default function ReglasAntecedentes({ ajustes, puedeEditar }: { ajustes: AjusteSeleccion[]; puedeEditar: boolean }) {
  const porClave = useMemo(() => new Map(ajustes.map((a) => [a.clave, a])), [ajustes]);
  // Sin la migración 20261125180228 los casos nuevos no existen todavía.
  const faltaMigracion = !porClave.has("ant_policia_sin_respuesta");

  return (
    <div className="mt-4 space-y-4">
      <p className="flex max-w-5xl items-start gap-2 text-xs text-text-tertiary">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        <span>
          Qué hace Gestivo con cada respuesta de Croma. <strong>Pasa solo</strong>: el proceso sigue sin que nadie intervenga. <strong>Revisión manual</strong>: queda en
          Candidatos › «Antecedentes por revisar» hasta que una persona apruebe o rechace. <strong>Propone cierre</strong>: Gestivo propone cerrar y lo confirma una persona
          (en el SIMIT y la licencia, se cierra solo a los 30 minutos). Al aspirante nunca se le habla de antecedentes. Cada cambio queda con quién lo hizo.
        </span>
      </p>
      {faltaMigracion && (
        <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
          Falta aplicar la migración <code>20261125180228_seleccion_reglas_de_antecedentes_por_caso.sql</code>: sin ella no aparecen «La consulta no responde», «El nombre no
          coincide» ni las acciones del SIMIT y la licencia, y todo sigue como antes.
        </p>
      )}

      <div className="gap-4 xl:columns-2 [&>*]:mb-4 [&>*]:break-inside-avoid">
      {TABLA_ANTECEDENTES.map((f) => (
        <Tarjeta key={f.id} id={`ant-${f.id}`} titulo={f.titulo} detalle={f.trae}>
          <p className="mb-1 text-[11px] text-text-tertiary">Cuándo se consulta: {f.cuando}</p>
          {f.casos.map((c) => {
            const a = c.clave ? porClave.get(c.clave) : undefined;
            if (c.clave && !a) return null;
            if (a) {
              return <FilaAjuste key={`${a.clave}:${a.updated_at}`} fila={{ ajuste: a, etiqueta: c.etiqueta, ayuda: c.ayuda, sufijo: c.sufijo ?? SUFIJO_UNIDAD[a.unidad] }} puedeEditar={puedeEditar} />;
            }
            return (
              <div key={c.etiqueta} className="flex flex-col gap-2 border-b border-border py-3 last:border-0 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-text-primary">{c.etiqueta}</p>
                  {c.ayuda && <p className="text-xs text-text-tertiary">{c.ayuda}</p>}
                </div>
                {c.fijo && (
                  <span className={`self-start rounded-full px-2.5 py-1 text-xs font-medium sm:self-auto ${CLASE_FIJO[c.fijo]}`} title="Este caso no se parametriza">
                    {TEXTO_FIJO[c.fijo]}
                  </span>
                )}
              </div>
            );
          })}
        </Tarjeta>
      ))}
      </div>

      <div className="grid items-start gap-4 xl:grid-cols-2">
        <Probador ajustes={ajustes} />
        {puedeEditar && <AplicarReglas />}
      </div>
    </div>
  );
}

/** Cambiar una regla no vuelve a evaluar sola a quien ya se evaluó: este botón lo hace. */
function AplicarReglas() {
  const router = useRouter();
  const [aviso, setAviso] = useState<Aviso>(null);
  const [pendiente, start] = useTransition();
  return (
    <Tarjeta
      id="aplicar"
      titulo="Aplicar las reglas a los aspirantes en curso"
      detalle="Un cambio de regla vale para las consultas nuevas. A quien ya se había evaluado no lo cambia solo: con este botón se vuelven a pasar por las reglas guardadas los que están en «Antecedentes» y en las últimas etapas. Quien ahora vaya a revisión recibe el aviso de que una persona revisará su proceso."
    >
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={pendiente}
          onClick={() =>
            start(async () => {
              setAviso(null);
              const r = await aplicarReglasAntecedentes().catch((e: Error) => ({ ok: false as const, error: e.message }));
              setAviso(r.ok ? { ok: true, texto: r.aviso ?? "Aplicadas." } : { ok: false, texto: r.error });
              router.refresh();
            })
          }
          className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-3 py-1.5 text-xs font-medium text-white hover:bg-primary/90 disabled:opacity-50"
        >
          {pendiente && <Loader2 className="h-3 w-3 animate-spin" />} Aplicar ahora
        </button>
        <AvisoLinea aviso={aviso} />
      </div>
    </Tarjeta>
  );
}
