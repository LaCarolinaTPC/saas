"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentPermissions, canAccess, canAccessSub, tienePermiso } from "@/lib/permissions";
import { nowBogotaISO } from "@/lib/utils";
import { logTesoreriaAudit } from "@/lib/devengados/audit";
import { CONCEPTOS_DEVENGO_DEFECTO, claveCorte, cortesHasta, quincenaGema } from "./calculo";
import { corteCerrado, listarPeriodos } from "./data";

const MODULO_AUDIT = "otros_devengados";
const MAX_LINEAS = 20000;

/** Línea compacta del listado: [cédula, nombre, concepto, cantidad, valor]. */
export type LineaCargue = [string, string | null, string, number | null, number];

export interface CargueNominaInput {
  periodo: string;
  quincena: number;
  archivo: string;
  codPer: string;
  nomPer: string | null;
  /** Corte que el navegador dedujo de las fechas del listado ('YYYY-MM-Q'). */
  corteListado: string;
  /** Nombre de cada concepto que trae el listado. */
  conceptos: Record<string, string | null>;
  lineas: LineaCargue[];
}

export type ResultadoCargueNomina =
  | { ok: true; lineas: number; empleados: number; totalDevengo: number; sinMaestro: number; reemplazo: boolean }
  | { ok: false; error: string };

/**
 * Guarda el listado de nómina de MGX para un corte cuya nómina todavía no
 * está cerrada en MGX. Con él se calculan y entregan los otros devengados;
 * cuando la nómina cierre en MGX manda MGX y este cargue queda para comparar.
 * Reemplaza el cargue anterior del corte (que queda como «reemplazada»).
 *
 * Solo quien puede editar Otros devengados y ver el detalle de nómina.
 */
export async function cargarNominaExcel(input: CargueNominaInput): Promise<ResultadoCargueNomina> {
  try {
    const perms = await getCurrentPermissions();
    if (
      !canAccess(perms, "tesoreria") ||
      !canAccessSub(perms, "tesoreria", "otros_devengados") ||
      !tienePermiso(perms, "tesoreria.otros_devengados.editar") ||
      !canAccessSub(perms, "tesoreria", "otros_devengados_detalle")
    ) {
      return { ok: false, error: "No tienes permisos para cargar la nómina de Otros devengados." };
    }

    const quincena = Number(input.quincena);
    const hoy = nowBogotaISO().slice(0, 10);
    const corte = cortesHasta(hoy).find((c) => claveCorte(c) === `${input.periodo}-${quincena}`);
    if (!corte) return { ok: false, error: "Ese corte no es de Otros devengados o todavía no ha empezado." };
    if (input.corteListado !== claveCorte(corte)) {
      return {
        ok: false,
        error: `Las fechas del listado no son de la ${quincena === 1 ? "1.ª" : "2.ª"} quincena de ${input.periodo}. Revisa que sea la nómina de ese corte.`,
      };
    }
    const codPer = String(input.codPer ?? "").trim();
    if (!codPer) return { ok: false, error: "El listado no trae el período de nómina (COD_PER)." };
    if (!Array.isArray(input.lineas) || input.lineas.length === 0) return { ok: false, error: "El listado no trae líneas." };
    if (input.lineas.length > MAX_LINEAS) return { ok: false, error: `El listado trae más de ${MAX_LINEAS.toLocaleString("es-CO")} líneas.` };

    const lineas: { cod_epl: string; nom_epl: string | null; cod_con: string; nom_con: string | null; cantidad: number | null; valor: number }[] = [];
    for (const [i, l] of input.lineas.entries()) {
      const cod_epl = String(l?.[0] ?? "").replace(/\D/g, "");
      const cod_con = String(l?.[2] ?? "").trim();
      const valor = Number(l?.[4]);
      if (!cod_epl || !cod_con || !Number.isFinite(valor)) return { ok: false, error: `La línea ${i + 1} del listado no es válida.` };
      const cantidad = l[3] == null || !Number.isFinite(Number(l[3])) ? null : Number(l[3]);
      lineas.push({
        cod_epl,
        nom_epl: l[1] ? String(l[1]).slice(0, 200) : null,
        cod_con,
        nom_con: input.conceptos?.[cod_con] ? String(input.conceptos[cod_con]).slice(0, 200) : null,
        cantidad,
        valor: Math.round(valor * 100) / 100,
      });
    }
    const devengo = new Set<string>(CONCEPTOS_DEVENGO_DEFECTO);
    const deCruce = lineas.filter((l) => devengo.has(l.cod_con));
    if (deCruce.length === 0) {
      return { ok: false, error: `El listado no trae ninguno de los conceptos del cruce (${CONCEPTOS_DEVENGO_DEFECTO.join(", ")}).` };
    }
    const empleados = new Set(deCruce.map((l) => l.cod_epl));
    const totalDevengo = Math.round(deCruce.reduce((t, l) => t + l.valor, 0));

    const db = createAdminClient();
    if (await corteCerrado(db, corte)) return { ok: false, error: "Esa quincena ya está cerrada: no admite cambios." };
    const periodos = await listarPeriodos(db, hoy);
    const delCorte = periodos.find((p) => claveCorte(p.quincena) === claveCorte(corte));
    if (delCorte?.cerradaMgx) {
      return { ok: false, error: `La nómina ${delCorte.codigo} ya está cerrada en MGX: el cálculo usa MGX y no hace falta cargarla.` };
    }
    // El código no puede ser el de la nómina de otro corte.
    const otro = periodos.find((p) => p.codigo === codPer && claveCorte(p.quincena) !== claveCorte(corte));
    if (otro) {
      return { ok: false, error: `El período ${codPer} del listado es el de otra quincena (${otro.quincena.periodo} Q${otro.quincena.quincena}).` };
    }

    // Cuántos empleados del listado no son conductores del maestro (aviso).
    const cedulas = [...empleados];
    const conocidas = new Set<string>();
    for (let i = 0; i < cedulas.length; i += 300) {
      const { data, error } = await db.from("conductores").select("cedula").in("cedula", cedulas.slice(i, i + 300));
      if (error) return { ok: false, error: error.message };
      for (const c of data ?? []) conocidas.add(c.cedula as string);
    }

    const { data: carga, error: e1 } = await db
      .from("otros_devengados_nomina_cargas")
      .insert({
        periodo: corte.periodo,
        quincena: corte.quincena,
        cod_per: codPer,
        nom_per: input.nomPer ? String(input.nomPer).slice(0, 200) : null,
        archivo: String(input.archivo ?? "").slice(0, 200) || "nomina.xlsx",
        lineas: lineas.length,
        empleados: empleados.size,
        estado: "incompleta",
        cargada_por: perms.userId,
        cargada_por_email: perms.userEmail,
      })
      .select("id")
      .single();
    if (e1 || !carga) {
      return { ok: false, error: `No se pudo guardar el cargue: ${e1?.message ?? "sin respuesta"}. ¿Ya se aplicó la migración de la nómina por Excel?` };
    }
    for (let i = 0; i < lineas.length; i += 1000) {
      const { error } = await db
        .from("otros_devengados_nomina_lineas")
        .insert(lineas.slice(i, i + 1000).map((l) => ({ ...l, carga_id: carga.id })));
      // Queda como «incompleta» y nunca se usa; el cargue anterior sigue activo.
      if (error) return { ok: false, error: `No se pudo guardar el listado: ${error.message}. No cambió nada; vuelve a cargarlo.` };
    }
    const { data: previas, error: e2 } = await db
      .from("otros_devengados_nomina_cargas")
      .update({ estado: "reemplazada", reemplazada_at: new Date().toISOString() })
      .eq("periodo", corte.periodo)
      .eq("quincena", corte.quincena)
      .eq("estado", "activa")
      .select("id");
    if (e2) return { ok: false, error: `No se pudo reemplazar el cargue anterior: ${e2.message}. No cambió nada.` };
    const { error: e3 } = await db.from("otros_devengados_nomina_cargas").update({ estado: "activa" }).eq("id", carga.id);
    if (e3) {
      return { ok: false, error: `El listado se guardó pero no se pudo activar: ${e3.message}. Vuelve a cargarlo.` };
    }

    const q = quincenaGema(corte.periodo, corte.quincena);
    await logTesoreriaAudit({
      accion: "otros_devengados_nomina_excel",
      modulo: MODULO_AUDIT,
      valor: totalDevengo,
      rol: perms.rol,
      detalle: {
        carga_id: carga.id,
        archivo: input.archivo,
        cod_per: codPer,
        corte: `${q.periodo} Q${q.quincena}`,
        lineas: lineas.length,
        empleados: empleados.size,
        reemplaza: previas?.[0]?.id ?? null,
      },
    });
    revalidatePath("/tesoreria/otros-devengados");
    return {
      ok: true,
      lineas: lineas.length,
      empleados: empleados.size,
      totalDevengo,
      sinMaestro: cedulas.filter((c) => !conocidas.has(c)).length,
      reemplazo: (previas?.length ?? 0) > 0,
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
