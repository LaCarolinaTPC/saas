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

/** ¿Hablan de la misma empresa? Igual, o una contiene a la otra (con al menos 4 letras). */
export function mismaEmpresa(a: string | null | undefined, b: string | null | undefined): boolean {
  const x = normalizarEmpresa(a);
  const y = normalizarEmpresa(b);
  if (x.length < 4 || y.length < 4) return false;
  return x === y || x.includes(y) || y.includes(x);
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
    const repetida = out.some((e) => (e.empresa && l.empresa ? mismaEmpresa(e.empresa, l.empresa) : e.cargo === l.cargo) && (e.desde ?? "") === (l.desde ?? ""));
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
  if (n("verificada") === conduccion.length) return { ...base, estado: "verificada", texto: "Toda la experiencia de conducción está verificada." };
  if (n("verificada")) {
    return { ...base, estado: "parcial", texto: `${n("verificada")} de ${conduccion.length} empleos de conducción verificados; falta la carta laboral o llamar a la referencia de los demás.` };
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
