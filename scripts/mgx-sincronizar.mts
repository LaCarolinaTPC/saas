// Sincronización de MGX por consola, sin tope de tiempo. Es la vía para la
// carga inicial de las tablas grandes (emp0co.cuerpo son 16 millones de filas,
// cerca de una hora) y para la reconciliación de borrados.
//
//   npm run mgx:sincronizar                                   # todo
//   npm run mgx:sincronizar -- --empresa=emp3                 # una empresa
//   npm run mgx:sincronizar -- --empresa=emp0 --modulo=co --tabla=cuerpo
//   npm run mgx:sincronizar -- --empresa=emp3 --reconciliar --solo-informe
//   npm run mgx:sincronizar -- --reconciliar                  # borra lo que MGX ya no tiene
//
// Usa el MISMO motor que la pantalla (src/lib/mgx/sync.ts), así que retoma
// donde haya quedado una corrida de la pantalla, y al revés. Lee las
// credenciales de .env.local. Sale con código 1 si algún par terminó en error.

import { config } from "dotenv";
config({ path: ".env.local", quiet: true });

function opcion(nombre: string): string | undefined {
  const a = process.argv.find((x) => x.startsWith(`--${nombre}=`));
  return a?.slice(nombre.length + 3);
}
const bandera = (nombre: string) => process.argv.includes(`--${nombre}`);

async function main() {
  const { createAdminClient } = await import("../src/lib/supabase/admin");
  const { closeMgxPool } = await import("../src/lib/mgx/client");
  const { expandirAlcance, esEmpresa, esModulo, etiquetaPar } = await import("../src/lib/mgx/catalogo");
  const sync = await import("../src/lib/mgx/sync");
  const { MAXIMO_BORRADO } = await import("../src/lib/gema/espejo");

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY || !process.env.NEXT_PUBLIC_SUPABASE_URL) {
    throw new Error("Faltan NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY en .env.local.");
  }
  const empresa = opcion("empresa");
  const modulo = opcion("modulo");
  const tabla = opcion("tabla");
  if (empresa && !esEmpresa(empresa)) throw new Error(`Empresa desconocida: ${empresa}`);
  if (modulo && !esModulo(modulo)) throw new Error(`Módulo desconocido: ${modulo} (co, no, in, rh)`);
  const pares = expandirAlcance({ empresa: empresa as never, modulo: modulo as never, tabla });
  if (!pares.length) throw new Error("Ese alcance no tiene ninguna tabla.");

  const db = createAdminClient();
  const log = (s: string) => console.log(`${new Date().toLocaleTimeString("es-CO")}  ${s}`);
  const t0 = Date.now();

  try {
    if (bandera("reconciliar")) {
      const soloInforme = bandera("solo-informe");
      log(`Reconciliación de ${pares.length} tabla(s)${soloInforme ? " (solo informe, no borra)" : ""}`);
      let problemas = 0;
      for (const par of pares) {
        const r = await sync.reconciliarPar(db, par, { soloInforme, maximoBorrado: MAXIMO_BORRADO, log });
        if (r.motivo) {
          problemas++;
          log(`${etiquetaPar(par)}  NO SE BORRÓ: ${r.motivo}`);
        } else if (r.borradas) {
          log(`${etiquetaPar(par)}  borradas ${r.borradas}`);
        }
      }
      process.exitCode = problemas ? 1 : 0;
      return;
    }

    const corridaId = await sync.abrirCorrida(db, {
      origen: "script",
      usuarioEmail: process.env.USERNAME ?? process.env.USER ?? null,
      alcance: { empresa: empresa ?? null, modulo: modulo ?? null, tabla: tabla ?? null },
    });
    log(`Corrida #${corridaId}: ${pares.length} tabla(s)`);
    let resultado;
    try {
      resultado = await sync.sincronizarPares(
        db,
        pares,
        {
          deadline: Infinity,
          loteLectura: opcion("lote-lectura") ? Number(opcion("lote-lectura")) : undefined,
          filasPorLote: opcion("lote-escritura") ? Number(opcion("lote-escritura")) : undefined,
          log,
        },
        corridaId
      );
    } catch (e) {
      await sync.cerrarCorrida(db, corridaId, "error", e instanceof Error ? e.message : String(e));
      throw e;
    }
    const errores = resultado.hechos.filter((h) => h.error);
    await sync.cerrarCorrida(db, corridaId, errores.length ? "error" : "ok", errores.map((h) => `${etiquetaPar(h.par)}: ${h.error}`).join("\n") || null);

    const total = resultado.hechos.reduce((s, h) => s + h.filas, 0);
    log(`Listo en ${((Date.now() - t0) / 60000).toFixed(1)} min · ${total.toLocaleString("es-CO")} filas escritas · ${errores.length} con error`);
    for (const h of resultado.hechos) if (h.aviso) log(`AVISO ${etiquetaPar(h.par)}: ${h.aviso}`);
    for (const h of errores) log(`ERROR ${etiquetaPar(h.par)}: ${h.error}`);
    process.exitCode = errores.length ? 1 : 0;
  } finally {
    await closeMgxPool();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
