import * as fs from "fs";
import * as path from "path";
import { execSync } from "child_process";
import dotenv from "dotenv";

if (fs.existsSync(".env.local")) {
  dotenv.config({ path: ".env.local" });
} else {
  dotenv.config();
}

const libDir = path.join("src", "lib");
const modulos = fs.readdirSync(libDir, { withFileTypes: true })
  .filter(dirent => dirent.isDirectory())
  .map(dirent => dirent.name);

console.log(`🚀 Iniciando generación masiva de documentación para ${modulos.length} módulos...\n`);

for (const mod of modulos) {
  console.log(`----------------------------------------`);
  console.log(`📦 Procesando módulo: [ ${mod} ]`);
  console.log(`----------------------------------------`);
  try {
    execSync(`npx tsx scripts/documentar-modulo.mts ${mod} --model gemini-3.1-flash-lite`, {
      stdio: "inherit",
      env: process.env
    });
    console.log(`✅ [${mod}] OK\n`);
  } catch (err: any) {
    console.error(`❌ [${mod}] Falló o excedió la demanda. Intentando con gemini-3.5-flash...\n`);
    try {
      execSync(`npx tsx scripts/documentar-modulo.mts ${mod} --model gemini-3.5-flash`, {
        stdio: "inherit",
        env: process.env
      });
      console.log(`✅ [${mod}] OK (con gemini-3.5-flash)\n`);
    } catch (err2: any) {
      console.error(`❌ [${mod}] No se pudo documentar automáticamente en este momento.\n`);
    }
  }
  // Pausa breve para evitar rate limits
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 2000);
}

console.log("🎉 ¡Proceso masivo finalizado! Revisa la carpeta docs/modulos/");
