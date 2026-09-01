#!/usr/bin/env node
// Crea una migración con marca de tiempo, para que dos personas trabajando en
// paralelo no puedan tomar el mismo nombre.
//
//   npm run migracion:nueva -- "permisos del modulo mantenimiento"
//
// Genera supabase/migrations/AAAAMMDDHHMMSS_permisos_del_modulo_mantenimiento.sql
// La marca de tiempo va en UTC para que no dependa de la zona horaria de quien
// la crea. Ver docs/migraciones.md.

import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const DIRECTORIO = "supabase/migrations";

const descripcion = process.argv.slice(2).join(" ").trim();
if (!descripcion) {
  console.error('Uso: npm run migracion:nueva -- "descripcion del cambio"');
  process.exit(1);
}

const slug = descripcion
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "") // tildes ya separadas por NFD
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, "_")
  .replace(/^_+|_+$/g, "");

if (!slug) {
  console.error("La descripción debe tener al menos una letra o un número.");
  process.exit(1);
}

function marcaDeTiempo(fecha) {
  const dosDigitos = (n) => String(n).padStart(2, "0");
  return [
    fecha.getUTCFullYear(),
    dosDigitos(fecha.getUTCMonth() + 1),
    dosDigitos(fecha.getUTCDate()),
    dosDigitos(fecha.getUTCHours()),
    dosDigitos(fecha.getUTCMinutes()),
    dosDigitos(fecha.getUTCSeconds()),
  ].join("");
}

// Si en el mismo segundo ya existe una, se avanza al siguiente.
const fecha = new Date();
let ruta = join(DIRECTORIO, `${marcaDeTiempo(fecha)}_${slug}.sql`);
while (existsSync(ruta)) {
  fecha.setUTCSeconds(fecha.getUTCSeconds() + 1);
  ruta = join(DIRECTORIO, `${marcaDeTiempo(fecha)}_${slug}.sql`);
}

const plantilla = `-- ${descripcion}
--
-- Contexto: explique por qué hace falta este cambio, no lo que hace el SQL.
--
-- Esta instancia de Supabase es autoalojada y las migraciones se aplican a
-- mano en el SQL Editor del Studio, así que el script debe poder ejecutarse
-- entero de una sola vez y ser idempotente donde se pueda (IF EXISTS,
-- IF NOT EXISTS, ON CONFLICT DO NOTHING).
--
-- Recuerde que en esta instalación las tablas nuevas no conceden privilegios a
-- service_role por defecto: si crea una tabla que la aplicación consulta desde
-- Server Components o Server Actions, añada su GRANT aquí mismo.

`;

writeFileSync(ruta, plantilla, "utf8");

console.log(`Migración creada: ${ruta}`);
console.log("");
console.log("Siguientes pasos:");
console.log("  1. Escriba el SQL en ese archivo.");
console.log("  2. Ejecútelo en el SQL Editor del Studio autoalojado.");
console.log("  3. Verifique el nombre con: npm run migracion:verificar");
