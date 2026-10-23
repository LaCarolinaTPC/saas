/**
 * Simulacro (SOLO LECTURA) de la limpieza de pendientes automáticos huérfanos
 * para una fecha: dice qué borraría y por qué, sin borrar nada.
 *
 *   npm run biometrico:limpieza                 # hoy
 *   npm run biometrico:limpieza -- 2026-10-23   # una fecha
 *
 * Lo que de verdad borra es `limpiarPendientesAutoHuerfanos`, que corre sola al
 * abrir Marcaciones o el Registro del día; esto solo dice QUÉ borraría y por
 * qué, para poder revisarlo antes. No escribe nada en ninguna parte.
 */
import { leerEnv } from "./biometrico-comun.mjs";
import { salioARodar } from "../src/lib/biometrico/despacho";
import type { FilaConductor } from "../src/lib/biometrico/plantilla";
import {
  pendientesAAnular,
  pendientesAAnularPorDespacho,
  CONCEPTO_PENDIENTE,
  ORIGEN_AUTOMATICO,
} from "../src/lib/biometrico/auto-pendientes";

const fecha = process.argv[2] ?? new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(new Date());
const env = leerEnv();
const URL = env.NEXT_PUBLIC_SUPABASE_URL;
const LLAVE = env.SUPABASE_SERVICE_ROLE_KEY ?? env.SUPABASE_SERVICE_KEY;
if (!URL || !LLAVE) {
  console.error("Faltan NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}
async function leer<T>(ruta: string): Promise<T[]> {
  const r = await fetch(`${URL}/rest/v1/${ruta}`, {
    headers: { apikey: LLAVE!, Authorization: `Bearer ${LLAVE}` },
  });
  if (!r.ok) throw new Error(`${ruta} → ${r.status} ${await r.text()}`);
  return (await r.json()) as T[];
}

const autos = await leer<{ id: string; cedula: string; nombre: string; codigo: string | null }>(
  `ausentismo_registros?fecha=eq.${fecha}&tipo=eq.${CONCEPTO_PENDIENTE}&origen=eq.${ORIGEN_AUTOMATICO}&select=id,cedula,nombre,codigo`
);
console.log(`${fecha}: ${autos.length} pendiente(s) automático(s) sin clasificar`);
if (autos.length === 0) process.exit(0);

const cedulas = [...new Set(autos.map((a) => String(a.cedula)))];
const lista = cedulas.join(",");

const maestro = new Map<string, FilaConductor>();
for (const c of await leer<FilaConductor>(
  `conductores?cedula=in.(${lista})&select=cedula,estado,reubicado,fecha_ingreso,codigo,created_at,solo_informativo`
)) {
  maestro.set(String(c.cedula), c);
}

const despacho = await leer<{ conductor_ced: string | null; estado: string | null; timbradas: number | null; hora_despacho: string | null; codigo: string | null }>(
  `historico_despacho?fecha_viaje=eq.${fecha}&conductor_ced=in.(${lista})&select=conductor_ced,estado,timbradas,hora_despacho,codigo`
);
const rodaron = new Set(
  despacho.filter((d) => d.conductor_ced && salioARodar(d)).map((d) => String(d.conductor_ced).trim())
);

const porDespacho = pendientesAAnularPorDespacho(autos, rodaron);
const ids = new Set(porDespacho.map((p) => p.id));
const porPlantilla = pendientesAAnular(autos, maestro, fecha).filter((p) => !ids.has(p.id));

const nombre = (id: string) => {
  const a = autos.find((x) => x.id === id)!;
  return `${a.codigo ?? "—"} · ${a.nombre} (CC ${a.cedula})`;
};

console.log(`\nSE ANULARÍAN ${porDespacho.length + porPlantilla.length}:`);
for (const p of porDespacho) {
  const v = despacho.filter((d) => String(d.conductor_ced).trim() === String(p.cedula).trim() && salioARodar(d));
  console.log(`  [rodó]       ${nombre(p.id)} — ${v.map((x) => `${x.hora_despacho} bus ${x.codigo} ${x.estado}`).join(" | ")}`);
}
for (const p of porPlantilla) console.log(`  [plantilla]  ${nombre(p.id)}`);

const quedan = autos.filter((a) => !ids.has(a.id) && !porPlantilla.some((p) => p.id === a.id));
console.log(`\nSE QUEDAN ${quedan.length} (sin despacho que rodara y en plantilla):`);
for (const a of quedan) console.log(`  ${a.codigo ?? "—"} · ${a.nombre} (CC ${a.cedula})`);
