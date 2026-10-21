/**
 * Qué le ha llegado al servidor del agente del biométrico, y por cuál vía.
 *
 * Es la forma de contestar «¿ya entran las huellas en vivo?» sin entrar a la
 * pantalla ni al PC de la portería:
 *
 *   · `origen=access` -> lo trajo el Access.mdb (depende de que alguien
 *     descargue en ZKAccess);
 *   · `origen=equipo` -> lo trajo el agente hablando DIRECTO con el lector,
 *     que es la vía de tiempo real;
 *   · `origen=-` con `recib=0` -> latido: el agente está vivo y no había nada
 *     nuevo;
 *   · `compl=` cuenta las que ya estaban (las trajo el equipo) y este envío de
 *     Access les completó el `id_zk`. Es la señal de que las dos vías cruzan.
 *
 * Solo lee.
 *
 *   npm run biometrico:envios
 */
import { createClient } from "@supabase/supabase-js";
import { leerEnv } from "./biometrico-comun.mjs";

const env = leerEnv();
const db = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL!,
  env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

const fmt = new Intl.DateTimeFormat("es-CO", {
  timeZone: "America/Bogota",
  dateStyle: "short",
  timeStyle: "medium",
});

const { data, error } = await db
  .from("biometrico_envios")
  .select("*")
  .order("recibido_at", { ascending: false })
  .limit(10);
if (error) {
  console.error(error.message);
  process.exit(1);
}

for (const f of (data ?? []) as Record<string, unknown>[]) {
  console.log(
    [
      fmt.format(new Date(String(f.recibido_at))),
      String(f.agente ?? "?").padEnd(24),
      "origen=" + String(f.origen ?? "-"),
      "recib=" + f.recibidas,
      "nuevas=" + f.nuevas,
      "compl=" + String(f.completadas ?? "-"),
      "repet=" + f.repetidas,
      f.error ? "ERROR: " + String(f.error).slice(0, 110) : "",
    ].join("  ")
  );
}

const { count } = await db
  .from("biometrico_marcaciones")
  .select("*", { count: "exact", head: true })
  .eq("origen", "equipo");
console.log("");
console.log("marcaciones por la via equipo: " + (count ?? 0));
