/**
 * Costo del asistente y tope mensual (entrega 3, NF1): registro y lectura
 * (solo servidor). Reglas puras en ./consumos. Nada de aquí impide la
 * operación que lo origina: sin la migración de la entrega 3 solo no se registra.
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { costoUsd, estadoTope, inicioMesBogota, type EstadoTope } from "./consumos";
import { leerAjustes, valorAjuste } from "./servidor";

export type ConceptoConsumo = "asistente" | "extraccion" | "lectura" | "transcripcion" | "antecedentes" | "laboratorio" | "whatsapp";

export async function registrarConsumo(d: {
  concepto: ConceptoConsumo;
  proveedor?: string | null;
  modelo?: string | null;
  tokensEntrada?: number | null;
  tokensSalida?: number | null;
  /** Si ya se conoce (una consulta con tarifa fija); si no, se calcula por tokens. */
  costoUsd?: number;
  procesoId?: string | null;
  conversacionId?: string | null;
}): Promise<void> {
  const costo = d.costoUsd ?? costoUsd(d.modelo, d.tokensEntrada, d.tokensSalida);
  const { error } = await createAdminClient().from("seleccion_consumos").insert({
    concepto: d.concepto,
    proveedor: d.proveedor ?? null,
    modelo: d.modelo ?? null,
    tokens_entrada: Math.max(0, Math.round(Number(d.tokensEntrada) || 0)),
    tokens_salida: Math.max(0, Math.round(Number(d.tokensSalida) || 0)),
    costo_usd: costo,
    proceso_id: d.procesoId ?? null,
    conversacion_id: d.conversacionId ?? null,
  });
  if (error && !/seleccion_consumos/.test(error.message)) console.error("[seleccion] consumo:", error.message);
}

export interface GastoDelMes extends EstadoTope {
  /** Gasto por concepto, en dólares. */
  porConcepto: Record<string, number>;
  trm: number;
  /** Consultas reales a Croma en el mes (se cuentan aunque su valor esté en 0). */
  consultasCroma: number;
}

/**
 * Consultas reales a Croma desde `desde`: las que respondieron (también las de
 * candidatos reiniciados), sin las reutilizadas de la caché, las simuladas ni
 * las revisiones a mano. Las que dieron error no cuentan (no se sabe si Croma
 * las cobra). null si no se pudo contar.
 */
async function consultasCromaDesde(desde: string): Promise<number | null> {
  const { count, error } = await createAdminClient()
    .from("verificaciones_externas")
    .select("id", { count: "exact", head: true })
    .eq("proveedor", "croma")
    .in("estado", ["ok", "hallazgo", "reiniciada"])
    .not("consultado_por", "ilike", "%reutilizada%")
    .gte("created_at", desde);
  return error ? null : (count ?? 0);
}

/** Gasto del mes en curso frente al tope. null si falta la migración. */
export async function gastoDelMes(ahora = new Date()): Promise<GastoDelMes | null> {
  const db = createAdminClient();
  const desde = inicioMesBogota(ahora);
  const [ajustes, { data, error }, consultasCroma] = await Promise.all([
    leerAjustes().catch(() => []),
    db.from("seleccion_consumos").select("concepto, costo_usd").gte("created_at", desde).limit(50_000),
    consultasCromaDesde(desde),
  ]);
  if (error) return null;
  const porConcepto: Record<string, number> = {};
  let total = 0;
  for (const f of data ?? []) {
    const v = Number(f.costo_usd) || 0;
    total += v;
    porConcepto[f.concepto as string] = (porConcepto[f.concepto as string] ?? 0) + v;
  }
  const trm = Number(valorAjuste<unknown>(ajustes, "trm", 3270)) || 3270;
  const tope = Number(valorAjuste<unknown>(ajustes, "tope_mensual_cop", 0)) || 0;
  // Croma cobra en pesos por consulta (ajuste `croma_costo_consulta`); se pasa a dólares para sumarlo.
  const valorCroma = Number(valorAjuste<unknown>(ajustes, "croma_costo_consulta", 0)) || 0;
  if (valorCroma > 0 && consultasCroma) {
    const usd = (consultasCroma * valorCroma) / trm;
    total += usd;
    porConcepto.antecedentes = (porConcepto.antecedentes ?? 0) + usd;
  }
  return { ...estadoTope(total, tope, trm), porConcepto, trm, consultasCroma: consultasCroma ?? 0 };
}

/** ¿Ya se gastó el tope del mes? Al 100 % se detiene lo automático. Sin datos, no. */
export async function topeAlcanzado(): Promise<boolean> {
  return (await gastoDelMes().catch(() => null))?.nivel === "alcanzado";
}
