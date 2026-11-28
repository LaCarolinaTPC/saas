/**
 * Las tarjetas del tablero de procesos (Candidatos › Tablero). Solo servidor;
 * quien llama revisa los permisos.
 *
 * 27-nov-2026: por mes. Por defecto el mes actual (los procesos creados ese mes,
 * en cualquier etapa): el tablero se llenaba con las pruebas y los procesos de
 * meses atrás. «todos»: como antes, los que siguen en curso de cualquier mes y
 * los cerrados o contratados de los últimos 30 días.
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { examenesPorRevisar } from "@/lib/seleccion/examenes-servidor";
import { procesosConCedulaDistinta } from "@/lib/seleccion/lectura/revision-servidor";
import { leerAjustes } from "@/lib/seleccion/servidor";
import { evaluarAntecedentes, reglasDeAjustes, type ConsultaGuardada } from "@/lib/seleccion/antecedentes";
import { puntosDeTarjeta, type DatosTarjeta, type PuntoTablero } from "./semaforo-tablero";

/** Columnas que usa la tarjeta del tablero (kanban-procesos.tsx) y su filtro por vacante. */
const COLUMNAS_TABLERO =
  "id, estado, nombre, cedula, edad, vacancy_id, origen, requisito_incumplido, preseleccion, causa_no_contrato, aprobacion_contratacion_at, updated_at, fecha_creacion, vacancies(title)";

/** El mes actual en Bogotá (AAAA-MM). */
export function mesActualBogota(d: Date = new Date()): string {
  return new Date(d.getTime() - 5 * 3_600_000).toISOString().slice(0, 7);
}

/** «2026-11» → [«2026-11-01», «2026-12-01»). null si no es un mes. Puro. */
export function rangoDeMes(mes: string): { desde: string; hasta: string } | null {
  const m = /^(\d{4})-(\d{2})$/.exec(mes);
  if (!m) return null;
  const anio = Number(m[1]);
  const n = Number(m[2]);
  if (n < 1 || n > 12) return null;
  const sig = n === 12 ? `${anio + 1}-01` : `${anio}-${String(n + 1).padStart(2, "0")}`;
  return { desde: `${mes}-01`, hasta: `${sig}-01` };
}

export async function leerTablero(mes: string = mesActualBogota()): Promise<Record<string, unknown>[]> {
  const admin = createAdminClient();
  const rango = mes === "todos" ? null : rangoDeMes(mes) ?? rangoDeMes(mesActualBogota());
  // Solo lo que muestra la tarjeta (27-nov-2026): con todas las columnas eran ~1,5 MB y ~1,2 s
  // en cada carga y recarga; la ficha completa se trae al abrir la tarjeta (procesoCompleto).
  let consulta = admin.from("procesos_contratacion").select(COLUMNAS_TABLERO);
  if (rango) consulta = consulta.gte("fecha_creacion", rango.desde).lt("fecha_creacion", rango.hasta);
  else consulta = consulta.or(`estado.not.in.(contratado,cierre),updated_at.gte.${new Date(Date.now() - 30 * 86_400_000).toISOString()}`);
  const { data: tablero } = await consulta.order("updated_at", { ascending: false }).limit(1000);
  const filas = (tablero ?? []) as unknown as Record<string, unknown>[];
  // 24-nov-2026: el no apto de los exámenes queda marcado en la tarjeta para revisarlo a mano (y el aplazado).
  const enExamenes = filas.filter((p) => ["en_examenes", "en_examenes_fase2", "reconocimiento_ruta"].includes(p.estado as string)).map((p) => p.id as string);
  const porRevisar = await examenesPorRevisar(enExamenes).catch(() => new Map());
  // 25-nov-2026 (R2): un documento leído trae una cédula que no es la del proceso y nadie lo ha revisado.
  const abiertos = filas.filter((p) => p.estado !== "cierre" && p.estado !== "contratado").map((p) => ({ id: p.id as string, cedula: (p.cedula as string | null) ?? null }));
  const cedulaDistinta = await procesosConCedulaDistinta(abiertos).catch(() => new Set<string>());
  const puntos = await puntosDelTablero(filas).catch((e) => {
    console.error("[tablero] semáforo:", e);
    return new Map<string, PuntoTablero[]>();
  });
  return filas.map((p) => ({
    ...p,
    ...(porRevisar.has(p.id as string) ? { revision_examen: porRevisar.get(p.id as string) } : {}),
    ...(cedulaDistinta.has(p.id as string) ? { cedula_no_coincide: true } : {}),
    puntos: puntos.get(p.id as string) ?? [],
  }));
}

/**
 * El semáforo de cada tarjeta (27-nov-2026): lo que necesita su etapa, con
 * consultas de a lote (no una por tarjeta). Cada consulta es tolerante: si falta
 * una columna o una tabla (migraciones sin aplicar), ese punto queda en gris.
 */
async function puntosDelTablero(filas: Record<string, unknown>[]): Promise<Map<string, PuntoTablero[]>> {
  const db = createAdminClient();
  const abiertos = filas.filter((f) => f.estado !== "cierre" && f.estado !== "contratado");
  const ids = abiertos.map((f) => f.id as string);
  if (!ids.length) return new Map();
  const de = (estados: string[]) => abiertos.filter((f) => estados.includes(f.estado as string)).map((f) => f.id as string);
  const conAntecedentes = de(["antecedentes", "citado", "listo_contratar"]);
  const filasDe = <T,>(r: { data: unknown; error: unknown }) => (r.error ? [] : ((r.data ?? []) as T[]));
  const enPreseleccion = de(["pendiente"]);
  const [extra, verif, citas, examenes, pruebas, clases, ajustes, simitRunt] = await Promise.all([
    db.from("procesos_contratacion").select("id, autorizacion_datos, banco_cuenta, rutas_respondido_at, reconocimiento_estado, antecedentes_decision, licencia_verificada_runt").in("id", ids),
    conAntecedentes.length
      ? db.from("verificaciones_externas").select("proceso_id, fuente, estado, resultado, error, created_at").in("proceso_id", conAntecedentes).in("fuente", ["policia", "procuraduria", "contraloria", "rnmc"]).neq("estado", "reiniciada").order("created_at", { ascending: false })
      : Promise.resolve({ data: [], error: null }),
    db.from("seleccion_citas").select("proceso_id, tipo, fecha, estado, orden_laboratorio_at").in("proceso_id", ids).in("tipo", ["prueba_manejo", "examen_f1"]).order("fecha", { ascending: false }),
    db.from("seleccion_examenes").select("proceso_id, fase, resultado").in("proceso_id", ids),
    db.from("seleccion_pruebas_manejo").select("proceso_id, resultado, created_at").in("proceso_id", de(["prueba_manejo", "en_escuela"])).order("created_at", { ascending: false }),
    db.from("seleccion_clases_escuela").select("proceso_id, resultado").in("proceso_id", de(["en_escuela"])),
    conAntecedentes.length ? leerAjustes().catch(() => []) : Promise.resolve([]),
    // SIMIT y RUNT de la preselección: si la última consulta falló, Croma no respondió (27-nov-2026).
    enPreseleccion.length
      ? db.from("verificaciones_externas").select("proceso_id, fuente, estado, created_at").in("proceso_id", enPreseleccion).in("fuente", ["simit", "runt"]).neq("estado", "reiniciada").order("created_at", { ascending: false })
      : Promise.resolve({ data: [], error: null }),
  ]);
  const ultimaDe = new Map<string, string>();
  for (const v of filasDe<{ proceso_id: string; fuente: string; estado: string }>(simitRunt)) {
    const k = `${v.proceso_id}:${v.fuente}`;
    if (!ultimaDe.has(k)) ultimaDe.set(k, v.estado);
  }
  const extras = new Map(filasDe<Record<string, unknown>>(extra).map((x) => [x.id as string, x]));
  const reglas = reglasDeAjustes(ajustes);
  const porProceso = <T extends { proceso_id: string }>(lista: T[]) => {
    const m = new Map<string, T[]>();
    for (const x of lista) m.set(x.proceso_id, [...(m.get(x.proceso_id) ?? []), x]);
    return m;
  };
  const verifPor = porProceso(filasDe<{ proceso_id: string; fuente: string; estado: string; resultado: unknown; error: string | null }>(verif));
  const citasPor = porProceso(filasDe<{ proceso_id: string; tipo: string; fecha: string; estado: string; orden_laboratorio_at: string | null }>(citas));
  const examenesPor = porProceso(filasDe<{ proceso_id: string; fase: number; resultado: string }>(examenes));
  const pruebasPor = porProceso(filasDe<{ proceso_id: string; resultado: string }>(pruebas));
  const clasesPor = porProceso(filasDe<{ proceso_id: string; resultado: string }>(clases));
  const salida = new Map<string, PuntoTablero[]>();
  for (const f of abiertos) {
    const id = f.id as string;
    const x = extras.get(id) ?? {};
    let antecedentes: DatosTarjeta["antecedentes"] = null;
    if (conAntecedentes.includes(id)) {
      const ev = evaluarAntecedentes((verifPor.get(id) ?? []) as ConsultaGuardada[], { reglas, nombre: (f.nombre as string | null) ?? null, identidadConfirmada: x.licencia_verificada_runt === true });
      antecedentes = { fuentes: ev.fuentes.map((y) => ({ fuente: y.fuente, estado: y.estado, accion: y.accion, motivo: y.motivo })), veredicto: ev.veredicto, decision: (x.antecedentes_decision as string | null) ?? null };
    }
    const citasP = citasPor.get(id) ?? [];
    const cita = citasP.find((c) => c.tipo === "prueba_manejo" && !["cancelada", "reprogramada"].includes(c.estado));
    const exs = examenesPor.get(id) ?? [];
    const cls = clasesPor.get(id) ?? [];
    salida.set(
      id,
      puntosDeTarjeta({
        estado: f.estado as string,
        preseleccion: f.preseleccion as DatosTarjeta["preseleccion"],
        autorizacion: (x.autorizacion_datos as string | null) ?? null,
        simitSinRespuesta: ultimaDe.get(`${id}:simit`) === "error",
        runtSinRespuesta: ultimaDe.get(`${id}:runt`) === "error",
        antecedentes,
        citaPrueba: cita ? { estado: cita.estado, fecha: cita.fecha } : null,
        prueba: pruebasPor.get(id)?.[0]?.resultado ?? null,
        clases: cls.length ? { total: cls.length, listo: cls.some((c) => c.resultado === "listo") } : null,
        ordenF1: citasP.some((c) => c.tipo === "examen_f1" && !!c.orden_laboratorio_at),
        banco: (x.banco_cuenta as string | null) ?? null,
        rutasRespondidas: !!x.rutas_respondido_at,
        examenF1: exs.find((e) => e.fase === 1)?.resultado ?? null,
        examenF2: exs.find((e) => e.fase === 2)?.resultado ?? null,
        reconocimiento: (x.reconocimiento_estado as string | null) ?? null,
        aprobacion: !!f.aprobacion_contratacion_at,
      })
    );
  }
  return salida;
}
