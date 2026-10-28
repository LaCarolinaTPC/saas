// Métricas viejo vs. nuevo y las incidencias de permisos abiertas
// (src/lib/permisos/incidencias.ts). SOLO LECTURA.
//
//   npm run permisos:incidencias            (últimos 7 días)
//   npm run permisos:incidencias -- 30
//
// Para pasar al sistema nuevo no puede haber «perdería acceso» abiertos.

import { config } from "dotenv";
config({ path: ".env.local", quiet: true });

async function main() {
  const dias = Number(process.argv[2] ?? 7) || 7;
  const { createAdminClient } = await import("../src/lib/supabase/admin");
  const { ETIQUETA_TIPO, resumir } = await import("../src/lib/permisos/incidencias");
  const db = createAdminClient();
  const desde = new Date(Date.now() - dias * 86_400_000).toISOString().slice(0, 10);

  const [porDia, fallas, inc] = await Promise.all([
    db.from("permisos_metricas_por_dia").select("*").gte("dia", desde).order("dia"),
    db
      .from("permisos_metricas_dia")
      .select("clave, origen, perdidos, ganados, denegados")
      .gte("dia", desde)
      .or("perdidos.gt.0,ganados.gt.0")
      .limit(5000),
    db
      .from("permisos_incidencias")
      .select("tipo, severidad, email, user_id, clave, origen, ruta, veces, ultima_vez, rol_viejo")
      .eq("estado", "abierta")
      .gte("ultima_vez", `${desde}T00:00:00`)
      .order("veces", { ascending: false })
      .limit(200),
  ]);
  const error = porDia.error ?? fallas.error ?? inc.error;
  if (error) throw new Error(error.message);

  const r = resumir(porDia.data ?? []);
  const pct = r.coincidencia === null ? "—" : `${(r.coincidencia * 100).toFixed(3)} %`;
  console.log(`Últimos ${dias} días: ${r.chequeos} chequeos, ${r.comparados} comparados, coincidencia ${pct}`);
  console.log(`  perdería acceso: ${r.perdidos} · ganaría: ${r.ganados} · denegados: ${r.denegados}\n`);

  const donde = new Map<string, { perdidos: number; ganados: number }>();
  for (const f of fallas.data ?? []) {
    const k = `${f.origen} ${f.clave}`;
    const x = donde.get(k) ?? { perdidos: 0, ganados: 0 };
    x.perdidos += Number(f.perdidos);
    x.ganados += Number(f.ganados);
    donde.set(k, x);
  }
  if (donde.size) {
    console.log("Dónde no coincide:");
    for (const [k, x] of [...donde].sort((a, b) => b[1].perdidos - a[1].perdidos || b[1].ganados - a[1].ganados).slice(0, 20)) {
      console.log(`   ${k}  ✖ ${x.perdidos}  + ${x.ganados}`);
    }
    console.log();
  }

  const rango: Record<string, number> = { alta: 0, media: 1, baja: 2 };
  const lista = [...(inc.data ?? [])].sort((a, b) => (rango[a.severidad] ?? 3) - (rango[b.severidad] ?? 3));
  if (!lista.length) {
    console.log("✔ Sin incidencias abiertas.");
    return;
  }
  console.log(`Incidencias abiertas (${lista.length}):`);
  for (const i of lista) {
    const quien = i.email ?? i.user_id ?? `credencial ${i.rol_viejo ?? ""}`;
    const tipo = ETIQUETA_TIPO[i.tipo as keyof typeof ETIQUETA_TIPO] ?? i.tipo;
    console.log(`   [${tipo}] ${quien} · ${i.clave} · ${i.origen}${i.ruta ? ` ${i.ruta}` : ""} · ${i.veces} vez/veces`);
  }
  const perdidos = lista.filter((i) => i.tipo === "divergencia_perdido").length;
  console.log(perdidos ? `\n✖ ${perdidos} de acceso perdido: no pasar al sistema nuevo.` : "\nSin accesos perdidos abiertos.");
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
