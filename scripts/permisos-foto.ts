// Foto del acceso de HOY (sistema anterior de permisos), usuario por usuario,
// antes de pasar a roles con permisos por acción. SOLO LECTURA.
//
//   npm run permisos:foto
//   npm run permisos:foto -- C:\ruta\foto.json
//
// Guarda los roles (`user_types`) y los perfiles tal como están, y para cada
// usuario lo que el sistema anterior le deja: módulos, sub-funciones, si edita,
// si evalúa accidentes y el menú que ve. Por omisión se escribe en la carpeta
// temporal del sistema, fuera del repositorio (tiene correos de personas).
// `npm run permisos:comparar` lo usa para verificar que nadie pierda nada.

import { config } from "dotenv";
import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
config({ path: ".env.local", quiet: true });

async function main() {
  const { createAdminClient } = await import("../src/lib/supabase/admin");
  const { accesoViejo, hrefViejoVisible, subsViejas } = await import("../src/lib/permisos/equivalencia");
  const { HREFS_MENU } = await import("../src/lib/permisos/comparar");

  const db = createAdminClient();
  const [{ data: roles, error: e1 }, { data: perfiles, error: e2 }] = await Promise.all([
    db.from("user_types").select("*"),
    db.from("profiles").select("*"),
  ]);
  if (e1 || e2) throw new Error((e1 ?? e2)!.message);

  // Bloqueados en Auth: se fotografían igual, pero se marcan.
  const bloqueados = new Set<string>();
  for (let pagina = 1; ; pagina++) {
    const { data, error } = await db.auth.admin.listUsers({ page: pagina, perPage: 1000 });
    if (error) throw new Error(error.message);
    for (const u of data.users) {
      const hasta = (u as { banned_until?: string | null }).banned_until;
      if (hasta && Date.parse(hasta) > Date.now()) bloqueados.add(u.id);
    }
    if (data.users.length < 1000) break;
  }

  const porClave = new Map((roles ?? []).map((r) => [r.key as string, r]));
  const usuarios = (perfiles ?? []).map((p) => {
    const u = {
      id: p.id as string,
      email: (p.email as string | null) ?? null,
      user_type: (p.user_type as string | null) ?? null,
      permisos_individuales: p.permisos_individuales ?? null,
      role: (p.role as string | null) ?? null,
    };
    const a = accesoViejo(u, (u.user_type && porClave.get(u.user_type)) || null);
    return {
      ...u,
      bloqueado: bloqueados.has(u.id),
      acceso: {
        isAdmin: a.isAdmin,
        modulos: a.modulos,
        subfunciones: subsViejas(a),
        puedeEditar: a.puedeEditar,
        evaluaAccidentes: a.evaluaAccidentes,
        menu: HREFS_MENU.filter((h) => hrefViejoVisible(a, h)),
      },
    };
  });

  const destino = process.argv[2] || join(tmpdir(), `gestivo-permisos-foto-${new Date().toISOString().slice(0, 10)}.json`);
  writeFileSync(destino, JSON.stringify({ tomada: new Date().toISOString(), roles, usuarios }, null, 2));
  console.log(`Foto: ${roles?.length ?? 0} roles y ${usuarios.length} usuarios (${bloqueados.size} bloqueados).`);
  console.log(`Guardada en ${destino}`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
