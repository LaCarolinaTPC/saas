// Accidentabilidad — Histórico de la Matriz de Control de Accidentes (GO-R-22)
// =============================================================================
// Reglas puras para convertir una fila de la matriz en Excel (exportada a CSV)
// al modelo de Gestivo. Las usa scripts/migrar-accidentes-historico.mts; viven
// aquí para poder probarlas sin base de datos.
//
// La matriz no traía muchos datos que hoy pide el formato (cédula, firma,
// lesionados por gravedad, huellas, etc.): esos quedan vacíos y el registro
// se marca con origen = 'historico'.

import type { ClaseAccidente } from "./formato";

export const REF_MATRIZ = "GO-R-22";

/** Encabezados de la matriz que usa la importación (normalizados con `clave`). */
export const COL = {
  fecha: "fecha accidente",
  hora: "hora accidente",
  direccion: "direccion accidente",
  danos: "danos mater.",
  lesion: "lesion.",
  danosLesiones: "danos y lesiones",
  muerto: "muerto",
  ipat: "ipat",
  ipatNumero: "num. ipat",
  conciliacion: "concil.",
  propietario: "propietario",
  interno: "n. interno",
  placa: "placas",
  conductor: "conductor",
  funcionario: "funcionario que atendio accidente",
  ruta: "ruta",
  inmovilizacion: "inmov.",
  reporteAseguradora: "report. asegur.",
  reporteAseguradoraNumero: "# reporte aseg.",
  responsabilidad: "responsabilidad accidente",
  causal1: "causal 1",
  causal2: "causal 2",
  cobroConductor: "cobro conduct.",
  cobroTercero: "cobro tercero",
  usuarioVia: "usuario via",
  actorVial: "actor vial",
  vehiculoAfectado: "vehiculo afectado",
  terceroNombre: "nombre de propietario del vehiculo o lesionado",
  terceroDireccion: "direccion del tercero",
  terceroCelular: "tel. cel del tercero",
  terceroFijo: "tel. fijo del tercero",
  terceroPlaca: "placas del afectado",
  agente: "nombre agente transito",
  costo: "costo de reparacion",
  seguimiento: "seguimiento a los casos con lesionados",
  estadoCaso: "estado del caso",
} as const;

export type Fila = Record<string, string>;

// ── Utilidades de texto ─────────────────────────────────────────────────────

export function sinTildes(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/** Clave de encabezado: minúsculas, sin tildes, sin "°"/"º" ni espacios de más. */
export function clave(s: string): string {
  return sinTildes(s).toLowerCase().replace(/[°º]/g, "").replace(/\s+/g, " ").trim();
}

/** Valor con contenido, o null si la matriz lo dejó vacío o "Desconocido". */
export function nulo(v: string | undefined): string | null {
  const t = (v ?? "").replace(/ /g, " ").replace(/\s+/g, " ").trim();
  if (!t) return null;
  if (/^(desconocido|n\/?a|no aplica|usuario|-|\$ ?-)$/i.test(t)) return null;
  return t;
}

export function siNo(v: string | undefined): boolean | null {
  const t = clave(v ?? "");
  if (t === "si") return true;
  if (t === "no") return false;
  return null;
}

/** "$ 230,000" → 230000; "$ -" → 0; vacío → null. */
export function dinero(v: string | undefined): number | null {
  const t = (v ?? "").trim();
  if (!t) return null;
  if (/^\$?\s*-\s*$/.test(t)) return 0;
  const n = Number(t.replace(/[$\s,]/g, ""));
  return Number.isFinite(n) ? n : null;
}

// ── CSV ─────────────────────────────────────────────────────────────────────

/** Lector CSV mínimo (comillas dobles, comas y saltos de línea dentro de comillas). */
export function leerCsv(texto: string): string[][] {
  const filas: string[][] = [];
  let fila: string[] = [];
  let celda = "";
  let comillas = false;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (comillas) {
      if (c === '"' && texto[i + 1] === '"') { celda += '"'; i++; }
      else if (c === '"') comillas = false;
      else celda += c;
    } else if (c === '"') comillas = true;
    else if (c === ",") { fila.push(celda); celda = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && texto[i + 1] === "\n") i++;
      fila.push(celda); filas.push(fila); fila = []; celda = "";
    } else celda += c;
  }
  if (celda || fila.length) { fila.push(celda); filas.push(fila); }
  return filas;
}

// ── Fecha, ciudad y códigos ─────────────────────────────────────────────────

/**
 * "1/2/2024" + "9:08:00 AM" (M/D/AAAA, hora de Colombia) → ISO con -05:00.
 * Alguna fila quedó digitada como D/M/AAAA ("19/09/2026"): si el primer número
 * no puede ser mes y el segundo sí, se lee así.
 */
export function fechaHora(fecha: string, hora: string): string | null {
  const f = fecha.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!f) return null;
  let [, mes, dia] = f.map(Number);
  const anio = Number(f[3]);
  if (mes > 12 && dia <= 12) [mes, dia] = [dia, mes];
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return null;
  let hh = 0, mm = 0;
  const h = hora.trim().match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*([AP]M)?$/i);
  if (h) {
    hh = Number(h[1]) % 12;
    if (!h[3]) hh = Number(h[1]);
    else if (h[3].toUpperCase() === "PM") hh += 12;
    mm = Number(h[2]);
  }
  const p = (n: number) => String(n).padStart(2, "0");
  return `${anio}-${p(mes)}-${p(dia)}T${p(hh)}:${p(mm)}:00-05:00`;
}

/** Ciudad del catálogo según lo que diga la dirección ("CALLE 38 CARRERA 41 - BARRANQUILLA"). */
export function ciudadDesdeDireccion(direccion: string): string | null {
  const t = clave(direccion).toUpperCase();
  if (/\bSOLEDAD\b/.test(t)) return "soledad";
  if (/PUERTO COLOMBIA|\bPTO?\.? ?COLOMBIA/.test(t)) return "puerto_colombia";
  // Barranquilla aparece con muchos errores de digitación (BARRAQNUILLA, BARANQUILLA…).
  if (/\bBAR+A?N?Q?U?I+L+A\b|\bBARR?A[NQM]/.test(t)) return "barranquilla";
  return null;
}

/** Código de tránsito al inicio de la causal ("121 NO MANTENER…" → "121"). */
export function codigoCausal(v: string | undefined): string | null {
  const m = (v ?? "").replace(/ /g, " ").match(/^\s*(\d{3})\b/);
  return m ? m[1] : null;
}

const RESPONSABILIDAD: Record<string, "directo" | "tercero" | "compartido"> = {
  conductor: "directo",
  tercero: "tercero",
  compartida: "compartido",
};

// ── Tercero y lesionados ────────────────────────────────────────────────────

const TIPO_VEHICULO: Record<string, string> = {
  automovil: "automovil", moto: "moto", camioneta: "camioneta", buseta: "buseta",
  bus: "bus", "moto carro": "motocarro", motocarro: "motocarro", camion: "camion",
  furgon: "furgon", vans: "vans", bicicleta: "bicicleta", campero: "campero",
  mula: "mula", ambulancia: "ambulancia",
};
const OBJETOS = new Set(["carretilla", "vivienda", "muro", "poste", "anden"]);
const PERSONAS: Record<string, "usuario" | "en_vehiculo" | "peaton"> = {
  "pasajero flota": "usuario",
  "pasajero tercero": "en_vehiculo",
  peaton: "peaton",
};

function claseVehiculo(afectado: string): { clase: string | null; afiliado_a: string | null } {
  const t = clave(afectado);
  if (t === "particular") return { clase: "particular", afiliado_a: null };
  if (t === "publico" || t === "intermunicipal" || t === "bus") return { clase: "publico", afiliado_a: null };
  if (t === "empresa") return { clase: "publico", afiliado_a: "Flota propia (empresa)" };
  if (t === "afiliado") return { clase: "publico", afiliado_a: "Flota propia (afiliado)" };
  return { clase: null, afiliado_a: null };
}

// ── Fila → registro ─────────────────────────────────────────────────────────

export type TerceroHistorico = {
  placa: string | null;
  descripcion: string | null;
  tipo_vehiculo: string | null;
  clase_vehiculo: string | null;
  afiliado_a: string | null;
  propietario_nombre: string | null;
  propietario_telefono: string | null;
  propietario_direccion: string | null;
};

export type VictimaHistorica = {
  nombre: string;
  direccion: string | null;
  telefono: string | null;
  condicion: "usuario" | "en_vehiculo" | "peaton";
  fallecido: boolean;
};

export type AccidenteHistorico = {
  historico_ref: string;
  historico_datos: Record<string, string>;
  conductor_nombre_matriz: string;
  fecha_accidente: string;
  direccion_accidente: string;
  ciudad: string | null;
  clase_accidente: ClaseAccidente;
  lesionados: "fatal" | null;
  tiene_ipat: boolean | null;
  ipat_numero: string | null;
  transaccion: boolean | null;
  vehiculo_empresa: boolean | null;
  vehiculo_afiliado: boolean | null;
  vehiculo_codigo: string | null;
  vehiculo_placa: string | null;
  vehiculo_ruta: string | null;
  inmovilizacion: boolean | null;
  solicito_aseguradora: boolean;
  aseguradora_reporte_numero: string | null;
  responsabilidad_reportada: "directo" | "tercero" | "compartido" | null;
  factores_codigos: string[];
  agente_nombre: string | null;
  funcionario_atendio: string | null;
  costo_reparacion: number | null;
  cobro_conductor: boolean | null;
  cobro_tercero: boolean | null;
  caso_estado: "abierto" | "cerrado" | null;
  seguimiento_lesionados: string | null;
  tercero: TerceroHistorico | null;
  victima: VictimaHistorica | null;
};

export type ResultadoFila =
  | { ok: true; registro: AccidenteHistorico; avisos: string[] }
  | { ok: false; motivo: string };

/** ¿La fila tiene datos? La matriz exportada trae ~1 millón de filas vacías. */
export function filaConDatos(f: Fila): boolean {
  return Boolean(nulo(f[COL.fecha]) || nulo(f[COL.conductor]) || nulo(f[COL.placa]));
}

export function mapearFila(f: Fila, numeroFila: number): ResultadoFila {
  const v = (k: keyof typeof COL) => f[COL[k]] ?? "";
  const avisos: string[] = [];

  const fecha = fechaHora(v("fecha"), v("hora"));
  if (!fecha) return { ok: false, motivo: `Fecha inválida: "${v("fecha")}"` };
  if (!nulo(v("hora"))) avisos.push("Sin hora: se cargó a las 00:00");

  const conductor = nulo(v("conductor"));
  if (!conductor) return { ok: false, motivo: "Sin nombre de conductor" };

  const muerto = Boolean(nulo(v("muerto")));
  const lesion = Boolean(nulo(v("lesion")) || nulo(v("danosLesiones")));
  const clase: ClaseAccidente = muerto ? "muerto" : lesion ? "lesionado" : "simple";

  const propietario = clave(v("propietario"));
  const esEmpresa = propietario.startsWith("empr");
  const esAfiliado = propietario.startsWith("afil");

  const codigos = [...new Set([codigoCausal(v("causal1")), codigoCausal(v("causal2"))].filter((c): c is string => !!c))];
  if (nulo(v("causal1")) && !codigoCausal(v("causal1"))) avisos.push(`Causal sin código: "${v("causal1")}"`);

  const resp = RESPONSABILIDAD[clave(v("responsabilidad"))] ?? null;
  if (!resp) avisos.push(`Responsabilidad no reconocida: "${v("responsabilidad")}"`);

  const tieneIpat = siNo(v("ipat"));
  const estadoCaso = clave(v("estadoCaso"));
  const direccion = nulo(v("direccion")) ?? "Sin dirección";
  const ciudad = ciudadDesdeDireccion(direccion);
  if (!ciudad) avisos.push(`Ciudad no reconocida en la dirección: "${direccion}"`);

  // ── Tercero / lesionado ──
  const usuarioVia = clave(v("usuarioVia"));
  const nombreTercero = nulo(v("terceroNombre"));
  const telefono = nulo(v("terceroCelular")) ?? nulo(v("terceroFijo"));
  const direccionTercero = nulo(v("terceroDireccion"));
  const afectado = clave(v("vehiculoAfectado"));

  const condicionPersona = PERSONAS[usuarioVia];
  const hayVictima = lesion || muerto || Boolean(condicionPersona) || afectado === "lesionado";
  const victima: VictimaHistorica | null = hayVictima
    ? {
        nombre: nombreTercero ?? "Sin identificar",
        direccion: direccionTercero,
        telefono,
        condicion: condicionPersona ?? "en_vehiculo",
        fallecido: muerto,
      }
    : null;

  const tipo = TIPO_VEHICULO[usuarioVia] ?? null;
  const objeto = OBJETOS.has(usuarioVia);
  const placaTercero = nulo(v("terceroPlaca"))?.toUpperCase() ?? null;
  const hayVehiculo = Boolean(tipo || objeto || (placaTercero && !condicionPersona));
  const { clase: claseV, afiliado_a } = claseVehiculo(v("vehiculoAfectado"));
  const tercero: TerceroHistorico | null = hayVehiculo
    ? {
        placa: placaTercero,
        descripcion: objeto ? nulo(v("usuarioVia")) : null,
        tipo_vehiculo: tipo,
        clase_vehiculo: objeto ? null : claseV,
        afiliado_a,
        propietario_nombre: nombreTercero,
        propietario_telefono: telefono,
        propietario_direccion: direccionTercero,
      }
    : null;
  if (usuarioVia && !tipo && !objeto && !condicionPersona) avisos.push(`Usuario de vía no reconocido: "${v("usuarioVia")}"`);

  const historico_datos: Record<string, string> = {};
  for (const [k, val] of Object.entries(f)) {
    const t = val.replace(/ /g, " ").trim();
    if (k && t) historico_datos[k] = t;
  }

  return {
    ok: true,
    avisos,
    registro: {
      historico_ref: `${REF_MATRIZ}!fila ${numeroFila}`,
      historico_datos,
      conductor_nombre_matriz: conductor,
      fecha_accidente: fecha,
      direccion_accidente: direccion,
      ciudad,
      clase_accidente: clase,
      lesionados: muerto ? "fatal" : null,
      tiene_ipat: tieneIpat,
      ipat_numero: tieneIpat ? nulo(v("ipatNumero")) : null,
      transaccion: siNo(v("conciliacion")),
      vehiculo_empresa: esEmpresa ? true : esAfiliado ? false : null,
      vehiculo_afiliado: esAfiliado ? true : esEmpresa ? false : null,
      vehiculo_codigo: nulo(v("interno")),
      vehiculo_placa: nulo(v("placa"))?.replace(/[\s-]/g, "").toUpperCase() ?? null,
      vehiculo_ruta: nulo(v("ruta")),
      inmovilizacion: siNo(v("inmovilizacion")),
      solicito_aseguradora: siNo(v("reporteAseguradora")) === true,
      aseguradora_reporte_numero: nulo(v("reporteAseguradoraNumero")),
      responsabilidad_reportada: resp,
      factores_codigos: codigos,
      agente_nombre: nulo(v("agente")),
      funcionario_atendio: nulo(v("funcionario")),
      costo_reparacion: dinero(v("costo")),
      cobro_conductor: siNo(v("cobroConductor")),
      cobro_tercero: siNo(v("cobroTercero")),
      caso_estado: estadoCaso === "abierto" || estadoCaso === "cerrado" ? estadoCaso : null,
      seguimiento_lesionados: nulo(v("seguimiento")),
      tercero,
      victima,
    },
  };
}

// ── Conductor: nombre de la matriz → maestro ────────────────────────────────

const PARTICULAS = new Set(["DE", "DEL", "LA", "LAS", "LOS", "Y"]);

/** Palabras del nombre, sin tildes ni partículas ("DE LA HOZ" → ["HOZ"]). */
export function tokensNombre(nombre: string): string[] {
  return sinTildes(nombre)
    .toUpperCase()
    .replace(/[^A-Z ]/g, " ")
    .split(/\s+/)
    .filter((t) => t && !PARTICULAS.has(t));
}

export type ConductorMaestro = { id: string; cedula: string; nombre: string; codigo: string | null };

export type Emparejamiento =
  | { tipo: "exacto" | "probable"; conductor: ConductorMaestro }
  | { tipo: "ambiguo"; candidatos: ConductorMaestro[] }
  | { tipo: "ninguno" };

/**
 * Busca el conductor del maestro por nombre. Exacto: mismas palabras en
 * cualquier orden. Probable: uno de los dos nombres contiene todas las
 * palabras del otro (al Excel le suele faltar el segundo apellido o nombre),
 * con al menos 3 palabras en común y un único candidato.
 */
export function crearEmparejador(maestro: ConductorMaestro[]) {
  const porClave = new Map<string, ConductorMaestro[]>();
  const conTokens = maestro.map((c) => ({ c, t: new Set(tokensNombre(c.nombre)) }));
  for (const { c, t } of conTokens) {
    const k = [...t].sort().join(" ");
    porClave.set(k, [...(porClave.get(k) ?? []), c]);
  }
  return (nombre: string): Emparejamiento => {
    const t = new Set(tokensNombre(nombre));
    if (t.size === 0) return { tipo: "ninguno" };
    const exactos = porClave.get([...t].sort().join(" ")) ?? [];
    if (exactos.length === 1) return { tipo: "exacto", conductor: exactos[0] };
    if (exactos.length > 1) return { tipo: "ambiguo", candidatos: exactos };

    const contiene = (a: Set<string>, b: Set<string>) => [...a].every((x) => b.has(x));
    const parecidos = conTokens
      .filter(({ t: m }) => Math.min(m.size, t.size) >= 3 && (contiene(t, m) || contiene(m, t)))
      .map(({ c }) => c);
    if (parecidos.length === 1) return { tipo: "probable", conductor: parecidos[0] };
    if (parecidos.length > 1) return { tipo: "ambiguo", candidatos: parecidos };
    return { tipo: "ninguno" };
  };
}

/** Día calendario en Colombia de una fecha ISO (para cruzar con lo reportado en Gestivo). */
export function diaColombia(iso: string): string {
  return new Date(new Date(iso).getTime() - 5 * 3600 * 1000).toISOString().slice(0, 10);
}
