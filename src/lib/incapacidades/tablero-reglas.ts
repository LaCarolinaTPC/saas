/**
 * Tablero desde el corte (fase 6, pantalla 8 del plan): por entidad y por
 * estado, cuánto se reclamó, cuánto está radicado, cuánto se recaudó y cuánto
 * falta. Puro; se prueba con node:test. Sin comparación con periodos
 * anteriores al corte: no existen en el módulo.
 */
import type { ExpedienteVista } from "./expedientes";

export type FilaTablero = Pick<
  ExpedienteVista,
  | "estado" | "entidad_catalogo_id" | "entidad_nombre" | "entidad_clase" | "pagador_recibido" | "cobrable"
  | "valor_reclamado" | "radicacion_estado" | "radicacion_valor" | "abonos_aplicados" | "ajustes_saldo" | "saldo_operativo"
  | "dias_incapacidad" | "dias_entidad" | "dias_entidad_ajustados"
>;

export interface AgregadoTablero {
  expedientes: number;
  porEstado: Record<string, number>;
  cobrables: number;
  noCobrables: number;
  dias: number;
  diasEntidad: number;
  /** Σ valor_reclamado de los expedientes liquidados en adelante. */
  reclamado: number;
  /** Σ valor de las radicaciones en estado radicada. */
  radicado: number;
  /** Σ abonos aplicados. */
  recaudado: number;
  /** Σ ajustes que extinguen saldo. */
  ajustes: number;
  /** Σ saldo operativo de los expedientes radicados en adelante (no cerrados). */
  saldo: number;
  /** reclamado − radicado: lo liquidado que todavía no se ha pedido a la entidad. */
  sinRadicar: number;
}

export interface GrupoTablero extends AgregadoTablero {
  entidadId: string | null;
  entidad: string;
  clase: string | null;
}

const ESTADOS_DESDE_LIQUIDADO = new Set(["liquidado", "radicado", "con_recaudo", "conciliado", "cerrado"]);
const ESTADOS_EN_COBRO = new Set(["radicado", "con_recaudo", "conciliado"]);

function vacio(): AgregadoTablero {
  return { expedientes: 0, porEstado: {}, cobrables: 0, noCobrables: 0, dias: 0, diasEntidad: 0, reclamado: 0, radicado: 0, recaudado: 0, ajustes: 0, saldo: 0, sinRadicar: 0 };
}

function sumar(a: AgregadoTablero, f: FilaTablero): void {
  a.expedientes++;
  a.porEstado[f.estado] = (a.porEstado[f.estado] ?? 0) + 1;
  if (f.cobrable) a.cobrables++; else a.noCobrables++;
  a.dias += f.dias_incapacidad ?? 0;
  a.diasEntidad += f.dias_entidad_ajustados ?? f.dias_entidad ?? 0;
  if (ESTADOS_DESDE_LIQUIDADO.has(f.estado) && f.valor_reclamado != null) a.reclamado += Number(f.valor_reclamado);
  if (f.radicacion_estado === "radicada") a.radicado += Number(f.radicacion_valor ?? f.valor_reclamado ?? 0);
  a.recaudado += Number(f.abonos_aplicados ?? 0);
  a.ajustes += Number(f.ajustes_saldo ?? 0);
  if (ESTADOS_EN_COBRO.has(f.estado) && f.saldo_operativo != null) a.saldo += Number(f.saldo_operativo);
  a.sinRadicar = Math.max(a.reclamado - a.radicado, 0);
}

export function agregarTablero(filas: FilaTablero[]): { total: AgregadoTablero; porEntidad: GrupoTablero[] } {
  const total = vacio();
  const m = new Map<string, GrupoTablero>();
  for (const f of filas) {
    sumar(total, f);
    const key = f.entidad_catalogo_id ?? `recibido:${f.pagador_recibido ?? "sin pagador"}`;
    let g = m.get(key);
    if (!g) {
      g = { ...vacio(), entidadId: f.entidad_catalogo_id, entidad: f.entidad_nombre ?? f.pagador_recibido ?? "Sin pagador", clase: f.entidad_clase };
      m.set(key, g);
    }
    sumar(g, f);
  }
  const porEntidad = [...m.values()].sort((a, b) => b.reclamado - a.reclamado || a.entidad.localeCompare(b.entidad, "es"));
  return { total, porEntidad };
}

/** Porcentaje entero acotado, para las barras del tablero. */
export function porcentaje(parte: number, todo: number): number {
  if (!todo || todo <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((parte / todo) * 100)));
}
