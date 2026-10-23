/**
 * Corrige SOLO la ruta de accidentes cuando GEMA confirma el mismo bus, el
 * mismo conductor y el viaje vigente a la hora del accidente.
 *
 * Uso seguro (no escribe): npm run accidentes:rutas-gema
 * Aplicar:             npm run accidentes:rutas-gema -- --aplicar
 *
 * No cambia ningún bus. Si GEMA dice otro bus, se deja para revisión humana:
 * cambiarlo modifica la imputación del accidente.
 */
import { leerEnv } from "./biometrico-comun.mjs";

const aplicar = process.argv.includes("--aplicar");
const env = leerEnv();
const base = env.NEXT_PUBLIC_SUPABASE_URL;
const llave = env.SUPABASE_SERVICE_ROLE_KEY ?? env.SUPABASE_SERVICE_KEY;
if (!base || !llave) throw new Error("Faltan credenciales de Supabase.");
const headers = { apikey: llave, Authorization: `Bearer ${llave}`, "Content-Type": "application/json" };

async function rest<T>(ruta: string, init?: RequestInit): Promise<T> {
  const r = await fetch(`${base}/rest/v1/${ruta}`, { ...init, headers: { ...headers, ...(init?.headers ?? {}) } });
  if (!r.ok) throw new Error(`${r.status}: ${await r.text()}`);
  const texto = await r.text();
  return texto ? JSON.parse(texto) as T : undefined as T;
}

type Accidente = { id: string; consecutivo: number; fecha_accidente: string; conductor_cedula: string | null; vehiculo_codigo: string | null; vehiculo_ruta: string | null };
type Viaje = { codigo: string | null; ruta_programada: string | null; hora_despacho: string | null; estado: string | null; timbradas: number | null };
const diaHoraBogota = (iso: string) => {
  const x = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(iso));
  const p = (t: string) => x.find((v) => v.type === t)?.value ?? "";
  return { dia: `${p("year")}-${p("month")}-${p("day")}`, hora: `${p("hour")}:${p("minute")}:00` };
};
const rodo = (v: Viaje) => (v.timbradas ?? 0) > 0 || ["DESPACHADO", "NO_FINALIZADO", "PENDIENTE", "POR_LIQUIDAR"].includes(String(v.estado ?? "").toUpperCase());
const igual = (a: string | null, b: string | null) => (a ?? "").trim().toUpperCase() === (b ?? "").trim().toUpperCase();

const accidentes: Accidente[] = [];
for (let offset = 0; ; offset += 1000) {
  const pagina = await rest<Accidente[]>(`accidentes?select=id,consecutivo,fecha_accidente,conductor_cedula,vehiculo_codigo,vehiculo_ruta&order=consecutivo&limit=1000&offset=${offset}`);
  accidentes.push(...pagina);
  if (pagina.length < 1000) break;
}

let candidatos = 0, sinViaje = 0, distintoBus = 0, yaCorrecta = 0, corregidas = 0;
const revisar: string[] = [];
for (const a of accidentes) {
  if (!a.conductor_cedula || !a.vehiculo_codigo) continue;
  const { dia, hora } = diaHoraBogota(a.fecha_accidente);
  const viajes = await rest<Viaje[]>(`historico_despacho?conductor_ced=eq.${encodeURIComponent(a.conductor_cedula)}&fecha_viaje=eq.${dia}&select=codigo,ruta_programada,hora_despacho,estado,timbradas&order=hora_despacho`);
  const queRodaron = viajes.filter(rodo);
  if (!queRodaron.length) { sinViaje++; continue; }
  const vigentes = queRodaron.filter((v) => String(v.hora_despacho ?? "99:99:99") <= hora);
  const viaje = vigentes.at(-1) ?? queRodaron[0];
  if (!viaje.codigo || String(viaje.codigo).trim() !== a.vehiculo_codigo.trim()) {
    distintoBus++;
    revisar.push(`#${a.consecutivo}: guardado ${a.vehiculo_codigo}; GEMA ${viaje.codigo ?? "—"} (${viaje.ruta_programada ?? "sin ruta"})`);
    continue;
  }
  if (!viaje.ruta_programada?.trim() || igual(a.vehiculo_ruta, viaje.ruta_programada)) { yaCorrecta++; continue; }
  candidatos++;
  if (aplicar) {
    await rest(`accidentes?id=eq.${a.id}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ vehiculo_ruta: viaje.ruta_programada }) });
    await rest("accidente_eventos", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify({
      accidente_id: a.id, tipo: "comentario",
      comentario: `Corrección automática auditable: ruta «${a.vehiculo_ruta ?? "sin ruta"}» → «${viaje.ruta_programada}», confirmada contra GEMA (mismo conductor, bus ${a.vehiculo_codigo} y viaje vigente a las ${hora} del ${dia}).`,
    }) });
    corregidas++;
  }
}

console.log(aplicar ? "APLICADO" : "SIMULACRO — no se escribió nada");
console.log({ total: accidentes.length, rutas_a_corregir: candidatos, corregidas, ya_correctas: yaCorrecta, sin_viaje: sinViaje, bus_distinto_revision_manual: distintoBus });
if (revisar.length) console.log("\nBuses que NO se tocaron (revisión humana):\n" + revisar.join("\n"));
