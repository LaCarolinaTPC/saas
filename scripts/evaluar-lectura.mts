// Calibración de la lectura de documentos (entrega 4 de selección, R1): lee una carpeta de documentos
// reales FUERA del repositorio (tienen datos personales) y reporta aciertos por clase y por campo.
//
//   npx tsx --env-file=.env.local --tsconfig tsconfig.json scripts/evaluar-lectura.mts <carpeta> [--preciso]
//
// - Cada archivo (jpg, png, webp, pdf) es un documento; una subcarpeta con varias fotos es UN documento
//   (las páginas de una hoja de vida) y se manda en una sola llamada, como hace Gestivo con una ráfaga.
// - Opcional: <carpeta>/esperado.json con lo que debería salir, por nombre de archivo o de subcarpeta:
//     { "licencia-juan.jpg": { "clase": "licencia", "campos": { "categorias": "C2", "restricciones": "lentes" } } }
//   Un campo acierta si lo leído contiene lo esperado (sin tildes ni mayúsculas).
// - Lee con la IA de «Documentos» (Candidatos › IA). --preciso: con Sonnet 5.5, para comparar.
// Usa el proveedor y las claves de Configuración (no escribe nada en la base). Cuesta lo que cueste la llamada.
import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { join, extname, basename } from "node:path";
import { MODELO_DOCUMENTOS_PRECISO, getAgenteConClaves } from "@/lib/comunicaciones/agente/config";
import type { ImagenEntrada } from "@/lib/comunicaciones/agente/proveedores";
import { leerArchivos } from "@/lib/seleccion/lectura/leer";
import { costoUsd } from "@/lib/seleccion/consumos";

const carpeta = process.argv[2];
if (!carpeta || !existsSync(carpeta)) {
  console.error("Uso: scripts/evaluar-lectura.mts <carpeta> [--preciso]");
  process.exit(1);
}
const preciso = process.argv.includes("--preciso");
const MIME: Record<string, ImagenEntrada["tipo"]> = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp", ".pdf": "application/pdf" };
const archivo = (ruta: string): ImagenEntrada | null => {
  const tipo = MIME[extname(ruta).toLowerCase()];
  return tipo ? { tipo, base64: readFileSync(ruta).toString("base64"), nombre: basename(ruta) } : null;
};

type Esperado = { clase?: string; campos?: Record<string, string> };
const esperado: Record<string, Esperado> = existsSync(join(carpeta, "esperado.json")) ? JSON.parse(readFileSync(join(carpeta, "esperado.json"), "utf8")) : {};
const norm = (s: unknown) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

const casos: { nombre: string; archivos: ImagenEntrada[] }[] = [];
for (const n of readdirSync(carpeta).sort()) {
  const ruta = join(carpeta, n);
  if (statSync(ruta).isDirectory()) {
    const paginas = readdirSync(ruta).sort().map((p) => archivo(join(ruta, p))).filter((x): x is ImagenEntrada => !!x);
    if (paginas.length) casos.push({ nombre: n, archivos: paginas });
  } else {
    const a = archivo(ruta);
    if (a) casos.push({ nombre: n, archivos: [a] });
  }
}
if (!casos.length) {
  console.error("No hay documentos (jpg, png, webp o pdf) en la carpeta.");
  process.exit(1);
}

const { config: guardada, claves } = await getAgenteConClaves();
const config = preciso
  ? { ...guardada, documentosProveedor: "anthropic" as const, documentosModelo: MODELO_DOCUMENTOS_PRECISO }
  : guardada;
const hoy = new Date(Date.now() - 5 * 3_600_000).toISOString().slice(0, 10);
let clasesOk = 0;
let clasesEvaluadas = 0;
const porCampo = new Map<string, { ok: number; total: number }>();
let gasto = 0;

for (const c of casos) {
  const t = Date.now();
  try {
    const r = await leerArchivos(c.archivos, { config, claves, hoy });
    gasto += costoUsd(r.modelo, r.tokensEntrada, r.tokensSalida);
    const d = r.docs?.[0];
    console.log(`\n■ ${c.nombre} (${c.archivos.length} archivo${c.archivos.length > 1 ? "s" : ""}, ${((Date.now() - t) / 1000).toFixed(1)} s, ${r.modelo})`);
    if (!r.docs) {
      console.log(`  ✖ respuesta sin JSON: ${r.texto.slice(0, 160)}`);
      continue;
    }
    if ((r.docs?.length ?? 0) > 1) console.log(`  ! el modelo lo partió en ${r.docs.length} documentos`);
    console.log(`  clase: ${d?.clase} · ${d?.estado} · ${d?.resumen}`);
    for (const campo of d?.campos ?? []) {
      const v = Array.isArray(campo.valor) ? `${campo.valor.length} elementos` : String(campo.valor);
      console.log(`    ${campo.campo}: ${v} [${campo.confianza}]${campo.nota ? ` — ${campo.nota}` : ""}`);
    }
    const e = esperado[c.nombre];
    if (e?.clase) {
      clasesEvaluadas++;
      const ok = d?.clase === e.clase;
      if (ok) clasesOk++;
      console.log(`  ${ok ? "✔" : "✖"} clase esperada: ${e.clase}`);
    }
    for (const [k, v] of Object.entries(e?.campos ?? {})) {
      const leido = d?.campos.find((x) => x.campo === k)?.valor;
      const ok = norm(Array.isArray(leido) ? JSON.stringify(leido) : leido).includes(norm(v));
      const s = porCampo.get(k) ?? { ok: 0, total: 0 };
      s.total++;
      if (ok) s.ok++;
      porCampo.set(k, s);
      console.log(`  ${ok ? "✔" : "✖"} ${k}: esperado «${v}», leído «${Array.isArray(leido) ? "[lista]" : (leido ?? "—")}»`);
    }
  } catch (e) {
    console.log(`\n■ ${c.nombre}\n  ✖ ${e instanceof Error ? e.message : String(e)}`);
  }
}

console.log("\n── Resumen");
console.log(`Documentos: ${casos.length} · modelo: ${preciso ? "preciso (Sonnet 5.5)" : config.documentosModelo ?? "el del proveedor de documentos"} · costo aprox.: USD ${gasto.toFixed(4)}`);
if (clasesEvaluadas) console.log(`Clase correcta: ${clasesOk} de ${clasesEvaluadas} (${Math.round((clasesOk / clasesEvaluadas) * 100)} %; la meta es 9 de cada 10)`);
for (const [k, s] of porCampo) console.log(`  ${k}: ${s.ok} de ${s.total}`);
if (!clasesEvaluadas) console.log("Sin esperado.json: solo se muestra lo leído.");
