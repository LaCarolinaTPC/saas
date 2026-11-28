/**
 * Batería: las indicaciones de revisión manual en el tablero (27-nov-2026).
 *
 * Crea procesos temporales del chat de prueba («PRUEBA TABLERO · …»), uno por
 * cada caso, directamente en la base (sin disparar correos ni mensajes), lee el
 * tablero del mes como lo ve la pantalla (leerTablero) y comprueba los puntos y
 * el borde rojo. Al final los borra, salvo con --mantener (para mirarlos en el
 * navegador; después: --limpiar).
 *
 *   npx tsx --env-file=.env.local scripts/seleccion-probar-tablero-revision.mts [--mantener | --limpiar]
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { leerTablero, mesActualBogota } from "@/lib/contratacion/tablero-servidor";

const db = createAdminClient();
const PREFIJO = "PRUEBA TABLERO · ";
const mantener = process.argv.includes("--mantener");
const soloLimpiar = process.argv.includes("--limpiar");

async function limpiar() {
  const { data } = await db.from("procesos_contratacion").select("id").like("nombre", `${PREFIJO}%`).eq("origen", "chat_prueba");
  const ids = (data ?? []).map((x) => x.id as string);
  if (!ids.length) return 0;
  for (const t of ["verificaciones_externas", "seleccion_examenes", "seleccion_citas", "procesos_contratacion_eventos"]) await db.from(t).delete().in("proceso_id", ids);
  await db.from("procesos_contratacion").delete().in("id", ids);
  return ids.length;
}

if (soloLimpiar) {
  console.log(`Borrados: ${await limpiar()}`);
  process.exit(0);
}
await limpiar();

const hoy = new Date(Date.now() - 5 * 3_600_000).toISOString().slice(0, 10);
const verde = (motivo: string) => ({ color: "verde", motivo });
const pendiente = (motivo: string) => ({ color: "pendiente", motivo });
const preVerde = { edad: verde("40 años"), residencia: verde("Soledad"), licencia: verde("C2 (RUNT)"), simit: verde("$0"), global: "pasa" };

let n = 0;
async function proceso(nombre: string, estado: string, extra: Record<string, unknown> = {}) {
  n++;
  const { data, error } = await db
    .from("procesos_contratacion")
    .insert({ fecha_creacion: hoy, nombre: `${PREFIJO}${nombre}`, cedula: `99977${String(n).padStart(5, "0")}`, estado, origen: "chat_prueba", medio_postulacion: "whatsapp", simit_valor: 0, reingreso: false, autorizacion_datos: "si", ...extra })
    .select("id, cedula")
    .single();
  if (error) throw new Error(`${nombre}: ${error.message}`);
  return data as { id: string; cedula: string };
}
async function verif(p: { id: string; cedula: string }, fuente: string, estado: string, resultado: unknown, proveedor = "simulado", error: string | null = null) {
  const { error: e } = await db.from("verificaciones_externas").insert({ proceso_id: p.id, cedula: p.cedula, proveedor, fuente, estado, resultado, error, consultado_por: "batería tablero" });
  if (e) throw new Error(`${fuente}: ${e.message}`);
}
const limpias = async (p: { id: string; cedula: string }, sin: string[] = []) => {
  if (!sin.includes("policia")) await verif(p, "policia", "ok", { has_records: false, status: "NO TIENE ASUNTOS PENDIENTES" });
  if (!sin.includes("procuraduria")) await verif(p, "procuraduria", "ok", { found: true, has_records: false });
  if (!sin.includes("contraloria")) await verif(p, "contraloria", "ok", { is_fiscal_responsible: false });
  if (!sin.includes("rnmc")) await verif(p, "rnmc", "ok", { found: true, full_name: "PRUEBA", has_pending_measures: false, pending_measures: [] });
};

// Lo que debe pasar con cada caso: borde rojo sí/no y el punto que lo pide.
const casos: { nombre: string; id?: string; rojo: boolean; punto?: string; color?: string }[] = [];

// 1. Preselección con todo en verde: sin borde.
casos.push({ nombre: "Preselección todo bien", id: (await proceso("Preselección todo bien", "pendiente", { preseleccion: preVerde })).id, rojo: false });
// 2. Preselección: Croma no respondió el SIMIT.
{
  const p = await proceso("SIMIT sin respuesta", "pendiente", { preseleccion: { ...preVerde, simit: pendiente("Falta consultar el SIMIT"), global: "incompleto" } });
  await verif(p, "simit", "error", null, "croma", "The operation was aborted due to timeout");
  casos.push({ nombre: "SIMIT sin respuesta", id: p.id, rojo: true, punto: "SIMIT", color: "ambar" });
}
// 3. Preselección: Croma no respondió el RUNT.
{
  const p = await proceso("RUNT sin respuesta", "pendiente", { preseleccion: { ...preVerde, licencia: pendiente("Falta el RUNT"), global: "incompleto" } });
  await verif(p, "runt", "error", null, "croma", "502 Bad Gateway");
  casos.push({ nombre: "RUNT sin respuesta", id: p.id, rojo: true, punto: "Licencia", color: "ambar" });
}
// 4. Antecedentes limpios: sin borde.
{
  const p = await proceso("Antecedentes limpios", "antecedentes", { licencia_verificada_runt: true });
  await limpias(p);
  casos.push({ nombre: "Antecedentes limpios", id: p.id, rojo: false });
}
// 5. Antecedentes: la Policía no respondió.
{
  const p = await proceso("Policía sin respuesta", "antecedentes", { licencia_verificada_runt: true });
  await limpias(p, ["policia"]);
  await verif(p, "policia", "error", null, "croma", "Croma no respondió");
  casos.push({ nombre: "Policía sin respuesta", id: p.id, rojo: true, punto: "Policía", color: "ambar" });
}
// 6. Antecedentes: RNMC con medida sin la conducta (va a revisión) → RNMC y Aval.
{
  const p = await proceso("RNMC a revisión", "antecedentes", { licencia_verificada_runt: true });
  await limpias(p, ["rnmc"]);
  await verif(p, "rnmc", "ok", { found: true, full_name: "PRUEBA", has_pending_measures: true, pending_measures: [{ Expediente: "08-001-6-2020-000001", Estado: "Abierto" }] }, "croma");
  casos.push({ nombre: "RNMC a revisión", id: p.id, rojo: true, punto: "RNMC", color: "ambar" });
}
// 7. Antecedentes con el aval de una persona: sin borde, todo verde.
{
  const p = await proceso("RNMC con aval", "antecedentes", { licencia_verificada_runt: true, antecedentes_decision: "aprobado" });
  await limpias(p, ["rnmc"]);
  await verif(p, "rnmc", "ok", { found: true, full_name: "PRUEBA", has_pending_measures: true, pending_measures: [{ Expediente: "08-001-6-2020-000002", Estado: "Abierto" }] }, "croma");
  casos.push({ nombre: "RNMC con aval", id: p.id, rojo: false, punto: "RNMC", color: "verde" });
}
// 8. Fase 2 no apta: decidir si sigue.
{
  const p = await proceso("Fase 2 no apta", "en_examenes_fase2");
  await db.from("seleccion_examenes").insert([
    { proceso_id: p.id, fase: 1, fecha: hoy, resultado: "apto", confirmado_por: "batería" },
    { proceso_id: p.id, fase: 2, fecha: hoy, resultado: "no_apto", observacion: "Prueba de la batería", confirmado_por: "batería" },
  ]);
  casos.push({ nombre: "Fase 2 no apta", id: p.id, rojo: true, punto: "Fase 2", color: "rojo" });
}
// 9. Reconocimiento por verificar (dijo que conoce las rutas).
{
  const p = await proceso("Reconocimiento por verificar", "reconocimiento_ruta", { reconocimiento_estado: "por_verificar" });
  await db.from("seleccion_examenes").insert([
    { proceso_id: p.id, fase: 1, fecha: hoy, resultado: "apto", confirmado_por: "batería" },
    { proceso_id: p.id, fase: 2, fecha: hoy, resultado: "apto", confirmado_por: "batería" },
  ]);
  casos.push({ nombre: "Reconocimiento por verificar", id: p.id, rojo: true, punto: "Reconocimiento", color: "ambar" });
}
// 10. Listo para contratar sin visto bueno: ámbar, pero no es una revisión (sin borde).
{
  const p = await proceso("Listo sin visto bueno", "listo_contratar", { reconocimiento_estado: "finalizado", licencia_verificada_runt: true });
  await limpias(p);
  await db.from("seleccion_examenes").insert([
    { proceso_id: p.id, fase: 1, fecha: hoy, resultado: "apto", confirmado_por: "batería" },
    { proceso_id: p.id, fase: 2, fecha: hoy, resultado: "apto", confirmado_por: "batería" },
  ]);
  casos.push({ nombre: "Listo sin visto bueno", id: p.id, rojo: false, punto: "Visto bueno", color: "ambar" });
}

// El tablero del mes, como lo pide la pantalla.
const tablero = await leerTablero(mesActualBogota());
let bien = 0;
let mal = 0;
for (const c of casos) {
  const t = tablero.find((x) => x.id === c.id) as { puntos?: { etiqueta: string; color: string; detalle: string; revisar?: boolean }[]; revision_examen?: unknown; cedula_no_coincide?: boolean } | undefined;
  const fallas: string[] = [];
  if (!t) fallas.push("no salió en el tablero del mes");
  const puntos = t?.puntos ?? [];
  // La misma regla de la tarjeta (kanban-procesos.tsx, necesitaRevision).
  const rojo = puntos.some((x) => x.revisar) || !!t?.revision_examen || !!t?.cedula_no_coincide;
  if (t && rojo !== c.rojo) fallas.push(`borde rojo: ${rojo ? "sí" : "no"} (debía ser ${c.rojo ? "sí" : "no"})`);
  const punto = c.punto ? puntos.find((x) => x.etiqueta === c.punto) : null;
  if (c.punto && !punto) fallas.push(`falta el punto «${c.punto}»`);
  if (punto && c.color && punto.color !== c.color) fallas.push(`«${c.punto}» en ${punto.color} (debía ser ${c.color})`);
  const linea = puntos.map((x) => `${x.color === "verde" ? "🟢" : x.color === "ambar" ? "🟠" : x.color === "rojo" ? "🔴" : "⚪"} ${x.etiqueta}${x.revisar ? "*" : ""}`).join("  ");
  if (fallas.length) {
    mal++;
    console.log(`✖ ${c.nombre}: ${fallas.join("; ")}\n    ${linea}`);
  } else {
    bien++;
    console.log(`✔ ${c.nombre}${c.rojo ? " · borde rojo" : ""}\n    ${linea}${punto ? `\n    ${punto.etiqueta}: ${punto.detalle}` : ""}`);
  }
}
console.log(`\n${bien} bien, ${mal} mal (* = pide revisión manual)`);
if (!mantener) console.log(`Borrados: ${await limpiar()}`);
else console.log("Se quedan para mirarlos en el tablero; después: --limpiar");
process.exit(mal ? 1 : 0);
