/**
 * Histórico del Excel «INFORMACION ACCIDENTES DE TRABAJO» (pestaña
 * «Consolidado AAAA») → `sst_accidentes_trabajo`. Reglas PURAS; la carga la
 * hace scripts/migrar-sst-accidentes-trabajo.mts.
 *
 * Los textos del Excel vienen en mayúsculas y con la redacción de sus listas
 * desplegables («SOBRE ESFUERZO, ESFUERZO EXC, FALSO MOV.»): se traducen a las
 * claves de los catálogos. La parte del cuerpo se agrupa como lo hizo SST en
 * su caracterización (tobillo con pies, espalda con tórax, cadera con miembros
 * inferiores), así los conteos coinciden con los del Excel.
 */
import {
  AGENTES, DIAS_SEMANA, MECANISMOS, MESES, TIPOS_LESION, diaSemana,
  type Agente, type DatosAccidenteTrabajo, type GrupoParteCuerpo, type Mecanismo, type TipoLesion,
} from "./reglas";

export function normalizar(v: unknown): string {
  return String(v ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toUpperCase()
    .replace(/[^A-Z0-9Ñ]+/g, " ")
    .trim();
}

const clave = <K extends string>(lista: readonly { key: K; label: string }[], v: unknown): K | null => {
  const n = normalizar(v);
  return lista.find((o) => normalizar(o.label) === n)?.key ?? null;
};

/** Tipo de lesión del Excel → clave. Los textos de la lista coinciden con el catálogo. */
export function tipoLesionDe(v: unknown): TipoLesion | null {
  const k = clave(TIPOS_LESION, v);
  if (k) return k;
  const n = normalizar(v);
  if (/AMPUTACION/.test(n)) return "amputacion";
  if (/RASGUNO|PINCHAZO/.test(n)) return "rasguno_pinchazo";
  if (/ALERGIA/.test(n)) return "alergia";
  if (/INTOXICACION|ENVENENAMIENTO/.test(n)) return "intoxicacion";
  if (/LACERACION/.test(n)) return "laceracion_sin_herida";
  return null;
}

export function mecanismoDe(v: unknown): Mecanismo | null {
  const k = clave(MECANISMOS, v);
  if (k) return k;
  const n = normalizar(v);
  if (/ESFUERZO|FALSO MOV/.test(n)) return "sobre_esfuerzo";
  if (/PISADA|CHOQUE|GOLPE/.test(n)) return "pisadas_choques_golpes";
  if (/CAIDA DE PERSONA/.test(n)) return "caida_personas";
  if (/CAIDA DE OBJETO/.test(n)) return "caida_objetos";
  if (/ATRAPAMIENTO/.test(n)) return "atrapamiento";
  if (/TEMPERATURA/.test(n)) return "temperatura_extrema";
  if (/ELECTRICIDAD/.test(n)) return "electricidad";
  if (/RADIACION/.test(n)) return "radiaciones";
  if (/SUSTANCIA|SALPI/.test(n)) return "sustancias_nocivas";
  if (/PARTICULA/.test(n)) return "contacto_particulas";
  return null;
}

export function agenteDe(v: unknown): Agente | null {
  const k = clave(AGENTES, v);
  if (k) return k;
  const n = normalizar(v);
  if (/MAQUINA/.test(n)) return "maquinas_equipos";
  if (/TRANSPORTE/.test(n)) return "medios_transporte";
  if (/HERRAMIENTA|UTENSILIO/.test(n)) return "herramientas";
  if (/MATERIAL|SUSTANCIA/.test(n)) return "materiales_sustancias";
  if (/AMBIENTE/.test(n)) return "ambiente_trabajo";
  if (/APARATO/.test(n)) return "aparatos";
  if (/RADIACION/.test(n)) return "radiaciones";
  if (/ANIMAL/.test(n)) return "animales";
  return null;
}

/**
 * Grupo de la caracterización para la parte del cuerpo escrita. Con varias
 * partes («PIERNA Y BRAZO IZQUIERDO») manda la primera de miembros superiores,
 * como la contó SST.
 */
export function grupoParteCuerpoDe(v: unknown): GrupoParteCuerpo {
  const n = normalizar(v);
  if (!n) return "otro";
  if (/\bOJO/.test(n)) return "ojo";
  if (/MANO|DEDO|PULGAR|MUNECA/.test(n)) return "manos";
  if (/BRAZO|HOMBRO|CODO|ANTEBRAZO/.test(n)) return "miembros_superiores";
  if (/\bPIE\b|PIES|TOBILLO|TALON/.test(n)) return "pies";
  if (/PIERNA|RODILLA|MUSLO|CADERA/.test(n)) return "miembros_inferiores";
  if (/CABEZA|CARA|ROSTRO|FRENTE|NARIZ|BOCA|OREJA/.test(n)) return "cabeza_cara";
  if (/CUELLO/.test(n)) return "cuello";
  if (/TORAX|COSTILLA|PECHO|ESPALDA/.test(n)) return "torax";
  if (/ABDOMEN/.test(n)) return "abdomen";
  if (/TRONCO/.test(n)) return "tronco";
  if (/MULTIPLE|VARIAS/.test(n)) return "ubicaciones_multiples";
  return "otro";
}

/** Número de serie de Excel → ISO. */
function serieAIso(n: number): string {
  return new Date(Math.round((n - 25569) * 86400000)).toISOString().slice(0, 10);
}

/** Fecha de una celda: serie de Excel o texto m/d/aa (como lo muestra el Excel en EE. UU.) o d/m/aaaa. */
export function fechaDe(v: unknown): string | null {
  if (typeof v === "number" && Number.isFinite(v) && v > 20000) return serieAIso(v);
  const s = String(v ?? "").trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const p = s.split(/\D+/).filter(Boolean).map(Number);
  if (p.length !== 3) return null;
  const [a, b] = p;
  const c = p[2] < 100 ? p[2] + 2000 : p[2];
  // d/m/aaaa si el primero no puede ser mes.
  const [mes, dia] = a > 12 ? [b, a] : [a, b];
  if (!(mes >= 1 && mes <= 12 && dia >= 1 && dia <= 31)) return null;
  return `${c}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
}

/** Hora de una celda: fracción del día de Excel o texto «9:26:00 AM» → «09:26». */
export function horaDe(v: unknown): string | null {
  if (typeof v === "number" && Number.isFinite(v) && v >= 0 && v < 1) {
    const min = Math.round(v * 24 * 60);
    return `${String(Math.floor(min / 60) % 24).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
  }
  const m = /^(\d{1,2}):(\d{2})(?::\d{2})?\s*([AP])?\.?\s*M?\.?$/i.exec(String(v ?? "").trim());
  if (!m) return null;
  let h = Number(m[1]);
  const ap = m[3]?.toUpperCase();
  if (ap === "P" && h < 12) h += 12;
  if (ap === "A" && h === 12) h = 0;
  return h < 24 ? `${String(h).padStart(2, "0")}:${m[2]}` : null;
}

const siNo = (v: unknown): boolean | null => {
  const n = normalizar(v);
  if (n === "SI" || n === "S") return true;
  if (n === "NO" || n === "N") return false;
  return null;
};
const textoLimpio = (v: unknown) => {
  const s = String(v ?? "").replace(/\s+/g, " ").trim();
  return s || null;
};
/** «CONDUCTOR - COBRADOR» → «Conductor - cobrador». */
const comoTitulo = (v: unknown) => {
  const s = textoLimpio(v)?.toLowerCase();
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : null;
};
/** «ANTONIO ELIAS CAMARGO MORENO» → «Antonio Elias Camargo Moreno». */
const comoNombre = (v: unknown) =>
  textoLimpio(v)
    ?.toLowerCase()
    .split(" ")
    .map((w, i) => (i > 0 && ["de", "del", "la", "las", "los", "y"].includes(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(" ") ?? null;

export interface FilaExcelAt {
  hoja: string;
  fila: number;
  celdas: unknown[];
}

export type ResultadoFilaAt =
  | { ok: true; anio: number; caso: number; historicoRef: string; datos: DatosAccidenteTrabajo; avisos: string[] }
  | { ok: false; error: string };

/**
 * Una fila de «Consolidado AAAA» (crudas: `sheet_to_json(..., { header: 1,
 * raw: true })`). Columnas, en orden: caso, mes, fecha AT, fecha de
 * notificación, cédula, nombre, cargo, empresa usuaria, ciudad, tipo de
 * lesión, descripción, parte del cuerpo, mecanismo, agente, accidente de
 * tránsito, hora, días de incapacidad, sexo, día de la semana, estado de la
 * investigación, cierre administrativo ARL.
 */
export function mapearFilaAt(f: FilaExcelAt): ResultadoFilaAt {
  const c = f.celdas;
  const avisos: string[] = [];
  const caso = Number(String(c[0] ?? "").trim());
  if (!Number.isInteger(caso) || caso <= 0) return { ok: false, error: `Fila ${f.fila}: «CASO No» no es un número.` };
  const fechaAt = fechaDe(c[2]);
  if (!fechaAt) return { ok: false, error: `Fila ${f.fila}: fecha del accidente ilegible («${String(c[2] ?? "")}»).` };
  const anio = Number(fechaAt.slice(0, 4));
  const nombre = comoNombre(c[5]);
  if (!nombre) return { ok: false, error: `Fila ${f.fila}: falta el nombre del trabajador.` };

  const tipoLesion = tipoLesionDe(c[9]);
  const mecanismo = mecanismoDe(c[12]);
  const agente = agenteDe(c[13]);
  if (!tipoLesion) avisos.push(`tipo de lesión no reconocido «${String(c[9] ?? "")}»: se guarda como «Otro»`);
  if (!mecanismo) avisos.push(`mecanismo no reconocido «${String(c[12] ?? "")}»: se guarda como «Otro»`);
  if (!agente) avisos.push(`agente no reconocido «${String(c[13] ?? "")}»: se guarda como «Otro»`);

  const mesCol = MESES.findIndex((m) => normalizar(m) === normalizar(c[1]));
  if (mesCol >= 0 && mesCol + 1 !== Number(fechaAt.slice(5, 7))) avisos.push(`la columna MES dice ${String(c[1])} y la fecha es ${fechaAt}`);
  const diaCol = DIAS_SEMANA.findIndex((d) => normalizar(d) === normalizar(c[18]));
  if (diaCol >= 0 && diaCol !== diaSemana(fechaAt)) avisos.push(`la columna DÍA dice ${String(c[18])} y la fecha cae ${DIAS_SEMANA[diaSemana(fechaAt)]}`);

  const dias = Number(String(c[16] ?? "0").replace(/\D/g, "") || 0);
  const sexoN = normalizar(c[17]);
  const estadoN = normalizar(c[19]);
  return {
    ok: true,
    anio,
    caso,
    historicoRef: `${f.hoja}:${f.fila}`,
    avisos,
    datos: {
      fechaAt,
      hora: horaDe(c[15]),
      fechaNotificacion: fechaDe(c[3]),
      cedula: String(c[4] ?? "").replace(/\D/g, "") || null,
      nombre,
      cargo: comoTitulo(c[6]),
      empresaUsuaria: textoLimpio(c[7]),
      ciudad: comoTitulo(c[8]),
      sexo: sexoN === "M" || sexoN === "F" ? sexoN : null,
      tipoLesion: tipoLesion ?? "otro",
      parteCuerpo: comoTitulo(c[11]),
      parteCuerpoGrupo: grupoParteCuerpoDe(c[11]),
      mecanismo: mecanismo ?? "otro",
      agente: agente ?? "otro",
      descripcion: textoLimpio(c[10]),
      accidenteTransito: siNo(c[14]) === true,
      diasIncapacidad: Number.isFinite(dias) ? dias : 0,
      estadoInvestigacion: !estadoN ? null : /CERRAD/.test(estadoN) ? "cerrada" : /CURSO|PROCESO/.test(estadoN) ? "en_curso" : "pendiente",
      cierreAdministrativoArl: siNo(c[20]),
      observaciones: null,
    },
  };
}

/** Filas de datos de una hoja «Consolidado»: desde el encabezado «CASO No» hasta la primera sin nombre. */
export function filasDeHoja(hoja: string, crudas: unknown[][]): FilaExcelAt[] {
  const iEnc = crudas.findIndex((r) => normalizar(r?.[0]) === "CASO NO");
  if (iEnc < 0) throw new Error(`La hoja ${hoja} no tiene el encabezado «CASO No».`);
  const salida: FilaExcelAt[] = [];
  for (let i = iEnc + 1; i < crudas.length; i++) {
    const r = crudas[i] ?? [];
    // Debajo de los casos están las listas desplegables (sin caso ni nombre).
    if (!String(r[0] ?? "").trim() || !String(r[5] ?? "").trim()) {
      if (salida.length > 0) break;
      continue;
    }
    salida.push({ hoja, fila: i + 1, celdas: r });
  }
  return salida;
}
