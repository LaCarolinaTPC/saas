// Lo que anotó el modo sombra: diferencias entre el sistema de permisos viejo
// y el nuevo, por usuario y día. SOLO LECTURA.
//
//   npm run permisos:discrepancias            (últimos 7 días)
//   npm run permisos:discrepancias -- 30
//
// Para pasar al sistema nuevo no puede haber ningún «perdido».

import { config } from "dotenv";
config({ path: ".env.local", quiet: true });

async function main() {
  const dias = Number(process.argv[2] ?? 7) || 7;
  const { createAdminClient } = await import("../src/lib/supabase/admin");
  const desde = new Date(Date.now() - dias * 86_400_000).toISOString().slice(0, 10);
  const { data, error } = await createAdminClient()
    .from("permisos_discrepancias")
    .select("dia, email, user_id, perdidos, ganados, visto_at")
    .gte("dia", desde)
    .order("dia", { ascending: false });
  if (error) throw new Error(error.message);
  if (!data?.length) {
    console.log(`✔ Sin discrepancias en los últimos ${dias} días.`);
    return;
  }
  for (const d of data) {
    console.log(`${d.dia} ${d.email ?? d.user_id}`);
    if (d.perdidos.length) console.log(`   ✖ pierde: ${d.perdidos.join(", ")}`);
    if (d.ganados.length) console.log(`   + gana:   ${d.ganados.join(", ")}`);
  }
  const conPerdidos = data.filter((d) => d.perdidos.length).length;
  console.log(conPerdidos ? `\n✖ ${conPerdidos} con accesos perdidos: no pasar al sistema nuevo.` : "\nSin perdidos (revisar los ganados).");
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
