// Deja la tabla `permisos` igual al catálogo del código, ya mismo (la
// aplicación también lo hace sola, como mucho una vez por minuto, mientras
// alguien la usa):
//
//   npm run permisos:sincronizar
//
// Crea los permisos nuevos, actualiza los cambiados, marca obsoletos los
// retirados y da las acciones nuevas a los roles que ya tenían ese nivel.
//
// ESCRIBE en la base. Requiere la migración 20261028011725_roles_y_permisos_dinamicos.

import { config } from "dotenv";
config({ path: ".env.local", quiet: true });

async function main() {
  const { sincronizarCatalogo } = await import("../src/lib/permisos/bd");
  console.log("Catálogo:", await sincronizarCatalogo({ forzar: true }));
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
