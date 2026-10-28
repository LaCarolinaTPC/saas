// Compara, usuario por usuario, el acceso de la foto (sistema anterior) con el
// que daría el sistema nuevo de roles y permisos. SOLO LECTURA.
//
//   npm run permisos:comparar -- C:\ruta\foto.json
//
// Mientras las tablas nuevas no existan, el acceso nuevo se calcula con la
// traducción en memoria (src/lib/permisos/equivalencia.ts) a partir de la
// misma foto; así se prueba el catálogo, las rutas y el menú contra los de hoy.
//
// Informe: PERDIDOS (tiene que ser 0; si no, sale con código 1), GANADOS (se
// revisan: se esperan solo los del admin, que pasa a super) y el resumen de
// roles y excepciones que quedarían.

import { config } from "dotenv";
import { readFileSync } from "node:fs";
config({ path: ".env.local", quiet: true });

async function main() {
  const archivo = process.argv[2];
  if (!archivo) throw new Error("Falta la ruta de la foto: npm run permisos:comparar -- <foto.json>");
  const { accesoViejo, efectivosDe, equivalencia } = await import("../src/lib/permisos/equivalencia");
  const { compararAcceso, HREFS_MENU } = await import("../src/lib/permisos/comparar");
  const { MODULOS } = await import("../src/lib/permisos/catalogo");

  const desdeBd = process.argv.includes("--bd");
  const { efectivosNuevosDe } = await import("../src/lib/permisos/bd");
  const foto = JSON.parse(readFileSync(archivo, "utf8"));
  const { roles, usuarios } = equivalencia(foto.roles, foto.usuarios);
  const rolesPorClave = new Map(roles.map((r) => [r.clave, r]));
  const rolViejo = new Map((foto.roles as { key: string }[]).map((r) => [r.key, r]));
  const rutas = [...new Set([...HREFS_MENU, ...MODULOS.map((m) => m.inicio)])];

  let perdidosTotal = 0;
  const ganadosPorUsuario: string[] = [];
  for (const u of foto.usuarios) {
    const viejo = accesoViejo(u, (u.user_type && (rolViejo.get(u.user_type) as never)) || null);
    // La foto guarda lo que calculó en su momento: si el código viejo cambió
    // desde entonces, se avisa en vez de comparar contra otra cosa.
    if (JSON.stringify(viejo.modulos) !== JSON.stringify(u.acceso.modulos)) {
      console.warn(`! ${u.email ?? u.id}: los módulos de la foto no coinciden con el cálculo actual`);
    }
    const nuevo = desdeBd
      ? await efectivosNuevosDe(u.id)
      : efectivosDe(usuarios.find((x) => x.userId === u.id)!, rolesPorClave);
    const dif = compararAcceso(viejo, nuevo, rutas);
    if (dif.perdidos.length) {
      perdidosTotal += dif.perdidos.length;
      console.log(`✖ ${u.email ?? u.id} PIERDE: ${dif.perdidos.join(", ")}`);
    }
    if (dif.ganados.length) ganadosPorUsuario.push(`${u.email ?? u.id} (${u.user_type}): ${dif.ganados.length} ganados`);
  }

  const conExcepciones = usuarios.filter((u) => u.concedidos.length || u.quitados.length);
  console.log("");
  console.log(`Fuente del acceso nuevo: ${desdeBd ? "tablas nuevas" : "traducción en memoria"}`);
  console.log(`Usuarios: ${foto.usuarios.length} · roles: ${roles.length} (${roles.filter((r) => r.super).map((r) => r.clave).join(", ")} = super)`);
  console.log(`Con permisos individuales: ${conExcepciones.length}`);
  for (const u of conExcepciones) {
    const email = foto.usuarios.find((x: { id: string }) => x.id === u.userId)?.email ?? u.userId;
    console.log(`  · ${email}: +${u.concedidos.length} −${u.quitados.length}  ${[...u.concedidos.map((p) => "+" + p), ...u.quitados.map((p) => "−" + p)].join(" ")}`);
  }
  console.log(`Ganados (revisar): ${ganadosPorUsuario.length ? "" : "ninguno"}`);
  for (const g of ganadosPorUsuario) console.log(`  · ${g}`);
  console.log("");
  console.log(perdidosTotal === 0 ? "✔ Nadie pierde acceso." : `✖ ${perdidosTotal} accesos perdidos: NO aplicar.`);
  process.exit(perdidosTotal === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
