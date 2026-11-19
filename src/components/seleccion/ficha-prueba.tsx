"use client";

/**
 * «Así se vería en Candidatos» dentro del chat de prueba: los datos del
 * aspirante con el mismo orden y nombres que la ficha de Candidatos, al día
 * con cada mensaje. Con «Guardar en Candidatos» es la ficha real guardada
 * (y debajo el mismo panel de selección, con las pestañas de Candidatos); si
 * no, es la simulación con lo leído del chat.
 */
import { estadoInfo, type ProcesoContratacion, type ResultadoPreseleccionGuardado } from "@/lib/contratacion/constants";
import { edadEfectiva, type DatosPrefiltro } from "@/lib/seleccion/extraccion";
import { requiereLentes } from "@/lib/seleccion/preseleccion";
import type { ResumenRunt } from "@/lib/verificacion/proveedores";
import { PanelSeleccion } from "./panel-seleccion";
import { SemaforoDetalle } from "./semaforo";

interface Vista {
  nombre: string;
  cedula: string;
  expedicion: string;
  nacimiento: string;
  edad: string;
  ciudad: string;
  traslado: string;
  licencia: string;
  restricciones: string[];
  lentes: boolean;
  renovara: boolean | null;
  experiencia: string;
  hojaVida: string;
  autorizacion: string;
  simit: string;
  rnmc: string;
  estado: string;
  preseleccion: ResultadoPreseleccionGuardado | null;
}

const pesos = (n: number) => `$${Math.round(n).toLocaleString("es-CO")}`;
const fecha = (iso: string | null | undefined) =>
  iso ? new Date(`${iso.slice(0, 10)}T00:00:00Z`).toLocaleDateString("es-CO", { timeZone: "UTC", day: "numeric", month: "short", year: "numeric" }) : "—";
const siNo = (v: boolean | null | undefined) => (v == null ? "—" : v ? "Sí" : "No");
const autorizacionTexto = (a: string | null | undefined) => (a === "si" ? "Autorizó" : a === "no" ? "No autorizó" : "Pendiente");

/** Categorías en firme del RUNT (como las deja en la ficha) o lo declarado. */
function licenciaDe(runt: ResumenRunt | null | undefined, declarada: string | null | undefined): string {
  if (runt?.categorias.length) {
    const enFirme = runt.categorias.filter((c) => c.activa);
    return [...new Set((enFirme.length ? enFirme : runt.categorias).map((c) => c.categoria))].join(", ") + " (RUNT)";
  }
  if (runt?.registrado === false) return `${declarada ?? "—"} (la cédula no aparece en el RUNT)`;
  return declarada ? `${declarada} (dicha)` : "—";
}

function desdeProceso(p: ProcesoContratacion): Vista {
  const runt = p.licencia_runt ?? null;
  return {
    nombre: p.nombre,
    cedula: p.cedula,
    expedicion: fecha(p.cedula_fecha_expedicion),
    nacimiento: fecha(p.fecha_nacimiento),
    edad: p.edad != null ? `${p.edad} años` : "—",
    ciudad: p.ciudad_residencia ?? "—",
    traslado: siNo(p.dispuesto_traslado),
    licencia: p.licencia_categoria ? `${p.licencia_categoria}${runt ? " (RUNT)" : ""}` : "—",
    restricciones: runt?.restricciones ?? [],
    lentes: requiereLentes(runt?.restricciones),
    renovara: p.renovara_licencia ?? null,
    experiencia: p.experiencia_meses != null ? `${p.experiencia_meses} meses` : "—",
    hojaVida: p.hoja_vida_recibida_at ? "Recibida" : "—",
    autorizacion: autorizacionTexto(p.autorizacion_datos),
    simit: p.simit ? `${p.simit === "ok" ? "Sin deuda" : p.simit}${p.simit_valor != null ? ` · ${pesos(Number(p.simit_valor))}` : ""}` : "Sin consultar",
    rnmc: "En «Consultas a Croma»",
    estado: estadoInfo(p.estado)?.label ?? p.estado,
    preseleccion: p.preseleccion ?? null,
  };
}

function simulada(
  d: DatosPrefiltro,
  runt: ResumenRunt | null,
  simit: { valor: number | null; consultado: boolean },
  preseleccion: ResultadoPreseleccionGuardado | null,
  estado: string | null,
  hoy: string,
  rnmc: string | null,
  nombreRegistro: string | null
): Vista {
  const edad = edadEfectiva(d, hoy);
  return {
    // Manda el nombre del registro civil (RNMC); el del RUNT solo si es de esta persona.
    nombre: nombreRegistro ?? (runt?.nombre && !runt.nombreNoCoincide ? runt.nombre : d.nombre ? d.nombre.toUpperCase() : "POR CONFIRMAR"),
    cedula: d.cedula ?? "—",
    expedicion: fecha(d.fecha_expedicion),
    nacimiento: fecha(d.fecha_nacimiento),
    edad: edad != null ? `${edad} años` : "—",
    ciudad: d.ciudad ?? "—",
    traslado: siNo(d.dispuesto_traslado),
    licencia: licenciaDe(runt, d.licencia),
    restricciones: runt?.restricciones ?? [],
    lentes: requiereLentes(runt?.restricciones),
    renovara: d.renovara_licencia,
    experiencia: d.experiencia_meses != null ? `${d.experiencia_meses} meses` : "—",
    hojaVida: d.hoja_vida ? "Recibida" : "—",
    autorizacion: autorizacionTexto(d.autorizacion),
    simit: simit.consultado && simit.valor != null ? (simit.valor > 0 ? `Deuda · ${pesos(simit.valor)}` : "Sin deuda · $0") : "Sin consultar",
    rnmc: rnmc ?? (d.fecha_expedicion ? "Sin consultar" : "Falta la fecha de expedición"),
    estado: estado === "antecedentes" ? "Antecedentes" : estado ? "Preselección" : "Todavía no es candidato (falta cédula o autorización)",
    preseleccion,
  };
}

export function FichaPrueba({
  proceso,
  version,
  extraido,
  runt,
  simit,
  preseleccion,
  estado,
  hoy,
  rnmc = null,
  nombreRegistro = null,
}: {
  /** Ficha real guardada (casilla «Guardar en Candidatos»). */
  proceso: ProcesoContratacion | null;
  /** Cambia cada vez que se vuelve a leer la ficha, para recargar consultas e historial. */
  version: number;
  extraido: DatosPrefiltro | null;
  runt: ResumenRunt | null;
  simit: { valor: number | null; consultado: boolean };
  preseleccion: ResultadoPreseleccionGuardado | null;
  estado: string | null;
  hoy: string;
  /** Resultado del RNMC consultado sin guardar (casilla de Croma). */
  rnmc?: string | null;
  /** Nombre según el RNMC (validado con la fecha de expedición). */
  nombreRegistro?: string | null;
}) {
  const v = proceso ? desdeProceso(proceso) : extraido ? simulada(extraido, runt, simit, preseleccion, estado, hoy, rnmc, nombreRegistro) : null;
  return (
    <div className="space-y-3 rounded-xl border border-border bg-white p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-text-primary">Así se vería en Candidatos</h3>
        <span
          className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${proceso ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-text-tertiary"}`}
        >
          {proceso ? "Guardado en Candidatos" : "Simulado (no se guarda)"}
        </span>
      </div>
      {!v ? (
        <p className="text-xs text-text-muted">Se llena solo a medida que el aspirante da sus datos.</p>
      ) : (
        <>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs @2xl:grid-cols-3">
            {[
              ["Nombre", v.nombre],
              ["Cédula", v.cedula],
              ["Expedición de la cédula", v.expedicion],
              ["Estado", v.estado],
              ["Nacimiento", v.nacimiento],
              ["Edad", v.edad],
              ["Ciudad donde vive", v.ciudad],
              ["¿Se traslada?", v.traslado],
              ["Licencia", v.licencia],
              ["Experiencia", v.experiencia],
              ["Hoja de vida", v.hojaVida],
              ["Autorización de datos", v.autorizacion],
              ["SIMIT", v.simit],
              ["RNMC", v.rnmc],
            ].map(([k, val]) => (
              <div key={k} className="min-w-0">
                <dt className="text-text-tertiary">{k}</dt>
                <dd className="truncate font-medium text-text-secondary" title={val}>
                  {val}
                </dd>
              </div>
            ))}
          </dl>
          {v.restricciones.length > 0 && (
            <p className="text-xs text-text-secondary">
              <span className="font-medium">Restricciones de la licencia (RUNT):</span> {v.restricciones.join(" · ")}
            </p>
          )}
          {runt?.nombreNoCoincide && !proceso && (
            <p className="text-xs font-medium text-amber-700">
              El RUNT trae esta cédula a nombre de otra persona: la licencia queda para revisión manual de Gestión Humana.
            </p>
          )}
          {v.lentes && <p className="text-xs font-medium text-amber-700">Debe traer los lentes a la prueba de manejo (restricción de la licencia).</p>}
          {v.renovara != null && (
            <p className="text-xs text-text-secondary">Licencia vencida: {v.renovara ? "dijo que la va a renovar." : "dijo que no la va a renovar."}</p>
          )}
          {proceso ? (
            // El mismo panel, con las mismas pestañas que en Candidatos (Resumen, Citas y
            // profesor, Croma, Documentos, Historial). Citar se hace en el recuadro de arriba.
            <PanelSeleccion key={proceso.id} proceso={proceso} puedeEditar={false} onCerrado={() => undefined} modoCitas="prueba" version={version} />
          ) : (
            v.preseleccion && <SemaforoDetalle resultado={v.preseleccion} />
          )}
          {v.preseleccion?.global === "no_cumple" && (
            <p className="text-xs font-medium text-red-700">
              No pasa la preselección: si el semáforo sigue en rojo 30 minutos, el proceso se cierra solo con la causa del requisito incumplido.
            </p>
          )}
        </>
      )}
    </div>
  );
}
