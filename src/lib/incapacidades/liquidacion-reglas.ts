/**
 * Reglas puras de la etapa 2 (fase 3 del plan): qué falta para liquidar, cómo
 * se arma la entrada del motor desde el expediente, cómo se aplican las
 * sobrescrituras de nivel 2 y cómo se lee una regla guardada en la base.
 * Sin acceso a datos: se prueba con node:test.
 */
import type { CodigoRegla, EntradaLiquidacion, Liquidacion, ParametrosRegla, ReglaMotor } from "./motor";
import type { ExpedienteVista } from "./expedientes";

// ── Regla desde la base ──────────────────────────────────────────────────────

export interface ReglaGuardada {
  id: string;
  codigo: string;
  descripcion: string;
  parametros: unknown;
}

const esNumero = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x);
const esObjeto = (x: unknown): x is Record<string, unknown> => !!x && typeof x === "object" && !Array.isArray(x);

/**
 * Convierte la fila de `incapacidad_reglas` en la regla que entiende el
 * motor. Valida la forma: una regla mal guardada no debe liquidar nada.
 */
export function reglaDesdeFila(f: ReglaGuardada): ReglaMotor & { id: string } {
  const p = f.parametros;
  if (!esObjeto(p)) throw new Error(`La regla ${f.codigo} no tiene parámetros.`);
  const de = p.diasEmpleador;
  if (!esNumero(p.divisorSalario) || p.divisorSalario <= 0) throw new Error(`Regla ${f.codigo}: divisorSalario inválido.`);
  if (!esObjeto(p.factorPorTipo) || !Object.values(p.factorPorTipo).every(esNumero)) throw new Error(`Regla ${f.codigo}: factorPorTipo inválido.`);
  if (!esNumero(p.factorPorDefecto)) throw new Error(`Regla ${f.codigo}: factorPorDefecto inválido.`);
  if (!esObjeto(de) || !esObjeto(de.porEntidad) || !Object.values(de.porEntidad).every(esNumero)) throw new Error(`Regla ${f.codigo}: diasEmpleador.porEntidad inválido.`);
  if (!(de.porClaseArl === null || esNumero(de.porClaseArl))) throw new Error(`Regla ${f.codigo}: diasEmpleador.porClaseArl inválido.`);
  if (!esNumero(de.porDefecto)) throw new Error(`Regla ${f.codigo}: diasEmpleador.porDefecto inválido.`);
  if (!(p.redondeoValorEntidad === null || p.redondeoValorEntidad === undefined || esNumero(p.redondeoValorEntidad))) {
    throw new Error(`Regla ${f.codigo}: redondeoValorEntidad inválido.`);
  }
  const parametros: ParametrosRegla = {
    divisorSalario: p.divisorSalario,
    factorPorTipo: Object.fromEntries(Object.entries(p.factorPorTipo).map(([k, v]) => [k.toUpperCase(), v as number])),
    factorPorDefecto: p.factorPorDefecto,
    diasEmpleador: {
      porEntidad: de.porEntidad as Record<string, number>,
      porClaseArl: de.porClaseArl as number | null,
      porDefecto: de.porDefecto,
    },
    redondeoValorEntidad: (p.redondeoValorEntidad ?? null) as number | null,
  };
  return { id: f.id, codigo: f.codigo as CodigoRegla, descripcion: f.descripcion, parametros };
}

// ── Qué falta para liquidar ──────────────────────────────────────────────────

export type CampoLiquidar = "salario_base" | "persona" | "entidad" | "tipo" | "modalidad" | "fechas" | "dias";

export interface Faltante {
  campo: CampoLiquidar;
  mensaje: string;
}

export type DatosLiquidar = Pick<
  ExpedienteVista,
  | "salario_base" | "persona_fuente" | "entidad_nombre" | "entidad_clase" | "tipo_homologado" | "origen"
  | "indicador_prorroga" | "modalidad_ajustada" | "fecha_inicio" | "fecha_fin" | "dias_incapacidad"
  | "dias_entidad_ajustados" | "valor_reclamado_ajustado"
>;

/** Lo que exige liquidar (plan, 7.3). Vacío = se puede liquidar. Nada se rellena por defecto. */
export function faltantesParaLiquidar(v: DatosLiquidar): Faltante[] {
  const f: Faltante[] = [];
  if (v.salario_base == null || v.salario_base <= 0) f.push({ campo: "salario_base", mensaje: "Falta el salario base diligenciado por RRHH." });
  if (!v.persona_fuente || v.persona_fuente === "sin_resolver") f.push({ campo: "persona", mensaje: "La cédula no está resuelta contra el maestro de conductores ni empleados." });
  if (!v.entidad_nombre) f.push({ campo: "entidad", mensaje: "La entidad pagadora no está homologada con el catálogo." });
  if (!v.tipo_homologado) f.push({ campo: "tipo", mensaje: "El tipo de incapacidad no está homologado." });
  if (!(v.modalidad_ajustada ?? v.indicador_prorroga)) f.push({ campo: "modalidad", mensaje: "Falta la modalidad (inicial o prórroga)." });
  if (!v.fecha_inicio || !v.fecha_fin) f.push({ campo: "fechas", mensaje: "La incapacidad no tiene fecha de inicio y fin en la matriz." });
  if (v.dias_incapacidad == null) f.push({ campo: "dias", mensaje: "La matriz no trae los días de incapacidad." });
  return f;
}

/** La entrada del motor tal como sale del expediente; `diasInformados` son los de la matriz (12.19). */
export function armarEntrada(v: DatosLiquidar): EntradaLiquidacion {
  return {
    salarioBase: v.salario_base,
    fechaInicio: v.fecha_inicio,
    fechaFin: v.fecha_fin,
    entidad: v.entidad_nombre,
    tipo: v.tipo_homologado ?? v.origen,
    modalidad: v.modalidad_ajustada ?? v.indicador_prorroga,
    esArl: v.entidad_clase ? v.entidad_clase === "ARL" : undefined,
    diasInformados: v.dias_incapacidad,
  };
}

// ── Sobrescrituras de nivel 2 (12.18) ────────────────────────────────────────

export interface Sobrescrituras {
  diasEntidad?: number | null;
  valorReclamado?: number | null;
}

export interface ResultadoLiquidacion {
  /** La liquidación con las sobrescrituras aplicadas. */
  liquidacion: Liquidacion;
  /** Qué se sobrescribió y con qué valor calculado, para guardarlo con la liquidación. */
  sobrescrituras: Record<string, { calculado: number; ajustado: number }>;
  /** Lo que se reclama: el valor ajustado si lo hay, si no el valor entidad. */
  valorReclamado: number;
  /** Advertencias que no bloquean (plan: valor por encima del total avisa). */
  avisos: string[];
}

/**
 * Aplica las sobrescrituras del resultado. Los días a cargo ajustados nunca
 * pueden superar los días de incapacidad (12.19): eso sí bloquea. El valor
 * reclamado por encima del valor total avisa sin bloquear.
 */
export function aplicarSobrescrituras(liq: Liquidacion, s: Sobrescrituras): ResultadoLiquidacion {
  const sobrescrituras: ResultadoLiquidacion["sobrescrituras"] = {};
  const avisos: string[] = [];
  let out: Liquidacion = { ...liq };

  if (s.diasEntidad != null) {
    if (!Number.isInteger(s.diasEntidad) || s.diasEntidad < 0) {
      throw new Error("Los días a cargo ajustados deben ser un entero mayor o igual a cero.");
    }
    if (s.diasEntidad > liq.diasIncapacidad) {
      throw new Error(`Los días a cargo ajustados (${s.diasEntidad}) superan los días de incapacidad (${liq.diasIncapacidad}).`);
    }
    const valorEntidad = liq.salarioDiario * s.diasEntidad * liq.factor;
    sobrescrituras.dias_entidad = { calculado: liq.diasEntidad, ajustado: s.diasEntidad };
    out = {
      ...out,
      diasEntidad: s.diasEntidad,
      diasEmpresa: liq.diasIncapacidad - s.diasEntidad,
      valorEntidad,
      valorEmpresa: liq.valorTotal - valorEntidad,
    };
  }

  let valorReclamado = out.valorEntidad;
  if (s.valorReclamado != null) {
    if (!Number.isFinite(s.valorReclamado) || s.valorReclamado < 0) {
      throw new Error("El valor reclamado ajustado debe ser un número mayor o igual a cero.");
    }
    sobrescrituras.valor_reclamado = { calculado: out.valorEntidad, ajustado: s.valorReclamado };
    valorReclamado = s.valorReclamado;
    if (s.valorReclamado > liq.valorTotal) {
      avisos.push(`El valor reclamado ajustado (${Math.round(s.valorReclamado).toLocaleString("es-CO")}) supera el valor total de la incapacidad (${Math.round(liq.valorTotal).toLocaleString("es-CO")}).`);
    }
  }

  return { liquidacion: out, sobrescrituras, valorReclamado, avisos };
}

// ── Catálogo de ajustes (12.18) ──────────────────────────────────────────────

export const CAMPOS_AJUSTE = {
  salario_base: "entrada",
  salario_vigencia_desde: "entrada",
  entidad_catalogo_id: "entrada",
  tipo_homologado: "entrada",
  modalidad_ajustada: "entrada",
  dias_entidad_ajustados: "sobrescritura",
  valor_reclamado_ajustado: "sobrescritura",
} as const;

export type CampoAjuste = keyof typeof CAMPOS_AJUSTE;

/** Estados en los que RRHH todavía puede completar, ajustar y liquidar. */
export const ESTADOS_EDITABLES: ReadonlySet<string> = new Set(["recibido", "en_completar", "liquidado"]);

export const MOTIVO_MIN = 5;

/** Un motivo válido para un ajuste: texto de al menos MOTIVO_MIN caracteres. */
export function motivoValido(m: string | null | undefined): m is string {
  return typeof m === "string" && m.replace(/\s+/g, " ").trim().length >= MOTIVO_MIN;
}

/** Dinero a NUMERIC(14,2). */
export function aDosDecimales(x: number): number {
  return Math.round(x * 100) / 100;
}
