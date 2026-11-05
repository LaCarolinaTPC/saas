/**
 * Histórico del Excel «LISTADO PERSONAL EXAMEN PERIODICO» → personas en
 * control y exámenes. Reglas PURAS; la carga la hace
 * scripts/migrar-sst-examenes-periodicos.mts.
 *
 * El libro tiene dos clases de hojas:
 *
 *  - Mensuales («ENERO 25» … «NOVIEMBRE 26»): una fila por atención con
 *    cédula, nombre, área, fecha de atención, fecha de entrega (en «DICIEMBRE
 *    25» se llama «OBSERVACION») y recomendaciones. El encabezado está en la
 *    fila 1 o en la 2. Una misma atención aparece a veces en dos meses.
 *  - De control («COND LA CAROLINA.», «ADMON CAROLINA.», «REUBICADOS.»,
 *    «METRORECAUDO», «ANAYA GIRALDO.»): una fila por persona con la fecha del
 *    examen de cada año (o «RETIRADO» / «INCAP»), la fecha del próximo examen
 *    (escrita a mano) y la alerta de días. Encabezado en la fila 2, los años en
 *    la 3 y los datos desde la 5.
 *
 * Un examen de control y uno mensual de la misma cédula con 45 días o menos de
 * diferencia son el mismo: gana el mensual, que trae la entrega y las
 * recomendaciones.
 */
import { normalizar } from "./historico";
import {
  PERIODICIDAD_DEFECTO, PERIODICIDADES, diasEntre, proximoExamen, type GrupoExamen,
} from "./examenes";

export interface HojaCruda {
  nombre: string;
  /** `sheet_to_json(hoja, { header: 1, raw: true, defval: null })`. */
  filas: unknown[][];
}

export interface PersonaHistorico {
  cedula: string;
  nombre: string;
  cargo: string | null;
  grupo: GrupoExamen;
  fechaIngreso: string | null;
  /**
   * La del último examen; sin exámenes, la que implica el próximo examen del
   * Excel contado desde la fecha de ingreso (12, 24 o 36 meses).
   */
  periodicidadMeses: number;
  activo: boolean;
  inactivoDesde: string | null;
  /** «hoja:fila» de donde sale. */
  fuente: string;
}

export interface ExamenHistorico {
  cedula: string;
  nombre: string;
  cargo: string | null;
  fechaAtencion: string;
  fechaEntrega: string | null;
  periodicidadMeses: number;
  proximoExamen: string;
  recomendaciones: string | null;
  observaciones: string | null;
  /** «hoja:fila» (mensual) o «hoja:fila:año» (control): clave de idempotencia. */
  historicoRef: string;
}

/** Lo que el Excel dice de cada persona en su hoja de control, para comparar. */
export interface ControlExcel {
  proximo: string | null;
  alerta: string | null;
}

export interface ResultadoLibro {
  personas: PersonaHistorico[];
  examenes: ExamenHistorico[];
  rechazadas: { ref: string; motivo: string }[];
  avisos: { ref: string; aviso: string }[];
  control: Map<string, ControlExcel>;
  hojas: { nombre: string; tipo: "mensual" | "control" | "ignorada"; filas: number }[];
}

const MESES = ["ENERO", "FEBRERO", "MARZO", "ABRIL", "MAYO", "JUNIO", "JULIO", "AGOSTO", "SEPTIEMBRE", "OCTUBRE", "NOVIEMBRE", "DICIEMBRE"];

/** «JUNIO 25 » → { anio: 2025, mes: 6 }; null si no es una hoja mensual. */
export function hojaMensual(nombre: string): { anio: number; mes: number } | null {
  const m = /^([A-Z]+)\s*(\d{2})$/.exec(normalizar(nombre));
  if (!m) return null;
  const mes = MESES.indexOf(m[1]) + 1;
  return mes ? { anio: 2000 + Number(m[2]), mes } : null;
}

/** Grupo de una hoja de control por su nombre; null si no lo es. */
export function hojaControl(nombre: string): GrupoExamen | null {
  const n = normalizar(nombre);
  if (/^COND/.test(n)) return "conductores";
  if (/^ADMON/.test(n)) return "administrativos";
  if (/^REUBICADO/.test(n)) return "reubicados";
  if (/^METRORECAUDO/.test(n)) return "metrorecaudo";
  if (/^ANAYA/.test(n)) return "anaya_giraldo";
  return null;
}

/** Grupo deducido del área de una hoja mensual (para quien no está en ninguna hoja de control). */
export function grupoPorArea(area: unknown): GrupoExamen {
  const n = normalizar(area);
  if (/REUBICAD/.test(n)) return "reubicados";
  if (/^CONDUCTOR/.test(n)) return "conductores";
  if (/VIGILANTE|ESCOLTA/.test(n)) return "anaya_giraldo";
  if (/CAJERO/.test(n)) return "metrorecaudo";
  return "administrativos";
}

const iso = (a: number, m: number, d: number) => `${a}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
const valida = (a: number, m: number, d: number) => {
  if (!(a >= 1990 && a <= 2100 && m >= 1 && m <= 12 && d >= 1)) return false;
  return d <= new Date(Date.UTC(a, m, 0)).getUTCDate();
};

/**
 * Fecha de una celda. Acepta la serie de Excel, «AAAA-MM-DD» y «d/m/aaaa» (el
 * Excel se diligencia en Colombia: día primero). Un año truncado («27/05/202»)
 * se completa con `anioHoja`, y lo dice en `corregida`.
 */
export function fechaCelda(v: unknown, anioHoja?: number): { fecha: string | null; corregida: boolean } {
  if (typeof v === "number" && Number.isFinite(v)) {
    if (v < 20000) return { fecha: null, corregida: false };
    const f = new Date(Math.round((v - 25569) * 86400000)).toISOString().slice(0, 10);
    return { fecha: f, corregida: false };
  }
  const s = String(v ?? "").trim();
  if (!s) return { fecha: null, corregida: false };
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
  if (m) {
    const [a, mes, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
    return { fecha: valida(a, mes, d) ? iso(a, mes, d) : null, corregida: false };
  }
  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{1,4})$/.exec(s);
  if (!m) return { fecha: null, corregida: false };
  const d = Number(m[1]);
  const mes = Number(m[2]);
  let a = Number(m[3]);
  let corregida = false;
  if (m[3].length === 2) a += 2000;
  else if (m[3].length !== 4) {
    if (!anioHoja) return { fecha: null, corregida: false };
    a = anioHoja;
    corregida = true;
  }
  return valida(a, mes, d) ? { fecha: iso(a, mes, d), corregida } : { fecha: null, corregida: false };
}

const textoLimpio = (v: unknown) => {
  const s = String(v ?? "").replace(/[ \t]+/g, " ").trim();
  return s || null;
};
/** Recomendaciones: se conservan los renglones, sin viñetas sueltas ni tabuladores. */
export function recomendacionesDe(v: unknown): string | null {
  const lineas = String(v ?? "")
    .split(/\r?\n/)
    .map((l) => l.replace(/^[\s•·\-*]+/, "").replace(/\s+/g, " ").trim())
    .filter(Boolean);
  return lineas.length ? lineas.join("\n") : null;
}
/** «ACOSTA GALINDO HUMBERTO      » → «Acosta Galindo Humberto». */
export const comoNombre = (v: unknown) =>
  textoLimpio(v)
    ?.toLowerCase()
    .split(" ")
    .map((w, i) => (i > 0 && ["de", "del", "la", "las", "los", "y"].includes(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(" ") ?? null;
const comoTitulo = (v: unknown) => {
  const s = textoLimpio(v)?.toLowerCase();
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : null;
};
const cedulaDe = (v: unknown) => {
  const s = typeof v === "number" ? String(Math.trunc(v)) : String(v ?? "").replace(/\D/g, "");
  return s.length >= 5 && s.length <= 12 ? s : null;
};

/** La periodicidad que implica el próximo examen escrito en el Excel: la más cercana de 12, 24 o 36 meses. */
export function periodicidadDesde(ultimo: string, proximo: string | null): number {
  if (!proximo || proximo <= ultimo) return PERIODICIDAD_DEFECTO;
  const meses = diasEntre(ultimo, proximo) / 30.44;
  return PERIODICIDADES.reduce((mejor, p) => (Math.abs(p - meses) < Math.abs(mejor - meses) ? p : mejor), PERIODICIDAD_DEFECTO as number);
}

interface ExamenParcial extends Omit<ExamenHistorico, "periodicidadMeses" | "proximoExamen"> {
  mensual: boolean;
}

const indiceDe = (encabezado: unknown[], prueba: (n: string) => boolean) => encabezado.findIndex((c) => prueba(normalizar(c)));

/** Lee el libro completo. `hoy` (AAAA-MM-DD): una atención posterior es una cita, no un examen. */
export function leerLibroExamenes(hojas: HojaCruda[], hoy: string): ResultadoLibro {
  const rechazadas: ResultadoLibro["rechazadas"] = [];
  const avisos: ResultadoLibro["avisos"] = [];
  const control = new Map<string, ControlExcel>();
  const personas = new Map<string, PersonaHistorico>();
  const resumenHojas: ResultadoLibro["hojas"] = [];
  const mensuales: ExamenParcial[] = [];
  const deControl: ExamenParcial[] = [];
  /** Área de la última atención mensual, para quien no está en el control. */
  const areaMensual = new Map<string, { nombre: string; area: string | null; fuente: string }>();

  for (const hoja of hojas) {
    const mes = hojaMensual(hoja.nombre);
    const grupo = hojaControl(hoja.nombre);
    const filas = hoja.filas;
    const iEnc = filas.findIndex((r) => (r ?? []).some((c) => normalizar(c) === "CEDULA"));
    if ((!mes && !grupo) || iEnc < 0) {
      resumenHojas.push({ nombre: hoja.nombre, tipo: "ignorada", filas: 0 });
      continue;
    }
    const enc = filas[iEnc] ?? [];
    const cCed = indiceDe(enc, (n) => n === "CEDULA");
    const cNom = indiceDe(enc, (n) => n.startsWith("NOMBRE"));
    const cArea = indiceDe(enc, (n) => n === "AREA" || n === "CARGO");
    const nombreHoja = hoja.nombre.trim();
    let leidas = 0;

    if (mes) {
      const cAtencion = indiceDe(enc, (n) => n === "FECHA DE ATENCION");
      // En «DICIEMBRE 25» la columna de la entrega se llama «OBSERVACION».
      const cEntrega = indiceDe(enc, (n) => n === "FECHA DE ENTREGA" || n === "OBSERVACION");
      const cRec = indiceDe(enc, (n) => n.startsWith("RECOMENDACION"));
      for (let i = iEnc + 1; i < filas.length; i++) {
        const r = filas[i] ?? [];
        const ref = `${nombreHoja}:${i + 1}`;
        if (r[cCed] == null || String(r[cCed]).trim() === "") continue;
        leidas += 1;
        const cedula = cedulaDe(r[cCed]);
        const nombre = comoNombre(r[cNom]);
        if (!cedula) { rechazadas.push({ ref, motivo: `cédula ilegible «${String(r[cCed])}»` }); continue; }
        if (!nombre) { rechazadas.push({ ref, motivo: "falta el nombre" }); continue; }
        const area = comoTitulo(r[cArea]);
        const at = fechaCelda(r[cAtencion], mes.anio);
        if (!at.fecha) {
          const txt = textoLimpio(r[cAtencion]);
          rechazadas.push({ ref, motivo: txt ? `fecha de atención ilegible «${txt}»` : "sin fecha de atención (cita programada sin atender)" });
          continue;
        }
        if (at.corregida) avisos.push({ ref, aviso: `fecha de atención «${String(r[cAtencion])}» con el año incompleto: se tomó ${at.fecha}` });
        if (at.fecha > hoy) { rechazadas.push({ ref, motivo: `atención futura (${at.fecha}): es una cita, no un examen` }); continue; }

        const obs: string[] = [];
        let fechaEntrega: string | null = null;
        const ent = r[cEntrega];
        if (ent != null && String(ent).trim() !== "") {
          const e = fechaCelda(ent, mes.anio);
          if (e.fecha) {
            fechaEntrega = e.fecha;
            if (e.corregida) avisos.push({ ref, aviso: `fecha de entrega con el año incompleto: se tomó ${e.fecha}` });
            if (fechaEntrega < at.fecha) avisos.push({ ref, aviso: `la entrega (${fechaEntrega}) es anterior a la atención (${at.fecha})` });
          } else if (typeof ent === "number") {
            avisos.push({ ref, aviso: "la fecha de entrega es solo una hora: se deja vacía" });
          } else {
            obs.push(`Entrega: ${textoLimpio(ent)}`);
          }
        }
        // Marca de la columna A en algunas hojas.
        const marca = r.slice(0, cCed).map(textoLimpio).find((x) => x && /^PROTEG/.test(normalizar(x)));
        if (marca) obs.push("Marcado «PROTEGER» en el Excel");
        mensuales.push({
          cedula, nombre, cargo: area, fechaAtencion: at.fecha, fechaEntrega,
          recomendaciones: recomendacionesDe(r[cRec]), observaciones: obs.length ? obs.join(" · ") : null,
          historicoRef: ref, mensual: true,
        });
        areaMensual.set(cedula, { nombre, area, fuente: ref });
      }
    } else if (grupo) {
      const anios = filas[iEnc + 1] ?? [];
      const columnasAnio = anios
        .map((v, j) => ({ j, anio: typeof v === "number" ? v : Number(String(v ?? "").trim()) }))
        .filter((x) => Number.isInteger(x.anio) && x.anio >= 2000 && x.anio <= 2100);
      const cIngreso = indiceDe(enc, (n) => n.startsWith("FECHA DE INGRESO"));
      const cProx = indiceDe(enc, (n) => n.includes("PROXIMO"));
      const cAlerta = indiceDe(enc, (n) => n === "ALERTAS");
      for (let i = iEnc + 2; i < filas.length; i++) {
        const r = filas[i] ?? [];
        const ref = `${nombreHoja}:${i + 1}`;
        const cedula = cedulaDe(r[cCed]);
        if (!cedula) continue; // filas de subtítulo («FECHA DE REALIZACION») y vacías
        leidas += 1;
        const nombre = comoNombre(r[cNom]);
        if (!nombre) { rechazadas.push({ ref, motivo: "falta el nombre" }); continue; }
        let retiradoDesde: number | null = null;
        for (const { j, anio } of columnasAnio) {
          const v = r[j];
          if (v == null || String(v).trim() === "") continue;
          const n = normalizar(v);
          if (/^RETIRAD/.test(n)) { retiradoDesde = retiradoDesde ?? anio; continue; }
          if (/^INCA/.test(n)) { avisos.push({ ref, aviso: `${anio}: «${String(v).trim()}» (incapacitado, sin examen)` }); continue; }
          const f = fechaCelda(v, anio);
          if (!f.fecha) { avisos.push({ ref, aviso: `${anio}: valor no reconocido «${String(v).trim()}»` }); continue; }
          if (f.fecha > hoy) { avisos.push({ ref, aviso: `${anio}: fecha futura ${f.fecha}, se omite` }); continue; }
          if (Number(f.fecha.slice(0, 4)) !== anio) avisos.push({ ref, aviso: `la columna ${anio} trae la fecha ${f.fecha}` });
          deControl.push({
            cedula, nombre, cargo: comoTitulo(r[cArea]), fechaAtencion: f.fecha, fechaEntrega: null,
            recomendaciones: null, observaciones: null, historicoRef: `${ref}:${anio}`, mensual: false,
          });
        }
        const proximo = cProx >= 0 ? fechaCelda(r[cProx]).fecha : null;
        // «Faltan  días» (sin número) es la fórmula sin próximo examen: no es una alerta.
        const crudo = cAlerta >= 0 ? textoLimpio(r[cAlerta]) : null;
        const alerta = crudo && /\d/.test(crudo) ? crudo : null;
        const previa = personas.get(cedula);
        const persona: PersonaHistorico = {
          cedula, nombre, cargo: comoTitulo(r[cArea]), grupo,
          fechaIngreso: cIngreso >= 0 ? fechaCelda(r[cIngreso]).fecha : null,
          periodicidadMeses: PERIODICIDAD_DEFECTO,
          activo: retiradoDesde == null,
          inactivoDesde: retiradoDesde == null ? null : `${retiradoDesde}-01-01`,
          fuente: ref,
        };
        if (previa) {
          avisos.push({ ref, aviso: `la cédula ya estaba en ${previa.fuente}; se deja ${previa.activo || !persona.activo ? previa.fuente : ref}` });
          // Gana la hoja donde sigue activa (p. ej. un conductor que pasó a reubicado).
          if (!previa.activo && persona.activo) {
            personas.set(cedula, persona);
            control.set(cedula, { proximo, alerta });
          }
          continue;
        }
        personas.set(cedula, persona);
        control.set(cedula, { proximo, alerta });
      }
    }
    resumenHojas.push({ nombre: hoja.nombre, tipo: mes ? "mensual" : "control", filas: leidas });
  }

  // 1. Las atenciones mensuales repetidas (misma cédula y fecha) son una sola.
  const porClave = new Map<string, ExamenParcial>();
  for (const e of mensuales) {
    const k = `${e.cedula}|${e.fechaAtencion}`;
    const previo = porClave.get(k);
    if (!previo) { porClave.set(k, { ...e }); continue; }
    avisos.push({ ref: e.historicoRef, aviso: `misma atención que ${previo.historicoRef}: se funden` });
    previo.fechaEntrega = previo.fechaEntrega ?? e.fechaEntrega;
    previo.recomendaciones = previo.recomendaciones ?? e.recomendaciones;
    previo.observaciones = [previo.observaciones, e.observaciones].filter((x, i, a) => x && a.indexOf(x) === i).join(" · ") || null;
    previo.cargo = previo.cargo ?? e.cargo;
  }
  const unidos: ExamenParcial[] = [...porClave.values()];

  // 2. Un examen de control que ya está en una hoja mensual (±45 días) no se repite.
  for (const e of deControl) {
    const igual = unidos.find((m) => m.mensual && m.cedula === e.cedula && Math.abs(diasEntre(m.fechaAtencion, e.fechaAtencion)) <= 45);
    if (igual) {
      if (igual.fechaAtencion !== e.fechaAtencion) avisos.push({ ref: e.historicoRef, aviso: `el control dice ${e.fechaAtencion} y la hoja mensual ${igual.fechaAtencion} (${igual.historicoRef}): se deja la mensual` });
      continue;
    }
    if (unidos.some((m) => m.cedula === e.cedula && m.fechaAtencion === e.fechaAtencion)) continue;
    unidos.push(e);
  }

  // 3. Quien solo aparece en las hojas mensuales entra al control por su área.
  for (const [cedula, a] of areaMensual) {
    if (personas.has(cedula)) continue;
    const grupo = grupoPorArea(a.area);
    personas.set(cedula, { cedula, nombre: a.nombre, cargo: a.area, grupo, fechaIngreso: null, periodicidadMeses: PERIODICIDAD_DEFECTO, activo: true, inactivoDesde: null, fuente: a.fuente });
    avisos.push({ ref: a.fuente, aviso: `no está en ninguna hoja de control: entra al grupo «${grupo}» por el área «${a.area ?? "sin área"}»` });
  }

  // 4. Periodicidad: la del próximo examen del Excel para el último examen de cada persona; 12 meses para los demás.
  const ultimoDe = new Map<string, string>();
  for (const e of unidos) if ((ultimoDe.get(e.cedula) ?? "") < e.fechaAtencion) ultimoDe.set(e.cedula, e.fechaAtencion);
  const examenes: ExamenHistorico[] = unidos
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    .map(({ mensual: _m, ...e }) => {
      const esUltimo = ultimoDe.get(e.cedula) === e.fechaAtencion;
      const meses = esUltimo ? periodicidadDesde(e.fechaAtencion, control.get(e.cedula)?.proximo ?? null) : PERIODICIDAD_DEFECTO;
      return { ...e, periodicidadMeses: meses, proximoExamen: proximoExamen(e.fechaAtencion, meses) };
    })
    .sort((a, b) => a.cedula.localeCompare(b.cedula) || a.fechaAtencion.localeCompare(b.fechaAtencion));

  // 5. Periodicidad de cada persona: la de su último examen o, sin exámenes, la
  //    del próximo examen del Excel contado desde el ingreso.
  const periodicidadUltimo = new Map<string, number>();
  for (const e of examenes) if (ultimoDe.get(e.cedula) === e.fechaAtencion) periodicidadUltimo.set(e.cedula, e.periodicidadMeses);
  for (const p of personas.values()) {
    const proximoExcel = control.get(p.cedula)?.proximo ?? null;
    p.periodicidadMeses = periodicidadUltimo.get(p.cedula) ?? (p.fechaIngreso ? periodicidadDesde(p.fechaIngreso, proximoExcel) : PERIODICIDAD_DEFECTO);
  }

  return { personas: [...personas.values()], examenes, rechazadas, avisos, control, hojas: resumenHojas };
}
