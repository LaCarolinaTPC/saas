/**
 * Experiencia laboral del aspirante y su verificación (pedido del usuario,
 * 21-nov-2026). PURO; lo que escribe está en ./experiencia-servidor.
 *
 * Cada empleo empieza «sin verificar»: lo que dice la hoja de vida es
 * declarado. Queda verificado cuando llega una carta laboral de esa empresa o
 * cuando alguien llama a una referencia de ahí; una persona también puede
 * marcarlo a mano, o como «no se confirmó».
 */
import { mesesConduccion } from "./lectura/interpretar";
import type { ExperienciaLeida } from "./lectura/esquema";

export type VerificacionExperiencia = "sin_verificar" | "verificada" | "no_confirmada";
export type ComoSeVerifico = "carta_laboral" | "referencia" | "otro";

export interface ExperienciaLaboral {
  id: string;
  empresa: string | null;
  cargo: string | null;
  /** AAAA-MM. */
  desde: string | null;
  /** AAAA-MM o «actual». */
  hasta: string | null;
  vehiculo: string | null;
  conduccion: boolean;
  origen: "hoja_vida" | "manual";
  verificacion: VerificacionExperiencia;
  como: ComoSeVerifico | null;
  nota: string | null;
  verificada_por: string | null;
  verificada_at: string | null;
  /** Lo que no coincide entre la carta laboral y la hoja de vida (fechas, cargo); null si coincide o no hay carta. */
  diferencias?: string | null;
  /** Lo que decía la hoja de vida antes de que la carta corrigiera las fechas («2018-01 a 2023-05»). */
  declarado?: string | null;
}

export const ETIQUETA_VERIFICACION: Record<VerificacionExperiencia, string> = {
  sin_verificar: "Sin verificar",
  verificada: "Verificada",
  no_confirmada: "No se confirmó",
};

export const ETIQUETA_COMO: Record<ComoSeVerifico, string> = {
  carta_laboral: "con carta laboral",
  referencia: "llamando a la referencia",
  otro: "por otro medio",
};

/** «Transportes Ficticios S.A.S.» → «transportes ficticios»: sin tildes, signos ni la forma societaria. */
export function normalizarEmpresa(nombre: string | null | undefined): string {
  return String(nombre ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\b(s ?a ?s|s ?a|ltda|limitada|e ?u|y cia|cia|sociedad|empresa|de transportes?)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Palabras que no distinguen a una empresa de otra. «Transmetro» es el
 * sistema, no el empleador: Sistur y Metrocaribe son operadores distintos.
 */
const PALABRAS_GENERICAS = new Set([
  "operador", "operadora", "transporte", "transportes", "servicio", "servicios", "grupo", "cooperativa", "colombia",
  "barranquilla", "soledad", "atlantico", "caribe", "costa", "norte", "express", "buses", "urbano", "urbanos",
  "integrado", "masivo", "transmetro", "conductores", "pasajeros",
]);
const palabrasDistintivas = (normalizado: string) => normalizado.split(" ").filter((w) => w.length >= 4 && !PALABRAS_GENERICAS.has(w));

/**
 * ¿Hablan de la misma empresa? Igual, una contiene a la otra (con al menos 4
 * letras) o comparten una palabra distintiva (23-nov-2026: «Transmetro S.A.S.
 * (operador Sistur)» en la hoja de vida y «SISTUR S.A.S. - OPERADOR
 * TRANSMETRO» en la carta no se reconocían como la misma).
 */
export function mismaEmpresa(a: string | null | undefined, b: string | null | undefined): boolean {
  const x = normalizarEmpresa(a);
  const y = normalizarEmpresa(b);
  if (x.length < 4 || y.length < 4) return false;
  if (x === y || x.includes(y) || y.includes(x)) return true;
  const enY = new Set(palabrasDistintivas(y));
  return palabrasDistintivas(x).some((w) => enY.has(w));
}

let contador = 0;
/** Id corto para un empleo nuevo (no hace falta que sea global: vive dentro del proceso). */
export function nuevoId(ahora = Date.now()): string {
  contador = (contador + 1) % 1000;
  return `exp_${ahora.toString(36)}${contador.toString(36)}`;
}

/**
 * Agrega los empleos leídos de una hoja de vida que no estén ya (misma
 * empresa y mismo inicio). Los que ya están no se tocan: su verificación se conserva.
 */
export function fusionarLeidas(existentes: readonly ExperienciaLaboral[], leidas: readonly ExperienciaLeida[], ahora = Date.now()): ExperienciaLaboral[] {
  const out = [...existentes];
  for (const l of leidas) {
    if (!l.empresa && !l.cargo) continue;
    // Mismo inicio, o a ±2 meses, o el que decía la hoja de vida antes de que una
    // carta corrigiera las fechas: así no se duplica un empleo ya verificado.
    const mismoInicio = (e: ExperienciaLaboral) =>
      (e.desde ?? "") === (l.desde ?? "") ||
      (!!e.desde && !!l.desde && /^\d{4}-\d{2}/.test(e.desde) && /^\d{4}-\d{2}/.test(l.desde) && mesesEntre(e.desde.slice(0, 7), l.desde.slice(0, 7)) <= 2) ||
      (!!l.desde && !!e.declarado?.startsWith(l.desde));
    const repetida = out.some((e) => (e.empresa && l.empresa ? mismaEmpresa(e.empresa, l.empresa) : e.cargo === l.cargo) && mismoInicio(e));
    if (repetida) continue;
    out.push({
      id: nuevoId(ahora),
      empresa: l.empresa,
      cargo: l.cargo,
      desde: l.desde,
      hasta: l.hasta,
      vehiculo: l.vehiculo,
      conduccion: l.conduccion,
      origen: "hoja_vida",
      verificacion: "sin_verificar",
      como: null,
      nota: null,
      verificada_por: null,
      verificada_at: null,
    });
  }
  return out;
}

/**
 * Marca como verificados los empleos de esa empresa que siguen sin verificar
 * (al aceptar una carta laboral o al validar una referencia). Devuelve la
 * lista nueva y cuántos cambió. No toca los que alguien ya decidió.
 */
export function verificarPorEmpresa(
  items: readonly ExperienciaLaboral[],
  empresa: string | null | undefined,
  d: { como: ComoSeVerifico; nota?: string | null; por: string | null; at: string }
): { items: ExperienciaLaboral[]; cambiados: number } {
  let cambiados = 0;
  const nuevos = items.map((e) => {
    if (e.verificacion !== "sin_verificar" || !mismaEmpresa(e.empresa, empresa)) return e;
    cambiados++;
    return { ...e, verificacion: "verificada" as const, como: d.como, nota: d.nota?.trim().slice(0, 300) || null, verificada_por: d.por, verificada_at: d.at };
  });
  return { items: nuevos, cambiados };
}

// ── Constatar la carta laboral con la hoja de vida (21-nov-2026) ─────────────

export interface DatosCarta {
  empresa: string | null;
  cargo: string | null;
  /** AAAA-MM o AAAA-MM-DD. */
  desde: string | null;
  /** AAAA-MM, AAAA-MM-DD, «actual» o null («a la fecha»). */
  hasta: string | null;
  /** A nombre de quién está la carta. */
  nombre?: string | null;
}

const CONDUCCION_RE = /conduct|chofer|chófer|operador|motorista|piloto/i;
const mesDe = (v: string | null | undefined): string | null => (v && /^\d{4}-\d{2}/.test(v) ? v.slice(0, 7) : null);
const esActual = (v: string | null | undefined) => !v || /actual|fecha|vigente|presente/i.test(v);
const mesesEntre = (a: string, b: string) => {
  const [ya, ma] = a.split("-").map(Number);
  const [yb, mb] = b.split("-").map(Number);
  return Math.abs((ya - yb) * 12 + (ma - mb));
};

/** ¿La carta está a nombre del aspirante? Al menos dos palabras del nombre (o todas, si son menos) coinciden. */
export function cartaDelAspirante(nombreCarta: string | null | undefined, nombreAspirante: string | null | undefined): boolean {
  const palabras = (s: string | null | undefined) =>
    String(s ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().split(/[^a-z]+/).filter((w) => w.length > 2);
  const carta = palabras(nombreCarta);
  const asp = new Set(palabras(nombreAspirante));
  if (!carta.length || !asp.size || [...asp].join(" ") === "por confirmar") return true; // sin dato: no se puede decir que no
  const comunes = carta.filter((w) => asp.has(w)).length;
  return comunes >= Math.min(2, carta.length, asp.size);
}

/** Lo que no coincide entre un empleo de la hoja de vida y la carta laboral de esa empresa. */
export function diferenciasConCarta(e: Pick<ExperienciaLaboral, "desde" | "hasta" | "cargo" | "conduccion">, c: DatosCarta): string[] {
  const out: string[] = [];
  const desdeCarta = mesDe(c.desde);
  if (desdeCarta && e.desde && mesesEntre(desdeCarta, e.desde) > 2) out.push(`inicio: la hoja de vida dice ${e.desde} y la carta ${desdeCarta}`);
  const hastaCarta = esActual(c.hasta) ? "actual" : mesDe(c.hasta);
  const hastaHv = esActual(e.hasta) ? "actual" : mesDe(e.hasta);
  if (hastaCarta && hastaHv && hastaCarta !== hastaHv) {
    if (hastaCarta === "actual" || hastaHv === "actual" || mesesEntre(hastaCarta, hastaHv) > 2) out.push(`fin: la hoja de vida dice ${hastaHv} y la carta ${hastaCarta}`);
  }
  if (e.conduccion && c.cargo && !CONDUCCION_RE.test(c.cargo)) out.push(`cargo: la hoja de vida dice ${e.cargo ?? "conductor"} y la carta «${c.cargo}»`);
  return out;
}

export interface ResultadoCarta {
  items: ExperienciaLaboral[];
  /** verificada: coincide · con_diferencias: verificada, pero con diferencias anotadas · agregada: no estaba en la hoja de vida · otro_nombre: no es del aspirante. */
  resultado: "verificada" | "con_diferencias" | "agregada" | "otro_nombre" | null;
  diferencias: string[];
}

/**
 * Constata la carta laboral con la hoja de vida: busca el empleo de esa
 * empresa (el de inicio más cercano si hay varios), lo marca verificado y
 * anota lo que no coincide. Para los meses verificados mandan las fechas de
 * la carta (lo declarado queda anotado). Si la empresa no estaba en la hoja
 * de vida, el empleo se agrega ya verificado. Una carta a nombre de otra
 * persona no verifica nada.
 */
export function constatarCarta(
  items: readonly ExperienciaLaboral[],
  carta: DatosCarta,
  nombreAspirante: string | null,
  d: { por: string | null; at: string; ahora?: number }
): ResultadoCarta {
  if (!carta.empresa?.trim()) return { items: [...items], resultado: null, diferencias: [] };
  if (!cartaDelAspirante(carta.nombre, nombreAspirante)) {
    return { items: [...items], resultado: "otro_nombre", diferencias: [`la carta está a nombre de ${carta.nombre}, no de ${nombreAspirante}`] };
  }
  const desdeCarta = mesDe(carta.desde);
  const hastaCarta = esActual(carta.hasta) ? (carta.hasta ? "actual" : null) : mesDe(carta.hasta);
  const candidatos = items.filter((e) => e.verificacion !== "no_confirmada" && mismaEmpresa(e.empresa, carta.empresa));
  const elegido = [...candidatos].sort((a, b) => {
    const dist = (e: ExperienciaLaboral) => (desdeCarta && e.desde ? mesesEntre(desdeCarta, e.desde) : 999);
    return dist(a) - dist(b);
  })[0];
  if (!elegido) {
    const conduccion = CONDUCCION_RE.test(carta.cargo ?? "");
    const [nuevo] = fusionarLeidas([], [{ empresa: carta.empresa, cargo: carta.cargo, desde: desdeCarta, hasta: hastaCarta, vehiculo: null, conduccion }], d.ahora);
    return {
      items: [...items, { ...nuevo, verificacion: "verificada", como: "carta_laboral", nota: "Carta laboral recibida (no estaba en la hoja de vida)", verificada_por: d.por, verificada_at: d.at, diferencias: null }],
      resultado: "agregada",
      diferencias: [],
    };
  }
  const difs = diferenciasConCarta(elegido, carta);
  const fechasCambian = (desdeCarta && desdeCarta !== elegido.desde) || (hastaCarta && hastaCarta !== elegido.hasta);
  // La hoja de vida dice que manejaba y la carta da otro cargo (23-nov-2026): la
  // carta no confirma esa experiencia de conducción. Antes quedaba «verificada»
  // y sus meses contaban como conducción verificada. Lo revisa una persona.
  const noConfirmaConduccion = elegido.conduccion && !!carta.cargo && !CONDUCCION_RE.test(carta.cargo);
  const actualizado: ExperienciaLaboral = {
    ...elegido,
    verificacion: noConfirmaConduccion ? "no_confirmada" : "verificada",
    como: "carta_laboral",
    nota: noConfirmaConduccion
      ? `La carta laboral no confirma que manejara: dice «${carta.cargo}»`
      : difs.length
        ? "Carta laboral recibida: no todo coincide con la hoja de vida"
        : "Carta laboral recibida: coincide con la hoja de vida",
    verificada_por: d.por,
    verificada_at: d.at,
    diferencias: difs.length ? difs.join("; ") : null,
    // La carta manda en las fechas; lo que decía la hoja de vida queda anotado.
    desde: desdeCarta ?? elegido.desde,
    hasta: hastaCarta ?? elegido.hasta,
    declarado: fechasCambian ? `${elegido.desde ?? "?"} a ${elegido.hasta ?? "?"}` : elegido.declarado ?? null,
  };
  return { items: items.map((e) => (e.id === elegido.id ? actualizado : e)), resultado: difs.length ? "con_diferencias" : "verificada", diferencias: difs };
}

/**
 * ¿La carta se puede validar sola, sin que una persona la acepte? (pedido del
 * 23-nov-2026, ajuste `validar_cartas_auto`). Solo si todo coincide: está a
 * nombre del aspirante (el nombre se leyó), el cargo es de conducción, hay un
 * empleo de conducción de esa empresa —en la experiencia ya aceptada o en la
 * hoja de vida leída— y las fechas no difieren en más de dos meses. Cualquier
 * duda (otra persona, otro cargo, otras fechas, empresa que no está) queda
 * para Gestión Humana. Devuelve el empleo de la hoja de vida que confirma
 * cuando todavía no está en la experiencia del candidato.
 */
export function cartaParaValidarSola(
  items: readonly ExperienciaLaboral[],
  deHojaDeVida: readonly ExperienciaLeida[],
  carta: DatosCarta,
  nombreAspirante: string | null
): { ok: true; empleoNuevo: ExperienciaLeida | null } | { ok: false; motivo: string } {
  if (!carta.empresa?.trim() || !mesDe(carta.desde)) return { ok: false, motivo: "la carta no trae empresa o fecha de inicio" };
  if (!carta.nombre?.trim() || !cartaDelAspirante(carta.nombre, nombreAspirante)) return { ok: false, motivo: "no se pudo confirmar que la carta sea del aspirante" };
  if (!carta.cargo || !CONDUCCION_RE.test(carta.cargo)) return { ok: false, motivo: "el cargo de la carta no es de conducción" };
  const coincide = (e: Pick<ExperienciaLaboral, "empresa" | "desde" | "hasta" | "cargo" | "conduccion">) =>
    e.conduccion && mismaEmpresa(e.empresa, carta.empresa) && diferenciasConCarta(e, carta).length === 0;
  const yaEsta = items.filter((e) => mismaEmpresa(e.empresa, carta.empresa));
  if (yaEsta.length) {
    return yaEsta.some((e) => e.verificacion === "sin_verificar" && coincide(e)) ? { ok: true, empleoNuevo: null } : { ok: false, motivo: "no coincide con el empleo de la hoja de vida" };
  }
  const leido = deHojaDeVida.find((e) => coincide(e));
  return leido ? { ok: true, empleoNuevo: leido } : { ok: false, motivo: "la empresa no está en la hoja de vida o no coincide" };
}

export type EstadoExperiencia = "sin_datos" | "sin_verificar" | "parcial" | "verificada" | "con_problema";

export interface ResumenExperiencia {
  estado: EstadoExperiencia;
  /** Lo que se le muestra a Gestión Humana. */
  texto: string;
  /** Meses manejando según lo declarado (todos los empleos de conducción). */
  mesesDeclarados: number;
  /** Meses manejando solo de los empleos verificados. */
  mesesVerificados: number;
  /** Empleos de conducción con periodo incompleto (no se cuentan). */
  sinFecha: number;
}

/** Estado de la experiencia: se mira solo la de conducción, que es la que pide el cargo. */
export function resumenExperiencia(items: readonly ExperienciaLaboral[], hoy: string): ResumenExperiencia {
  const conduccion = items.filter((e) => e.conduccion);
  const declarados = mesesConduccion(conduccion, hoy);
  const verificados = mesesConduccion(conduccion.filter((e) => e.verificacion === "verificada"), hoy);
  const base = { mesesDeclarados: declarados.meses, mesesVerificados: verificados.meses, sinFecha: declarados.sinFecha };
  if (!conduccion.length) {
    return { ...base, estado: "sin_datos", texto: items.length ? "Ningún empleo de conducción registrado." : "Sin experiencia registrada." };
  }
  const n = (v: VerificacionExperiencia) => conduccion.filter((e) => e.verificacion === v).length;
  if (n("no_confirmada")) {
    return { ...base, estado: "con_problema", texto: `${n("no_confirmada")} ${n("no_confirmada") === 1 ? "empleo no se confirmó" : "empleos no se confirmaron"}: revíselo antes de seguir.` };
  }
  const conDiferencias = conduccion.filter((e) => e.verificacion === "verificada" && e.diferencias).length;
  const nota = conDiferencias ? ` ${conDiferencias === 1 ? "Una carta no coincide" : `${conDiferencias} cartas no coinciden`} del todo con la hoja de vida: revise las diferencias.` : "";
  if (n("verificada") === conduccion.length) return { ...base, estado: "verificada", texto: `Toda la experiencia de conducción está verificada.${nota}` };
  if (n("verificada")) {
    return { ...base, estado: "parcial", texto: `${n("verificada")} de ${conduccion.length} empleos de conducción verificados; falta la carta laboral o llamar a la referencia de los demás.${nota}` };
  }
  return { ...base, estado: "sin_verificar", texto: "Sin verificar: a la espera de las cartas laborales o de llamar a las referencias." };
}

const MES_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

/** Valida un empleo escrito a mano. */
export function validarExperiencia(d: Partial<ExperienciaLaboral>): { ok: true } | { ok: false; error: string } {
  if (!String(d.empresa ?? "").trim() && !String(d.cargo ?? "").trim()) return { ok: false, error: "Escriba la empresa o el cargo." };
  if (d.desde && !MES_RE.test(d.desde)) return { ok: false, error: "«Desde» va como AAAA-MM." };
  if (d.hasta && d.hasta !== "actual" && !MES_RE.test(d.hasta)) return { ok: false, error: "«Hasta» va como AAAA-MM o «actual»." };
  if (d.desde && d.hasta && d.hasta !== "actual" && d.hasta < d.desde) return { ok: false, error: "«Hasta» no puede ser antes de «Desde»." };
  return { ok: true };
}
