// Comprueba los indicadores de selección contra conteos directos en la base de .env.local (desarrollo).
// Solo lee. Cada cifra se cuenta dos veces: como la calcula la vista «Indicadores» de Candidatos
// (leerIndicadoresSeleccion / leerIndicadoresRespuesta) y con una consulta de conteo hecha aparte,
// con los mismos criterios escritos de nuevo aquí. Imprime las diferencias y termina con código 1 si hay alguna.
//   npx tsx --env-file=.env.local --tsconfig tsconfig.json scripts/seleccion-verificar-indicadores.mts [días…]
// Sin argumentos revisa 7 y 30 días.
import { createAdminClient } from "@/lib/supabase/admin";
import { diaBogota, inicioDiaBogota, rangoUltimosDias, sumarDias } from "@/lib/comunicaciones/indicadores";
import { leerIndicadoresRespuesta, leerIndicadoresSeleccion } from "@/lib/seleccion/indicadores-servidor";
import { FIRMA_RECORDATORIO } from "@/lib/seleccion/indicadores-respuesta";
import { PROCESO_ESTADOS } from "@/lib/contratacion/constants";

const db = createAdminClient();
const SIN_PRUEBA = "origen.is.null,origen.neq.chat_prueba";
let diferencias = 0;
let comprobadas = 0;

function comparar(que: string, vista: number, directo: number | null) {
  comprobadas += 1;
  if (directo === null) {
    console.log(`  ?  ${que}: la vista dice ${vista}; el conteo directo falló`);
    diferencias += 1;
  } else if (vista === directo) {
    console.log(`  ✓  ${que}: ${vista}`);
  } else {
    console.log(`  ✗  ${que}: la vista dice ${vista} y el conteo directo ${directo}`);
    diferencias += 1;
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function contar(consulta: any): Promise<number | null> {
  const { count, error } = await consulta;
  if (error) {
    console.log(`     (error: ${error.message})`);
    return null;
  }
  return count ?? 0;
}

/** Todas las filas de una consulta, de 1000 en 1000. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function todas<T>(armar: () => any): Promise<T[]> {
  const filas: T[] = [];
  for (let desde = 0; ; desde += 1000) {
    const { data, error } = await armar().range(desde, desde + 999);
    if (error) throw new Error(error.message);
    filas.push(...((data ?? []) as T[]));
    if ((data ?? []).length < 1000) return filas;
  }
}

function lotes<T>(xs: T[], n = 150): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += n) out.push(xs.slice(i, i + n));
  return out;
}

async function verificar(dias: number) {
  const rango = rangoUltimosDias(dias);
  const inicio = inicioDiaBogota(rango.desde);
  const fin = inicioDiaBogota(sumarDias(rango.hasta, 1));
  const hoy = diaBogota(new Date());
  console.log(`\nÚltimos ${dias} días (${rango.desde} a ${rango.hasta})`);

  const [{ ind }, resp] = await Promise.all([leerIndicadoresSeleccion(rango), leerIndicadoresRespuesta(rango)]);
  const procesos = () => db.from("procesos_contratacion").select("id", { count: "exact", head: true }).gte("created_at", inicio).lt("created_at", fin).or(SIN_PRUEBA);

  console.log(" Proceso");
  comparar("Aspirantes", ind.aspirantes, await contar(procesos()));
  comparar("Contratados", ind.contratados, await contar(procesos().eq("estado", "contratado")));
  comparar("Cerrados", ind.cerrados, await contar(procesos().eq("estado", "cierre")));
  for (const e of PROCESO_ESTADOS) {
    const fila = ind.porEtapa.find((f) => f.clave === e.value);
    comparar(`En «${e.label}»`, fila?.n ?? 0, await contar(procesos().eq("estado", e.value)));
  }
  const delChat = () => procesos().eq("origen", "whatsapp_agente");
  comparar("Llegaron por el asistente", ind.clave.hojaVida.base, await contar(delChat()));
  comparar("Enviaron la hoja de vida", ind.clave.hojaVida.n, await contar(delChat().not("hoja_vida_recibida_at", "is", null)));

  console.log(" Citas a prueba de manejo ya pasadas");
  const citas = () =>
    db
      .from("seleccion_citas")
      .select("id, proceso:procesos_contratacion!inner(origen)", { count: "exact", head: true })
      .gte("fecha", rango.desde)
      .lte("fecha", rango.hasta)
      .lt("fecha", hoy)
      .eq("tipo", "prueba_manejo")
      .or(SIN_PRUEBA, { referencedTable: "proceso" });
  comparar("Citas", ind.clave.asistencia.citas, await contar(citas().not("estado", "in", "(cancelada,reprogramada)")));
  comparar("Asistieron", ind.clave.asistencia.asistieron, await contar(citas().eq("estado", "asistio")));
  comparar("No asistieron", ind.clave.asistencia.noAsistieron, await contar(citas().eq("estado", "no_asistio")));

  if (!resp) {
    console.log(" Respuesta de los aspirantes: la lectura falló");
    diferencias += 1;
    return;
  }
  console.log(" Respuesta de los aspirantes");
  // Conversaciones del periodo que no son de «otros temas».
  const convs = await todas<{ id: string }>(() =>
    db
      .from("wa_conversaciones")
      .select("id")
      .gte("created_at", inicio)
      .lt("created_at", fin)
      .or("prefiltro.is.null,prefiltro->>busca_trabajo.is.null,prefiltro->>busca_trabajo.neq.false")
      .order("id")
  );
  const conSaliente = new Set<string>();
  const conEntranteDespues = new Set<string>();
  let recordatorios = 0;
  const recordadas = new Set<string>();
  for (const lote of lotes(convs.map((c) => c.id))) {
    const msgs = await todas<{ conversacion_id: string; direccion: string; enviado_por: string | null; timestamp: string }>(() =>
      db.from("wa_mensajes").select("conversacion_id, direccion, enviado_por, timestamp").in("conversacion_id", lote).order("timestamp").order("id")
    );
    for (const m of msgs) {
      if (m.direccion === "saliente") {
        conSaliente.add(m.conversacion_id);
        if (m.enviado_por === FIRMA_RECORDATORIO) {
          recordatorios += 1;
          recordadas.add(m.conversacion_id);
        }
      } else if (conSaliente.has(m.conversacion_id)) {
        conEntranteDespues.add(m.conversacion_id);
      }
    }
  }
  comparar("Conversaciones a las que les escribimos", resp.base, conSaliente.size);
  comparar("Nos respondieron", resp.respondieron, conEntranteDespues.size);
  comparar("Recordatorios por silencio enviados", resp.recordatorios.enviados, recordatorios);
  comparar("Conversaciones con recordatorio", resp.recordatorios.conversaciones, recordadas.size);
  comparar(
    "Recordatorios: suma por número",
    resp.recordatorios.porNumero.reduce((s, n) => s + n.enviados, 0),
    recordatorios
  );
  if (resp.faltantes.length) console.log(`     (columnas que faltan en esta base: ${resp.faltantes.join(", ")})`);
}

const pedidos = process.argv.slice(2).map(Number).filter((n) => Number.isInteger(n) && n > 0);
for (const dias of pedidos.length ? pedidos : [7, 30]) await verificar(dias);
console.log(`\n${comprobadas} cifras comprobadas, ${diferencias} con diferencia.`);
process.exit(diferencias ? 1 : 0);
