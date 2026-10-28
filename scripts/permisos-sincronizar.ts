// Deja las tablas nuevas de permisos al día, ya mismo (la aplicación también lo
// hace sola, como mucho una vez por minuto, mientras alguien la usa):
//
//   npm run permisos:sincronizar
//
//  1. `permisos` igual al catálogo del código (nuevos, cambiados, obsoletos).
//  2. Mientras el sistema viejo mande (modo viejo o sombra): roles,
//     asignaciones y permisos individuales reconstruidos desde `user_types` y
//     `profiles` con la traducción probada.
//
// ESCRIBE en la base. Requiere la migración 20261028011725_roles_y_permisos_dinamicos.

import { config } from "dotenv";
config({ path: ".env.local", quiet: true });

async function main() {
  const { sincronizarCatalogo, reconstruirDesdeViejo, leerMotor } = await import("../src/lib/permisos/bd");
  const motor = await leerMotor();
  console.log(`Modo: ${motor}`);
  console.log("Catálogo:", await sincronizarCatalogo({ forzar: true }));
  if (motor === "nuevo") {
    console.log("Roles: no se reconstruyen (manda el sistema nuevo).");
  } else {
    console.log("Roles y asignaciones:", await reconstruirDesdeViejo({ forzar: true }));
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
