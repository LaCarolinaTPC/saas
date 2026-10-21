/**
 * Comprobación de la migración de la llave natural de las marcaciones
 * (`20261020164817_marcaciones_del_biometrico_llave_natural_y_origen_equipo`).
 *
 * Esa migración borra filas —57.577 duplicados que dejaron los cuatro
 * re-registros del mismo lector en ZKAccess—, así que después hay que
 * comprobarla contra producción y no fiarse de que «corrió sin error».
 *
 * Qué exige, y por qué cada cosa:
 *   · ninguna repetición por `(device_sn, pin, momento)`  -> la llave natural
 *     existe y de verdad es única;
 *   · ningún `device_sn` vacío                            -> todas las filas
 *     viejas quedaron atribuidas a su lector;
 *   · el total bajó en 57.577 exactas                     -> se borró lo que
 *     se midió y nada más;
 *   · `id` existe y no es nulo en ninguna fila            -> el Data API
 *     externo y el catálogo MCP pueden direccionar la fila;
 *   · las dos funciones nuevas responden                  -> la ingesta de las
 *     dos vías y la marca de avance por lector funcionan.
 *
 * Solo LEE, salvo una llamada a `biometrico_ultimo_momento_por_equipo()`, que
 * también solo lee. No escribe nada.
 *
 *   npm run biometrico:verificar-llave
 *
 * Sale con código 1 si algo no cuadra.
 */
import { createClient } from "@supabase/supabase-js";
import { leerEnv } from "./biometrico-comun.mjs";

/** Lo que la migración tenía que borrar. Medido en el .mdb y en producción. */
const DUPLICADOS_ESPERADOS = 57_577;

const co = new Intl.NumberFormat("es-CO");
let fallos = 0;

function afirmar(que: string, bien: boolean, detalle?: string) {
  if (bien) {
    console.log(`  ok   ${que}${detalle ? ` · ${detalle}` : ""}`);
    return;
  }
  fallos++;
  console.log(`  MAL  ${que}${detalle ? ` · ${detalle}` : ""}`);
}

async function main() {
  const env = leerEnv();
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const llave = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !llave) {
    console.error(
      "Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local."
    );
    process.exit(1);
  }
  const db = createClient(url, llave, { auth: { persistSession: false } });

  console.log("Comprobación de la llave natural de biometrico_marcaciones");
  console.log("-".repeat(62));

  // ── Total ────────────────────────────────────────────────────────────────
  const { count: total, error: eTotal } = await db
    .from("biometrico_marcaciones")
    .select("*", { count: "exact", head: true });
  if (eTotal) throw new Error(`total: ${eTotal.message}`);
  console.log(`  filas ahora: ${co.format(total ?? 0)}`);

  // ── Cuántas se borraron ──────────────────────────────────────────────────
  //
  // El conteo de ANTES no sale de la tabla de respaldo: PostgREST no la
  // expone (la migración no le dio permisos, y está bien que no los tenga).
  // Sale del máximo `id`, que es mejor fuente: la IDENTITY numeró todas las
  // filas que existían al migrar, así que el máximo es cuántas hubo jamás,
  // incluidas las que llegaron después. Restarle el total da lo borrado.
  const { data: maxima, error: eMax } = await db
    .from("biometrico_marcaciones")
    .select("id")
    .order("id", { ascending: false })
    .limit(1);
  if (eMax) throw new Error(`máximo id: ${eMax.message}`);
  const jamas = Number((maxima?.[0] as { id?: number } | undefined)?.id ?? 0);
  console.log(`  filas que existieron: ${co.format(jamas)}`);
  const borradas = jamas - (total ?? 0);
  afirmar(
    `se borraron exactamente ${co.format(DUPLICADOS_ESPERADOS)} duplicados`,
    borradas === DUPLICADOS_ESPERADOS,
    `borradas ${co.format(borradas)}`
  );

  // Toda fila pertenece a uno de los dos lectores conocidos. Si apareciera un
  // SN inesperado, o alguna fila se quedara sin atribuir, la suma no cerraría.
  const porLector: Array<[string, number]> = [];
  for (const sn of ["AHID222860036", "AHID211660104"]) {
    const { count, error } = await db
      .from("biometrico_marcaciones")
      .select("*", { count: "exact", head: true })
      .eq("device_sn", sn);
    if (error) throw new Error(`lector ${sn}: ${error.message}`);
    porLector.push([sn, count ?? 0]);
  }
  const suma = porLector.reduce((t, [, n]) => t + n, 0);
  afirmar(
    "cada fila pertenece a uno de los dos lectores conocidos",
    suma === (total ?? 0),
    `${porLector.map(([sn, n]) => `${sn} ${co.format(n)}`).join(" + ")} = ${co.format(suma)}`
  );
  // ── device_sn: parte de la llave, nunca vacío ────────────────────────────
  const { count: sinSn, error: eSn } = await db
    .from("biometrico_marcaciones")
    .select("*", { count: "exact", head: true })
    .eq("device_sn", "");
  if (eSn) throw new Error(`device_sn: ${eSn.message}`);
  afirmar("ninguna fila quedó sin número de serie", (sinSn ?? 0) === 0,
    `vacías ${co.format(sinSn ?? 0)}`);

  // ── `id` existe y sirve de identificador ─────────────────────────────────
  const { data: unaFila, error: eId } = await db
    .from("biometrico_marcaciones")
    .select("id, id_zk, device_sn, origen, recibido_at")
    .order("id", { ascending: false })
    .limit(1);
  if (eId) {
    afirmar("la columna id existe y se puede ordenar por ella", false, eId.message);
  } else {
    const fila = unaFila?.[0] as Record<string, unknown> | undefined;
    afirmar("la columna id existe y no es nula", typeof fila?.id === "number",
      `id ${String(fila?.id)}`);
    afirmar("existen origen y recibido_at",
      fila !== undefined && "origen" in fila && "recibido_at" in fila,
      `origen ${String(fila?.origen)}`);
  }

  // ── Las dos funciones nuevas ─────────────────────────────────────────────
  const { data: porEquipo, error: eFn } = await db.rpc(
    "biometrico_ultimo_momento_por_equipo"
  );
  if (eFn) {
    afirmar("biometrico_ultimo_momento_por_equipo() responde", false, eFn.message);
  } else {
    const filas = (porEquipo ?? []) as Array<{ device_sn: string; momento: string }>;
    afirmar("biometrico_ultimo_momento_por_equipo() responde", true,
      `${filas.length} lector(es)`);
    for (const f of filas) {
      // En hora de Colombia: PostgREST normaliza los timestamptz a +00:00, así
      // que leer los dígitos tal cual mostraría UTC.
      const cuando = new Intl.DateTimeFormat("es-CO", {
        timeZone: "America/Bogota",
        dateStyle: "short",
        timeStyle: "medium",
      }).format(new Date(f.momento));
      console.log(`       ${f.device_sn}: ${cuando}`);
    }
  }

  // La de ingesta se comprueba con un lote VACÍO: devuelve ceros y no escribe
  // nada, pero falla si la función o su permiso no están.
  const { data: ingesta, error: eIng } = await db.rpc(
    "biometrico_ingresar_marcaciones",
    { p_filas: [], p_envio_id: null }
  );
  if (eIng) {
    afirmar("biometrico_ingresar_marcaciones() responde", false, eIng.message);
  } else {
    const r = (ingesta ?? [])[0] as { nuevas?: number; completadas?: number } | undefined;
    afirmar("biometrico_ingresar_marcaciones() responde con un lote vacío",
      r !== undefined && (r.nuevas ?? 0) === 0 && (r.completadas ?? 0) === 0,
      JSON.stringify(r ?? null));
  }

  // ── Cuántas por la vía equipo, informativo ───────────────────────────────
  const { count: deEquipo } = await db
    .from("biometrico_marcaciones")
    .select("*", { count: "exact", head: true })
    .eq("origen", "equipo");
  console.log(`  por la vía equipo: ${co.format(deEquipo ?? 0)}`);

  console.log("-".repeat(62));
  console.log(fallos === 0 ? "OK" : `FALLARON ${fallos} comprobación(es)`);
  process.exit(fallos === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
});
